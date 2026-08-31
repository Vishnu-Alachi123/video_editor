import { FFmpegWrapper, VideoMetadata } from '../lib/ffmpeg-wrapper.js';
import { config, initializeDirectories } from '../lib/config.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

interface ExtractOptions {
  videoPath: string;
  extractAudio?: boolean;
  extractFrames?: boolean;
  maxFrames?: number;
  outputDir?: string;
}

interface ExtractionResult {
  videoPath: string;
  metadata: VideoMetadata;
  outputDir: string;
}

async function extractVideo(options: ExtractOptions): Promise<ExtractionResult> {
  const {
    videoPath,
    extractAudio = true,
    extractFrames = true,
    maxFrames = config.processing.maxFramesAnalyze,
    outputDir = config.directories.temp,
  } = options;

  initializeDirectories();

  console.log(`\n🎬 Extracting video: ${videoPath}\n`);

  const wrapper = new FFmpegWrapper(config.ffmpeg.ffmpegPath, config.ffmpeg.ffprobePath);

  try {
    // Get metadata
    console.log('📊 Reading video metadata...');
    const metadata = await wrapper.getMetadata(videoPath);
    console.log(`  Duration: ${metadata.duration.toFixed(2)}s`);
    console.log(`  Resolution: ${metadata.width}x${metadata.height}`);
    console.log(`  FPS: ${metadata.fps.toFixed(2)}`);
    console.log(`  Codec: ${metadata.codec}`);
    console.log(`  Bitrate: ${(metadata.bitrate / 1000000).toFixed(2)} Mbps\n`);

    const metadataFile = path.join(outputDir, 'metadata.json');
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    console.log(`✅ Metadata saved to ${metadataFile}`);

    // Extract audio
    if (extractAudio) {
      console.log('\n🎵 Extracting audio track...');
      const audioPath = path.join(outputDir, 'audio.mp3');
      await wrapper.extractAudio(videoPath, audioPath);
      console.log(`✅ Audio saved to ${audioPath}`);
    }

    // Extract keyframes
    if (extractFrames) {
      console.log('\n📸 Extracting keyframes...');
      const framesDir = path.join(outputDir, 'frames');
      const frames = await wrapper.extractKeyframes(videoPath, {
        outputDir: framesDir,
        maxFrames,
      });
      console.log(`✅ Extracted ${frames.length} frames to ${framesDir}`);
    }

    console.log('\n✨ Video extraction complete!\n');

    return {
      videoPath,
      metadata,
      outputDir,
    };
  } catch (error) {
    console.error('❌ Error extracting video:', error);
    throw error;
  }
}

// CLI usage
const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  const videoPath = process.argv[2];

  if (!videoPath) {
    console.log('Usage: node --loader ts-node/esm src/cli/extract-video.ts <video_path>');
    console.log('Example: node --loader ts-node/esm src/cli/extract-video.ts video.mp4');
    process.exit(1);
  }

  extractVideo({
    videoPath,
    extractAudio: true,
    extractFrames: true,
    maxFrames: 30,
  }).catch(console.error);
}

export { extractVideo };
