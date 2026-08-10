import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

interface EditingInstruction {
  timestamp: number;
  type: 'cut' | 'transition' | 'zoom' | 'color_grade' | 'speed_ramp';
  description: string;
  parameters: Record<string, any>;
}

interface SceneAnalysis {
  sceneNumber: number;
  description: string;
  emotions: string[];
  suggestedCuts: number[];
  transitionType: string;
  colorGradeHint: string;
}

export class ClaudeVideoAnalyzer {
  private client: Anthropic;
  private model = 'claude-3-5-haiku-20241022'; // 73% cheaper than Sonnet

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async analyzeKeyframes(
    keyframePaths: string[],
    beatTiming: { bpm: number; beatTimes: number[] },
    audioDescription: string = 'Travel vlog background music'
  ): Promise<SceneAnalysis[]> {
    try {
      // Convert images to base64
      const imageContents: Anthropic.ImageBlockParam[] = [];

      for (const framePath of keyframePaths.slice(0, 10)) {
        try {
          const imageData = await fs.readFile(framePath);
          const base64 = imageData.toString('base64');
          imageContents.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64,
            },
          });
        } catch (err) {
          console.warn(`Could not load frame: ${framePath}`);
        }
      }

      if (imageContents.length === 0) {
        return [];
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              {
                type: 'text',
                text: `Analyze these video keyframes for a travel vlog editing scenario.

Audio context: ${audioDescription}
BPM: ${beatTiming.bpm}
Available beat points (seconds): ${beatTiming.beatTimes.slice(0, 20).join(', ')}

For each scene shown, provide:
1. A brief description of the content
2. Dominant emotions (energy level, mood)
3. Suggested cut points that align with beat times
4. Recommended transition type (cut, fade, wipe, etc.)
5. Color grading hint (warm, cool, saturated, desaturated, etc.)

Format as JSON array of scenes. Example:
[
  {
    "sceneNumber": 1,
    "description": "Mountain landscape at sunrise",
    "emotions": ["serene", "inspiring", "peaceful"],
    "suggestedCuts": [0.5, 1.2, 2.8],
    "transitionType": "fade",
    "colorGradeHint": "warm, high saturation"
  }
]

Respond ONLY with valid JSON, no markdown.`,
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return JSON.parse(content.text);
    } catch (error) {
      console.error('Error analyzing keyframes:', error);
      return [];
    }
  }

  async generateEditingPlan(
    sceneAnalysis: SceneAnalysis[],
    beatData: { bpm: number; beatTimes: number[] },
    targetDuration: number = 60
  ): Promise<EditingInstruction[]> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: `Generate an editing plan for a travel vlog with the following scenes:

Scenes: ${JSON.stringify(sceneAnalysis, null, 2)}

Beat timing:
- BPM: ${beatData.bpm}
- Beat times (seconds): ${beatData.beatTimes.join(', ')}

Requirements:
1. Create cuts synchronized to beat points
2. Use transitions that match emotional tone
3. Target final video duration: ${targetDuration} seconds
4. Prioritize high-energy scenes during bass drops
5. Use slower transitions during mellower sections

Return a JSON array of editing instructions with this structure:
[
  {
    "timestamp": 0.5,
    "type": "cut",
    "description": "Cut to mountain scene",
    "parameters": {
      "easeType": "linear",
      "duration": 0.3
    }
  },
  {
    "timestamp": 1.2,
    "type": "transition",
    "description": "Fade transition",
    "parameters": {
      "transitionType": "fade",
      "duration": 0.5
    }
  }
]

Respond ONLY with valid JSON, no markdown.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return JSON.parse(content.text);
    } catch (error) {
      console.error('Error generating editing plan:', error);
      return [];
    }
  }

  async analyzeAudioDescription(audioPath: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this audio file for editing purposes and provide:
1. Detected genre or style
2. Energy level progression (0-10 scale over time)
3. Key moments (build-ups, drops, transitions)
4. Suggested pacing (slow, moderate, fast)
5. Emotional tone

File: ${audioPath}

Respond as a brief JSON object suitable for video editing decisions.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return content.text;
    } catch (error) {
      console.error('Error analyzing audio description:', error);
      return '';
    }
  }
}
