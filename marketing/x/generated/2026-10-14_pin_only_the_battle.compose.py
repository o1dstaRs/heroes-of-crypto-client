"""Replace v2's text block while preserving its existing background and units."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE_STEM = "2026-10-14_pin_who_moves_first_v2"
STEM = "2026-10-14_pin_only_the_battle"
COPY = [
    "The map made us wait.",
    "So we built only the battle.",
    "Turn-based PvP in the browser. The board shrinks.",
]
TEXT_REGION = (0, 0, 1600, 284)
RULE_REGION = (477, 223, 1124, 232)
FACTOR = 4


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def difference_mask(first, second):
    red, green, blue = ImageChops.difference(first, second).split()
    largest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    return largest.point(lambda value: 255 if value else 0)


def type_layer(copy, size, include_rule=True):
    layer = Image.new("RGBA", tuple(value * FACTOR for value in size))
    draw = ImageDraw.Draw(layer)
    serif = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Georgia.ttf", 80 * FACTOR
    )
    sans = ImageFont.truetype(
        "/System/Library/Fonts/HelveticaNeue.ttc", 26 * FACTOR
    )
    for text, y, color in zip(copy[:2], [40, 128], ["#F1ECE1", "#B99B61"]):
        draw.text(
            (800 * FACTOR, y * FACTOR),
            text,
            font=serif,
            fill=color,
            anchor="mt",
        )
    if include_rule:
        draw.line(
            (480 * FACTOR, 227 * FACTOR, 1120 * FACTOR, 227 * FACTOR),
            fill="#927746",
            width=FACTOR,
        )
    draw.text(
        (800 * FACTOR, 250 * FACTOR),
        copy[2],
        font=sans,
        fill="#C7C3B9",
        anchor="mt",
    )
    return layer.resize(size, Image.Resampling.LANCZOS)


assert HERE == ROOT / "marketing/x/generated"
source_path = HERE / f"{SOURCE_STEM}.png"
background_path = HERE / f"{SOURCE_STEM}.background.png"
source_report_path = HERE / f"{SOURCE_STEM}.verification.json"
source_report = json.loads(source_report_path.read_text())
input_paths = [source_path, background_path, source_report_path]
input_paths += [ROOT / entry["source"] for entry in source_report["units"]]
input_hashes = {path: digest(path) for path in input_paths}
assert input_hashes[source_path] == source_report["output_sha256"]
for entry in source_report["units"]:
    assert input_hashes[ROOT / entry["source"]] == entry["source_sha256_after"]

source = Image.open(source_path).convert("RGB")
background = Image.open(background_path).convert("RGBA")
assert source.size == background.size == (1600, 900)
old_type = type_layer(source_report["copy"], source.size)
new_type = type_layer(COPY, source.size)
for layer in [old_type, new_type]:
    bounds = layer.getchannel("A").getbbox()
    assert bounds and bounds[1] >= 0 and bounds[3] <= TEXT_REGION[3]

# Reconstruct the old text block exactly before substituting the new lettering.
# Copy every other pixel directly from the existing flattened v2 PNG.
old_header = Image.alpha_composite(background, old_type).convert("RGB")
assert source.crop(TEXT_REGION).tobytes() == old_header.crop(TEXT_REGION).tobytes()
new_header = Image.alpha_composite(background, new_type).convert("RGB")
output = source.copy()
output.paste(new_header.crop(TEXT_REGION), TEXT_REGION[:2])
output_path = HERE / f"{STEM}.png"
output.save(output_path, format="PNG", optimize=True)

# Verify the actual saved PNG, including the composited antialiased unit edges.
saved = Image.open(output_path)
assert saved.format == "PNG" and saved.mode == "RGB" and saved.size == source.size
changed = difference_mask(source, saved)
old_glyphs = type_layer(source_report["copy"], source.size, include_rule=False)
new_glyphs = type_layer(COPY, source.size, include_rule=False)
allowed = ImageChops.lighter(
    old_glyphs.getchannel("A"), new_glyphs.getchannel("A")
).point(lambda value: 255 if value else 0)
outside_text = ImageChops.multiply(changed, ImageChops.invert(allowed))
assert outside_text.getbbox() is None
assert source.crop(RULE_REGION).tobytes() == saved.crop(RULE_REGION).tobytes()
protected_region = (0, TEXT_REGION[3], source.width, source.height)
protected_before = source.crop(protected_region).tobytes()
protected_after = saved.crop(protected_region).tobytes()
assert protected_before == protected_after

unit_reports = []
for entry in source_report["units"]:
    bounds = tuple(entry["display_bounds"])
    before, after = source.crop(bounds), saved.crop(bounds)
    mismatches = difference_mask(before, after).histogram()[255]
    assert mismatches == 0
    assert new_type.getchannel("A").crop(bounds).getbbox() is None
    unit_reports.append(
        {
            "unit": entry["unit"],
            "bounds": list(bounds),
            "pixels_checked": before.width * before.height,
            "changed_pixels_vs_v2": mismatches,
            "v2_composite_rgb_sha256": hashlib.sha256(before.tobytes()).hexdigest(),
            "output_composite_rgb_sha256": hashlib.sha256(after.tobytes()).hexdigest(),
            "includes_every_unit_pixel_and_antialiased_edge": True,
            "text_overlaps_unit": False,
        }
    )

assert all(digest(path) == value for path, value in input_hashes.items())
report = {
    "output": str(output_path.relative_to(ROOT)),
    "output_sha256": digest(output_path),
    "source": str(source_path.relative_to(ROOT)),
    "format": "PNG",
    "size": list(saved.size),
    "method": "Deterministic text-layer replacement; existing v2 composite reused.",
    "copy": COPY,
    "headline_font": "Georgia Regular",
    "headline_size_px": 80,
    "headline_colors": ["#F1ECE1", "#B99B61"],
    "headline_top_y": [40, 128],
    "caption_font": "Helvetica Neue Regular",
    "caption_size_px": 26,
    "caption_color": "#C7C3B9",
    "caption_top_y": 250,
    "type_supersampling": FACTOR,
    "gold_rule_pixel_identical_to_v2": True,
    "gold_rule_region": list(RULE_REGION),
    "changed_pixel_bounds": list(changed.getbbox()),
    "changed_pixels": changed.histogram()[255],
    "changed_pixels_outside_old_or_new_text_glyphs": 0,
    "background_pixels_outside_text_unchanged": True,
    "protected_region_pixel_identical_to_v2": list(protected_region),
    "protected_region_pixels_checked": source.width * (source.height - TEXT_REGION[3]),
    "protected_region_v2_rgb_sha256": hashlib.sha256(protected_before).hexdigest(),
    "protected_region_output_rgb_sha256": hashlib.sha256(protected_after).hexdigest(),
    "unit_pixels_changed_vs_v2": 0,
    "unit_resampling_or_recompositing": False,
    "minimum_text_to_unit_vertical_clearance_px": (
        min(entry["display_bounds"][1] for entry in source_report["units"])
        - new_type.getchannel("A").getbbox()[3]
    ),
    "units": unit_reports,
    "inputs_unchanged": {
        str(path.relative_to(ROOT)): value for path, value in input_hashes.items()
    },
    "verification_method": (
        "Reopen the saved PNG and compare every RGB pixel against v2. Require "
        "all changes to fall within old or new text glyphs. Compare the gold "
        "rule and entire unit rectangles, including composited partially "
        "transparent edges, byte for byte. Compare everything below y=284 "
        "byte for byte. Verify all input file hashes are unchanged."
    ),
}
(HERE / f"{STEM}.verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
