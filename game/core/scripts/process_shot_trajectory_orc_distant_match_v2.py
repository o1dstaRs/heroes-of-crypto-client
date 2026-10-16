from __future__ import annotations

from pathlib import Path
from shutil import copy2

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_ROOT = REPO_ROOT / "game" / "core"
CANONICAL_ROOT = Path("/Users/pro/Workplace/heroesofcrypto-assets")
DESIGN_ROOT = CANONICAL_ROOT / "design" / "shot-trajectory" / "orc-distant-match-v2"
CANONICAL_IMAGES = CANONICAL_ROOT / "images"
RUNTIME_IMAGES = CORE_ROOT / "images"
MAX_RUNTIME_BYTES = 120_000

ASSETS = (
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-7f77b606-a6ea-42ae-9c65-ba189aebce46.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_gold_fletching_wide_socket_v6.webp",
        "design_name": "shot_trajectory_orc_bronze_fletching_distant_match_v8_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_fletching_distant_match_v8.webp",
    },
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-dc98fb1b-9f06-4533-963c-b527d79ddaf3.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_gold_arrowhead_wide_socket_v6.webp",
        "design_name": "shot_trajectory_orc_bronze_arrowhead_distant_match_v8_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_arrowhead_distant_match_v8.webp",
    },
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.convert("RGBA").getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Sprite source has no visible alpha pixels")
    return bbox


def cleaned_visible_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    # Remove ImageGen's nearly invisible warm halo. At distant LOD those isolated low-alpha pixels
    # resample into the shimmer/dots reported on the battlefield.
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < 32 else value)
    rgba.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Sprite source has no visible alpha pixels after halo cleanup")
    return rgba.crop(bbox)


def fit_to_reference_canvas(source: Image.Image, reference: Image.Image) -> Image.Image:
    source_crop = cleaned_visible_crop(source)
    reference_rgba = reference.convert("RGBA")
    ref_left, ref_top, ref_right, ref_bottom = alpha_bbox(reference_rgba)
    target_size = (ref_right - ref_left, ref_bottom - ref_top)

    # The approved gold sprites remain authoritative for the exact on-board footprint. Only the Orc
    # color/material rendering changes; canvas, length and thickness stay 1:1 with the gold set.
    resized = source_crop.resize(target_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", reference_rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, (ref_left, ref_top))
    return canvas


def save_runtime_webp(image: Image.Image, destination: Path) -> None:
    for quality in (92, 88, 84, 80, 76, 72):
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
