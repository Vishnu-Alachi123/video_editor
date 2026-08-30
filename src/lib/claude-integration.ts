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
                text: `You are editing a SUMMER INSTAGRAM REELS travel vlog. Analyze these keyframes with this EXACT aesthetic:

EDITING STYLE: Cinematic Instagram Reels (dreamy, nostalgic, summer montage)
MUSIC: ${audioDescription} (${beatTiming.bpm} BPM - use this for pacing)
FORMAT: Vertical 9:16 (Instagram Reels optimized)
VIBE: Summer memories collection, like Tame Impala energy (psychedelic but chill)

COLOR GRADING:
- Warm golden tones (beach sunset aesthetic)
- Slightly saturated (dreamy, not oversaturated)
- Soft highlights (nostalgic, not harsh)
- Subtle vintage tint (Summer 2024 vibes)
- HIGH contrast on beaches (punchy blues against golden sand)

PACING & TRANSITIONS:
- Landscapes: 3-5 sec per scene (let them breathe, cinematic)
- Regular scenes: 2-3 sec (medium pacing)
- Action/bars: 1-2 sec (faster energy)
- Transitions: Smooth fades ONLY (no jarring cuts, no zoom)
- Sync beats: Subtle cuts on beat changes, not aggressive

CUTTING STRATEGY:
- Longer holds on beautiful/serene scenes
- Cuts align to BPM but feel natural, not robotic
- Match emotional pacing to music energy
- Emphasize quiet moments (beach sunrise > night clubs)

For EACH scene, provide:
1. What you see (beach, bar, sunset, people, water, etc.)
2. Mood/energy level (serene, joyful, contemplative, energetic)
3. Cut points that sync with beats: ${beatTiming.beatTimes.slice(0, 15).join(', ')}
4. Transition: "fade" (ALWAYS fade for this aesthetic)
5. Color grade: golden/warm/dreamy tone description

OUTPUT FORMAT (JSON ONLY):
[
  {
    "sceneNumber": 1,
    "description": "Golden hour beach landscape, waves, sunset",
    "emotions": ["serene", "peaceful", "nostalgic"],
    "suggestedCuts": [0.5, 2.1, 4.3],
    "transitionType": "fade",
    "colorGradeHint": "golden hour, warm tones, high saturation on sky, soft shadows"
  }
]

RESPOND ONLY WITH JSON, NO MARKDOWN.`,
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
            content: `SUMMER INSTAGRAM REELS EDITING PLAN

Scenes analyzed: ${JSON.stringify(sceneAnalysis, null, 2)}

Music timing:
- BPM: ${beatData.bpm}
- Beat points (seconds): ${beatData.beatTimes.join(', ')}
- Target length: ${targetDuration} seconds

EDITING RULES:
1. Maintain dreamy, cinematic pacing (NOT TikTok-fast)
2. Landscapes = longer holds (3-5 sec) to let beauty sink in
3. Regular clips = medium pacing (2-3 sec)
4. Energy moments (bars, action) = faster (1-2 sec)
5. ALL transitions = smooth FADE (no hard cuts, no zooms)
6. Sync cuts to BEAT POINTS but feel organic, not robotic
7. Emphasize emotional arc: serene → joy → reflective → energetic → nostalgic
8. Golden hour/sunset scenes get longest holds
9. Quiet moments > action moments for this vibe

GOLDEN HOUR RULE: Extend scenes with warm tones/sunsets by 1-2 extra seconds

Generate edit instructions (cuts and fades) that:
- Align with beat points but prioritize visual flow
- Create emotional pacing (slow builds, gentle releases)
- Match color grading to music intensity
- Feel like a summer memory montage, not a music video

OUTPUT (JSON ONLY):
[
  {
    "timestamp": 0.5,
    "type": "cut",
    "description": "Cut to golden hour beach",
    "parameters": {
      "easeType": "linear",
      "duration": 0.5
    }
  },
  {
    "timestamp": 1.2,
    "type": "transition",
    "description": "Smooth fade between scenes",
    "parameters": {
      "transitionType": "fade",
      "duration": 0.8
    }
  }
]

ONLY JSON, NO MARKDOWN.`,
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
