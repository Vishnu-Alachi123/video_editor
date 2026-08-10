# AI Video Editing Pipeline - Setup Guide

## Quick Start

This automated video editing pipeline runs entirely in the cloud via Claude Code and requires **NO local installations** on your phone.

### Prerequisites (Already Installed in Claude Code)
- ✅ Node.js v22+
- ✅ Python 3.11+
- ✅ Git
- ⚠️ FFmpeg (will be installed in container)

### Step 1: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python audio libraries
pip3 install librosa scipy numpy scikit-learn essentia-d
```

### Step 2: Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit with your API key (optional for local-only processing)
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

### Step 3: Test Installation

```bash
# Test FFmpeg wrapper
npm run test:ffmpeg

# Test audio analysis (requires sample audio)
npm run test:bpm
```

---

## Architecture Overview

```
Phone (Upload videos)
    ↓
Claude Code Remote Container
    ├─ FFmpeg (video processing)
    ├─ Python/librosa (audio analysis)
    ├─ Node.js (orchestration)
    └─ Claude API (scene analysis & editing decisions)
    ↓
Git Repo (Store & retrieve results)
    ↓
Phone (Download edited videos)
```

---

## Directory Structure

```
video_editor/
├── raw_clips/           # Input travel vlog videos
├── audio/               # Background music tracks
├── output/              # Final edited videos
├── temp/                # Temporary processing files
├── src/
│   ├── lib/
│   │   ├── ffmpeg-wrapper.ts       # FFmpeg orchestration
│   │   ├── audio_analysis.py       # Beat detection & BPM
│   │   ├── claude-integration.ts   # AI scene analysis
│   │   ├── video-editing-engine.ts # Main orchestration
│   │   └── config.ts               # Configuration
│   ├── cli/
│   │   ├── extract-video.ts        # Extract metadata & audio
│   │   └── auto-edit.ts            # Automated editing workflow
│   └── tests/
│       ├── test-ffmpeg.ts
│       └── test-bpm.ts
└── package.json
```

---

## Usage

### Option 1: Full Automated Pipeline (with AI)

```bash
npm run edit:auto travel_vlog.mp4 background_music.mp3
```

This will:
1. Extract video metadata and audio
2. Analyze audio for BPM and beats
3. Extract 10 keyframes for scene analysis
4. Use Claude to identify scenes and suggest cuts
5. Sync audio to video with intelligent cuts

**Cost**: ~$0.50-2.00 per video (Claude API)

### Option 2: Local-Only Processing (Free)

```bash
npm run edit:auto travel_vlog.mp4 --no-ai
```

This will:
1. Analyze audio for BPM locally
2. Detect beats and onsets
3. Sync audio to video with beat-matching
4. Skip expensive Claude API calls

**Cost**: $0

### Option 3: Extract & Analyze Separately

```bash
# Extract video metadata and audio
npm run extract:video travel_vlog.mp4

# Analyze audio for BPM
python3 src/audio_analysis.py audio.mp3 -o analysis.json
```

---

## Cost Analysis

| Task | Method | Cost | Time |
|------|--------|------|------|
| Audio BPM detection | Local (librosa) | Free | 2-5s/min |
| Video metadata | FFmpeg | Free | <1s |
| Keyframe extraction | FFmpeg | Free | 5-10s |
| Scene analysis | Claude Vision API | $0.01-0.05/image | ~10s for 10 frames |
| Edit plan generation | Claude API | $0.30-1.50 | ~5s |
| **Per video total** | | **$0.50-2.00** | **30-60s** |

**Monthly estimate for 100 videos**:
- Local processing: $0
- AI analysis: $50-200
- **Total: $50-200/month** (vs $500+ with commercial APIs)

---

## Features

### Audio Analysis
- ✅ BPM detection with confidence scoring
- ✅ Beat timing extraction
- ✅ Onset detection (audio transients)
- ✅ Section detection (verses, choruses)
- ✅ Loudness envelope analysis

### Video Processing
- ✅ Metadata extraction (duration, FPS, codec)
- ✅ Keyframe extraction
- ✅ Audio extraction & sync
- ✅ Video scaling & quality control
- ✅ Segment cutting

### AI Features (with API key)
- ✅ Scene recognition & classification
- ✅ Emotional tone detection
- ✅ Transition type suggestion
- ✅ Color grading hints
- ✅ Cut point recommendation
- ✅ Beat-synchronized editing

---

## Examples

### Example 1: Process Travel Vlog with Music

```bash
# Upload video and music to git repo
git add raw_clips/travel.mp4 audio/music.mp3
git commit -m "Add travel vlog and background music"
git push

# Run pipeline
npm run edit:auto raw_clips/travel.mp4 audio/music.mp3

# Download result
git pull
# output/travel_final.mp4 now contains edited video synced to music
```

### Example 2: Batch Process Multiple Videos

```bash
for video in raw_clips/*.mp4; do
  npm run edit:auto "$video" audio/music.mp3
done
```

### Example 3: Local Analysis Only (Save API Costs)

```bash
# Just analyze without expensive Claude API calls
npm run edit:auto video.mp4 --no-ai
```

---

## Troubleshooting

### "FFmpeg not found"
```bash
# Verify FFmpeg is installed
ffmpeg -version

# If not installed in container:
apt-get update && apt-get install -y ffmpeg
```

### "Python libraries missing"
```bash
pip3 install librosa scipy numpy scikit-learn
```

### "ANTHROPIC_API_KEY not set"
- Set in `.env` file for AI features
- Or run with `--no-ai` flag to skip API calls

### "No space left on device"
- Clean temp directory: `rm -rf temp/*`
- Remove old videos from raw_clips
- Videos must be scaled: max 1280x720 recommended

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | API key for Claude AI features |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary |
| `AUDIO_SR` | `22050` | Audio sample rate (Hz) |
| `MAX_FRAMES_ANALYZE` | `30` | Max keyframes to extract |
| `OUTPUT_QUALITY` | `23` | Video quality (0-51, lower=better) |
| `MAX_VIDEO_RESOLUTION` | `1280x720` | Max output resolution |

---

## API Costs Breakdown

### Claude API Usage

**Per video (light analysis)**:
- Scene recognition: 10 images × $0.003/image = $0.03
- Editing plan: ~1,500 tokens × $0.003/1K = $0.005
- **Total per video**: ~$0.03-0.10

**Per video (heavy analysis)**:
- Full scene analysis + transitions: $0.50-2.00
- **Total per video**: $0.50-2.00

### Free Local Processing
- BPM detection: librosa (free, open-source)
- Beat alignment: scipy (free, open-source)
- Video extraction: FFmpeg (free, LGPL)
- Audio extraction: FFmpeg (free, LGPL)

---

## Next Steps

1. **Upload sample video** to `/raw_clips/`
2. **Upload music** to `/audio/`
3. **Run pipeline**: `npm run edit:auto raw_clips/sample.mp4 audio/music.mp3`
4. **Check output** in `/output/`
5. **Commit results** to git for download on phone

---

## Security Notes

- **API keys**: Store ANTHROPIC_API_KEY only in `.env` (not committed)
- **Media files**: Large videos not stored in git (use .gitignore)
- **Analysis outputs**: JSON files safe to commit (no personal data)
- **Container isolation**: All processing happens in isolated Claude Code environment

---

## Support

For issues, check:
- FFmpeg compatibility: `ffmpeg -codecs | grep h264`
- Python libraries: `python3 -c "import librosa; print(librosa.__version__)"`
- Claude SDK: `npm list @anthropic-ai/sdk`
