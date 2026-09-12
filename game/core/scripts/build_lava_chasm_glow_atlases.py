#!/usr/bin/env python3
"""Build subtle transparent sprite atlases from the approved baked narrowing paintings."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


FRAME_WIDTH = 512
FRAME_HEIGHT = 448
FRAME_COUNT = 12
COLUMNS = 4
ROWS = 3
FPS = 8

BACKGROUND_BY_LEVEL = {
    1: "background_stone_tiles_sinister_16x16_first_ring_destroyed_aaa_v3.webp",
    2: "background_stone_tiles_sinister_16x16_two_rings_destroyed_aaa_v7.webp",
    3: "background_stone_tiles_sinister_16x16_three_rings_destroyed_aaa_v3.webp",
    4: "background_stone_tiles_sinister_16x16_four_rings_destroyed_aaa_v7.webp",
    5: "background_stone_tiles_sinister_16x16_five_rings_destroyed_aaa_v4.webp",
}


def local_asset_root() -> Path:
    workplace = Path(__file__).resolve().parents[4]
    return workplace / "heroesofcrypto-assets"


def image_root() -> Path:
    configured = os.environ.get("HOC_IMAGES_LOC")
    return Path(configured).expanduser() if configured else local_asset_root() / "images"


def animation_output_root() -> Path:
    configured = os.environ.get("HOC_ANIMATIONS_LOC")
    root = Path(configured).expanduser() if configured else local_asset_root() / "animations"
    return root / "output"


def design_record_root() -> Path:
    return local_asset_root() / "design" / "lava-chasm-glow-sprite-animation-v1"


def battlefield_mask() -> Image.Image:
    # Same authored field quad as BattlefieldVisualGrid.ts, scaled onto the compact atlas frame.
    source_width, source_height = 1576, 1378
    points = [(205, 329), (1293, 329), (1561, 1342), (12, 1342)]
    scaled = [(x * FRAME_WIDTH / source_width, y * FRAME_HEIGHT / source_height) for x, y in points]
    mask = Image.new("L", (FRAME_WIDTH, FRAME_HEIGHT), 0)
    ImageDraw.Draw(mask).polygon(scaled, fill=255)
    return mask


def furnace_shelf_keep_mask() -> Image.Image:
    """Exclude the three painted stone aprons below the furnaces from every animated overlay frame."""
    mask = Image.new("L", (FRAME_WIDTH, FRAME_HEIGHT), 255)
    draw = ImageDraw.Draw(mask)
    for bounds in ((78, 96, 164, 128), (210, 96, 302, 128), (348, 96, 432, 128)):
        draw.rounded_rectangle(bounds, radius=9, fill=0)
    return mask


def lava_base(source: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.asarray(source.convert("RGB").resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)).astype(
        np.float32
    )
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # Select the warm fissures, not the brown basalt: they have a strong red lead, some green heat,
    # very little blue, and enough luminance to be genuine emission rather than rusty stone.
    warmth = np.clip((r - g * 1.14) / 92.0, 0.0, 1.0)
    heat = np.clip((g - b * 0.82) / 72.0, 0.0, 1.0)
    luminance = np.clip((r + g * 0.62 - 46.0) / 185.0, 0.0, 1.0)
    alpha = warmth * heat * luminance
    alpha *= np.asarray(battlefield_mask(), dtype=np.float32) / 255.0
    alpha[alpha < 0.055] = 0.0

    # Keep a crisp emissive core and add a narrow halo so the light remains readable at gameplay scale.
    alpha_source = Image.fromarray(np.uint8(np.clip(alpha, 0.0, 1.0) * 255))
    core = np.asarray(alpha_source.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255.0
    halo = np.asarray(alpha_source.filter(ImageFilter.GaussianBlur(2.4)), dtype=np.float32) / 255.0
    alpha = np.clip(core + halo * 0.42, 0.0, 1.0)
    alpha *= np.asarray(furnace_shelf_keep_mask(), dtype=np.float32) / 255.0

    # Additive donor colour stays orange/amber and carries some local variation from the painting.
    donor = np.empty_like(rgb)
    donor[..., 0] = np.clip(210.0 + r * 0.25, 0.0, 255.0)
    donor[..., 1] = np.clip(70.0 + g * 0.62, 0.0, 218.0)
    donor[..., 2] = np.clip(6.0 + b * 0.24, 0.0, 58.0)
    return donor, alpha


def build_frame(donor: np.ndarray, alpha: np.ndarray, frame_index: int) -> Image.Image:
    phase = math.tau * frame_index / FRAME_COUNT
    yy, xx = np.mgrid[0:FRAME_HEIGHT, 0:FRAME_WIDTH].astype(np.float32)
    x = xx / FRAME_WIDTH
    y = yy / FRAME_HEIGHT

    # Several travelling waves move in different directions. Integer phase multipliers keep the wrap seamless,
    # while the narrow hot band makes the motion readable at actual game size instead of looking static.
    broad = np.sin(math.tau * (x * 1.25 + y * 0.44) + phase)
    fine = np.sin(math.tau * (x * -2.1 + y * 1.35) - phase * 2.0)
    cross = np.sin(math.tau * (x * 0.38 + y * 2.4) + phase * 3.0)
    hot_band = np.maximum(0.0, np.sin(math.tau * (x * 3.2 + y * 1.8) - phase * 3.0)) ** 6
    motion = np.clip(0.46 + broad * 0.27 + fine * 0.17 + cross * 0.09 + hot_band * 0.55, 0.12, 1.2)
    frame_alpha = np.clip(alpha * motion * 1.35, 0.0, 1.0)

    # The travelling band also gets a warmer yellow core, so motion remains visible over already-orange cracks.
    frame_rgb = donor.copy()
    frame_rgb[..., 0] = np.clip(frame_rgb[..., 0] + hot_band * 26.0, 0.0, 255.0)
    frame_rgb[..., 1] = np.clip(frame_rgb[..., 1] + hot_band * 112.0, 0.0, 240.0)
    frame_rgb[..., 2] = np.clip(frame_rgb[..., 2] + hot_band * 18.0, 0.0, 72.0)
    rgba = np.dstack((frame_rgb, frame_alpha[..., None] * 255.0)).astype(np.uint8)
    return Image.fromarray(rgba)


def preview_frame(source: Image.Image, overlay: Image.Image) -> Image.Image:
    base = np.asarray(source.convert("RGB").resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)).astype(
        np.float32
    )
    rgba = np.asarray(overlay).astype(np.float32)
    alpha = rgba[..., 3:4] / 255.0 * 0.75
    composed = np.clip(base + rgba[..., :3] * alpha, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(composed)


def write_level(level: int, source_path: Path, output_root: Path, design_root: Path) -> None:
    source = Image.open(source_path)
    donor, alpha = lava_base(source)
    frames = [build_frame(donor, alpha, index) for index in range(FRAME_COUNT)]

    atlas = Image.new("RGBA", (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * ROWS), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.paste(frame, ((index % COLUMNS) * FRAME_WIDTH, (index // COLUMNS) * FRAME_HEIGHT))

    level_root = output_root / "environment" / "lava_chasm_glow" / f"level_{level}"
    atlas_dir = level_root / "atlas"
    atlas_dir.mkdir(parents=True, exist_ok=True)
    atlas_name = f"lava_chasm_glow_narrowing_level_{level}_atlas.webp"
    atlas_path = atlas_dir / atlas_name
    atlas.save(atlas_path, "WEBP", lossless=True, method=6)

    meta = {
        "meta": {
            "frameWidth": FRAME_WIDTH,
            "frameHeight": FRAME_HEIGHT,
            "atlasWidth": FRAME_WIDTH * COLUMNS,
            "atlasHeight": FRAME_HEIGHT * ROWS,
            "frameCount": FRAME_COUNT,
            "fps": FPS,
            "frameDurationSec": 1 / FPS,
            "totalDurationSec": FRAME_COUNT / FPS,
            "layout": {"cols": COLUMNS, "rows": ROWS},
            "geometry": "full-background transparent chasm-emission overlay",
            "encoding": "lossless WebP RGBA",
        },
        "source": str(source_path),
        "notes": "Sprite-only additive glow; exact baked-background alignment; seamless 12-frame loop.",
    }
    (level_root / f"lava_chasm_glow_level_{level}_meta.json").write_text(
        json.dumps(meta, indent=2) + "\n", encoding="utf-8"
    )

    if level == 5:
        preview_dir = design_root / f"level_{level}"
        preview_dir.mkdir(parents=True, exist_ok=True)
        previews = [preview_frame(source, frame) for frame in frames]
        previews[0].save(
            preview_dir / f"lava_chasm_glow_level_{level}_preview.gif",
            save_all=True,
            append_images=previews[1:],
            duration=round(1000 / FPS),
            loop=0,
            optimize=False,
        )
        contact = Image.new("RGB", (FRAME_WIDTH * COLUMNS, FRAME_HEIGHT * ROWS), (0, 0, 0))
        for index, preview in enumerate(previews):
            contact.paste(preview, ((index % COLUMNS) * FRAME_WIDTH, (index // COLUMNS) * FRAME_HEIGHT))
        contact.save(preview_dir / f"lava_chasm_glow_level_{level}_contact.webp", "WEBP", quality=92, method=6)
    print(f"level {level}: {atlas_path} ({atlas_path.stat().st_size} bytes)", flush=True)


def main() -> None:
    sources = image_root()
    output = animation_output_root()
    design = design_record_root()
    for level, filename in BACKGROUND_BY_LEVEL.items():
        source = sources / filename
        if not source.is_file():
            raise FileNotFoundError(f"Missing approved narrowing background: {source}")
        write_level(level, source, output, design)


if __name__ == "__main__":
    main()
