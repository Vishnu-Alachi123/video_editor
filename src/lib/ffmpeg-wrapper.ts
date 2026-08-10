import ffmpeg from 'fluent-ffmpeg';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';

interface VideoMetadata {
  duration: number;
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
}

interface ExtractionOptions {
  outputDir: string;
  maxFrames?: number;
  quality?: number;
  interval?: number;
}

interface CutPoint {
  start: number;
  end: number;
  label?: string;
}

export class FFmpegWrapper extends EventEmitter {
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor(ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe') {
    super();
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
  }

  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) reject(err);
        const stream = metadata.streams.find(s => s.codec_type === 'video');
        if (!stream) throw new Error('No video stream found');

        resolve({
          duration: metadata.format.duration || 0,
          fps: eval(stream.r_frame_rate),
          width: stream.width || 0,
          height: stream.height || 0,
          bitrate: parseInt(stream.bit_rate || '0'),
          codec: stream.codec_name || 'unknown',
        });
      });
    });
  }

  async extractAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .on('error', reject)
        .on('end', resolve)
        .save(outputPath);
    });
  }

  async extractKeyframes(
    inputPath: string,
    options: ExtractionOptions
  ): Promise<string[]> {
    const { outputDir, maxFrames = 30, quality = 5, interval = undefined } = options;

    await fs.mkdir(outputDir, { recursive: true });

    const metadata = await this.getMetadata(inputPath);
    const fps = metadata.fps;
    const duration = metadata.duration;

    let filterSpec: string;
    if (interval) {
      const frameInterval = Math.floor(fps * interval);
      filterSpec = `fps=1/${interval}`;
    } else {
      const frameSkip = Math.max(1, Math.floor((fps * duration) / maxFrames));
      filterSpec = `fps=fps=${fps / frameSkip}`;
    }

    return new Promise((resolve, reject) => {
      const frameFiles: string[] = [];
      ffmpeg(inputPath)
        .outputOptions([
          `-vf`,
          `${filterSpec}`,
          `-q:v`,
          `${quality}`,
        ])
        .output(path.join(outputDir, 'frame_%04d.jpg'))
        .on('error', reject)
        .on('end', async () => {
          try {
            const files = await fs.readdir(outputDir);
            const frames = files
              .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
              .sort()
              .slice(0, maxFrames)
              .map(f => path.join(outputDir, f));
            resolve(frames);
          } catch (err) {
            reject(err);
          }
        })
        .run();
    });
  }

  async cutSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    endTime: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', '23'])
        .on('error', reject)
        .on('end', resolve)
        .save(outputPath);
    });
  }

  async concatenateVideos(inputPaths: string[], outputPath: string): Promise<void> {
    const concatList = inputPaths.join('|');
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(`concat:${concatList}`)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-crf', '23'])
        .on('error', reject)
        .on('end', resolve)
        .save(outputPath);
    });
  }

  async syncAudioToVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    audioStartMs: number = 0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-ss',
          `${audioStartMs / 1000}`,
          '-shortest',
        ])
        .on('error', reject)
        .on('end', resolve)
        .save(outputPath);
    });
  }

  async scaleVideo(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-vf', `scale=${width}:${height}`])
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('error', reject)
        .on('end', resolve)
        .save(outputPath);
    });
  }

  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp: number = 0
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          count: 1,
          folder: path.dirname(outputPath),
          filename: path.basename(outputPath),
          timestamps: [timestamp],
        })
        .on('error', reject)
        .on('end', resolve);
    });
  }
}
