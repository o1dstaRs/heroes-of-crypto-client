"""Compose the marketing card with Pillow and verify source pixel preservation."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STEM = "2026-10-14_pin_who_moves_first"
SOURCE_REL = "site/public/assets/images/units/portraits/cyclops_portrait_full.9c6bea6c.webp"
SOURCE = ROOT / SOURCE_REL
SOURCE_SHA256 = "9c6bea6cf9ed3d8328a254042e1e3cd4c9b611dea3939c447d51390b25568e0f"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assert HERE == ROOT / "marketing/x/generated"
assert digest(SOURCE) == SOURCE_SHA256, "Source file has changed."
source = Image.open(SOURCE).convert("RGBA")
source_bbox = source.getchannel("A").getbbox()
cropped = source.crop(source_bbox)  # Remove transparent padding only.
height = 812
width = round(cropped.width * height / cropped.height)
unit = cropped.resize((width, height), Image.Resampling.NEAREST)
placement = (440 - width // 2, 44)

canvas = Image.open(HERE / f"{STEM}.background.png").convert("RGBA")
assert canvas.size == (1600, 900)

# Quiet contact shadows sit behind the artwork, never on top of it.
shadow = Image.new("RGBA", canvas.size)
sd = ImageDraw.Draw(shadow)
sd.ellipse((224, 786, 367, 809), fill=(0, 0, 0, 115))
sd.ellipse((568, 838, 719, 862), fill=(0, 0, 0, 130))
canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(12)))
canvas.alpha_composite(unit, placement)

# Supersample only typography; the unit never passes through a later resize.
factor = 4
lettering = Image.new("RGBA", (1600 * factor, 900 * factor))
draw = ImageDraw.Draw(lettering)
serif = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 78 * factor)
sans = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 25 * factor)
text_x = 880
draw.text((text_x * factor, 334 * factor), "Who moves first", font=serif,
          fill="#F0EDE5", anchor="lt")
draw.text((text_x * factor, 432 * factor), "decides the fight.", font=serif,
          fill="#B99B61", anchor="lt")
draw.line((text_x * factor, 550 * factor, 1490 * factor, 550 * factor),
          fill="#8D7447", width=factor)
draw.text((text_x * factor, 581 * factor), "PvP tactics in the browser.", font=sans,
          fill="#C5C1B8", anchor="lt")
lettering = lettering.resize(canvas.size, Image.Resampling.LANCZOS)
assert lettering.getchannel("A").crop((placement[0], placement[1],
                                       placement[0] + width, placement[1] + height)).getbbox() is None
canvas = Image.alpha_composite(canvas, lettering).convert("RGB")
output = HERE / f"{STEM}.png"
canvas.save(output, format="PNG", optimize=True)

# Reopen the saved artifact, then check every displayed fully opaque unit pixel.
saved = Image.open(output).convert("RGB")
actual = saved.crop((placement[0], placement[1], placement[0] + width, placement[1] + height))
opaque = unit.getchannel("A").point(lambda value: 255 if value == 255 else 0)
opaque_count = opaque.histogram()[255]
rgb_difference = ImageChops.difference(actual, unit.convert("RGB"))
r, g, b = rgb_difference.split()
any_difference = ImageChops.lighter(ImageChops.lighter(r, g), b)
masked_difference = ImageChops.multiply(any_difference, opaque)
mismatch_count = sum(masked_difference.histogram()[1:])
assert mismatch_count == 0, "Opaque unit pixels changed during compositing."

# Independently map nearest-neighbor samples back to the original decoded WebP.
# This also checks the scaling preserves original RGB values, without interpolation.
unit_pixels = unit.load()
source_pixels = source.load()
final_pixels = saved.load()
mapped_mismatches = 0
for y in range(height):
    sy = source_bbox[1] + ((2 * y + 1) * cropped.height) // (2 * height)
    for x in range(width):
        if unit_pixels[x, y][3] != 255:
            continue
        sx = source_bbox[0] + ((2 * x + 1) * cropped.width) // (2 * width)
        original = source_pixels[sx, sy]
        result = final_pixels[placement[0] + x, placement[1] + y]
        if original[3] != 255 or original[:3] != result:
            mapped_mismatches += 1
assert mapped_mismatches == 0, "Displayed opaque pixel differs from its original source sample."
assert digest(SOURCE) == SOURCE_SHA256, "Source file was modified."
assert placement[0] >= 0 and placement[1] >= 0
assert placement[0] + width <= 880 and placement[1] + height < 900

report = {
    "output": str(output.relative_to(ROOT)),
    "format": "PNG",
    "size": list(saved.size),
    "source": SOURCE_REL,
    "source_sha256_before": SOURCE_SHA256,
    "source_sha256_after": digest(SOURCE),
    "source_file_unchanged": True,
    "source_alpha_bbox": list(source_bbox),
    "removed_padding": "Fully transparent pixels outside the alpha bounding box only.",
    "unit_size": [width, height],
    "unit_placement": list(placement),
    "unit_resampling": "Pillow NEAREST; proportional fit; no color interpolation.",
    "fully_opaque_pixels_checked": opaque_count,
    "opaque_mismatches_vs_scaled_source": mismatch_count,
    "opaque_mismatches_vs_original_source_samples": mapped_mismatches,
    "max_opaque_rgb_channel_difference": masked_difference.getextrema()[1],
    "unit_fully_inside_canvas_and_left_55_percent": True,
    "no_recolor_retouch_redraw_mirror_or_overlays_on_unit": True,
    "copy": ["Who moves first", "decides the fight.", "PvP tactics in the browser."],
    "headline_font": "Georgia Regular",
    "caption_font": "Helvetica Neue Regular",
    "background": "Built-in imagegen; environment only; resized to canvas with Pillow LANCZOS.",
    "verification_method": (
        "Reopen the final PNG; compare RGB at every scaled-source alpha=255 pixel. "
        "Independently map those pixels to original WebP coordinates using nearest-neighbor "
        "sample centers and compare RGB byte-for-byte. Hash the source before and after. "
        "The source is downsampled to fit; not every full-resolution source pixel appears."
    ),
}
(HERE / f"{STEM}.verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
