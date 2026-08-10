import { VideoEditingEngine } from './lib/video-editing-engine.js';
import { FFmpegWrapper } from './lib/ffmpeg-wrapper.js';
import { ClaudeVideoAnalyzer } from './lib/claude-integration.js';
import { config, initializeDirectories, validateConfig } from './lib/config.js';

export {
  VideoEditingEngine,
  FFmpegWrapper,
  ClaudeVideoAnalyzer,
  config,
  initializeDirectories,
  validateConfig,
};

// Initialize on import
initializeDirectories();
validateConfig();
