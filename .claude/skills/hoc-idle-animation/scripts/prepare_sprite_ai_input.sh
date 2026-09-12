#!/bin/zsh
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  print -u2 "usage: $0 <canonical-image> <output.png>"
  exit 2
fi

source_image="$1"
output_image="$2"

if [[ ! -f "$source_image" ]]; then
  print -u2 "source image does not exist: $source_image"
  exit 3
fi

if [[ -e "$output_image" ]]; then
  print -u2 "refusing to overwrite existing output: $output_image"
  exit 4
fi

if [[ "${output_image:e:l}" != "png" ]]; then
  print -u2 "output must use a .png extension"
  exit 5
fi

sips --setProperty format png --resampleHeightWidthMax 256 "$source_image" --out "$output_image" >/dev/null

print "canonical:"
sips -g pixelWidth -g pixelHeight -g hasAlpha "$source_image"
shasum -a 256 "$source_image"
print "sprite-ai input:"
sips -g pixelWidth -g pixelHeight -g hasAlpha "$output_image"
shasum -a 256 "$output_image"
