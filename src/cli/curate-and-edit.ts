#!/usr/bin/env node

import { execFileSync, spawnSync } from 'child_process';
import path from 'path';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { config, initializeDirectories } from '../lib/config.js';
import { ClaudeVideoAnalyzer, ClipRating, EditReview } from '../lib/claude-integration.js';

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
  hookWorthy: boolean;
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
const MAX_REFINE_ITERATIONS = 2;
const REVIEW_FRAME_COUNT = 10;

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
  const tempoOk = typeof data.tempo?.bpm === 'number' && data.tempo.bpm > 0;
  if (!tempoOk) {
    console.warn(`⚠️  BPM detection failed (${data.tempo?.error || 'unknown error'}) — using default 120 BPM, cuts won't be beat-accurate.`);
  }
  const bpm = tempoOk ? data.tempo.bpm : 120;
  const beatTimes = data.beats?.beat_times_seconds || [];
  if (beatTimes.length === 0 && data.beats?.error) {
    console.warn(`⚠️  Beat detection failed: ${data.beats.error}`);
  }
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

function defaultRating(entry: ManifestEntry): ClipRating {
  return {
    index: entry.index,
    sceneType: entry.type === 'photo' ? 'landscape' : 'other',
    quality: 5,
    keep: true,
    hookWorthy: false,
    notable: '',
  };
}

async function rateClips(entries: ManifestEntry[], mode: string): Promise<{ ratings: Map<number, ClipRating>; usedAi: boolean }> {
  const ratings = new Map<number, ClipRating>();
  let useAi = mode === 'ai' && !!config.anthropic.apiKey;

  if (mode === 'ai' && !config.anthropic.apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set — falling back to even (non-AI) curation.');
  }

  if (useAi) {
    const claude = new ClaudeVideoAnalyzer();
    const auth = await claude.verifyAuth();
    if (!auth.ok) {
      console.warn('⚠️  Claude API auth check failed — falling back to even (non-AI) curation.');
      console.warn(`   Reason: ${auth.message}`);
      if (auth.message.includes('workspace-id')) {
        console.warn('   Fix: your API key is "identity-linked" (tied to your login across multiple');
        console.warn('   workspaces) rather than scoped to one workspace. Either:');
        console.warn('     1. Generate a workspace-scoped key at console.anthropic.com → Settings → API Keys');
        console.warn('        (create it while a specific workspace is selected), or');
        console.warn('     2. Set ANTHROPIC_WORKSPACE_ID=<your workspace id> in .env alongside your API key.');
      }
      useAi = false;
    }
  }

  if (!useAi) {
    for (const entry of entries) {
      ratings.set(entry.index, defaultRating(entry));
    }
    return { ratings, usedAi: false };
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

    for (const b of batch) {
      if (!ratings.has(b.entry.index)) {
        ratings.set(b.entry.index, defaultRating(b.entry));
      }
    }
  }

  return { ratings, usedAi: true };
}

// Bucket clips chronologically so highlights spread across the whole trip,
// then fill the target duration biased toward video clips first (photos
// only fill remaining budget) so a big photo dump doesn't crowd out footage.
function selectClips(entries: RatedEntry[], targetDuration: number, videoRatio: number): RatedEntry[] {
  const kept = entries.filter((e) => e.keep);
  const numBuckets = Math.max(1, Math.min(15, kept.length));
  const buckets: RatedEntry[][] = Array.from({ length: numBuckets }, () => []);

  kept.forEach((entry, pos) => {
    const bucketIdx = Math.min(numBuckets - 1, Math.floor((pos / kept.length) * numBuckets));
    buckets[bucketIdx].push(entry);
  });

  buckets.forEach((bucket) => bucket.sort((a, b) => b.quality - a.quality || a.index - b.index));

  const durationOf = (e: RatedEntry) => Math.min(DURATION_BY_SCENE[e.sceneType] || 2.5, e.duration);

  const selected: RatedEntry[] = [];
  let total = 0;
  let videoTotal = 0;
  const videoTarget = targetDuration * videoRatio;

  // Phase 1: round-robin across buckets, videos only, until the video
  // budget is hit or every bucket has run out of video candidates.
  let exhausted = false;
  while (videoTotal < videoTarget && total < targetDuration && !exhausted) {
    exhausted = true;
    for (const bucket of buckets) {
      const idx = bucket.findIndex((e) => e.type === 'video');
      if (idx === -1) continue;
      const next = bucket.splice(idx, 1)[0];
      exhausted = false;
      selected.push(next);
      const d = durationOf(next);
      total += d;
      videoTotal += d;
      if (videoTotal >= videoTarget || total >= targetDuration) break;
    }
  }

  // Phase 2: round-robin across buckets with whatever's left (video or
  // photo) to fill the remaining time budget.
  exhausted = false;
  while (total < targetDuration && !exhausted) {
    exhausted = true;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (!next) continue;
      exhausted = false;
      selected.push(next);
      total += durationOf(next);
      if (total >= targetDuration) break;
    }
  }

  return selected.sort((a, b) => a.index - b.index);
}

// Open on the single strongest "hook" shot (short-form best practice: grab
// attention in the first second), then break up any 3-in-a-row run of the
// same scene type so the pacing doesn't feel monotonous.
function orderClips(selected: RatedEntry[]): RatedEntry[] {
  const ordered = [...selected];

  const hookCandidates = ordered.filter((e) => e.hookWorthy).sort((a, b) => b.quality - a.quality);
  if (hookCandidates.length > 0) {
    const hook = hookCandidates[0];
    const idx = ordered.findIndex((e) => e.index === hook.index);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(hook);
    }
  }

  for (let i = 0; i < ordered.length - 2; i++) {
    if (ordered[i].sceneType === ordered[i + 1].sceneType && ordered[i + 1].sceneType === ordered[i + 2].sceneType) {
      const swapWith = ordered.findIndex((e, j) => j > i + 2 && e.sceneType !== ordered[i].sceneType);
      if (swapWith !== -1) {
        [ordered[i + 2], ordered[swapWith]] = [ordered[swapWith], ordered[i + 2]];
      }
    }
  }

  return ordered;
}

// Swap out clips at the given 1-indexed positions for the best available
// replacement from the unused pool (weighted toward quality and temporal
// closeness so the substitution still fits the surrounding story beat).
function refineSelection(ordered: RatedEntry[], pool: RatedEntry[], weakPositions: number[]): RatedEntry[] {
  const next = [...ordered];
  const used = new Set(next.map((e) => e.index));
  const available = pool.filter((e) => !used.has(e.index));

  for (const posNum of weakPositions) {
    const i = posNum - 1;
    if (i < 0 || i >= next.length || available.length === 0) continue;

    const weak = next[i];
    let bestIdx = -1;
    let bestScore = -Infinity;
    available.forEach((candidate, ci) => {
      if (used.has(candidate.index)) return;
      const score = candidate.quality * 2 - Math.abs(candidate.index - weak.index) * 0.03;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = ci;
      }
    });

    if (bestIdx === -1) continue;
    const replacement = available.splice(bestIdx, 1)[0];
    used.delete(weak.index);
    used.add(replacement.index);
    next[i] = replacement;
  }

  return next;
}

function trimSegments(selected: RatedEntry[], beatInterval: number, segDir: string): SelectedSegment[] {
  fsSync.rmSync(segDir, { recursive: true, force: true });
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

function muxWithMusic(videoPath: string, musicPath: string, duration: number, audioStart: number, outPath: string): void {
  const fadeOutStart = Math.max(0, duration - 1);
  const filter = `[1:a]atrim=${audioStart.toFixed(3)}:${(audioStart + duration).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=1,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=1[aout]`;

  execFileSync('ffmpeg', [
    '-y', '-i', videoPath, '-i', musicPath,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-crf', String(config.video.quality),
    '-c:a', 'aac', '-shortest',
    outPath, '-loglevel', 'error',
  ]);
}

function extractReviewFrames(videoPath: string, duration: number, count: number, dir: string): string[] {
  fsSync.rmSync(dir, { recursive: true, force: true });
  fsSync.mkdirSync(dir, { recursive: true });
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    const p = path.join(dir, `review_${String(i).padStart(2, '0')}.jpg`);
    execFileSync('ffmpeg', ['-y', '-ss', t.toFixed(2), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-1', p, '-loglevel', 'error']);
    frames.push(p);
  }
  return frames;
}

function renderEdit(
  ordered: RatedEntry[],
  beatInterval: number,
  musicPath: string,
  audioStart: number,
  outputPath: string
): number {
  const segDir = path.join(config.directories.temp, 'curated_segments');
  const segments = trimSegments(ordered, beatInterval, segDir);

  const curatedVideoPath = path.join(config.directories.temp, 'curated_video.mp4');
  const finalDuration = buildXfadeVideo(segments, curatedVideoPath);

  muxWithMusic(curatedVideoPath, musicPath, finalDuration, audioStart, outputPath);
  return finalDuration;
}

async function main() {
  initializeDirectories();

  const args = process.argv.slice(2);
  const manifestPath = args[0];
  const musicPath = args[1];

  if (!manifestPath || !musicPath) {
    console.log('Usage: curate-and-edit.ts <manifest.json> <music_path> [--duration N] [--mode ai|even] [--audio-start N] [--video-ratio N]');
    process.exit(1);
  }

  const flag = (name: string, fallback: string) => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : fallback;
  };

  const targetDuration = parseFloat(flag('--duration', '60'));
  const mode = flag('--mode', 'ai');
  const audioStart = parseFloat(flag('--audio-start', process.env.AUDIO_START_OFFSET || '0'));
  const videoRatio = parseFloat(flag('--video-ratio', process.env.VIDEO_RATIO || '0.75'));

  console.log(`\n🎬 Curating a ${targetDuration}s summer edit (mode: ${mode}, audio start: ${audioStart}s, video ratio: ${videoRatio})...\n`);

  const manifest = loadManifest(manifestPath);
  const deduped = dedupe(manifest);
  console.log(`📋 ${manifest.length} raw items → ${deduped.length} after dedup`);

  const [{ bpm, beatTimes }, { ratings, usedAi }] = await Promise.all([
    analyzeAudio(musicPath),
    rateClips(deduped, mode),
  ]);

  const rated: RatedEntry[] = deduped.map((entry) => {
    const r = ratings.get(entry.index);
    return {
      ...entry,
      sceneType: r?.sceneType || (entry.type === 'photo' ? 'landscape' : 'other'),
      quality: r?.quality ?? 5,
      keep: r?.keep ?? true,
      hookWorthy: r?.hookWorthy ?? false,
    };
  });

  const beatInterval = bpm > 0 ? 60 / bpm : 0;
  const outputPath = path.join(config.directories.output, 'summer_edit_final.mp4');

  let selected = selectClips(rated, targetDuration, videoRatio);
  let ordered = orderClips(selected);
  console.log(`✅ Selected ${ordered.length} clips for the final edit`);

  console.log('✂️  Trimming, crossfading, and syncing music...');
  let finalDuration = renderEdit(ordered, beatInterval, musicPath, audioStart, outputPath);
  console.log(`   Render: ${ordered.length} clips, ~${finalDuration.toFixed(1)}s`);

  if (usedAi) {
    const usedIndices = new Set(ordered.map((e) => e.index));
    const pool = rated.filter((e) => e.keep && !usedIndices.has(e.index));
    const claude = new ClaudeVideoAnalyzer();

    for (let iteration = 1; iteration <= MAX_REFINE_ITERATIONS; iteration++) {
      console.log(`🔍 Reviewing edit (pass ${iteration}/${MAX_REFINE_ITERATIONS})...`);
      const reviewDir = path.join(config.directories.temp, 'review_frames');
      const frames = extractReviewFrames(outputPath, finalDuration, REVIEW_FRAME_COUNT, reviewDir);

      let review: EditReview;
      try {
        review = await claude.reviewEdit(frames);
      } catch (err) {
        console.warn('   ⚠️  Review call failed, keeping current edit:', err);
        break;
      }

      console.log(`   Score: ${review.overallScore}/10, hook good: ${review.hookGood}`);
      if (review.issues.length > 0) {
        review.issues.forEach((issue) => console.log(`   - ${issue}`));
      }

      if (review.overallScore >= 7 && review.weakPositions.length === 0) {
        console.log('   ✅ Edit looks solid, keeping it.');
        break;
      }

      if (review.weakPositions.length === 0 || pool.length === 0) {
        console.log('   No further improvements available, keeping current edit.');
        break;
      }

      console.log(`   Swapping weak position(s): ${review.weakPositions.join(', ')}`);
      const usedBefore = new Set(ordered.map((e) => e.index));
      ordered = refineSelection(ordered, pool, review.weakPositions);
      ordered = orderClips(ordered);

      // Keep the pool in sync: anything newly used comes out, anything
      // freed up (swapped away) goes back in.
      const usedAfter = new Set(ordered.map((e) => e.index));
      for (let i = pool.length - 1; i >= 0; i--) {
        if (usedAfter.has(pool[i].index)) pool.splice(i, 1);
      }
      for (const e of rated) {
        if (e.keep && usedBefore.has(e.index) && !usedAfter.has(e.index) && !pool.some((p) => p.index === e.index)) {
          pool.push(e);
        }
      }

      finalDuration = renderEdit(ordered, beatInterval, musicPath, audioStart, outputPath);
      console.log(`   Re-render: ${ordered.length} clips, ~${finalDuration.toFixed(1)}s`);
    }
  }

  console.log(`\n✨ Done! ${ordered.length} clips, ~${finalDuration.toFixed(1)}s`);
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
