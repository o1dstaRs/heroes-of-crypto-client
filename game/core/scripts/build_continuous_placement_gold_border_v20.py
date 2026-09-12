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


def main() -> None:
    """Build the red team's uninterrupted raster frame for every field layout."""
    CANONICAL_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    source = transparent_gold_source()

    for columns in CONFIGS:
        continuous = nine_slice_frame(source, TARGET_WIDTHS[columns], TARGET_HEIGHT)
        for rows in ROW_COUNTS:
            output_name = f"placement_gold_outer_border_continuous_{columns}col_{rows}row_v20.webp"
            for directory in (CANONICAL_IMAGE_DIR, RUNTIME_IMAGE_DIR):
                path = directory / output_name
                continuous.save(path, "WEBP", lossless=True, method=6)
                print(path)


if __name__ == "__main__":
    main()
