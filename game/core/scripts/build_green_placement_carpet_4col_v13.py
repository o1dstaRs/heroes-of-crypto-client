from pathlib import Path

from PIL import Image, ImageEnhance


GENERATED_DIR = Path(
    "/Users/pro/.codex/generated_images/01a037f2-9349-7fc3-beae-63d4f3ff4c03"
)
BASE_SOURCE = GENERATED_DIR / "exec-f6e356cd-6436-4f00-8e3e-9a87ea145abc.png"
SEAM_SOURCE = GENERATED_DIR / "exec-852d5fa8-bd04-4992-942f-d4d03d2d347b.png"

BASE_CROP = (36, 3, 791, 1895)
SEAM_CROP = (36, 4, 791, 1900)

CONFIGS = (
    (3, 14, 410),
    (4, 16, 547),
    (5, 16, 683),
)
SOURCE_ROWS = 12

ASSET_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
DESIGN_DIR = Path(__file__).resolve().parents[1] / "design" / "placement-carpets"
def source_y(row: int, height: int) -> int:
    return round(height * row / SOURCE_ROWS)


def rebuild_vertical_seams(
    canvas: Image.Image,
    source: Image.Image,
    columns: int,
    rows: int,
) -> None:
    band_half_width = 8
    target_band_width = max(10, round(canvas.width / 50))
    source_width, source_height = source.size

    for column in range(1, columns):
        source_variant = ((column - 1) % 3) + 1
        source_center_x = round(source_width * source_variant / 4)
        for row in range(rows):
            source_row = row % SOURCE_ROWS
            source_top = source_y(source_row, source_height) + 6
            source_bottom = source_y(source_row + 1, source_height) - 6
            segment = source.crop(
                (
                    source_center_x - band_half_width,
                    source_top,
                    source_center_x + band_half_width + 1,
                    source_bottom,
                )
            )

            target_top = round(canvas.height * row / rows) + 4
            target_bottom = round(canvas.height * (row + 1) / rows) - 4
            segment = segment.resize(
                (target_band_width, target_bottom - target_top),
                Image.Resampling.LANCZOS,
            )
            canvas.paste(
                segment,
                (round(canvas.width * column / columns) - target_band_width // 2, target_top),
            )


def rebuild_horizontal_seams(
    canvas: Image.Image,
    source: Image.Image,
    columns: int,
    rows: int,
) -> None:
    source_width, source_height = source.size
    source_border = 12
    target_border = 9
    source_band_half_height = 6
    target_band_height = 16

    for row in range(1, rows):
        source_row = ((row - 1) % (SOURCE_ROWS - 1)) + 1
        source_center_y = source_y(source_row, source_height)
        seam = source.crop(
            (
                source_border,
                source_center_y - source_band_half_height,
                source_width - source_border,
                source_center_y + source_band_half_height + 1,
            )
        ).resize(
            (canvas.width - target_border * 2, target_band_height),
            Image.Resampling.LANCZOS,
        )
        seam = ImageEnhance.Contrast(seam).enhance(1.18)
        seam = ImageEnhance.Brightness(seam).enhance(0.62)
        canvas.paste(
            seam,
            (target_border, round(canvas.height * row / rows) - target_band_height // 2),
        )


def build(
    base_source: Image.Image,
    seam_source: Image.Image,
    columns: int,
    rows: int,
    width: int,
) -> Path:
    canvas = base_source.crop(BASE_CROP).resize((width, 1810), Image.Resampling.LANCZOS)
    rebuild_vertical_seams(canvas, seam_source, columns, rows)
    rebuild_horizontal_seams(canvas, seam_source, columns, rows)

    output_path = (
        ASSET_DIR
        / f"placement_carpet_green_exact_grid_{columns}x{rows}_opaque_v13.webp"
    )
    canvas.save(output_path, "WEBP", lossless=True, method=6)
    return output_path


def main() -> None:
    DESIGN_DIR.mkdir(parents=True, exist_ok=True)

    base_source = Image.open(BASE_SOURCE).convert("RGB")
    base_source.save(DESIGN_DIR / "green_carpet_seamless_imagegen_source_v13.png")
    seam_source_image = Image.open(SEAM_SOURCE).convert("RGB")
    seam_source_image.save(DESIGN_DIR / "green_carpet_stitched_imagegen_source_v13.png")

    seam_source = seam_source_image.crop(SEAM_CROP)

    for columns, rows, width in CONFIGS:
        print(build(base_source, seam_source, columns, rows, width))


if __name__ == "__main__":
    main()
