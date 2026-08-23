#!/usr/bin/env python3
"""Build two stable 64-frame fire-pit sprite/GIF variants from extracted video frames."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


FRAME_SIZE = 512
FRAME_COUNT = 64
ATLAS_COLUMNS = 8
FPS = 16
LOOP_BLEND_FRAMES = 12


@dataclass(frozen=True)
class Variant:
    key: str
    source_name: str
    clip_start_seconds: float
    clip_duration_seconds: float
    crop: tuple[int, int, int, int]
    placement: tuple[int, int, int, int]
    mask_left: int
    mask_top: int
    mask_right: int
    brightness: float
    saturation: float
    alpha_power: float


VARIANTS = (
    Variant(
        key="variant_1_low_front",
        source_name="variant_1_low_front.mp4",
        clip_start_seconds=3.6,
        clip_duration_seconds=4.0,
        crop=(0, 72, 1920, 1080),
        placement=(41, 111, 430, 360),
        mask_left=82,
        mask_top=112,
        mask_right=444,
        brightness=1.08,
        saturation=1.13,
        alpha_power=1.18,
    ),
    Variant(
        key="variant_2_dense_flame",
        source_name="variant_2_dense_flame.mp4",
        clip_start_seconds=0.5,
        clip_duration_seconds=4.0,
        crop=(80, 35, 1200, 720),
        placement=(72, 174, 368, 276),
        mask_left=91,
        mask_top=154,
        mask_right=429,
        brightness=0.9,
        saturation=1.06,
        alpha_power=1.3,
    ),
)


def smoothstep(value: np.ndarray) -> np.ndarray:
    clipped = np.clip(value, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def fire_bowl_mask(variant: Variant) -> Image.Image:
    mask = Image.new("L", (FRAME_SIZE, FRAME_SIZE), 0)
    ImageDraw.Draw(mask).ellipse(
        (variant.mask_left, variant.mask_top, variant.mask_right, 474),
        fill=255,
    )
    return mask.filter(ImageFilter.GaussianBlur(6))


def flame_layer(source: Image.Image, variant: Variant) -> Image.Image:
    x, y, width, height = variant.placement
    crop = source.convert("RGB").crop(variant.crop).resize((width, height), Image.Resampling.LANCZOS)
    crop = ImageEnhance.Brightness(crop).enhance(variant.brightness)
    crop = ImageEnhance.Color(crop).enhance(variant.saturation)

    rgb = np.asarray(crop, dtype=np.float32)
    brightness = rgb.max(axis=2)
    warmth = np.clip((rgb[:, :, 0] - rgb[:, :, 2] * 0.42 + 18.0) / 120.0, 0.0, 1.0)
    alpha = smoothstep((brightness - 8.0) / 92.0) * warmth
    alpha = np.power(alpha, variant.alpha_power)

    placed_alpha = Image.new("L", (FRAME_SIZE, FRAME_SIZE), 0)
    placed_alpha.paste(Image.fromarray(np.uint8(np.clip(alpha * 255.0, 0, 255))), (x, y))

    bowl_mask = fire_bowl_mask(variant)

    vertical = np.zeros((FRAME_SIZE, FRAME_SIZE), dtype=np.float32)
    top_fade_end = variant.mask_top + 52
    bottom_fade_start = 438
    for row in range(FRAME_SIZE):
        if row < variant.mask_top:
            amount = 0.0
        elif row < top_fade_end:
            amount = (row - variant.mask_top) / max(1, top_fade_end - variant.mask_top)
        elif row <= bottom_fade_start:
            amount = 1.0
        else:
            amount = max(0.0, 1.0 - (row - bottom_fade_start) / 42.0)
        vertical[row, :] = amount
    vertical_mask = Image.fromarray(np.uint8(vertical * 255.0), "L")
    final_alpha = Image.fromarray(
        np.uint8(
            np.asarray(placed_alpha, dtype=np.float32)
            * np.asarray(bowl_mask, dtype=np.float32)
            * np.asarray(vertical_mask, dtype=np.float32)
            / (255.0 * 255.0)
        ),
        "L",
    )

    layer = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    layer.paste(crop.convert("RGBA"), (x, y), Image.new("L", (width, height), 255))
    layer.putalpha(final_alpha)
    return layer


def compose_frame(fire: Image.Image, variant: Variant, bowl: Image.Image, grate: Image.Image) -> Image.Image:
    glow_alpha = ImageChops.multiply(
        fire.getchannel("A").filter(ImageFilter.GaussianBlur(21)),
        fire_bowl_mask(variant),
    ).point(lambda value: int(value * 0.24))
    glow = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (255, 66, 7, 0))
    glow.putalpha(glow_alpha)
    result = Image.alpha_composite(bowl, glow)
    result = Image.alpha_composite(result, fire)
    result = Image.alpha_composite(result, grate)
    return result.convert("RGB")


def close_loop(frames: list[Image.Image]) -> list[Image.Image]:
    """Crossfade two moving sequences, then uniformly resample the closed motion back to 64 frames."""
    overlap = LOOP_BLEND_FRAMES
    # Start after the head used for the transition. The final blended frame approaches head[11], so the
    # following frame (raw[12]) is an ordinary forward motion step instead of a repeated still first frame.
    cycle = list(frames[overlap:-overlap])
    for index in range(overlap):
        amount = (index + 1) / (overlap + 1)
        cycle.append(Image.blend(frames[-overlap + index], frames[index], amount))

    result: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        position = index * len(cycle) / FRAME_COUNT
        left = int(position) % len(cycle)
        fraction = position - int(position)
        result.append(Image.blend(cycle[left], cycle[(left + 1) % len(cycle)], fraction))
    return result


def save_outputs(
    frames: list[Image.Image], fire_layers: list[Image.Image], output: Path, variant: Variant
) -> None:
    output.mkdir(parents=True, exist_ok=True)
    frames_dir = output / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old_frame in frames_dir.glob("frame_*.png"):
        old_frame.unlink()
    for index, frame in enumerate(frames):
        frame.save(frames_dir / f"frame_{index:03d}.png", optimize=True)

    atlas = Image.new("RGB", (FRAME_SIZE * ATLAS_COLUMNS, FRAME_SIZE * ATLAS_COLUMNS), (0, 0, 0))
    for index, frame in enumerate(frames):
        atlas.paste(frame, ((index % ATLAS_COLUMNS) * FRAME_SIZE, (index // ATLAS_COLUMNS) * FRAME_SIZE))
    atlas_path = output / f"fire_pit_{variant.key}_64_atlas.webp"
    atlas.save(atlas_path, "WEBP", quality=91, method=6)

    fire_atlas = Image.new("RGBA", atlas.size, (0, 0, 0, 0))
    for index, fire in enumerate(fire_layers):
        fire_atlas.alpha_composite(
            fire,
            ((index % ATLAS_COLUMNS) * FRAME_SIZE, (index // ATLAS_COLUMNS) * FRAME_SIZE),
        )
    fire_atlas_path = output / f"fire_pit_{variant.key}_fire_overlay_seamless_v2_64_atlas.webp"
    fire_atlas.save(fire_atlas_path, "WEBP", lossless=True, method=6)

    gif_frames = [frame.quantize(colors=256, method=Image.Quantize.MEDIANCUT) for frame in frames]
    gif_path = output / f"fire_pit_{variant.key}_preview.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        optimize=False,
        disposal=2,
    )

    contact = Image.new("RGB", (FRAME_SIZE * 4, FRAME_SIZE), (0, 0, 0))
    for slot, frame_index in enumerate((0, 16, 32, 48)):
        contact.paste(frames[frame_index], (slot * FRAME_SIZE, 0))
    contact.save(output / f"fire_pit_{variant.key}_contact.webp", "WEBP", quality=92, method=6)

    metadata = {
        "variant": variant.key,
        "sourceVideo": variant.source_name,
        "clipStartSeconds": variant.clip_start_seconds,
        "clipDurationSeconds": variant.clip_duration_seconds,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "frameCount": FRAME_COUNT,
        "columns": ATLAS_COLUMNS,
        "rows": ATLAS_COLUMNS,
        "fps": FPS,
        "loopBlendFrames": LOOP_BLEND_FRAMES,
        "loopStrategy": "moving head-tail crossfade, uniformly resampled to 64 frames",
        "crop": variant.crop,
        "placement": variant.placement,
        "fireStartZone": "lower central flame front inside the elliptical bowl",
        "layers": ["dark static bowl", "video-derived keyed fire", "immutable grate overlay"],
        "atlas": atlas_path.name,
        "transparentFireAtlas": fire_atlas_path.name,
        "gif": gif_path.name,
    }
    (output / f"fire_pit_{variant.key}_meta.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--bowl", type=Path, required=True)
    parser.add_argument("--grate", type=Path, required=True)
    args = parser.parse_args()

    bowl = Image.open(args.bowl).convert("RGBA")
    grate = Image.open(args.grate).convert("RGBA")
    for variant_index, variant in enumerate(VARIANTS, start=1):
        raw_dir = args.raw_root / f"raw_v{variant_index}"
        paths = sorted(raw_dir.glob("frame_*.png"))[:FRAME_COUNT]
        if len(paths) != FRAME_COUNT:
            raise RuntimeError(f"{raw_dir}: expected {FRAME_COUNT} frames, found {len(paths)}")
        fire_layers = close_loop([flame_layer(Image.open(path), variant) for path in paths])
        frames = [compose_frame(fire, variant, bowl, grate) for fire in fire_layers]
        save_outputs(frames, fire_layers, args.output_root / variant.key, variant)


if __name__ == "__main__":
    main()
