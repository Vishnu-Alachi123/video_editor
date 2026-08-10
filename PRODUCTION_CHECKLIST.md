# 🚀 Production Checklist

Use this checklist before processing videos at scale.

## Pre-Launch (One-time)

- [ ] **Environment setup**
  - [ ] `npm install` completed successfully
  - [ ] `pip3 install librosa scipy numpy` completed
  - [ ] `.env` file created with `ANTHROPIC_API_KEY` set
  - [ ] `npm run test:ffmpeg` passes
  - [ ] `npm run test:bpm` passes

- [ ] **Directory structure**
  - [ ] `raw_clips/` exists and is empty
  - [ ] `audio/` exists and is empty
  - [ ] `output/` exists and is empty
  - [ ] `temp/` exists and is empty
  - [ ] `.cache/` exists and is empty

- [ ] **FFmpeg verification**
  - [ ] `ffmpeg -version` shows v4.4+
  - [ ] `ffprobe -version` shows v4.4+
  - [ ] `ffmpeg -codecs | grep h264` returns results
  - [ ] `ffmpeg -codecs | grep aac` returns results

- [ ] **Python verification**
  - [ ] `python3 -c "import librosa; print(librosa.__version__)"`
  - [ ] `python3 -c "import scipy; print(scipy.__version__)"`
  - [ ] `python3 -c "import numpy; print(numpy.__version__)"`

- [ ] **API connectivity**
  - [ ] Test API key: `node -e "require('dotenv').config(); const a = require('@anthropic-ai/sdk'); const c = new a.default(); console.log(c.api_key ? '✅' : '❌')"`
  - [ ] Rate limit info accessible

- [ ] **Disk space**
  - [ ] At least 10GB free: `df -h . | tail -1`
  - [ ] Temp cleanup configured: `rm -rf temp/*` works

## Before Each Batch

- [ ] **Video preparation**
  - [ ] All source videos are H.264 encoded
  - [ ] All videos have AAC audio tracks
  - [ ] Video resolution is ≤ 1280x720 (rescale if needed)
  - [ ] Video duration < 30 minutes (split if longer)
  - [ ] No corrupt frames: `ffmpeg -v error -i video.mp4 -f null - 2>&1 | grep -i error`

- [ ] **Audio preparation**
  - [ ] All music tracks are MP3 or WAV
  - [ ] Audio bitrate ≥ 128 kbps
  - [ ] Audio sample rate ≥ 44.1 kHz
  - [ ] No corrupted audio: `ffprobe -show_error audio.mp3 2>&1 | grep error`

- [ ] **Clean workspace**
  - [ ] Run `rm -rf temp/* .cache/*`
  - [ ] Run `npm run build` to recompile TypeScript
  - [ ] Git status is clean: `git status`

- [ ] **Git status**
  - [ ] Latest code pulled: `git pull origin main`
  - [ ] No uncommitted changes: `git status` shows clean
  - [ ] Branch is correct: `git branch | grep \*`

## During Processing

- [ ] **Monitor resource usage**
  - [ ] Disk space > 1GB remaining: `df -h .`
  - [ ] Memory usage < 80%: `free -h`
  - [ ] CPU not maxed out: `top -bn1 | grep Cpu`

- [ ] **Check logs**
  - [ ] No error messages in output
  - [ ] Audio analysis completes in < 10s per minute
  - [ ] Video extraction completes in < 20s per video
  - [ ] Claude API calls return in < 30s

- [ ] **Intermediate validation**
  - [ ] `temp/metadata.json` contains valid video info
  - [ ] `temp/audio.mp3` is playable: `ffplay temp/audio.mp3`
  - [ ] `temp/frames/frame_*.jpg` are valid images
  - [ ] Analysis JSON is parseable: `jq . temp/analysis.json`

## After Each Video

- [ ] **Output verification**
  - [ ] Output file exists: `ls -lh output/*_final.mp4`
  - [ ] Output is playable: `ffplay output/*_final.mp4`
  - [ ] Duration looks correct: `ffprobe -show_entries format=duration output/*_final.mp4`
  - [ ] Audio is synchronized: Manual check for sync issues
  - [ ] No visual artifacts: Check for encoding errors

- [ ] **Commit progress**
  - [ ] Add output: `git add output/*_final.mp4`
  - [ ] Commit with info: `git commit -m "Add edited video: filename, duration, effects"`
  - [ ] Push to repo: `git push origin main`

- [ ] **Cleanup**
  - [ ] Remove temp files: `rm -rf temp/*`
  - [ ] Maintain .cache for future runs
  - [ ] Keep metadata: `git add .cache/analysis.json` (optional)

## Batch Processing

### Setup

```bash
# Prepare batch of videos
mkdir -p batch_001
cp raw_clips/video_*.mp4 batch_001/
cp audio/music.mp3 batch_001/

# Start processing
cd batch_001
BATCH_START=$(date +%s)
```

### Process Each Video

```bash
for VIDEO in *.mp4; do
  echo "Processing $VIDEO..."
  npm run edit:auto "$VIDEO" music.mp3
  if [ $? -ne 0 ]; then
    echo "⚠️  Failed: $VIDEO" >> ../BATCH_ERRORS.log
  fi
done
```

### Validate Batch

```bash
# Check all outputs
for OUTPUT in output/*_final.mp4; do
  if ! ffmpeg -v error -i "$OUTPUT" -f null - 2>&1 | grep -q error; then
    echo "✅ $OUTPUT"
  else
    echo "❌ $OUTPUT"
  fi
done

# Summary
BATCH_END=$(date +%s)
BATCH_TIME=$((BATCH_END - BATCH_START))
echo "Batch completed in $BATCH_TIME seconds"
echo "Cost estimate: $(ls output/*_final.mp4 | wc -l) × $0.06 = $..."
```

## Optimization Tips

### Cost Optimization
- [ ] Use `--no-ai` flag for non-critical videos (save $0.06/video)
- [ ] Process 10+ videos in batch to amortize setup time
- [ ] Cache keyframes across similar videos
- [ ] Use Haiku model (already set, 73% cheaper)
- [ ] Monitor API token usage: `jq '.usage' temp/api_response.json`

### Speed Optimization
- [ ] Run extract/analyze in parallel for large batches
- [ ] Pre-encode videos to target resolution (saves 5-10s)
- [ ] Use `-preset fast` for H.264 encoding (faster, slightly lower quality)
- [ ] Cache Python librosa model (loads in ~2s)

### Quality Optimization
- [ ] Use `-preset slow` for H.264 encoding (better quality)
- [ ] Set `-crf 18-20` instead of default 23 (better quality)
- [ ] Use 2-pass encoding for critical videos
- [ ] Test color profiles: `ffmpeg -i output.mp4 -vf format=yuv420p -c:v libx264 -preset veryslow -crf 16 output_hq.mp4`

## Troubleshooting Batch

| Issue | Debug | Fix |
|-------|-------|-----|
| "No space left on device" | `df -h .` | `rm -rf temp/* .cache/*` then retry |
| Slow processing | `time npm run edit:auto` | Check CPU: `top -bn1 \| head -10` |
| Audio sync drift | Compare durations: `ffprobe` | Check input audio: `ffplay audio.mp3` |
| Corrupt output | `ffmpeg -v error -i output.mp4` | Use different FFmpeg preset: `-preset medium` |
| API rate limit | Check logs for 429 | Wait 60s, reduce batch size to 1 video |
| Out of memory | `free -h` | Reduce `MAX_FRAMES_ANALYZE` in .env |

## Rollback

If a batch fails partially:

```bash
# Identify failed videos
cat BATCH_ERRORS.log

# Retry specific videos
npm run edit:auto raw_clips/failed_video.mp4 audio/music.mp3

# Or reset and restart
git reset --hard origin/main
rm -rf temp/* .cache/*
npm run build
# Start batch again
```

## Post-Completion

- [ ] **Archive results**
  - [ ] Commit all outputs: `git add output/*`
  - [ ] Tag release: `git tag -a batch_001 -m "100 videos edited"`
  - [ ] Push tags: `git push origin --tags`

- [ ] **Analyze results**
  - [ ] Count successes: `ls -1 output/*_final.mp4 | wc -l`
  - [ ] Total duration: `ffprobe -show_entries format=duration output/*_final.mp4 | grep duration | awk -F= '{sum+=$2} END {print sum " seconds"}'`
  - [ ] Storage used: `du -sh output/`
  - [ ] API cost: `grep "cost:" temp/*.json | awk '{sum+=$2} END {print "$" sum}'`

- [ ] **Cleanup**
  - [ ] Move raw_clips to archive: `mv raw_clips archive/batch_001`
  - [ ] Compress outputs (optional): `tar -czf output_batch_001.tar.gz output/`
  - [ ] Delete temp files: `rm -rf temp/* .cache/*`

---

**Checklist version 1.0** | Last updated: 2024-08-10
