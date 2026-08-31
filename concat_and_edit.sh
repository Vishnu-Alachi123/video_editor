#!/bin/bash

# Normalize every clip/photo in raw_clips/, build a manifest describing
# them, then hand off to the AI curation pipeline (src/cli/curate-and-edit.ts)
# which picks the best highlights, trims/orders them, crossfades them
# together, applies the summer color grade, and syncs the result to music.
#
# Photos are turned into short clips with a subtle Ken Burns zoom so they
# don't look like dead static frames in the final video.

set -e

MUSIC_PATH="${1:-audio/music.mp3}"
PHOTO_DURATION="${PHOTO_DURATION:-4}"   # seconds each photo clip is generated at
TARGET_DURATION="${TARGET_DURATION:-60}" # target length of the final edit, seconds
CURATION_MODE="${CURATION_MODE:-ai}"     # "ai" (Claude-curated) or "even" (no AI, deterministic)
AUDIO_START_OFFSET="${AUDIO_START_OFFSET:-0}" # seconds into the music track to start from
VIDEO_RATIO="${VIDEO_RATIO:-0.75}"       # min fraction of final duration that should come from videos vs photos

if [ ! -f "$MUSIC_PATH" ]; then
  echo "❌ Music file not found: $MUSIC_PATH"
  echo "   Files in audio/:"
  ls -la audio/ 2>/dev/null
  exit 1
fi

mkdir -p temp

# Find every video AND image file in raw_clips/, any filename, sorted
# together so numbered prefixes (01_, 02_, ...) control the final order
# regardless of whether an item is a video or a photo.
# (Uses a while-read loop instead of mapfile for compatibility with
# macOS's default bash 3.2, which predates mapfile/readarray.)
ITEMS=()
while IFS= read -r line; do
  ITEMS+=("$line")
done < <(find raw_clips -maxdepth 1 -type f \( \
  -iname "*.mp4" -o -iname "*.mov" -o -iname "*.m4v" -o \
  -iname "*.mkv" -o -iname "*.avi" -o \
  -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" \
  \) | sort)

if [ ${#ITEMS[@]} -eq 0 ]; then
  echo "❌ No video or photo files found in raw_clips/"
  exit 1
fi

echo "📹 Found ${#ITEMS[@]} item(s) in raw_clips/"

echo ""
echo "🔧 Normalizing all clips/photos to a common format..."
rm -rf temp/normalized
mkdir -p temp/normalized temp/converted_images

MANIFEST="temp/clip_manifest.json"
echo "[" > "$MANIFEST"
first_entry=true

i=0
for item in "${ITEMS[@]}"; do
  i=$((i+1))
  out="temp/normalized/clip_$(printf '%03d' "$i").mp4"
  ext="${item##*.}"
  ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

  base_noext=$(basename "${item%.*}")
  # Strip a trailing " (1)", " (2)", etc. so duplicate-export photos and
  # live-photo video/still pairs share the same baseName for dedup.
  base_key=$(echo "$base_noext" | sed -E 's/ \([0-9]+\)$//')

  clip_type=""
  case "$ext_lower" in
    jpg|jpeg|png|heic)
      clip_type="photo"
      src="$item"

      # HEIC (default iPhone format) needs conversion to JPG first via macOS sips
      if [ "$ext_lower" = "heic" ]; then
        if command -v sips >/dev/null 2>&1; then
          converted="temp/converted_images/$(basename "${item%.*}").jpg"
          sips -s format jpeg "$item" --out "$converted" >/dev/null
          src="$converted"
        else
          echo "   [$i/${#ITEMS[@]}] ⚠️  Skipping $(basename "$item") — HEIC needs macOS 'sips' to convert, not found"
          continue
        fi
      fi

      echo "   [$i/${#ITEMS[@]}] 📷 $(basename "$item") (photo, ${PHOTO_DURATION}s w/ zoom)"
      frames=$((PHOTO_DURATION * 30))
      ffmpeg -y -loop 1 -i "$src" \
        -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
        -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.15)':d=${frames}:s=1080x1920:fps=30,format=yuv420p" \
        -c:v libx264 -crf 20 -preset veryfast \
        -c:a aac -ar 48000 -ac 2 \
        -t "$PHOTO_DURATION" -r 30 -shortest \
        "$out" -loglevel error
      ;;
    *)
      clip_type="video"
      echo "   [$i/${#ITEMS[@]}] 🎬 $(basename "$item") (video)"
      ffmpeg -y -i "$item" \
        -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
        -r 30 -c:v libx264 -crf 20 -preset veryfast \
        -c:a aac -ar 48000 -ac 2 \
        "$out" -loglevel error
      ;;
  esac

  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" 2>/dev/null || echo "0")

  if [ "$first_entry" = true ]; then
    first_entry=false
  else
    echo "," >> "$MANIFEST"
  fi
  printf '  {"index": %d, "normalizedPath": "%s", "originalPath": "%s", "baseName": "%s", "type": "%s", "duration": %s}' \
    "$i" "$PWD/$out" "$item" "$base_key" "$clip_type" "$duration" >> "$MANIFEST"
done

echo "" >> "$MANIFEST"
echo "]" >> "$MANIFEST"

echo ""
echo "✨ Running AI curation + editing pipeline (target: ${TARGET_DURATION}s, mode: ${CURATION_MODE}, audio start: ${AUDIO_START_OFFSET}s)..."
npm run curate:edit -- "$MANIFEST" "$MUSIC_PATH" \
  --duration "$TARGET_DURATION" --mode "$CURATION_MODE" \
  --audio-start "$AUDIO_START_OFFSET" --video-ratio "$VIDEO_RATIO"

FINAL_OUTPUT="output/summer_edit_final.mp4"
if [ -f "$FINAL_OUTPUT" ]; then
  echo ""
  echo "✅ Done! Output saved to $FINAL_OUTPUT"
else
  echo ""
  echo "❌ Something went wrong — expected output at $FINAL_OUTPUT but it wasn't created."
  echo "   Check the pipeline logs above for errors."
  exit 1
fi
