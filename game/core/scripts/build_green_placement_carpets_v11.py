from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw


ASSET_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
DESIGN_DIR = Path(__file__).resolve().parents[1] / "design" / "placement-carpets"
GENERATED_DIR = Path(
    "/Users/pro/.codex/generated_images/01a037f2-9349-7fc3-beae-63d4f3ff4c03"
)

SOURCE_PATH = GENERATED_DIR / "exec-569f7a09-3200-4761-8dfc-234b10c2a5a0.png"
SOURCE_CROP = (109, 0, 614, 2175)
SOURCE_SIZE = (410, 1810)

CONFIGS = (
    (3, 14, 410),
    (4, 16, 547),
    (5, 16, 683),
)


SEGMENT_PATTERNS = (
    ((0.05, 0.28), (0.37, 0.67), (0.80, 0.94)),
    ((0.08, 0.40), (0.52, 0.70), (0.79, 0.93)),
    ((0.04, 0.20), (0.30, 0.63), (0.73, 0.91)),
)


def draw_stitch(
    draw: ImageDraw.ImageDraw,
    position: int,
    along: int,
    vertical: bool,
    size: int,
) -> None:
    stitch = (109, 91, 43, 230)
    glint = (173, 139, 61, 170)
    if vertical:
        draw.line((position - size, along - 1, position + size, along + 1), fill=stitch, width=2)
        draw.point((position, along), fill=glint)
    else:
        draw.line((along - 1, position - size, along + 1, position + size), fill=stitch, width=2)
        draw.point((along, position), fill=glint)


def draw_repair_strap(
    draw: ImageDraw.ImageDraw,
    position: int,
    along: int,
    vertical: bool,
    size: int,
) -> None:
    leather = (42, 37, 19, 235)
    rim = (123, 98, 43, 215)
    if vertical:
        box = (position - size, along - 4, position + size, along + 4)
    else:
        box = (along - 4, position - size, along + 4, position + size)
    draw.rounded_rectangle(box, radius=2, fill=leather, outline=rim, width=1)


def draw_crafted_boundary(
    layer: Image.Image,
    position: int,
    divisions: int,
    vertical: bool,
    seed: int,
) -> None:
    draw = ImageDraw.Draw(layer)
    length = layer.height if vertical else layer.width
    cell_length = length / divisions
    crease_width = max(2, round((layer.width if vertical else layer.height) / 170))
    stitch_size = max(3, round((layer.width if vertical else layer.height) / 110))
    rng = random.Random(seed)

    for cell in range(divisions):
        start = cell * cell_length
        pattern = SEGMENT_PATTERNS[(cell + seed) % len(SEGMENT_PATTERNS)]
        for segment_index, (a, b) in enumerate(pattern):
            jitter = rng.uniform(-0.015, 0.015)
            lo = round(start + max(0.0, a + jitter) * cell_length)
            hi = round(start + min(1.0, b + jitter) * cell_length)
            shadow = (5, 18, 10, 205)
            raised_edge = (44, 71, 33, 150)
            if vertical:
                draw.line((position, lo, position, hi), fill=shadow, width=crease_width + 2)
                draw.line((position + crease_width, lo + 1, position + crease_width, hi - 1), fill=raised_edge, width=1)
            else:
                draw.line((lo, position, hi, position), fill=shadow, width=crease_width + 2)
                draw.line((lo + 1, position + crease_width, hi - 1, position + crease_width), fill=raised_edge, width=1)

            spacing = max(15, round(cell_length / 4))
            stitch = lo + spacing // 2 + rng.randint(-3, 3)
            while stitch < hi - 4:
                draw_stitch(draw, position, stitch, vertical, stitch_size)
                stitch += spacing + rng.randint(-4, 4)

            if (cell * 7 + segment_index * 3 + seed) % 11 == 0:
                draw_repair_strap(
                    draw,
                    position,
                    (lo + hi) // 2,
                    vertical,
                    stitch_size + 2,
                )


def add_knots(layer: Image.Image, columns: int, rows: int) -> None:
    draw = ImageDraw.Draw(layer)
    size = max(3, round(layer.width / 110))
    for column in range(1, columns):
        for row in range(1, rows):
            if (column * 5 + row * 3) % 4 != 0:
                continue
            x = round(layer.width * column / columns)
            y = round(layer.height * row / rows)
            color = (117, 91, 39, 225)
            draw.line((x - size, y - size, x + size, y + size), fill=color, width=2)
            draw.line((x - size, y + size, x + size, y - size), fill=color, width=2)
            draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(180, 139, 57, 210))


def build(columns: int, rows: int, width: int) -> Path:
    base_path = ASSET_DIR / f"placement_carpet_green_redrawn_alpha_grid_{columns}col_v10.webp"
    canvas = Image.open(base_path).convert("RGBA")
    canvas = canvas.resize((width, 1810), Image.Resampling.LANCZOS)
    seam_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))

    for column in range(1, columns):
        draw_crafted_boundary(
            seam_layer,
            round(width * column / columns),
            rows,
            vertical=True,
            seed=41 + columns * 13 + column,
        )

    for row in range(1, rows):
        draw_crafted_boundary(
            seam_layer,
            round(canvas.height * row / rows),
            columns,
            vertical=False,
            seed=79 + rows * 11 + row,
        )

    add_knots(seam_layer, columns, rows)
    canvas.alpha_composite(seam_layer)

    output_path = (
        ASSET_DIR
        / f"placement_carpet_green_crafted_cell_seams_{columns}col_v11.webp"
    )
    canvas.save(output_path, "WEBP", lossless=True, method=6)
    return output_path


def main() -> None:
    DESIGN_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE_PATH).convert("RGBA").crop(SOURCE_CROP)
    source = source.resize(SOURCE_SIZE, Image.Resampling.LANCZOS)
    source.save(DESIGN_DIR / "green_carpet_crafted_seams_imagegen_source_v11.png")

    for columns, rows, width in CONFIGS:
        print(build(columns, rows, width))


if __name__ == "__main__":
    main()
