from PIL import Image

from build_gapped_placement_gold_border_v19 import (
    CANONICAL_IMAGE_DIR,
    CONFIGS,
    ROW_COUNTS,
    RUNTIME_IMAGE_DIR,
    TARGET_HEIGHT,
    TARGET_WIDTHS,
    nine_slice_frame,
    transparent_gold_source,
)


SUPERSAMPLE = 5
SUPERSAMPLED_BORDER_DEPTH = 54


def main() -> None:
    """Build the current 20%-thicker green frame as one uninterrupted bitmap."""
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    source = transparent_gold_source()

    for columns in CONFIGS:
        width = TARGET_WIDTHS[columns]
        supersampled = nine_slice_frame(
            source,
            width * SUPERSAMPLE,
            TARGET_HEIGHT * SUPERSAMPLE,
            SUPERSAMPLED_BORDER_DEPTH,
        )
        continuous = supersampled.resize((width, TARGET_HEIGHT), Image.Resampling.LANCZOS)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_green_continuous_{columns}col_{rows}row_v23.webp"
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                continuous.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
