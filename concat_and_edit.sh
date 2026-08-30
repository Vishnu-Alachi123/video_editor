#!/bin/bash

# Concatenate ALL video clips in raw_clips/ (any format, any filename)
# and run the complete editing pipeline against the given music track.

set -e

MUSIC_PATH="${1:-audio/music.mp3}"

if [ ! -f "$MUSIC_PATH" ]; then
  echo "❌ Music file not found: $MUSIC_PATH"
  echo "   Files in audio/:"
  ls -la audio/ 2>/dev/null
  exit 1
fi

mkdir -p temp

# Find every video file in raw_clips/, regardless of name or extension
# (mp4, mov, MOV, m4v, mkv, avi — case-insensitive)
mapfile -t CLIPS < <(find raw_clips -maxdepth 1 -type f \( \
  -iname "*.mp4" -o -iname "*.mov" -o -iname "*.m4v" -o \
  -iname "*.mkv" -o -iname "*.avi" \) | sort)

if [ ${#CLIPS[@]} -eq 0 ]; then
  echo "❌ No video files found in raw_clips/"
  exit 1
fi

echo "📹 Found ${#CLIPS[@]} clip(s) in raw_clips/:"
printf '   %s\n' "${CLIPS[@]}"

# Re-encode each clip to a consistent format (resolution/fps/codec) so
# clips from different sources (phone vs camera) concatenate cleanly.
echo ""
echo "🔧 Normalizing clips to a common format..."
rm -rf temp/normalized
mkdir -p temp/normalized

NORMALIZED_LIST="temp/concat_list.txt"
rm -f "$NORMALIZED_LIST"

i=0
for clip in "${CLIPS[@]}"; do
  i=$((i+1))
  out="temp/normalized/clip_$(printf '%03d' "$i").mp4"
  echo "   [$i/${#CLIPS[@]}] $(basename "$clip")"
  ffmpeg -y -i "$clip" \
    -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
    -r 30 -c:v libx264 -crf 20 -preset veryfast \
    -c:a aac -ar 48000 -ac 2 \
    "$out" -loglevel error
  echo "file '$PWD/$out'" >> "$NORMALIZED_LIST"
done

# Concatenate the normalized clips
CONCAT_VIDEO="temp/concatenated.mp4"
echo ""
echo "🎬 Concatenating all clips..."
ffmpeg -y -f concat -safe 0 -i "$NORMALIZED_LIST" -c copy "$CONCAT_VIDEO" -loglevel error

# Run the editing pipeline
echo ""
echo "✨ Running AI editing pipeline..."
npm run edit:auto "$CONCAT_VIDEO" "$MUSIC_PATH"

echo ""
echo "✅ Done! Check output/ for your edited video"
