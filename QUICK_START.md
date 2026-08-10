# ⚡ Quick Start (5 Minutes)

## For Phone Users

### 1. Setup Once

```bash
npm install
pip3 install librosa scipy numpy
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env (optional)
```

### 2. Upload Video

```bash
git add raw_clips/your_video.mp4 audio/your_music.mp3
git commit -m "Add video and music"
git push origin main
```

### 3. Edit Video

```bash
# Option A: Smart AI editing ($0.06-0.15)
npm run edit:auto raw_clips/your_video.mp4 audio/your_music.mp3

# Option B: Free local-only ($0)
npm run edit:auto raw_clips/your_video.mp4 audio/your_music.mp3 --no-ai
```

### 4. Download Result

```bash
git pull origin main
# Download: output/your_video_final.mp4
```

---

## Common Commands

```bash
# Test installation
npm run test:ffmpeg
npm run test:bpm

# Extract components (no AI, free)
npm run extract:video video.mp4
npm run analyze:audio music.mp3

# Full pipeline (with AI)
npm run edit:auto video.mp4 music.mp3

# Full pipeline (free, no AI)
npm run edit:auto video.mp4 music.mp3 --no-ai

# Build TypeScript
npm run build

# Check code
npm run lint
npm run format
```

---

## Cost

- **BPM analysis**: Free (librosa)
- **Video processing**: Free (FFmpeg)
- **AI scene analysis**: $0.01 (Claude Vision)
- **Edit plan**: $0.05 (Claude API)
- **Per video**: $0.06-0.15
- **100 videos/month**: $6-15

---

## Troubleshooting

### FFmpeg not found?
```bash
ffmpeg -version
# If missing:
apt-get install -y ffmpeg
```

### Python libraries missing?
```bash
pip3 install librosa scipy numpy
```

### API key not set?
```bash
# Add to .env: ANTHROPIC_API_KEY=sk-ant-xxxxx
# Or use --no-ai flag (free)
npm run edit:auto video.mp4 --no-ai
```

### Out of disk space?
```bash
rm -rf temp/* .cache/*
df -h .
```

---

## Full Docs

- **README.md** - Features & overview
- **PHONE_WORKFLOW.md** - Phone-specific guide
- **SETUP.md** - Complete setup & troubleshooting
- **PRODUCTION_CHECKLIST.md** - QA & batch processing
- **IMPLEMENTATION_SUMMARY.md** - Technical overview

---

## Next Steps

1. ✅ Setup (5 min)
2. ✅ Upload video (depends on file size)
3. ✅ Run editing (1-2 min)
4. ✅ Download result (depends on connection)
5. ✅ Share to social media!

**Total time: ~5-10 minutes from video to edited result**

---

**Start now**: `npm run edit:auto raw_clips/video.mp4 audio/music.mp3`
