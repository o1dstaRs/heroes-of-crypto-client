from __future__ import annotations

from pathlib import Path
from shutil import copy2

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_ROOT = REPO_ROOT / "game" / "core"
CANONICAL_ROOT = Path("/Users/pro/Workplace/heroesofcrypto-assets")
DESIGN_ROOT = CANONICAL_ROOT / "design" / "shot-trajectory" / "orc-geometry-match-v1"
CANONICAL_IMAGES = CANONICAL_ROOT / "images"
RUNTIME_IMAGES = CORE_ROOT / "images"
MAX_RUNTIME_BYTES = 120_000

ASSETS = (
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-9625cecf-f603-42c7-bbe3-30a9571da5aa.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_gold_fletching_wide_socket_v6.webp",
        "design_name": "shot_trajectory_orc_bronze_fletching_geometry_match_v7_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_fletching_geometry_match_v7.webp",
    },
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-28dc2fc5-dc20-4c67-88f5-32958a036430.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_gold_arrowhead_wide_socket_v6.webp",
        "design_name": "shot_trajectory_orc_bronze_arrowhead_geometry_match_v7_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_arrowhead_geometry_match_v7.webp",
    },
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Sprite source has no visible alpha pixels")
    return bbox


def visible_alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    visible_alpha = rgba.getchannel("A").point(lambda alpha: 255 if alpha >= 8 else 0)
    bbox = visible_alpha.getbbox()
    if bbox is None:
        raise ValueError("Sprite source has no visible alpha pixels")
    return bbox


def fit_to_reference_canvas(source: Image.Image, reference: Image.Image) -> Image.Image:
    source_rgba = source.convert("RGBA")
    # Ignore the near-zero transparent halo emitted by background extraction; otherwise that invisible
    # padding makes the actual bronze arrowhead smaller than the approved gold geometry.
    source_crop = source_rgba.crop(visible_alpha_bbox(source_rgba))
    reference_rgba = reference.convert("RGBA")
    ref_left, ref_top, ref_right, ref_bottom = alpha_bbox(reference_rgba)
    target_width = ref_right - ref_left
    target_height = ref_bottom - ref_top

    # The user approved the gold geometry as the authoritative footprint. Fill that exact painted box so
    # the Orc variant has identical on-board length and thickness rather than merely sharing the canvas.
    resized = source_crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", reference_rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, (ref_left, ref_top))
    return canvas


def save_runtime_webp(image: Image.Image, destination: Path) -> None:
    for quality in (90, 86, 82, 78, 74, 70):
        image.save(destination, "WEBP", quality=quality, method=6, exact=True)
        if destination.stat().st_size <= MAX_RUNTIME_BYTES:
            return
    raise ValueError(f"{destination.name} exceeds {MAX_RUNTIME_BYTES} bytes after compression")


def main() -> None:
    DESIGN_ROOT.mkdir(parents=True, exist_ok=True)
    CANONICAL_IMAGES.mkdir(parents=True, exist_ok=True)
    RUNTIME_IMAGES.mkdir(parents=True, exist_ok=True)

    for asset in ASSETS:
        source = asset["source"]
        reference = asset["reference"]
        if not source.exists():
            raise FileNotFoundError(source)
        if not reference.exists():
            raise FileNotFoundError(reference)

        copy2(source, DESIGN_ROOT / asset["design_name"])
        processed = fit_to_reference_canvas(Image.open(source), Image.open(reference))
        canonical_output = CANONICAL_IMAGES / asset["runtime_name"]
        save_runtime_webp(processed, canonical_output)
        copy2(canonical_output, RUNTIME_IMAGES / asset["runtime_name"])
        print(
            f"{asset['runtime_name']}: {processed.width}x{processed.height}, "
            f"{canonical_output.stat().st_size} bytes"
        )


if __name__ == "__main__":
    main()
