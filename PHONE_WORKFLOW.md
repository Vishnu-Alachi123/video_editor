# 📱 Phone Workflow Guide

**TL;DR**: Upload video + music to git → run one command → download edited video. No local software installation needed.

## How This Works From Your Phone

Your phone only needs:
- ✅ Git client (GitHub desktop, Gitpod, or terminal app)
- ✅ Video player to preview results
- ❌ NO FFmpeg, Node.js, or Python installation

Everything runs in **Claude Code Remote Container** (cloud).

```
Phone (git push)
    ↓ (5 min)
Cloud Container (edit video)
    ↓ (1-2 min)
Git Repo (store result)
    ↓ (5 min)
Phone (git pull & download)
```

## Step-by-Step Phone Workflow

### 1. Get Started (First Time Only)

On desktop/laptop (or in Claude Code terminal):

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/video_editor.git
cd video_editor

# Setup (one time)
npm install
pip3 install librosa scipy numpy
cp .env.example .env

# Edit .env to add your API key (optional)
# ANTHROPIC_API_KEY=sk-ant-xxxxx

# Push setup to repo
git add .
git commit -m "Initial setup"
git push origin main
```

### 2. Upload Video From Phone

#### Using GitHub Desktop (Easiest)

1. Open **GitHub Desktop** on your phone
2. Switch to `video_editor` repository
3. Tap **"Add File"** → **"Choose from Photos"**
4. Select your travel vlog (e.g., `trip.mp4`)
5. Choose folder: **`raw_clips/`**
6. Repeat for background music: **`audio/music.mp3`**
7. Write commit message: `"Add travel vlog and music"`
8. Tap **"Commit"** → **"Push"**

#### Using Git CLI

```bash
# On phone (if using terminal app with git)
git add raw_clips/trip.mp4 audio/music.mp3
git commit -m "Add travel vlog and background music"
git push origin main
```

### 3. Run Video Editing

#### Option A: Full Editing with AI (Smart)

In **Claude Code** terminal or via **Anthropic API**:

```bash
# Pull latest changes
git pull origin main

# Run full pipeline (extracts scenes, suggests cuts, syncs audio)
npm run edit:auto raw_clips/trip.mp4 audio/music.mp3

# Push result
git add output/
git commit -m "Add edited travel vlog"
git push origin main
```

**Cost**: $0.06-0.15 per video (3-5 minute wait)

#### Option B: Local-Only (Free, No AI)

```bash
# Run without Claude API (saves money, faster)
npm run edit:auto raw_clips/trip.mp4 audio/music.mp3 --no-ai

# Push result
git add output/
git commit -m "Add edited travel vlog (local)"
git push origin main
```

**Cost**: $0 (instant processing, 1-2 minute wait)

### 4. Download Result to Phone

#### Using GitHub Desktop

1. Open **GitHub Desktop**
2. Tap **"Pull"** to sync latest changes
3. Navigate to **`output/`** folder
4. Long-press **`trip_final.mp4`** → **"Save Video"**
5. Video saved to your phone's gallery! 🎉

#### Using Git CLI

```bash
# Pull latest from repo
git pull origin main

# List available videos
ls output/

# Download specific video (depends on your git app)
```

### 5. Share & Post

Your edited video is now in your phone's gallery:
- ✅ TikTok (60 sec clips)
- ✅ Instagram Reels (30-90 sec)
- ✅ YouTube Shorts (up to 60 sec)
- ✅ YouTube (full length)
- ✅ Email to friends
- ✅ Cloud storage (OneDrive, Google Drive, iCloud)

---

## Common Phone Workflows

### Workflow 1: Quick Single Video Edit

```
1. Shoot travel footage on phone → export to camera roll
2. Pick background music from streaming service → download MP3
3. Push both to git repo
4. npm run edit:auto video.mp4 music.mp3 --no-ai
5. Pull result, download to phone
6. Upload to TikTok/Instagram
```

**Time**: ~5 min (mostly upload/download)  
**Cost**: $0

### Workflow 2: Batch Weekly Edits (10 Videos)

```
Monday:
- Collect 10 video clips from the week
- Push all to raw_clips/ → git push

Tuesday:
- npm run edit:auto for each video (or write batch script)
- All results in output/
- git push

Wednesday:
- Pull results to phone
- Download and schedule posts for the week
```

**Time**: ~1-2 hours total  
**Cost**: $0-1.50 (if using AI)

### Workflow 3: Testing Edit Parameters

```
1. Upload video → git push
2. npm run edit:auto video.mp4 music.mp3 --no-ai (quick test)
3. Review output on phone
4. If good: done! If not:
   - Adjust .env parameters (AUDIO_SR, OUTPUT_QUALITY, etc.)
   - npm run edit:auto again with new params
   - Review again
5. Download final version
```

**Time**: ~15 min for tweaks  
**Cost**: $0

---

## Pro Tips

### 1. Use Cloud Storage for Backups

```bash
# Backup results to cloud
git remote add backup https://github.com/YOUR_USERNAME/video-backup
git push backup main

# Or use git-lfs for large files
# git lfs install
# git add output/
# git push origin main
```

### 2. Organize Videos by Project

```
raw_clips/
├── trip_2024_iceland/
│   ├── day1.mp4
│   ├── day2.mp4
│   └── day3.mp4
├── trip_2024_japan/
│   └── vlog.mp4
└── tutorial_series/
    └── episode1.mp4

output/
├── iceland_montage_final.mp4
├── japan_vlog_final.mp4
└── tutorial_ep1_final.mp4
```

### 3. Schedule Batch Processing

```bash
# Create processing schedule
at 2AM tomorrow <<EOF
cd /path/to/video_editor
for video in raw_clips/*.mp4; do
  npm run edit:auto "$video" audio/music.mp3 --no-ai
done
git add output/ && git commit -m "Batch processed $(date)" && git push
EOF
```

### 4. Monitor Processing Progress

```bash
# In separate terminal while editing
watch -n 5 'ls -lh output/ | tail -5'
watch -n 5 'du -sh temp/'
```

### 5. Pre-Process Videos on Phone

Before uploading, optimize video on your phone:

**Using iOS/Android:**
- Use Adobe Lightroom Mobile for color grading
- Use CapCut to pre-trim unwanted sections
- Use ffmpeg app to scale down resolution (if >720p)

**Result**: Faster processing, lower storage, better quality

---

## Troubleshooting From Phone

### Problem: "Git rejected my push"

**Cause**: Git conflict with repository

**Fix**:
```bash
git pull origin main          # Merge latest changes
git push origin main          # Try again
```

If still failing:
```bash
git reset --hard origin/main  # Reset to latest (⚠️ loses local changes)
# Re-upload your video
git add raw_clips/
git push origin main
```

### Problem: "Output video doesn't play"

**Cause**: Encoding issue or corruption

**Fix**:
```bash
# Re-run with different settings
# Reduce quality or change resolution in .env:
# OUTPUT_QUALITY=18 (higher quality)
# MAX_VIDEO_RESOLUTION=1024x576 (smaller)

npm run edit:auto video.mp4 --no-ai    # Retry without AI

# If still broken:
ffmpeg -i raw_clips/video.mp4 -c:v libx264 -c:a aac -preset medium fixed.mp4
git add fixed.mp4 && git push
```

### Problem: "Takes too long to upload/download"

**Solution**: Use smaller files

```bash
# Scale down video before uploading
ffmpeg -i large_video.mp4 -vf scale=1280:720 -c:v libx264 -c:a aac small_video.mp4

# Or use compression
ffmpeg -i video.mp4 -c:v libx264 -crf 28 -c:a aac -b:a 128k compressed.mp4

# Upload smaller version
git add raw_clips/small_video.mp4
```

### Problem: "Out of disk space"

**Cause**: Large video files or temp files not cleaned up

**Fix**:
```bash
rm -rf temp/*         # Clear temporary files
rm -rf .cache/*       # Clear cache
git add -A && git commit -m "Cleanup" && git push
```

Then delete old videos from repo or use git-lfs.

---

## Phone App Recommendations

| App | Purpose | Cost |
|-----|---------|------|
| **GitHub Desktop** | Upload/download videos | Free |
| **Git Client** | Alternative git interface | Free |
| **VLC** | Preview edited videos | Free |
| **ffmpeg app** | Pre-process videos on phone | Free |
| **Adobe Lightroom Mobile** | Color grade before uploading | Free/Premium |
| **CapCut** | Pre-trim video segments | Free |

---

## FAQ

**Q: Can I edit multiple videos at once from my phone?**  
A: Yes! Upload all videos to `raw_clips/`, then run a batch script in Claude Code. Everything processes in cloud.

**Q: What if I lose my phone?**  
A: All videos are in git repo (cloud backup). Clone on new phone, continue editing!

**Q: Can I edit videos offline?**  
A: No, but you can prepare files offline, then sync when online.

**Q: How large can videos be?**  
A: Recommended max 500MB. Git can handle up to 4GB per file with git-lfs.

**Q: Can I share results with friends before downloading?**  
A: Yes! Share a git repo link, they can access output files via GitHub web UI or clone locally.

**Q: Do I need the API key?**  
A: Optional. Use `--no-ai` flag to skip Claude API (free, local-only processing).

---

**Happy editing! 🚀**

For more details, see:
- **README.md** - Feature overview
- **SETUP.md** - Complete technical setup
- **PRODUCTION_CHECKLIST.md** - Quality assurance
