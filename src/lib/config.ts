import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export interface Config {
  anthropic: {
    apiKey: string;
    workspaceId: string;
  };
  ffmpeg: {
    ffmpegPath: string;
    ffprobePath: string;
  };
  audio: {
    sampleRate: number;
    nFft: number;
  };
  video: {
    defaultCodec: string;
    audioCodec: string;
    quality: number;
    maxResolution: string;
  };
  processing: {
    maxFramesAnalyze: number;
    maxVideosBatch: number;
  };
  directories: {
    rawClips: string;
    audio: string;
    output: string;
    temp: string;
    cache: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    verbose: boolean;
  };
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const config: Config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || '',
  },
  ffmpeg: {
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  },
  audio: {
    sampleRate: parseInt(process.env.AUDIO_SR || '22050'),
    nFft: parseInt(process.env.AUDIO_N_FFT || '2048'),
  },
  video: {
    defaultCodec: process.env.DEFAULT_VIDEO_CODEC || 'libx264',
    audioCodec: process.env.DEFAULT_AUDIO_CODEC || 'aac',
    quality: parseInt(process.env.OUTPUT_QUALITY || '23'),
    maxResolution: process.env.MAX_VIDEO_RESOLUTION || '1280x720',
  },
  processing: {
    maxFramesAnalyze: parseInt(process.env.MAX_FRAMES_ANALYZE || '30'),
    maxVideosBatch: parseInt(process.env.MAX_VIDEOS_BATCH || '5'),
  },
  directories: {
    rawClips: process.env.RAW_CLIPS_DIR || './raw_clips',
    audio: process.env.AUDIO_DIR || './audio',
    output: process.env.OUTPUT_DIR || './output',
    temp: process.env.TEMP_DIR || './temp',
    cache: process.env.CACHE_DIR || './.cache',
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    verbose: process.env.VERBOSE === 'true',
  },
};

// Ensure all directories exist
export function initializeDirectories(): void {
  Object.values(config.directories).forEach(ensureDirectory);
}

// Validate configuration
export function validateConfig(): void {
  if (!config.anthropic.apiKey && process.env.NODE_ENV !== 'test') {
    console.warn('Warning: ANTHROPIC_API_KEY not set. AI features will be disabled.');
  }
}
