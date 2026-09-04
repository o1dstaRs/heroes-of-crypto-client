from pathlib import Path

from PIL import Image


SOURCE = Path(
    "/Users/pro/.codex/generated_images/01a037f2-9349-7fc3-beae-63d4f3ff4c03/"
    "exec-897b929b-c4ce-47c0-8d08-564eace6e00f.png"
)
SOURCE_CROP = (36, 3, 791, 1895)
ASSET_DIR = Path("/Users/pro/Workplace/heroesofcrypto-assets/images")
DESIGN_DIR = Path(__file__).resolve().parents[1] / "design" / "placement-carpets"

CONFIGS = (
    (3, 410),
    (4, 547),
    (5, 683),
)


def main() -> None:
    DESIGN_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    source.save(DESIGN_DIR / "green_carpet_seamless_imagegen_source_v14.png")
    carpet = source.crop(SOURCE_CROP)

    for columns, width in CONFIGS:
        output = carpet.resize((width, 1810), Image.Resampling.LANCZOS)
        output_path = (
            ASSET_DIR
            / f"placement_carpet_green_seamless_opaque_{columns}col_v14.webp"
        )
        output.save(output_path, "WEBP", lossless=True, method=6)
        print(output_path)


if __name__ == "__main__":
    main()
