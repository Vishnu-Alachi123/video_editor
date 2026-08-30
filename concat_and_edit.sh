#!/bin/bash

# Concatenate all videos in raw_clips/ and run the complete editing pipeline

set -e

MUSIC_PATH="${1:-audio/music.mp3}"

if [ ! -f "$MUSIC_PATH" ]; then
  echo "❌ Music file not found: $MUSIC_PATH"
  exit 1
fi

# Create concat file list
CONCAT_FILE="temp/concat_list.txt"
mkdir -p temp

echo "📹 Building concat list from raw_clips/*.mp4..."
ls -1 raw_clips/*.mp4 2>/dev/null | while read file; do
  echo "file '$PWD/$file'" >> "$CONCAT_FILE"
done

if [ ! -f "$CONCAT_FILE" ] || [ ! -s "$CONCAT_FILE" ]; then
  echo "❌ No MP4 files found in raw_clips/"
  exit 1
fi

# Concatenate all videos
CONCAT_VIDEO="temp/concatenated.mp4"
echo "🎬 Concatenating all videos..."
ffmpeg -f concat -safe 0 -i "$CONCAT_FILE" -c copy "$CONCAT_VIDEO"

# Run the editing pipeline
echo "✨ Running AI editing pipeline..."
npm run edit:auto "$CONCAT_VIDEO" "$MUSIC_PATH"

echo "✅ Done! Check output/ for your edited video"
