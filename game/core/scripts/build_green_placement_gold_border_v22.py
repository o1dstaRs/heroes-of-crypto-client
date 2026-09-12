from PIL import Image

from build_gapped_placement_gold_border_v19 import (
    CANONICAL_IMAGE_DIR,
    CONFIGS,
    ROW_COUNTS,
    RUNTIME_IMAGE_DIR,
    TARGET_HEIGHT,
    TARGET_WIDTHS,
    erase_grid_seam_gaps,
    nine_slice_frame,
    transparent_gold_source,
)


SUPERSAMPLE = 5
SUPERSAMPLED_BORDER_DEPTH = 54
OUTPUT_EDGE_DEPTH = 11


def main() -> None:
    """Build a green raster border exactly 20% thicker via 5x supersampling."""
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
        thick = supersampled.resize((width, TARGET_HEIGHT), Image.Resampling.LANCZOS)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_green_gapped_{columns}col_{rows}row_v22.webp"
            output = erase_grid_seam_gaps(thick, columns, rows, OUTPUT_EDGE_DEPTH)
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                output.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
