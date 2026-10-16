from pathlib import Path

from PIL import Image, ImageDraw


CANONICAL_IMAGE_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
RUNTIME_IMAGE_DIR = Path(__file__).resolve().parents[1] / "images"
CONFIGS = (3, 4, 5, 6)
ROW_COUNTS = (14, 16)


def erase_grid_seam_gaps(border: Image.Image, columns: int, rows: int) -> Image.Image:
    output = border.convert("RGBA")
    width, height = output.size
    draw = ImageDraw.Draw(output)
    horizontal_gap = max(8, round(width * 0.018))
    vertical_gap = max(8, round(height * 0.0045))
    edge_depth = max(12, round(min(width, height) * 0.024))

    # These coordinates are the exact UV slice boundaries used by
    # placementCarpetTextureFrame. Each gap therefore lands on a real projected
    # cell edge after its texture slice is mapped onto the battlefield mesh.
    for column in range(1, columns):
        x = width * column / columns
        draw.rectangle(
            (round(x - horizontal_gap / 2), 0, round(x + horizontal_gap / 2), edge_depth),
            fill=(0, 0, 0, 0),
        )
        draw.rectangle(
            (round(x - horizontal_gap / 2), height - edge_depth, round(x + horizontal_gap / 2), height),
            fill=(0, 0, 0, 0),
        )

    for row in range(1, rows):
        y = height * row / rows
        draw.rectangle(
            (0, round(y - vertical_gap / 2), edge_depth, round(y + vertical_gap / 2)),
            fill=(0, 0, 0, 0),
        )
        draw.rectangle(
            (width - edge_depth, round(y - vertical_gap / 2), width, round(y + vertical_gap / 2)),
            fill=(0, 0, 0, 0),
        )

    return output


def main() -> None:
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    for columns in CONFIGS:
        source_columns = min(columns, 5)
        source = CANONICAL_IMAGE_DIR / f"placement_gold_outer_border_aaa_{source_columns}col_v16.webp"
        source_image = Image.open(source)
        if columns > source_columns:
            target_width = round(source_image.width * columns / source_columns)
            source_image = source_image.resize((target_width, source_image.height), Image.Resampling.LANCZOS)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_gapped_{columns}col_{rows}row_v18.webp"
            output = erase_grid_seam_gaps(source_image, columns, rows)
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                output.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
