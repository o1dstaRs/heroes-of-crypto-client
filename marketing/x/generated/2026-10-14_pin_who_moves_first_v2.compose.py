"""Composite original unit samples and type; verify the saved marketing PNG."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
STEM = "2026-10-14_pin_who_moves_first_v2"
SIZE = (1600, 900)
UNIT_HEIGHT = 515
COPY = [
    "Who moves first",
    "decides the fight.",
    "PvP tactics in the browser. The board shrinks every fight.",
]
SPECS = [
    {
        "name": "Crusader",
        "source": "site/public/assets/images/units/portraits/crusader_portrait_full.3480ffd9.webp",
        "sha256": "3480ffd94a10b65cce20a324552fcbeecab0301b481287168b20e349baca835a",
        "mirror": False,
        "position": (235, 292),
        "foot_shadows": [(370, 795, 427, 813), (563, 770, 637, 786)],
    },
    {
        "name": "Cyclops",
        "source": "site/public/assets/images/units/portraits/cyclops_portrait_full.9c6bea6c.webp",
        "sha256": "9c6bea6cf9ed3d8328a254042e1e3cd4c9b611dea3939c447d51390b25568e0f",
        "mirror": True,
        "position": (985, 292),
        "foot_shadows": [(1006, 797, 1091, 815), (1199, 752, 1277, 768)],
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def opaque_mask(image):
    return image.getchannel("A").point(lambda value: 255 if value == 255 else 0)


assert HERE == ROOT / "marketing/x/generated"
canvas = Image.open(HERE / f"{STEM}.background.png").convert("RGBA")
assert canvas.size == SIZE
assert canvas.getchannel("A").getextrema() == (255, 255)

# Type alone is supersampled. The original unit layer never passes through
# a later resize, retouch, color grade, lighting effect, or other filter.
factor = 4
lettering = Image.new("RGBA", (SIZE[0] * factor, SIZE[1] * factor))
draw = ImageDraw.Draw(lettering)
serif = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 80 * factor)
sans = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", 26 * factor)
draw.text((800 * factor, 40 * factor), COPY[0], font=serif, fill="#F1ECE1", anchor="mt")
draw.text((800 * factor, 128 * factor), COPY[1], font=serif, fill="#B99B61", anchor="mt")
draw.line((480 * factor, 227 * factor, 1120 * factor, 227 * factor), fill="#927746", width=factor)
draw.text((800 * factor, 250 * factor), COPY[2], font=sans, fill="#C7C3B9", anchor="mt")
lettering = lettering.resize(SIZE, Image.Resampling.LANCZOS)

units = []
for spec in SPECS:
    source_path = ROOT / spec["source"]
    assert digest(source_path) == spec["sha256"], f"{spec['name']} source changed."
    source = Image.open(source_path).convert("RGBA")
    bbox = source.getchannel("A").getbbox()
    cropped = source.crop(bbox)  # Discard only fully transparent outer padding.
    if spec["mirror"]:
        cropped = ImageOps.mirror(cropped)
    width = round(cropped.width * UNIT_HEIGHT / cropped.height)
    unit = cropped.resize((width, UNIT_HEIGHT), Image.Resampling.NEAREST)
    x, y = spec["position"]
    bounds = (x, y, x + width, y + UNIT_HEIGHT)
    assert 0 <= x < bounds[2] <= SIZE[0] and 0 <= y < bounds[3] <= SIZE[1]
    assert lettering.getchannel("A").crop(bounds).getbbox() is None
    units.append({"spec": spec, "source": source, "bbox": bbox, "unit": unit, "bounds": bounds})

assert units[0]["bounds"][2] < units[1]["bounds"][0]

# Contact shadows are composited before either unit, so no source pixels
# are darkened. Each foot rests on intact central cells.
shadow = Image.new("RGBA", SIZE)
sd = ImageDraw.Draw(shadow)
for spec in SPECS:
    for ellipse in spec["foot_shadows"]:
        sd.ellipse(ellipse, fill=(0, 0, 0, 150))
canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(8)))
for entry in units:
    canvas.alpha_composite(entry["unit"], entry["spec"]["position"])
canvas = Image.alpha_composite(canvas, lettering).convert("RGB")
output = HERE / f"{STEM}.png"
canvas.save(output, format="PNG", optimize=True)

# Check the actual saved bytes, not just an in-memory pre-save layer.
saved = Image.open(output).convert("RGB")
assert saved.size == SIZE
final_pixels = saved.load()
reports = []
for entry in units:
    spec, source, bbox, unit, bounds = (
        entry[key] for key in ("spec", "source", "bbox", "unit", "bounds")
    )
    actual = saved.crop(bounds)
    opaque = opaque_mask(unit)
    opaque_count = opaque.histogram()[255]
    diff = ImageChops.difference(actual, unit.convert("RGB"))
    r, g, b = diff.split()
    largest_channel = ImageChops.lighter(ImageChops.lighter(r, g), b)
    masked_difference = ImageChops.multiply(largest_channel, opaque)
    mismatches = sum(masked_difference.histogram()[1:])
    assert mismatches == 0, f"Opaque {spec['name']} samples changed."

    # Independently reconstruct the sample coordinates in the original,
    # unscaled and unmirrored decoded WebP. NEAREST samples exact RGB values.
    source_pixels, unit_pixels = source.load(), unit.load()
    crop_width, crop_height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mapped_mismatches = 0
    for y in range(unit.height):
        sy = bbox[1] + ((2 * y + 1) * crop_height) // (2 * unit.height)
        for x in range(unit.width):
            if unit_pixels[x, y][3] != 255:
                continue
            sample_x = ((2 * x + 1) * crop_width) // (2 * unit.width)
            sx = bbox[0] + (crop_width - 1 - sample_x if spec["mirror"] else sample_x)
            original = source_pixels[sx, sy]
            result = final_pixels[bounds[0] + x, bounds[1] + y]
            if original[3] != 255 or original[:3] != result:
                mapped_mismatches += 1
    assert mapped_mismatches == 0, f"Original {spec['name']} RGB samples differ."
    after = digest(ROOT / spec["source"])
    assert after == spec["sha256"]
    reports.append({
        "unit": spec["name"],
        "source": spec["source"],
        "source_sha256_before": spec["sha256"],
        "source_sha256_after": after,
        "source_file_unchanged": True,
        "source_size": list(source.size),
        "source_alpha_bbox": list(bbox),
        "transparent_padding_only_removed": True,
        "horizontal_mirror": spec["mirror"],
        "display_size": list(unit.size),
        "display_bounds": list(bounds),
        "unit_fully_inside_canvas": True,
        "source_proportions_preserved_with_integer_rounding": True,
        "fully_opaque_displayed_pixels_checked": opaque_count,
        "opaque_mismatches_vs_scaled_layer": mismatches,
        "opaque_mismatches_vs_original_source_samples": mapped_mismatches,
        "max_opaque_rgb_channel_difference": masked_difference.getextrema()[1],
        "lettering_overlaps_unit": False,
    })

report = {
    "output": str(output.relative_to(ROOT)),
    "output_sha256": digest(output),
    "format": "PNG",
    "size": list(saved.size),
    "background_generator": "Built-in image_gen; empty board only; no unit images submitted.",
    "background_preparation": "Generated 1672x941 plate resized to 1600x985 with LANCZOS; bottom-cropped to 1600x900.",
    "unit_resampling": "Pillow NEAREST. Exact original RGB samples; Cyclops mirrored horizontally before scaling.",
    "source_pixel_changes_beyond_allowed_scaling_and_mirroring": 0,
    "equal_displayed_unit_heights": True,
    "unit_display_height": UNIT_HEIGHT,
    "units": reports,
    "copy": COPY,
    "headline_font": "Georgia Regular",
    "caption_font": "Helvetica Neue Regular",
    "type_supersampling": factor,
    "verification_method": (
        "Reopen the final PNG and compare every displayed alpha=255 unit pixel to the scaled layer. "
        "Independently map every checked sample to the original decoded WebP, reverse the Cyclops mirror, "
        "and compare exact RGB bytes. Verify both source hashes before and after. "
        "Scaling downsamples the art; not every full-resolution source pixel appears. "
        "Partially transparent source pixels use ordinary alpha compositing."
    ),
}
(HERE / f"{STEM}.verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
