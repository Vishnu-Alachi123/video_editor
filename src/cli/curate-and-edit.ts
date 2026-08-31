#!/usr/bin/env node

import { execFileSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { config, initializeDirectories } from '../lib/config.js';
import { ClaudeVideoAnalyzer, ClipRating } from '../lib/claude-integration.js';

interface ManifestEntry {
  index: number;
  normalizedPath: string;
  originalPath: string;
  baseName: string;
  type: 'photo' | 'video';
  duration: number;
}

interface RatedEntry extends ManifestEntry {
  sceneType: string;
  quality: number;
  keep: boolean;
}

interface SelectedSegment {
  entry: RatedEntry;
  trimStart: number;
  duration: number;
  path: string;
}

const DURATION_BY_SCENE: Record<string, number> = {
  landscape: 4.5,
  action: 1.8,
  portrait: 2.8,
  other: 2.5,
};

const CROSSFADE = 0.6; // seconds — smooth fades only, matches the summer aesthetic

function loadManifest(manifestPath: string): ManifestEntry[] {
  const raw = fsSync.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw);
}

// Prefer video over photo, and drop exact-duplicate exports, when multiple
// raw_clips items share a baseName (e.g. IMG_6923.jpeg + IMG_6923.MOV, or
// "IMG_0476.MP4" + "IMG_0476 (1).MP4").
function dedupe(entries: ManifestEntry[]): ManifestEntry[] {
  const groups = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.baseName) || [];
    list.push(entry);
    groups.set(entry.baseName, list);
  }

  const result: ManifestEntry[] = [];
  for (const list of groups.values()) {
    const videos = list.filter((e) => e.type === 'video');
    const chosen = videos.length > 0 ? videos[0] : list[0];
    result.push(chosen);
  }

  return result.sort((a, b) => a.index - b.index);
}

async function analyzeAudio(audioPath: string): Promise<{ bpm: number; beatTimes: number[] }> {
  console.log('🎵 Analyzing music for BPM and beats...');
  const outputFile = path.join(config.directories.temp, 'curate_audio_analysis.json');
  const analysisScript = path.resolve('src/audio_analysis.py');

  const result = spawnSync('python3', [analysisScript, audioPath, '-o', outputFile, '-a', 'full']);
  if (result.status !== 0) {
    console.warn('⚠️  Could not analyze audio, falling back to a default tempo:', result.stderr?.toString());
    return { bpm: 120, beatTimes: [] };
  }

  const data = JSON.parse(fsSync.readFileSync(outputFile, 'utf-8'));
  const bpm = data.tempo?.bpm || 120;
  const beatTimes = data.beats?.beat_times_seconds || [];
  console.log(`  ✅ BPM: ${bpm.toFixed(2)}, beats detected: ${beatTimes.length}`);
  return { bpm, beatTimes };
}

function generateThumbnail(entry: ManifestEntry, thumbDir: string): string {
  const mid = Math.max(0, entry.duration / 2);
  const thumbPath = path.join(thumbDir, `thumb_${String(entry.index).padStart(3, '0')}.jpg`);
  execFileSync('ffmpeg', [
    '-y', '-ss', mid.toFixed(2), '-i', entry.normalizedPath,
    '-frames:v', '1', '-vf', 'scale=480:-1',
    thumbPath, '-loglevel', 'error',
  ]);
  return thumbPath;
}

async function rateClips(entries: ManifestEntry[], mode: string): Promise<Map<number, ClipRating>> {
  const ratings = new Map<number, ClipRating>();

  const useAi = mode === 'ai' && !!config.anthropic.apiKey;
  if (mode === 'ai' && !config.anthropic.apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — falling back to even (non-AI) curation.');
  }

  if (!useAi) {
    for (const entry of entries) {
      ratings.set(entry.index, {
        index: entry.index,
        sceneType: entry.type === 'photo' ? 'landscape' : 'other',
        quality: 5,
        keep: true,
        notable: '',
      });
    }
    return ratings;
  }

  console.log(`🤖 Generating thumbnails for ${entries.length} clips...`);
  const thumbDir = path.join(config.directories.temp, 'thumbnails');
  fsSync.mkdirSync(thumbDir, { recursive: true });

  const withThumbs: { entry: ManifestEntry; thumb: string }[] = [];
  for (const entry of entries) {
    try {
      const thumb = generateThumbnail(entry, thumbDir);
      withThumbs.push({ entry, thumb });
    } catch (err) {
      console.warn(`  ⚠️  Could not generate thumbnail for ${entry.originalPath}`);
    }
  }

  console.log('🤖 Rating clips with Claude (batches of 12)...');
  const claude = new ClaudeVideoAnalyzer();
  const batchSize = 12;

  for (let i = 0; i < withThumbs.length; i += batchSize) {
    const batch = withThumbs.slice(i, i + batchSize);
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(withThumbs.length / batchSize)}...`);

    try {
      const batchRatings = await claude.rateClips(
        batch.map((b) => b.thumb),
        batch.map((b) => b.entry.index)
      );
      for (const r of batchRatings) {
        ratings.set(r.index, r);
      }
    } catch (err) {
      console.warn('  ⚠️  Batch rating failed, using defaults for this batch:', err);
    }

    // Fill in any indices Claude skipped in this batch
    for (const b of batch) {
      if (!ratings.has(b.entry.index)) {
        ratings.set(b.entry.index, {
          index: b.entry.index,
          sceneType: b.entry.type === 'photo' ? 'landscape' : 'other',
          quality: 5,
          keep: true,
          notable: '',
        });
      }
    }
  }

  return ratings;
}

function selectClips(entries: RatedEntry[], targetDuration: number): RatedEntry[] {
  const kept = entries.filter((e) => e.keep);
  const numBuckets = Math.max(1, Math.min(15, kept.length));
  const buckets: RatedEntry[][] = Array.from({ length: numBuckets }, () => []);

  kept.forEach((entry, pos) => {
    const bucketIdx = Math.min(numBuckets - 1, Math.floor((pos / kept.length) * numBuckets));
    buckets[bucketIdx].push(entry);
  });

  buckets.forEach((bucket) => bucket.sort((a, b) => b.quality - a.quality || a.index - b.index));

  const selected: RatedEntry[] = [];
  let total = 0;
  let exhausted = false;

  while (total < targetDuration && !exhausted) {
    exhausted = true;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (!next) continue;
      exhausted = false;
      selected.push(next);
      total += Math.min(DURATION_BY_SCENE[next.sceneType] || 2.5, next.duration);
      if (total >= targetDuration) break;
    }
  }

  return selected.sort((a, b) => a.index - b.index);
}

function trimSegments(
  selected: RatedEntry[],
  beatInterval: number,
  segDir: string
): SelectedSegment[] {
  fsSync.mkdirSync(segDir, { recursive: true });

  return selected.map((entry, i) => {
    const budget = DURATION_BY_SCENE[entry.sceneType] || 2.5;
    const allotted = Math.min(budget, entry.duration);
    const rounded = beatInterval > 0
      ? Math.max(0.8, Math.round(allotted / beatInterval) * beatInterval)
      : allotted;
    const finalDuration = Math.max(0.5, Math.min(rounded, entry.duration));
    const trimStart = entry.type === 'photo' ? 0 : Math.max(0, (entry.duration - finalDuration) / 2);

    const segPath = path.join(segDir, `seg_${String(i).padStart(3, '0')}.mp4`);
    execFileSync('ffmpeg', [
      '-y', '-ss', trimStart.toFixed(3), '-i', entry.normalizedPath,
      '-t', finalDuration.toFixed(3), '-an',
      '-vf', 'setpts=PTS-STARTPTS',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast',
      segPath, '-loglevel', 'error',
    ]);

    return { entry, trimStart, duration: finalDuration, path: segPath };
  });
}

function buildXfadeVideo(segments: SelectedSegment[], outPath: string): number {
  if (segments.length === 1) {
    execFileSync('ffmpeg', [
      '-y', '-i', segments[0].path,
      '-vf', 'eq=saturation=1.15:contrast=1.05:gamma=1.05,colorbalance=rs=0.06:gs=0.02:bs=-0.06',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast',
      outPath, '-loglevel', 'error',
    ]);
    return segments[0].duration;
  }

  const inputArgs: string[] = [];
  segments.forEach((s) => inputArgs.push('-i', s.path));

  const filterParts: string[] = [];
  let runningLabel = '0:v';
  let runningDuration = segments[0].duration;

  for (let i = 1; i < segments.length; i++) {
    const offset = Math.max(0, runningDuration - CROSSFADE);
    const outLabel = i === segments.length - 1 ? 'vpre' : `v${i}`;
    filterParts.push(
      `[${runningLabel}][${i}:v]xfade=transition=fade:duration=${CROSSFADE}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    runningDuration = runningDuration + segments[i].duration - CROSSFADE;
    runningLabel = outLabel;
  }

  filterParts.push(
    `[${runningLabel}]eq=saturation=1.15:contrast=1.05:gamma=1.05,colorbalance=rs=0.06:gs=0.02:bs=-0.06[vout]`
  );

  execFileSync(
    'ffmpeg',
    [
      '-y', ...inputArgs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast',
      outPath, '-loglevel', 'error',
    ],
    { maxBuffer: 1024 * 1024 * 100 }
  );

  return runningDuration;
}

function muxWithMusic(videoPath: string, musicPath: string, duration: number, outPath: string): void {
  const fadeOutStart = Math.max(0, duration - 1);
  const filter = `[1:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=1,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1[aout]`;

  execFileSync('ffmpeg', [
    '-y', '-i', videoPath, '-i', musicPath,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-crf', String(config.video.quality),
    '-c:a', 'aac', '-shortest',
    outPath, '-loglevel', 'error',
  ]);
}

async function main() {
  initializeDirectories();

  const args = process.argv.slice(2);
  const manifestPath = args[0];
  const musicPath = args[1];

  if (!manifestPath || !musicPath) {
    console.log('Usage: curate-and-edit.ts <manifest.json> <music_path> [--duration N] [--mode ai|even]');
    process.exit(1);
  }

  const durationFlagIdx = args.indexOf('--duration');
  const targetDuration = durationFlagIdx !== -1 ? parseFloat(args[durationFlagIdx + 1]) : 60;

  const modeFlagIdx = args.indexOf('--mode');
  const mode = modeFlagIdx !== -1 ? args[modeFlagIdx + 1] : 'ai';

  console.log(`\n🎬 Curating a ${targetDuration}s summer edit (mode: ${mode})...\n`);

  const manifest = loadManifest(manifestPath);
  const deduped = dedupe(manifest);
  console.log(`📋 ${manifest.length} raw items → ${deduped.length} after dedup`);

  const [{ bpm, beatTimes }, ratingsMap] = await Promise.all([
    analyzeAudio(musicPath),
    rateClips(deduped, mode),
  ]);

  const rated: RatedEntry[] = deduped.map((entry) => {
    const r = ratingsMap.get(entry.index);
    return {
      ...entry,
      sceneType: r?.sceneType || (entry.type === 'photo' ? 'landscape' : 'other'),
      quality: r?.quality ?? 5,
      keep: r?.keep ?? true,
    };
  });

  const selected = selectClips(rated, targetDuration);
  console.log(`✅ Selected ${selected.length} clips for the final edit`);

  const beatInterval = bpm > 0 ? 60 / bpm : 0;
  const segDir = path.join(config.directories.temp, 'curated_segments');
  console.log('✂️  Trimming selected clips to beat-aligned durations...');
  const segments = trimSegments(selected, beatInterval, segDir);

  console.log('🎨 Crossfading clips together and applying golden-hour color grade...');
  const curatedVideoPath = path.join(config.directories.temp, 'curated_video.mp4');
  const finalDuration = buildXfadeVideo(segments, curatedVideoPath);

  console.log('🎵 Syncing music...');
  const outputPath = path.join(config.directories.output, 'summer_edit_final.mp4');
  muxWithMusic(curatedVideoPath, musicPath, finalDuration, outputPath);

  console.log(`\n✨ Done! ${selected.length} clips, ~${finalDuration.toFixed(1)}s`);
  console.log(`📁 Output: ${outputPath}\n`);
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  main().catch((err) => {
    console.error('❌ Error during curation pipeline:', err);
    process.exit(1);
  });
}

export { main };
