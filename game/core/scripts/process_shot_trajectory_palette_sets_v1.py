from __future__ import annotations

from pathlib import Path
from shutil import copy2

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_ROOT = REPO_ROOT / "game" / "core"
CANONICAL_ROOT = Path("/Users/pro/Workplace/heroesofcrypto-assets")
DESIGN_ROOT = CANONICAL_ROOT / "design" / "shot-trajectory" / "palette-sets-v1"
CANONICAL_IMAGES = CANONICAL_ROOT / "images"
RUNTIME_IMAGES = CORE_ROOT / "images"

MAX_RUNTIME_BYTES = 120_000
UPSCALE = 4

ASSETS = (
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-b43433c1-3625-448a-abd0-a96b1d061aa5.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_hammered_bronze_casing_sprite_v4.webp",
        "design_name": "shot_trajectory_gold_casing_sprite_v6_source.png",
        "runtime_name": "shot_trajectory_gold_casing_sprite_v6.webp",
    },
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-656c999d-1f73-44bd-a368-639f845444cd.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_arrow_fletching_start_v4.webp",
        "design_name": "shot_trajectory_orc_bronze_fletching_start_v5_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_fletching_start_v5.webp",
    },
    {
        "source": Path(
            "/Users/pro/.codex/generated_images/01a04937-ab87-7bc3-8e53-ee587f02c029/"
            "exec-3b3a3f5d-ed1b-4d49-b654-e5360eaf37c5.png"
        ),
        "reference": RUNTIME_IMAGES / "shot_trajectory_arrowhead_target_v4.webp",
        "design_name": "shot_trajectory_orc_bronze_arrowhead_target_v5_source.png",
        "runtime_name": "shot_trajectory_orc_bronze_arrowhead_target_v5.webp",
    },
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Sprite source has no visible alpha pixels")
    return bbox


def fit_to_reference_canvas(source: Image.Image, reference: Image.Image) -> Image.Image:
    source_rgba = source.convert("RGBA")
    source_crop = source_rgba.crop(alpha_bbox(source_rgba))
    reference_rgba = reference.convert("RGBA")
    ref_left, ref_top, ref_right, ref_bottom = alpha_bbox(reference_rgba)

    canvas_width = reference_rgba.width * UPSCALE
    canvas_height = reference_rgba.height * UPSCALE
    target_left = ref_left * UPSCALE
    target_top = ref_top * UPSCALE
    target_width = (ref_right - ref_left) * UPSCALE
    target_height = (ref_bottom - ref_top) * UPSCALE

    scale = min(target_width / source_crop.width, target_height / source_crop.height)
    resized_width = max(1, round(source_crop.width * scale))
    resized_height = max(1, round(source_crop.height * scale))
    resized = source_crop.resize((resized_width, resized_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    paste_x = target_left + (target_width - resized_width) // 2
    paste_y = target_top + (target_height - resized_height) // 2
    canvas.alpha_composite(resized, (paste_x, paste_y))
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
