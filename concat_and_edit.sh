#!/bin/bash

# Concatenate ALL clips (videos AND photos) in raw_clips/ into one edit,
# then run the complete AI editing pipeline against the given music track.
#
# Photos are turned into short clips with a subtle Ken Burns zoom so they
# don't look like dead static frames in the final video.

set -e

MUSIC_PATH="${1:-audio/music.mp3}"
PHOTO_DURATION="${PHOTO_DURATION:-4}"   # seconds each photo is shown

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
mapfile -t ITEMS < <(find raw_clips -maxdepth 1 -type f \( \
  -iname "*.mp4" -o -iname "*.mov" -o -iname "*.m4v" -o \
  -iname "*.mkv" -o -iname "*.avi" -o \
  -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.heic" \
  \) | sort)

if [ ${#ITEMS[@]} -eq 0 ]; then
  echo "❌ No video or photo files found in raw_clips/"
  exit 1
fi

echo "📹 Found ${#ITEMS[@]} item(s) in raw_clips/:"
printf '   %s\n' "${ITEMS[@]}"

echo ""
echo "🔧 Normalizing all clips/photos to a common format..."
rm -rf temp/normalized
mkdir -p temp/normalized temp/converted_images

NORMALIZED_LIST="temp/concat_list.txt"
rm -f "$NORMALIZED_LIST"

i=0
for item in "${ITEMS[@]}"; do
  i=$((i+1))
  out="temp/normalized/clip_$(printf '%03d' "$i").mp4"
  ext="${item##*.}"
  ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

  case "$ext_lower" in
    jpg|jpeg|png|heic)
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
      echo "   [$i/${#ITEMS[@]}] 🎬 $(basename "$item") (video)"
      ffmpeg -y -i "$item" \
        -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" \
        -r 30 -c:v libx264 -crf 20 -preset veryfast \
        -c:a aac -ar 48000 -ac 2 \
        "$out" -loglevel error
      ;;
  esac

  echo "file '$PWD/$out'" >> "$NORMALIZED_LIST"
done

# Concatenate everything
CONCAT_VIDEO="temp/concatenated.mp4"
echo ""
echo "🎬 Concatenating all clips and photos..."
ffmpeg -y -f concat -safe 0 -i "$NORMALIZED_LIST" -c copy "$CONCAT_VIDEO" -loglevel error

# Run the editing pipeline
echo ""
echo "✨ Running AI editing pipeline..."
npm run edit:auto "$CONCAT_VIDEO" "$MUSIC_PATH"

echo ""
echo "✅ Done! Check output/ for your edited video"
