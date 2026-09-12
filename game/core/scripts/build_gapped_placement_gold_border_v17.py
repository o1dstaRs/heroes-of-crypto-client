from pathlib import Path

from PIL import Image, ImageDraw


CANONICAL_IMAGE_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
RUNTIME_IMAGE_DIR = Path(__file__).resolve().parents[1] / "images"
ROWS = 16
CONFIGS = (3, 4, 5)


def erase_grid_seam_gaps(border: Image.Image, columns: int) -> Image.Image:
    output = border.convert("RGBA")
    width, height = output.size
    draw = ImageDraw.Draw(output)
    horizontal_gap = max(8, round(width * 0.018))
    vertical_gap = max(8, round(height * 0.0045))
    edge_depth = max(12, round(min(width, height) * 0.024))

    for column in range(1, columns):
        x = round(width * column / columns)
        draw.rectangle(
            (x - horizontal_gap // 2, 0, x + horizontal_gap // 2, edge_depth),
            fill=(0, 0, 0, 0),
        )
        draw.rectangle(
            (x - horizontal_gap // 2, height - edge_depth, x + horizontal_gap // 2, height),
            fill=(0, 0, 0, 0),
        )

    for row in range(1, ROWS):
        y = round(height * row / ROWS)
        draw.rectangle(
            (0, y - vertical_gap // 2, edge_depth, y + vertical_gap // 2),
            fill=(0, 0, 0, 0),
        )
        draw.rectangle(
            (width - edge_depth, y - vertical_gap // 2, width, y + vertical_gap // 2),
            fill=(0, 0, 0, 0),
        )

    return output


def main() -> None:
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    for columns in CONFIGS:
        source = CANONICAL_IMAGE_DIR / f"placement_gold_outer_border_aaa_{columns}col_v16.webp"
        output_name = f"placement_gold_outer_border_gapped_{columns}col_v17.webp"
        output = erase_grid_seam_gaps(Image.open(source), columns)
        for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
            path = directory / output_name
            output.save(path, "WEBP", lossless=True, method=6)
            print(path)


if __name__ == "__main__":
    main()
