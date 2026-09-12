from pathlib import Path

from PIL import Image, ImageFilter


SOURCE = Path(
    "/Users/pro/.codex/generated_images/01a037f2-9349-7fc3-beae-63d4f3ff4c03/"
    "exec-cf1bcc9f-d00d-4077-a672-d82dca9e86a1.png"
)
SOURCE_CROP = (35, 2, 791, 1900)
ASSET_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
DESIGN_DIR = Path(__file__).resolve().parents[1] / "design" / "placement-carpets"

CONFIGS = (
    (3, 410),
    (4, 547),
    (5, 683),
)

FRAME_SAMPLE_WIDTH = 16
FRAME_TARGET_WIDTH = 8


def gold_alpha(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    alpha = Image.new("L", rgb.size, 0)
    source = rgb.load()
    target = alpha.load()
    width, height = rgb.size

    for y in range(height):
        for x in range(width):
            red, green, blue = source[x, y]
            warmth = min(red - blue, green - blue)
            if red < 46 or green < 31 or warmth < 8 or red < green:
                continue
            target[x, y] = max(0, min(255, 72 + warmth * 6))

    return alpha.filter(ImageFilter.GaussianBlur(0.35))


def gold_only(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putalpha(gold_alpha(image))
    return rgba


def uniform_gold_border(image: Image.Image) -> Image.Image:
    width, height = image.size
    sample = FRAME_SAMPLE_WIDTH
    target = FRAME_TARGET_WIDTH
    border = Image.new("RGBA", image.size, (0, 0, 0, 0))

    left = gold_only(image.crop((0, 0, sample, height)).resize((target, height), Image.Resampling.LANCZOS))
    right = gold_only(
        image.crop((width - sample, 0, width, height)).resize((target, height), Image.Resampling.LANCZOS)
    )
    top = gold_only(image.crop((0, 0, width, sample)).resize((width, target), Image.Resampling.LANCZOS))
    bottom = gold_only(
        image.crop((0, height - sample, width, height)).resize((width, target), Image.Resampling.LANCZOS)
    )

    border.alpha_composite(left, (0, 0))
    border.alpha_composite(right, (width - target, 0))
    border.alpha_composite(top, (0, 0))
    border.alpha_composite(bottom, (0, height - target))
    return border


def carpet_with_uniform_border(image: Image.Image, border: Image.Image) -> Image.Image:
    width, height = image.size
    sample = FRAME_SAMPLE_WIDTH
    interior = image.crop((sample, sample, width - sample, height - sample)).resize(
        (width, height), Image.Resampling.LANCZOS
    )
    combined = interior.convert("RGBA")
    combined.alpha_composite(border)
    return combined.convert("RGB")


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    DESIGN_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    source.save(DESIGN_DIR / "green_carpet_uniform_thin_gold_aaa_imagegen_source_v16.png")
    carpet = source.crop(SOURCE_CROP)

    for columns, width in CONFIGS:
        output = carpet.resize((width, 1810), Image.Resampling.LANCZOS)
        border = uniform_gold_border(output)
        output = carpet_with_uniform_border(output, border)
        carpet_path = ASSET_DIR / f"placement_carpet_green_uniform_gold_aaa_{columns}col_v16.webp"
        output.save(carpet_path, "WEBP", lossless=True, method=6)

        border_path = ASSET_DIR / f"placement_gold_outer_border_aaa_{columns}col_v16.webp"
        border.save(border_path, "WEBP", lossless=True, method=6)

        print(carpet_path)
        print(border_path)


if __name__ == "__main__":
    main()
