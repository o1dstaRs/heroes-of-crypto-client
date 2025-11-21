#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <input_folder_with_videos>"
  exit 1
fi

INPUT_DIR="$(cd "$1" && pwd)"

# Location of the JS scripts (assumes this bash script is in the same folder)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VIDEO_TO_FRAMES="$SCRIPT_DIR/video_to_frames.js"
CLEAN_FRAMES="$SCRIPT_DIR/clean_frames_background.js"
FRAMES_TO_ATLAS="$SCRIPT_DIR/frames_to_atlas.js"

# Default params – tweak if needed
CROP_TOP=0
CROP_BOTTOM=0
# CROP_TOP=104
# CROP_BOTTOM=104
DESCALE=1.09375
#DESCALE=2
BG_THRESHOLD=10
FPS=12
MAX_WIDTH=4096
WEBP_QUALITY=70

OUTPUT_ROOT="$INPUT_DIR/output"
mkdir -p "$OUTPUT_ROOT"

shopt -s nullglob

MP4_FILES=("$INPUT_DIR"/*.mp4)

if [ ${#MP4_FILES[@]} -eq 0 ]; then
  echo "No .mp4 files found in $INPUT_DIR"
  exit 0
fi

for video in "${MP4_FILES[@]}"; do
  name="$(basename "$video")"
  base="${name%.*}"

  echo "========================================"
  echo "Processing video: $video"
  echo "Base name: $base"
  echo "========================================"

  frames_dir="$OUTPUT_ROOT/$base"
  clean_dir="$frames_dir/clean"
  atlas_dir="$frames_dir/atlas"

  mkdir -p "$frames_dir" "$clean_dir" "$atlas_dir"

  # If we already have cleaned frames, skip steps 1 & 2 and just rebuild the atlas
  if compgen -G "$clean_dir/*.*" > /dev/null; then
    echo "➜ Cleaned frames already exist in $clean_dir"
    echo "   Skipping frame extraction and background cleaning."
  else
    # 1) Video -> frames
    echo "➜ Extracting frames..."
    args=( "$VIDEO_TO_FRAMES" "$video" "$frames_dir" \
      --crop-top "$CROP_TOP" \
      --crop-bottom "$CROP_BOTTOM" \
      --descale "$DESCALE" )

    if [ "$FPS" != "24" ]; then
      args+=( --fps "$FPS" )
    fi

    bun run "${args[@]}"

    # 2) Clean background
    echo "➜ Cleaning backgrounds..."
    bun run "$CLEAN_FRAMES" \
      "$frames_dir" \
      "$clean_dir" \
      --bg-threshold "$BG_THRESHOLD"
  fi

  # 3) Frames -> atlas (PNG + WebP + JSON)
  echo "➜ Building atlas from $clean_dir ..."
  if [ "$WEBP_QUALITY" -eq 100 ]; then
    bun run "$FRAMES_TO_ATLAS" \
      "$clean_dir" \
      "$atlas_dir/${base}_atlas.png" \
      "$atlas_dir/${base}_meta.json" \
      --fps "$FPS" \
      --max-width "$MAX_WIDTH" \
      --webp-lossless
  else
    bun run "$FRAMES_TO_ATLAS" \
      "$clean_dir" \
      "$atlas_dir/${base}_atlas.png" \
      "$atlas_dir/${base}_meta.json" \
      --fps "$FPS" \
      --max-width "$MAX_WIDTH" \
      --webp-quality "$WEBP_QUALITY"
  fi

  echo "✅ Done: $base"
  echo "    Frames: $frames_dir"
  echo "    Clean:  $clean_dir"
  echo "    Atlas:  $atlas_dir"
done

echo "🎉 All videos processed."
