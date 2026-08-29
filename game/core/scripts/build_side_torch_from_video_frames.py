#!/usr/bin/env python3
"""Build seamless left/right torch atlases from extracted frames of the approved Vecteezy fire video."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageOps


FRAME_SIZE = 256
FRAME_COUNT = 64
COLUMNS = 8
LOOP_BLEND_FRAMES = 12


def smoothstep(value: np.ndarray) -> np.ndarray:
    clipped = np.clip(value, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def torch_envelopes(frame_index: int) -> tuple[np.ndarray, np.ndarray]:
    """Return soft, asymmetric torch envelopes without a drawable geometric edge.

    Width is deliberately irregular down the flame: a thin leaning crown, a restless neck, and a rounded
    fuel-heavy base.  The envelopes only attenuate the keyed video alpha; they never paint an opaque mask,
    so their outline cannot appear as the oval/ring seen with the previous polygon mask.
    """
    y_points = np.array([7, 22, 42, 67, 94, 124, 154, 183, 209, 230, 248], dtype=np.float32)
    center_points = np.array([139, 134, 127, 135, 126, 133, 123, 130, 126, 130, 128], dtype=np.float32)
    width_points = np.array([1, 5, 9, 13, 17, 21, 26, 34, 45, 47, 7], dtype=np.float32)

    yy, xx = np.mgrid[0:FRAME_SIZE, 0:FRAME_SIZE].astype(np.float32)
    phase = frame_index * (2.0 * np.pi / FRAME_COUNT)
    vertical = yy[:, 0]
    motion_weight = np.clip((225.0 - vertical) / 200.0, 0.08, 1.0)
    center_motion = (
        np.sin(vertical * 0.061 + phase) * 4.8
        + np.sin(vertical * 0.137 - phase * 1.7) * 2.1
    ) * motion_weight
    width_motion = 1.0 + (
        np.sin(vertical * 0.091 - phase * 1.3) * 0.12
        + np.sin(vertical * 0.217 + phase * 1.9) * 0.055
    ) * (0.45 + motion_weight * 0.55)
    center = (np.interp(vertical, y_points, center_points) + center_motion)[:, None]
    half_width = (np.interp(vertical, y_points, width_points) * width_motion)[:, None]
    normalized_distance = np.abs(xx - center) / np.maximum(1.0, half_width)

    # Feather almost half the profile and keep the outside dependent on bright source filaments. There is no
    # constant-alpha rim for the eye to read as an oval.
    core = 1.0 - smoothstep((normalized_distance - 0.52) / 0.48)
    outer = 1.0 - smoothstep((normalized_distance - 0.55) / 0.78)
    top_fade = smoothstep((yy - 5.0) / 15.0)
    bottom_fade = smoothstep((251.0 - yy) / 12.0)
    core *= top_fade * bottom_fade
    outer *= smoothstep((yy - 1.0) / 11.0) * smoothstep((255.0 - yy) / 8.0)
    return core, outer


def keyed_torch(source: Image.Image, frame_index: int) -> Image.Image:
    # The selected video is 1280×720. A centred 430px column retains the strong vertical tongues while
    # discarding the unrelated wide fire front, then fills a narrow, tall torch canvas.
    crop = source.convert("RGB").crop((475, 0, 805, 720)).resize((154, 252), Image.Resampling.LANCZOS)
    crop = ImageEnhance.Contrast(crop).enhance(1.06)

    rgb = np.asarray(crop, dtype=np.float32)
    brightness = rgb.max(axis=2)
    warmth = np.clip((rgb[:, :, 0] - rgb[:, :, 2] * 0.38 + 12.0) / 105.0, 0.0, 1.0)
    alpha = smoothstep((brightness - 5.0) / 74.0) * warmth
    alpha = np.power(alpha, 1.12)

    flame = crop.convert("RGBA")
    flame.putalpha(Image.fromarray(np.uint8(np.clip(alpha * 255.0, 0, 255))))
    result = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    result.alpha_composite(flame, (51, 2))

    raw_alpha = np.asarray(result.getchannel("A"), dtype=np.float32) / 255.0
    core_mask, outer_mask = torch_envelopes(frame_index)
    outer_band = np.maximum(0.0, outer_mask - core_mask)
    # Bright filaments may escape the body and break up its contour. The mask only attenuates existing video
    # alpha, rather than adding a static silhouette, so no oval or straight mask line can become visible.
    escaped_tongues = outer_band * np.power(raw_alpha, 2.7) * 0.68
    combined_alpha = (raw_alpha * core_mask + escaped_tongues) * 255.0
    # Remove low-alpha black-background residue so linear texture filtering cannot create a smoky rectangle.
    combined_alpha[combined_alpha < 14.0] = 0.0
    result.putalpha(Image.fromarray(np.uint8(np.clip(combined_alpha, 0, 255))))
    return result


def close_loop(frames: list[Image.Image]) -> list[Image.Image]:
    cycle = list(frames[LOOP_BLEND_FRAMES:-LOOP_BLEND_FRAMES])
    for index in range(LOOP_BLEND_FRAMES):
        amount = (index + 1) / (LOOP_BLEND_FRAMES + 1)
        cycle.append(Image.blend(frames[-LOOP_BLEND_FRAMES + index], frames[index], amount))

    result: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        position = index * len(cycle) / FRAME_COUNT
        left = int(position) % len(cycle)
        fraction = position - int(position)
        result.append(Image.blend(cycle[left], cycle[(left + 1) % len(cycle)], fraction))
    return result


def save_atlas(frames: list[Image.Image], path: Path, mirrored: bool) -> None:
    atlas = Image.new("RGBA", (FRAME_SIZE * COLUMNS, FRAME_SIZE * COLUMNS), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        output = ImageOps.mirror(frame) if mirrored else frame
        atlas.alpha_composite(output, ((index % COLUMNS) * FRAME_SIZE, (index // COLUMNS) * FRAME_SIZE))
    path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(path, "WEBP", lossless=True, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-video", type=Path, required=True)
    args = parser.parse_args()

    paths = sorted(args.frames.glob("frame_*.png"))[:FRAME_COUNT]
    if len(paths) != FRAME_COUNT:
        raise RuntimeError(f"expected {FRAME_COUNT} extracted frames in {args.frames}, found {len(paths)}")

    frames = close_loop([keyed_torch(Image.open(path), index) for index, path in enumerate(paths)])
    left_path = args.output / "ambient_fire_video_torch_left_natural_v4_64_atlas.webp"
    right_path = args.output / "ambient_fire_video_torch_right_natural_v4_64_atlas.webp"
    save_atlas(frames, left_path, mirrored=False)
    save_atlas(frames, right_path, mirrored=True)

    contact = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE), (0, 0, 0, 0))
    for slot, frame_index in enumerate((0, 16, 32, 48)):
        contact.alpha_composite(frames[frame_index], (slot * FRAME_SIZE, 0))
    contact.save(args.output / "ambient_fire_video_torch_contact.webp", "WEBP", lossless=True, method=6)

    metadata = {
        "sourceVideo": str(args.source_video),
        "frameCount": FRAME_COUNT,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "columns": COLUMNS,
        "fps": 16,
        "loopBlendFrames": LOOP_BLEND_FRAMES,
        "loopStrategy": "moving head-tail crossfade, uniformly resampled to 64 frames",
        "crop": [475, 0, 805, 720],
        "shape": "animated tall asymmetric torch with a thin crown, irregular neck, rounded base and no mask rim",
    }
    (args.output / "ambient_fire_video_torch_meta.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
