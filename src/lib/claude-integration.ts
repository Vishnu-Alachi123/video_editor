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

export interface ClipRating {
  index: number;
  sceneType: string;
  quality: number;
  keep: boolean;
  hookWorthy: boolean;
  notable: string;
}

export interface EditReview {
  overallScore: number;
  hookGood: boolean;
  issues: string[];
  weakPositions: number[];
}

// Models frequently wrap JSON in ```json ... ``` fences despite being told
// not to — strip them before parsing instead of failing on the backtick.
function parseJsonResponse(text: string): any {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

export class ClaudeVideoAnalyzer {
  private client: Anthropic;
  private model = 'claude-haiku-4-5-20251001'; // cheapest current model with vision support

  constructor(apiKey?: string, workspaceId?: string) {
    const wsId = workspaceId || process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      defaultHeaders: wsId ? { 'anthropic-workspace-id': wsId } : undefined,
    });
  }

  /** Cheap sanity call to fail fast with a clear message instead of burning
   * through every batch with the same auth error. */
  async verifyAuth(): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, message: error?.message || String(error) };
    }
  }

  /**
   * Rate a batch of candidate clip thumbnails for inclusion in a curated
   * summer Instagram Reels highlight edit. `indices` must line up 1:1 with
   * `thumbnailPaths` so results can be mapped back to source clips.
   */
  async rateClips(thumbnailPaths: string[], indices: number[]): Promise<ClipRating[]> {
    try {
      const imageContents: Anthropic.ImageBlockParam[] = [];

      for (const framePath of thumbnailPaths) {
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
          console.warn(`Could not load thumbnail: ${framePath}`);
        }
      }

      if (imageContents.length === 0) {
        return [];
      }

      const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
      imageContents.forEach((img, i) => {
        content.push({ type: 'text', text: `Clip index ${indices[i]}:` });
        content.push(img);
      });

      content.push({
        type: 'text',
        text: `You're curating clips for a SUMMER INSTAGRAM REELS travel highlight video (dreamy, cinematic, nostalgic — golden hour beach aesthetic, Tame Impala energy, chill not high-action).

For EACH numbered clip image above, rate it for inclusion in the final highlight reel:
- sceneType: one of "landscape" (scenic beach/nature/sunset), "action" (bars/partying/movement), "portrait" (people-focused), "other"
- quality: 1-10, how visually appealing/well-composed/worth including this shot is (blurry, dark, awkward, or boring shots score low; beautiful scenery, genuine candid moments, striking light score high)
- keep: true/false — should this make the highlight reel at all (false for blurry, near-duplicate, or low-value shots)
- hookWorthy: true/false — would this be a STRONG opening shot? Short-form video best practice is to open on the single most eye-catching, high-impact frame to stop the scroll in the first second (a stunning wide landscape, a striking action moment, peak golden-hour light). Most clips should be false; only mark true for genuinely exceptional shots.
- notable: very short (<8 words) description of what's in it

Respond ONLY with a JSON array, one object per clip index provided, in this exact shape:
[{"index": 0, "sceneType": "landscape", "quality": 8, "keep": true, "hookWorthy": false, "notable": "golden hour beach waves"}]

ONLY JSON, NO MARKDOWN, NO OTHER TEXT.`,
      });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      });

      const responseContent = response.content[0];
      if (responseContent.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return parseJsonResponse(responseContent.text);
    } catch (error) {
      console.error('Error rating clips:', error);
      return [];
    }
  }

  /**
   * Review an assembled edit (sampled frames in timeline order) against
   * established short-form video editing principles, and flag weak spots
   * for a refinement pass.
   */
  async reviewEdit(framePaths: string[]): Promise<EditReview> {
    const fallback: EditReview = { overallScore: 7, hookGood: true, issues: [], weakPositions: [] };
    try {
      const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

      framePaths.forEach((_, i) => {
        content.push({ type: 'text', text: `Position ${i + 1}:` });
      });

      for (const framePath of framePaths) {
        try {
          const imageData = await fs.readFile(framePath);
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageData.toString('base64') },
          });
        } catch (err) {
          console.warn(`Could not load review frame: ${framePath}`);
        }
      }

      content.push({
        type: 'text',
        text: `These frames are sampled in order from an assembled SUMMER INSTAGRAM REELS travel highlight edit (cinematic, dreamy, golden-hour, Tame Impala energy). Each is labeled with its Position number in the sequence.

Evaluate against established short-form video editing principles:
1. HOOK: Does Position 1 grab attention in the first second (striking, high-impact, scroll-stopping)? Weak, generic, or dark openers fail this.
2. VARIETY: Are there 3+ consecutive positions that look near-identical or repetitive (same scene type, same composition)? That kills pacing.
3. FLOW: Does the sequence feel like a coherent journey rather than a random shuffle?
4. CLOSER: Does the edit end on a satisfying note rather than trailing off on something weak?

Respond ONLY with JSON in this exact shape:
{"overallScore": 7, "hookGood": true, "issues": ["short description of each real problem"], "weakPositions": [3, 4]}

overallScore is 1-10. weakPositions lists the Position numbers (1-indexed) that should be swapped out for something better — leave empty if the edit is solid. Be specific and honest; a mediocre edit should not score above 6.

ONLY JSON, NO MARKDOWN, NO OTHER TEXT.`,
      });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content }],
      });

      const responseContent = response.content[0];
      if (responseContent.type !== 'text') {
        return fallback;
      }

      return parseJsonResponse(responseContent.text);
    } catch (error) {
      console.error('Error reviewing edit:', error);
      return fallback;
    }
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

      return parseJsonResponse(content.text);
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

      return parseJsonResponse(content.text);
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
