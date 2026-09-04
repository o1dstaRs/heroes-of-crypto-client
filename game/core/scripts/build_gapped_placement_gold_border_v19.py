from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps, ImageDraw


CANONICAL_ROOT = Path("/Users/pro/Workplace/heroesofcrypto-assets")
SOURCE = CANONICAL_ROOT / "design/placement-gold-border-v19/placement_gold_border_imagegen_source_v19.png"
CANONICAL_IMAGE_DIR = CANONICAL_ROOT / "images"
RUNTIME_IMAGE_DIR = Path(__file__).resolve().parents[1] / "images"
CONFIGS = (3, 4, 5, 6)
ROW_COUNTS = (14, 16)
TARGET_HEIGHT = 1810
TARGET_WIDTHS = {3: 410, 4: 547, 5: 683, 6: 820}
SOURCE_BORDER_DEPTH = 46
OUTPUT_BORDER_DEPTH = 7


def transparent_gold_source() -> Image.Image:
    """Remove ImageGen's baked preview checkerboard while retaining its gold ornament."""
    image = Image.open(SOURCE).convert("RGB")
    red, green, blue = image.split()
    warm = ImageChops.subtract(red, blue)
    saturation = ImageChops.subtract(ImageChops.lighter(red, green), ImageChops.darker(green, blue))
    alpha = ImageChops.lighter(warm, saturation).point(lambda value: max(0, min(255, (value - 10) * 6)))

    # The requested asset is a perimeter frame. Clipping the recovered pixels to a
    # fixed edge band removes every checkerboard remnant from the transparent centre.
    edge_mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(edge_mask)
    draw.rectangle((0, 0, image.width - 1, image.height - 1), outline=255, width=SOURCE_BORDER_DEPTH)
    alpha = ImageChops.multiply(alpha, edge_mask).filter(ImageFilter.GaussianBlur(0.35))
    gold = ImageEnhance.Contrast(image).enhance(1.08)
    gold = ImageEnhance.Sharpness(gold).enhance(1.35)
    return Image.merge("RGBA", (*gold.split(), alpha))


def nine_slice_frame(
    source: Image.Image,
    width: int,
    height: int,
    output_depth: int = OUTPUT_BORDER_DEPTH,
) -> Image.Image:
    """Straighten the picture without scaling the ornament band differently per side."""
    source_depth = SOURCE_BORDER_DEPTH
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    left = source_depth
    right = source.width - source_depth
    top = source_depth
    bottom = source.height - source_depth

    pieces = (
        ((0, 0, left, top), (0, 0, output_depth, output_depth)),
        ((left, 0, right, top), (output_depth, 0, width - output_depth, output_depth)),
        ((right, 0, source.width, top), (width - output_depth, 0, width, output_depth)),
        ((0, top, left, bottom), (0, output_depth, output_depth, height - output_depth)),
        ((right, top, source.width, bottom), (width - output_depth, output_depth, width, height - output_depth)),
        ((0, bottom, left, source.height), (0, height - output_depth, output_depth, height)),
        ((left, bottom, right, source.height), (output_depth, height - output_depth, width - output_depth, height)),
        ((right, bottom, source.width, source.height), (width - output_depth, height - output_depth, width, height)),
    )
    for source_box, target_box in pieces:
        target_size = (target_box[2] - target_box[0], target_box[3] - target_box[1])
        piece = source.crop(source_box).resize(target_size, Image.Resampling.LANCZOS)
        output.alpha_composite(piece, (target_box[0], target_box[1]))
    return output


def erase_grid_seam_gaps(
    border: Image.Image,
    columns: int,
    rows: int,
    output_depth: int = OUTPUT_BORDER_DEPTH,
) -> Image.Image:
    output = border.copy()
    width, height = output.size
    draw = ImageDraw.Draw(output)
    horizontal_gap = 12
    vertical_gap = 9
    edge_depth = output_depth + 2

    # These are exactly the UV boundaries used by placementCarpetTextureFrame.
    # Since the frame is sliced into the same cells, every transparent break maps
    # onto an actual projected stone seam for all supported field extensions.
    for column in range(1, columns):
        x = round(width * column / columns)
        draw.rectangle((x - horizontal_gap // 2, 0, x + horizontal_gap // 2, edge_depth), fill=(0, 0, 0, 0))
        draw.rectangle(
            (x - horizontal_gap // 2, height - edge_depth, x + horizontal_gap // 2, height),
            fill=(0, 0, 0, 0),
        )

    for row in range(1, rows):
        y = round(height * row / rows)
        draw.rectangle((0, y - vertical_gap // 2, edge_depth, y + vertical_gap // 2), fill=(0, 0, 0, 0))
        draw.rectangle(
            (width - edge_depth, y - vertical_gap // 2, width, y + vertical_gap // 2),
            fill=(0, 0, 0, 0),
        )
    return output


def main() -> None:
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    source = transparent_gold_source()

    for columns in CONFIGS:
        straight = nine_slice_frame(source, TARGET_WIDTHS[columns], TARGET_HEIGHT)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_gapped_{columns}col_{rows}row_v19.webp"
            output = erase_grid_seam_gaps(straight, columns, rows)
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                output.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
