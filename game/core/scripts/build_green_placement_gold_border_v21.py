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


GREEN_BORDER_DEPTH = 9


def main() -> None:
    """Build the green raster frame 25% thicker while retaining real-seam breaks."""
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    source = transparent_gold_source()

    for columns in CONFIGS:
        thick = nine_slice_frame(source, TARGET_WIDTHS[columns], TARGET_HEIGHT, GREEN_BORDER_DEPTH)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_green_gapped_{columns}col_{rows}row_v21.webp"
            output = erase_grid_seam_gaps(thick, columns, rows, GREEN_BORDER_DEPTH)
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                output.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
