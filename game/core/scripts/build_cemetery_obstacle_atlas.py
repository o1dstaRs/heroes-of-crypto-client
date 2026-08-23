#!/usr/bin/env python3
"""Build the nine-tile Cemetery obstacle atlas from the local design sources."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


TILE_WIDTH = 256
TILE_HEIGHT = 461
COLUMNS = 3
ROWS = 3


@dataclass(frozen=True)
class TileSpec:
    filename: str
    width_fraction: float
    height_fraction: float
    base_anchor_x: float


# The Cemetery barrel set uses circular, rotationally readable silhouettes with no privileged front. The
# frame stays one logical cell wide and 461/256 cells tall; transparent padding keeps the squat casks inside
# the occupied square while preserving the runtime's existing texture slicing and perspective scaling.
TILES = (
    TileSpec("01-funerary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("02-cracked-funerary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("03-chained-funerary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("04-ribbed-funerary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("05-ossuary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("06-mossy-funerary-cask.png", 0.88, 0.51, 0.50),
    TileSpec("07-armored-funerary-drum.png", 0.88, 0.51, 0.50),
    TileSpec("08-bone-inlay-cask.png", 0.88, 0.51, 0.50),
    TileSpec("09-tiered-funerary-cask.png", 0.88, 0.51, 0.50),
)


def alpha_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    # Ignore the few near-transparent edge pixels produced by generation; they are not part of the object
    # and otherwise make the packed art look undersized after resampling.
    solid_alpha = rgba.getchannel("A").point(lambda alpha: 255 if alpha > 24 else 0)
    bounds = solid_alpha.getbbox()
    if bounds is None:
        raise ValueError("source image contains no visible pixels")
    return rgba.crop(bounds)


def main() -> None:
    workspace = Path(__file__).resolve().parents[4]
    assets_root = Path(os.environ.get("HOC_ASSETS_ROOT", workspace / "heroesofcrypto-assets"))
    source_dir = assets_root / "design" / "battlefield_obstacles_cemetery_barrels_v1"
    # The versioned name intentionally invalidates Pixi/Vite's cached copy of the old 4x4 atlas. Reusing
    # that key made the new 3x3 frame rectangles cut unrelated fragments out of the previous texture.
    # Keep `_atlas` out of the runtime key: Pixi classifies those files as optional background animation
    # assets, while Cemetery obstacles must be ready before the board scene starts.
    output = assets_root / "images" / "cemetery_obstacles_9x_256.webp"

    atlas = Image.new("RGBA", (TILE_WIDTH * COLUMNS, TILE_HEIGHT * ROWS), (0, 0, 0, 0))
    for index, spec in enumerate(TILES):
        source_path = source_dir / spec.filename
        source = alpha_crop(Image.open(source_path))
        target_width = round(TILE_WIDTH * spec.width_fraction)
        target_height = round(TILE_HEIGHT * spec.height_fraction)
        resized = source.resize((target_width, target_height), Image.Resampling.LANCZOS)

        column = index % COLUMNS
        row = index // COLUMNS
        tile_left = column * TILE_WIDTH
        tile_top = row * TILE_HEIGHT
        object_left = round(TILE_WIDTH * 0.5 - spec.base_anchor_x * target_width)
        object_top = TILE_HEIGHT - target_height
        atlas.alpha_composite(resized, (tile_left + object_left, tile_top + object_top))

    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, "WEBP", quality=88, method=6, alpha_quality=100)
    print(f"Wrote {output} ({atlas.width}x{atlas.height}, {output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
