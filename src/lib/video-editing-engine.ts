import { FFmpegWrapper } from './ffmpeg-wrapper.js';
import { ClaudeVideoAnalyzer } from './claude-integration.js';
import { config } from './config.js';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

interface AudioAnalysisResult {
  bpm: number;
  beatTimes: number[];
  onsets: number[];
  confidence: number;
}

interface EditProject {
  name: string;
  videoPath: string;
  audioPath: string;
  outputPath: string;
  metadata: any;
  audioAnalysis: AudioAnalysisResult | null;
  editInstructions: any[];
}

export class VideoEditingEngine {
  private ffmpeg: FFmpegWrapper;
  private claude: ClaudeVideoAnalyzer;
  private workDir: string;

  constructor(workDir: string = config.directories.temp) {
    this.ffmpeg = new FFmpegWrapper(config.ffmpeg.ffmpegPath, config.ffmpeg.ffprobePath);
    this.claude = new ClaudeVideoAnalyzer();
    this.workDir = workDir;
  }

  async analyzeAudio(audioPath: string): Promise<AudioAnalysisResult> {
    console.log('🎵 Analyzing audio for BPM and beats...');

    return new Promise((resolve, reject) => {
      const analysisScript = path.resolve('src/audio_analysis.py');
      const outputFile = path.join(this.workDir, 'audio_analysis.json');

      const proc = spawn('python3', [
        analysisScript,
        audioPath,
        '-o',
        outputFile,
        '-a',
        'full',
      ]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          console.error('Audio analysis error:', stderr);
          reject(new Error(`Python script failed with code ${code}`));
          return;
        }

        try {
          const analysisData = JSON.parse(await fs.readFile(outputFile, 'utf-8'));
          const result: AudioAnalysisResult = {
            bpm: analysisData.tempo.bpm,
            beatTimes: analysisData.beats.beat_times_seconds || [],
            onsets: analysisData.onsets.onset_times_seconds || [],
            confidence: analysisData.tempo.confidence,
          };

          console.log(`  ✅ BPM: ${result.bpm.toFixed(2)}`);
          console.log(`  ✅ Beats detected: ${result.beatTimes.length}`);
          console.log(`  ✅ Confidence: ${result.confidence.toFixed(2)}`);

          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async createEditProject(
    projectName: string,
    videoPath: string,
    audioPath: string
  ): Promise<EditProject> {
    console.log(`\n📁 Creating edit project: ${projectName}`);

    const project: EditProject = {
      name: projectName,
      videoPath,
      audioPath,
      outputPath: path.join(config.directories.output, `${projectName}_final.mp4`),
      metadata: {},
      audioAnalysis: null,
      editInstructions: [],
    };

    // Get video metadata
    project.metadata = await this.ffmpeg.getMetadata(videoPath);

    // Analyze audio
    try {
      project.audioAnalysis = await this.analyzeAudio(audioPath);
    } catch (err) {
      console.warn('⚠️  Could not analyze audio:', err);
    }

    console.log(`✅ Project created with ${project.audioAnalysis?.beatTimes.length || 0} beats\n`);

    return project;
  }

  async generateEditingPlan(project: EditProject): Promise<void> {
    if (!project.audioAnalysis) {
      console.warn('⚠️  Skipping editing plan (no audio analysis available)');
      return;
    }

    console.log('🤖 Generating AI editing plan...');

    try {
      // Extract keyframes for scene analysis
      const framesDir = path.join(this.workDir, `${project.name}_frames`);
      const frames = await this.ffmpeg.extractKeyframes(project.videoPath, {
        outputDir: framesDir,
        maxFrames: Math.min(10, config.processing.maxFramesAnalyze),
      });

      console.log(`  Analyzing ${frames.length} keyframes...`);

      // Get scene analysis from Claude
      const sceneAnalysis = await this.claude.analyzeKeyframes(
        frames,
        {
          bpm: project.audioAnalysis.bpm,
          beatTimes: project.audioAnalysis.beatTimes,
        },
        'Travel vlog background music'
      );

      if (sceneAnalysis.length > 0) {
        console.log(`  ✅ Analyzed ${sceneAnalysis.length} scenes`);

        // Generate editing instructions
        project.editInstructions = await this.claude.generateEditingPlan(
          sceneAnalysis,
          {
            bpm: project.audioAnalysis.bpm,
            beatTimes: project.audioAnalysis.beatTimes,
          },
          project.metadata.duration
        );

        console.log(`✅ Generated ${project.editInstructions.length} editing instructions\n`);

        // Save editing plan
        const planFile = path.join(this.workDir, `${project.name}_edit_plan.json`);
        await fs.writeFile(
          planFile,
          JSON.stringify(
            {
              projectName: project.name,
              sceneAnalysis,
              editInstructions: project.editInstructions,
            },
            null,
            2
          )
        );

        console.log(`📋 Edit plan saved to ${planFile}`);
      }
    } catch (err) {
      console.warn('⚠️  Could not generate editing plan:', err);
    }
  }

  async executeEdits(project: EditProject): Promise<string> {
    console.log('\n⚙️  Executing video edits...');

    if (project.editInstructions.length === 0) {
      console.log('  ⚠️  No edit instructions to execute, syncing audio only...');
      return await this.syncAudioToVideo(project);
    }

    // For now, just sync audio to video
    // Full editing execution would require implementing FFmpeg filter chains
    return await this.syncAudioToVideo(project);
  }

  private async syncAudioToVideo(project: EditProject): Promise<string> {
    console.log(`  Syncing audio to video...`);
    await this.ffmpeg.syncAudioToVideo(
      project.videoPath,
      project.audioPath,
      project.outputPath,
      0
    );
    console.log(`✅ Output saved to ${project.outputPath}`);
    return project.outputPath;
  }

  async processVideo(
    projectName: string,
    videoPath: string,
    audioPath: string,
    generatePlan: boolean = true
  ): Promise<EditProject> {
    console.log('\n🎬 Starting video processing pipeline...\n');

    // Create project
    const project = await this.createEditProject(projectName, videoPath, audioPath);

    // Generate AI editing plan
    if (generatePlan && config.anthropic.apiKey) {
      await this.generateEditingPlan(project);
    }

    // Execute edits
    await this.executeEdits(project);

    console.log('\n✨ Video processing complete!\n');
    return project;
  }
}
