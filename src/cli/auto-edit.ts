#!/usr/bin/env node

import { VideoEditingEngine } from '../lib/video-editing-engine.js';
import { config, initializeDirectories, validateConfig } from '../lib/config.js';
import path from 'path';

interface AutoEditOptions {
  projectName: string;
  videoPath: string;
  audioPath?: string;
  useAiPlan?: boolean;
  outputDir?: string;
}

async function autoEdit(options: AutoEditOptions) {
  const {
    projectName,
    videoPath,
    audioPath,
    useAiPlan = true,
    outputDir = config.directories.output,
  } = options;

  // Initialize
  initializeDirectories();
  validateConfig();

  if (!config.anthropic.apiKey && useAiPlan) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set. AI editing plan will be skipped.');
    console.warn('    Set the key in .env to enable intelligent scene analysis.\n');
  }

  const engine = new VideoEditingEngine();

  try {
    const project = await engine.processVideo(
      projectName,
      videoPath,
      audioPath || videoPath,
      useAiPlan
    );

    console.log('📊 Project Summary:');
    console.log(`  Name: ${project.name}`);
    console.log(`  Video: ${path.basename(project.videoPath)}`);
    if (project.audioAnalysis) {
      console.log(`  Audio BPM: ${project.audioAnalysis.bpm.toFixed(2)}`);
      console.log(`  Beats: ${project.audioAnalysis.beatTimes.length}`);
    }
    console.log(`  Output: ${project.outputPath}`);
  } catch (error) {
    console.error('❌ Error during video editing:', error);
    process.exit(1);
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node auto-edit.ts <video_path> [audio_path] [--no-ai]');
    console.log('\nExamples:');
    console.log('  node auto-edit.ts travel_vlog.mp4');
    console.log('  node auto-edit.ts travel_vlog.mp4 background_music.mp3');
    console.log('  node auto-edit.ts travel_vlog.mp4 --no-ai  # Skip AI analysis');
    process.exit(1);
  }

  const videoPath = args[0];
  const audioPath = args.includes('--no-ai') ? videoPath : args[1] || videoPath;
  const useAiPlan = !args.includes('--no-ai');
  const projectName = path.basename(videoPath, path.extname(videoPath));

  autoEdit({
    projectName,
    videoPath,
    audioPath,
    useAiPlan,
  }).catch(console.error);
}

export { autoEdit };
