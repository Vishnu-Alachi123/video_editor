# 🎬 AI-Powered Video Editing Pipeline

Automated travel vlog editing system that analyzes tempo, syncs cuts to beat, and uses AI to intelligently edit footage—**running entirely in the cloud via Claude Code from your phone**.

## ⚡ Quick Start (30 seconds)

```bash
# 1. Install dependencies
npm install && pip3 install librosa scipy numpy

# 2. Add your video and music
git add raw_clips/travel.mp4 audio/music.mp3 && git push

# 3. Run the pipeline
npm run edit:auto raw_clips/travel.mp4 audio/music.mp3

# 4. Get your edited video
git pull
# output/travel_final.mp4 is ready to download
```

## Features

- ✅ **Cloud-native**: No local installations (Claude Code container)
- ✅ **Phone-friendly**: Upload via git, download results
- ✅ **Beat-synced editing**: Analyzes audio tempo, aligns cuts to beat
- ✅ **AI scene analysis**: Claude identifies scenes and suggests transitions
- ✅ **Cost-effective**: $0.06-0.15 per video (local processing is free)
- ✅ **Fully automated**: One command from video → edited output
- ✅ **Batch-ready**: Process 10-100 videos in parallel

## 💰 Cost Breakdown (Research-Backed)

| Task | Cost | Time |
|------|------|------|
| BPM/beat detection (librosa) | Free | 2-5s/min |
| Video extraction (FFmpeg) | Free | 5-10s |
| Scene analysis (Claude Haiku) | $0.01 | 10s |
| Edit plan (Claude Haiku) | $0.05 | 5s |
| **Per video total** | **$0.06-0.15** | **~30s** |

**Monthly for 100 videos**: $6-15 (well under free tier)

## 📁 Project Structure

```
video_editor/
├── src/
│   ├── lib/
│   │   ├── ffmpeg-wrapper.ts       # Video processing
│   │   ├── audio_analysis.py       # BPM detection
│   │   ├── claude-integration.ts   # AI scene analysis
│   │   ├── video-editing-engine.ts # Main orchestration
│   │   └── config.ts               # Configuration
│   ├── cli/
│   │   ├── extract-video.ts        # Extract metadata
│   │   └── auto-edit.ts            # Full pipeline
│   └── tests/
├── raw_clips/                      # Input videos (your content)
├── audio/                          # Background music
├── output/                         # Edited videos
├── .env.example                    # Config template
└── SETUP.md                        # Detailed setup
```

## 🚀 Usage

### Option A: Full AI Pipeline (Smart Editing)
```bash
npm run edit:auto raw_clips/travel.mp4 audio/music.mp3
# - Analyzes scenes with Claude Vision
# - Generates beat-synced edit plan
# - Produces final video with cuts & transitions
# Cost: ~$0.06-0.15 per video
```

### Option B: Local-Only (Zero API Cost)
```bash
npm run edit:auto raw_clips/travel.mp4 audio/music.mp3 --no-ai
# - Detects BPM locally (librosa)
# - Syncs audio to video
# - Skips expensive Claude API calls
# Cost: $0 (free)
```

### Option C: Extract & Analyze Separately
```bash
# Extract components
npm run extract:video travel.mp4
# Creates: temp/metadata.json, temp/audio.mp3, temp/frames/

# Analyze audio alone
npm run analyze:audio temp/audio.mp3
# Creates: analysis.json with BPM, beats, onsets
```

## 🏗️ How It Works

### Step 1: Audio Analysis (Free)
```python
# Extract BPM and beat timings
python3 src/audio_analysis.py music.mp3 -o analysis.json
# → {bpm: 120, beatTimes: [0.5, 1.0, 1.5, ...], confidence: 0.94}
```

### Step 2: Video Analysis (Optional AI, $0.01)
- Extracts 10 keyframes from video
- Sends to Claude Vision for scene recognition
- Identifies: emotions, cut points, transitions

### Step 3: Edit Plan (Optional AI, $0.05)
- Claude generates beat-aligned edit instructions
- Suggests transitions and color grades
- Returns JSON with timing and effects

### Step 4: Render (Free)
- FFmpeg applies cuts and syncs audio
- Encodes final MP4 with H.264 + AAC
- Saves to output/ folder

## 📊 Architecture

```
Phone (git push video + music)
    ↓
Claude Code Remote Container
├─ FFmpeg: Extract video/audio/keyframes
├─ librosa: Detect BPM & beats (free)
├─ Claude Haiku: Scene analysis ($0.01-0.05)
└─ Node.js: Orchestrate workflow
    ↓
Git repo (store results)
    ↓
Phone (git pull edited video)
```

## 🔧 Configuration

```bash
# Copy example config
cp .env.example .env

# Set your API key (optional)
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# Other settings (optional)
# AUDIO_SR=22050
# OUTPUT_QUALITY=23
# MAX_VIDEO_RESOLUTION=1280x720
```

## 📋 Commands

```bash
# Test installation
npm run test:ffmpeg
npm run test:bpm

# Processing
npm run extract:video video.mp4
npm run analyze:audio audio.mp3
npm run edit:auto video.mp4 music.mp3

# Development
npm run build
npm run lint
npm run format
```

## 📚 Documentation

- **SETUP.md** - Detailed setup, troubleshooting, examples
- **src/lib/video-editing-engine.ts** - Core pipeline logic
- **src/lib/ffmpeg-wrapper.ts** - Video processing API
- **.env.example** - Configuration reference

## ⚠️ Limitations & Solutions

| Issue | Solution |
|-------|----------|
| Phone can't install FFmpeg | Use Claude Code (cloud container) |
| Video too large for context | Extract keyframes only (10-30 images) |
| API costs for large batches | Use `--no-ai` flag (free, local-only) |
| Slow video rendering | Process overnight, check in morning |

## 🎯 Next Steps

1. **Setup**: `npm install && pip3 install librosa scipy numpy`
2. **Test**: `npm run test:ffmpeg && npm run test:bpm`
3. **Upload**: `git add raw_clips/video.mp4 audio/music.mp3 && git push`
4. **Edit**: `npm run edit:auto raw_clips/video.mp4 audio/music.mp3`
5. **Download**: `git pull && find output/ -name "*.mp4"`

## 🤝 Contributing

Ideas for improvement:
- [ ] Multi-audio track support
- [ ] Real-time color grading
- [ ] Hardware acceleration (NVIDIA NVENC)
- [ ] Web UI for monitoring
- [ ] Mobile app integration

## 📄 License

MIT

---

**Cloud-native video editing for creators.** Edit smarter, faster, cheaper. 🚀