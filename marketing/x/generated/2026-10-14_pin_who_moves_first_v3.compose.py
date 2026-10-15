"""Replace only v2's headline, preserving its existing composite pixels."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE_STEM = "2026-10-14_pin_who_moves_first_v2"
STEM = "2026-10-14_pin_who_moves_first_v3"
HEADLINES = ["It was never about stats.", "It was about who moved first."]
HEADLINE_REGION = (0, 0, 1600, 216)
FACTOR = 4


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def difference_mask(first, second):
    red, green, blue = ImageChops.difference(first, second).split()
    largest = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    return largest.point(lambda value: 255 if value else 0)


def headlines_layer(lines, size):
    layer = Image.new("RGBA", tuple(value * FACTOR for value in size))
    draw = ImageDraw.Draw(layer)
    font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Georgia.ttf", 80 * FACTOR
    )
    for text, y, color in zip(lines, [40, 128], ["#F1ECE1", "#B99B61"]):
        draw.text(
            (800 * FACTOR, y * FACTOR), text, font=font, fill=color, anchor="mt"
        )
    return layer.resize(size, Image.Resampling.LANCZOS)


assert HERE == ROOT / "marketing/x/generated"
source_path = HERE / f"{SOURCE_STEM}.png"
background_path = HERE / f"{SOURCE_STEM}.background.png"
source_report = json.loads((HERE / f"{SOURCE_STEM}.verification.json").read_text())
input_hashes = {path: digest(path) for path in [source_path, background_path]}
assert input_hashes[source_path] == source_report["output_sha256"]

source = Image.open(source_path).convert("RGB")
background = Image.open(background_path).convert("RGBA")
assert source.size == background.size == (1600, 900)
old_type = headlines_layer(source_report["copy"][:2], source.size)
new_type = headlines_layer(HEADLINES, source.size)
for layer in [old_type, new_type]:
    bounds = layer.getchannel("A").getbbox()
    assert bounds and bounds[1] >= 0 and bounds[3] <= HEADLINE_REGION[3]

# Verify that the original clean plate exactly reconstructs v2's headline area.
# All units, their edges, contact shadows, the rule, and caption remain in v2.
old_header = Image.alpha_composite(background, old_type).convert("RGB")
assert source.crop(HEADLINE_REGION).tobytes() == old_header.crop(
    HEADLINE_REGION
).tobytes()
new_header = Image.alpha_composite(background, new_type).convert("RGB")
output = source.copy()
output.paste(new_header.crop(HEADLINE_REGION), HEADLINE_REGION[:2])
output_path = HERE / f"{STEM}.png"
output.save(output_path, format="PNG", optimize=True)

# Reopen the saved PNG and verify actual decoded pixels, including alpha edges.
saved = Image.open(output_path)
assert saved.format == "PNG" and saved.mode == "RGB" and saved.size == source.size
changed = difference_mask(source, saved)
allowed = ImageChops.lighter(
    old_type.getchannel("A"), new_type.getchannel("A")
).point(lambda value: 255 if value else 0)
outside_text = ImageChops.multiply(changed, ImageChops.invert(allowed))
assert outside_text.getbbox() is None
protected_region = (0, HEADLINE_REGION[3], source.width, source.height)
assert source.crop(protected_region).tobytes() == saved.crop(
    protected_region
).tobytes()

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
            "v3_composite_rgb_sha256": hashlib.sha256(after.tobytes()).hexdigest(),
            "includes_every_unit_pixel_and_antialiased_edge": True,
        }
    )

assert all(digest(path) == value for path, value in input_hashes.items())
report = {
    "output": str(output_path.relative_to(ROOT)),
    "output_sha256": digest(output_path),
    "format": "PNG",
    "size": list(saved.size),
    "method": "Deterministic text-layer replacement; existing v2 composite reused.",
    "copy": HEADLINES + source_report["copy"][2:],
    "headline_font": "Georgia Regular",
    "headline_size_px": 80,
    "headline_colors": ["#F1ECE1", "#B99B61"],
    "headline_top_y": [40, 128],
    "type_supersampling": FACTOR,
    "caption_and_gold_rule_pixel_identical_to_v2": True,
    "caption_font": source_report["caption_font"],
    "changed_pixel_bounds": list(changed.getbbox()),
    "changed_pixels": changed.histogram()[255],
    "changed_pixels_outside_old_or_new_headline_glyphs": 0,
    "protected_region_pixel_identical_to_v2": list(protected_region),
    "unit_pixels_changed_vs_v2": 0,
    "units": unit_reports,
    "inputs_unchanged": {
        str(path.relative_to(ROOT)): value for path, value in input_hashes.items()
    },
    "verification_method": (
        "Reopen the saved PNG; compare every RGB pixel against v2. Require all "
        "changes to fall within old or new headline glyphs. Compare entire unit "
        "rectangles, including partially transparent edges composited over the "
        "board, byte for byte. Compare everything below y=216 byte for byte. "
        "Verify source PNG and background file hashes are unchanged."
    ),
}
(HERE / f"{STEM}.verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
