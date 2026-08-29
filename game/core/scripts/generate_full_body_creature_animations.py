#!/usr/bin/env python3
"""Build the approved full-body creature animation and portrait package.

The source art lives in ``tmp/imagegen/full-body-feed-v1/final``.  Every source is
normalised onto the same grounded 768 px canvas and rendered into the seven board
states consumed by RenderableUnit.  The timings and frame counts intentionally
match the Orc package.

This script has hard safety rails for Orc, Scavenger/Thief and Ash Moth/Wandering
Mage: those units are rejected even when explicitly supplied on the command line.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageEnhance


CANVAS = 768
PIVOT_X = CANVAS // 2
GROUND_Y = 742
MAX_SUBJECT_WIDTH = 704
MAX_SUBJECT_HEIGHT = 700

EXCLUDED_SLUGS = frozenset(
    {
        "orc",
        "scavenger",
        "thief",
        "ash_moth",
        "wandering_mage",
    }
)

FLYING_SLUGS = frozenset(
    {
        "angel",
        "beholder",
        "black_dragon",
        "efreet",
        "fairy",
        "griffin",
        "harpy",
        "magic_dragon",
        "manticore",
        "mantis",
        "pegasus",
        "thunderbird",
        "valkyrie",
        "wyvern",
    }
)

BIG_SLUGS = frozenset(
    {
        "abomination",
        "angel",
        "behemoth",
        "black_dragon",
        "champion",
        "frenzied_boar",
        "gargantuan",
        "hydra",
        "magic_dragon",
        "thunderbird",
        "tsar_cannon",
    }
)


@dataclass(frozen=True)
class StateSpec:
    frame_count: int
    fps: float


STATE_SPECS = {
    "walk": StateSpec(9, 20.0),
    "attack": StateSpec(8, 100.0 / 3.0),
    "attack_up": StateSpec(8, 100.0 / 3.0),
    "attack_down": StateSpec(8, 100.0 / 3.0),
    "hit": StateSpec(8, 80.0 / 3.0),
    "death": StateSpec(8, 40.0 / 3.0),
    "idle": StateSpec(8, 40.0 / 3.0),
}


@dataclass(frozen=True)
class Pose:
    dx: float = 0
    dy: float = 0
    angle: float = 0
    sx: float = 1
    sy: float = 1
    alpha: float = 1
    red_flash: float = 0


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def assert_allowed(slug: str) -> None:
    if slug in EXCLUDED_SLUGS:
        raise RuntimeError(f"Safety rail: refusing to generate protected unit {slug!r}")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Source has no visible pixels")
    return bbox


def trim_and_ground(source: Image.Image) -> Image.Image:
    source = source.convert("RGBA")
    bbox = alpha_bbox(source)
    subject = source.crop(bbox)
    scale = min(MAX_SUBJECT_WIDTH / subject.width, MAX_SUBJECT_HEIGHT / subject.height)
    size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS))
    x = PIVOT_X - subject.width // 2
    y = GROUND_Y - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def normalize_authored_sequence(sources: list[Image.Image]) -> list[Image.Image]:
    """Place authored frames on one shared scale without destroying their vertical motion."""
    rgba_sources = [source.convert("RGBA") for source in sources]
    source_width = max(source.width for source in rgba_sources)
    source_height = max(source.height for source in rgba_sources)
    aligned: list[Image.Image] = []
    union_alpha = Image.new("L", (source_width, source_height))
    for source in rgba_sources:
        frame = Image.new("RGBA", (source_width, source_height))
        frame.alpha_composite(source, ((source_width - source.width) // 2, (source_height - source.height) // 2))
        aligned.append(frame)
        union_alpha = ImageChops.lighter(union_alpha, frame.getchannel("A"))
    union_bbox = union_alpha.getbbox()
    if union_bbox is None:
        raise ValueError("Authored sequence has no visible pixels")
    union_width = union_bbox[2] - union_bbox[0]
    union_height = union_bbox[3] - union_bbox[1]
    scale = min(MAX_SUBJECT_WIDTH / union_width, MAX_SUBJECT_HEIGHT / union_height)
    output_size = (max(1, round(union_width * scale)), max(1, round(union_height * scale)))
    output: list[Image.Image] = []
    for frame in aligned:
        subject = frame.crop(union_bbox).resize(output_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (CANVAS, CANVAS))
        canvas.alpha_composite(subject, (PIVOT_X - subject.width // 2, GROUND_Y - subject.height))
        output.append(canvas)
    return output


def scale_frame_around(frame: Image.Image, scale: float, pivot: tuple[int, int]) -> Image.Image:
    """Scale one authored pose around an anatomy landmark instead of its changing silhouette."""
    if scale == 1:
        return frame.copy()
    bbox = alpha_bbox(frame)
    subject = frame.crop(bbox)
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    pivot_x, pivot_y = pivot
    x = round(pivot_x + (bbox[0] - pivot_x) * scale)
    y = round(pivot_y + (bbox[1] - pivot_y) * scale)
    output = Image.new("RGBA", frame.size)
    output.alpha_composite(subject, (x, y))
    return output


def transformed(base: Image.Image, pose: Pose) -> Image.Image:
    bbox = alpha_bbox(base)
    crop = base.crop(bbox)
    scaled_size = (
        max(1, round(crop.width * pose.sx)),
        max(1, round(crop.height * pose.sy)),
    )
    crop = crop.resize(scaled_size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", base.size)
    original_cx = (bbox[0] + bbox[2]) / 2
    x = round(PIVOT_X + pose.dx + (bbox[0] - original_cx) * pose.sx)
    y = round(GROUND_Y + pose.dy - (bbox[3] - bbox[1]) * pose.sy)
    frame.alpha_composite(crop, (x, y))
    if pose.angle:
        frame = frame.rotate(
            pose.angle,
            resample=Image.Resampling.BICUBIC,
            center=(PIVOT_X + pose.dx, GROUND_Y + pose.dy),
        )
    if pose.red_flash:
        alpha = frame.getchannel("A")
        red = Image.new("RGBA", frame.size, (255, 42, 30, 0))
        red.putalpha(alpha.point(lambda value: round(value * pose.red_flash)))
        frame = Image.alpha_composite(frame, red)
    if pose.alpha < 1:
        frame.putalpha(frame.getchannel("A").point(lambda value: round(value * pose.alpha)))
    return frame


def state_poses(state: str, flying: bool) -> list[Pose]:
    if state == "idle":
        values = [0.0, 0.45, 0.85, 0.45, 0.0, -0.35, -0.7, -0.35]
        hover = [0, -1, -2, -1, 0, 1, 2, 1] if flying else [0] * 8
        return [
            Pose(dy=hover[i], sx=1 - value * 0.004, sy=1 + value * 0.007, angle=value * 0.25)
            for i, value in enumerate(values)
        ]
    if state == "walk":
        if flying:
            return [
                Pose(dx=dx, dy=dy, angle=angle, sx=sx, sy=sy)
                for dx, dy, angle, sx, sy in [
                    (0, 0, 0, 1.00, 1.00),
                    (2, -5, -1.5, 1.02, 0.995),
                    (5, -10, -2.5, 1.045, 0.99),
                    (3, -5, -1, 1.025, 0.995),
                    (0, 0, 0, 1.00, 1.00),
                    (-2, 4, 1.5, 0.98, 1.005),
                    (-4, 7, 2.5, 0.965, 1.01),
                    (-2, 3, 1, 0.98, 1.005),
                    (0, 0, 0, 1.00, 1.00),
                ]
            ]
        return [
            Pose(dx=dx, dy=dy, angle=angle, sx=sx, sy=sy)
            for dx, dy, angle, sx, sy in [
                (0, 0, 0, 1.00, 1.00),
                (2, -2, -0.7, 1.006, 0.995),
                (5, -7, -1.4, 1.012, 0.988),
                (3, -3, -0.6, 1.006, 0.995),
                (0, 0, 0, 1.00, 1.00),
                (-3, -2, 0.7, 1.006, 0.995),
                (-5, -7, 1.4, 1.012, 0.988),
                (-2, -3, 0.6, 1.006, 0.995),
                (0, 0, 0, 1.00, 1.00),
            ]
        ]
    if state in {"attack", "attack_up", "attack_down"}:
        progress = [0, 0.08, 0.28, 0.67, 1.0, 0.62, 0.22, 0]
        if state == "attack_up":
            return [Pose(dx=22 * p, dy=-28 * p, angle=-10 * p, sx=1 + 0.035 * p, sy=1 - 0.01 * p) for p in progress]
        if state == "attack_down":
            return [Pose(dx=26 * p, dy=9 * p, angle=12 * p, sx=1 + 0.04 * p, sy=1 - 0.025 * p) for p in progress]
        return [Pose(dx=36 * p, dy=-5 * math.sin(math.pi * p), angle=-7 * p, sx=1 + 0.05 * p, sy=1 - 0.02 * p) for p in progress]
    if state == "hit":
        recoil = [0, 0.3, 0.82, 1.0, 0.68, 0.35, 0.12, 0]
        return [
            Pose(dx=-25 * p, dy=-4 * p, angle=8 * p, sx=1 - 0.025 * p, sy=1 + 0.015 * p, red_flash=0.23 * p)
            for p in recoil
        ]
    if state == "death":
        values = [
            (0, 0, 0, 1.00, 1.00, 1.0),
            (3, -2, -5, 1.00, 1.00, 1.0),
            (9, 0, -15, 1.01, 0.99, 1.0),
            (17, 6, -29, 1.02, 0.97, 1.0),
            (24, 15, -45, 1.04, 0.92, 1.0),
            (29, 25, -61, 1.07, 0.84, 1.0),
            (31, 36, -76, 1.10, 0.74, 1.0),
            (32, 45, -87, 1.14, 0.64, 1.0),
        ]
        return [Pose(dx=dx, dy=dy, angle=angle, sx=sx, sy=sy, alpha=alpha) for dx, dy, angle, sx, sy, alpha in values]
    raise KeyError(state)


def load_authored_troglodyte_walk(root: Path) -> list[Image.Image] | None:
    frames_dir = root / "tmp/imagegen/movement-v1/user_ready/frames"
    paths = sorted(frames_dir.glob("frame_*.png"))
    # The approved seven-frame export already ends on an exact copy of frame 1,
    # so it closes the loop without adding another duplicate here. The former
    # seventh pose was intentionally removed from the authored sequence.
    if len(paths) != 7:
        return None
    return [trim_and_ground(Image.open(path)) for path in paths]


def load_authored_centaur_walk(root: Path) -> list[Image.Image] | None:
    frames_dir = root / "tmp/imagegen/centaur-walk-v2/frames"
    paths = sorted(frames_dir.glob("frame_*.png"))
    if len(paths) != 9:
        return None
    frames = normalize_authored_sequence([Image.open(path) for path in paths])
    # Independently authored gallop poses drifted slightly in character scale. Correct only
    # the visibly smaller push/flight frames around the human/horse anatomy junction, keeping
    # hoof lift and vertical body motion intact.
    scale_corrections = (1.0, 1.10, 1.0, 1.12, 1.0, 1.0, 1.11, 1.0, 1.0)
    frames = [
        scale_frame_around(frame, scale, (PIVOT_X, 400))
        for frame, scale in zip(frames, scale_corrections)
    ]
    # The exit turn is deliberately identical to the entry turn before returning to idle.
    frames[-1] = frames[0].copy()
    return frames


def build_frames(root: Path, slug: str, base: Image.Image, state: str) -> list[Image.Image]:
    if slug == "centaur" and state == "walk":
        authored = load_authored_centaur_walk(root)
        if authored:
            return authored
    if slug == "troglodyte" and state == "walk":
        authored = load_authored_troglodyte_walk(root)
        if authored:
            return authored
    return [transformed(base, pose) for pose in state_poses(state, slug in FLYING_SLUGS)]


def save_atlas(frames: list[Image.Image], output_dir: Path, slug: str, state: str, spec: StateSpec) -> None:
    assert_allowed(slug)
    atlas_dir = output_dir / f"{slug}_{state}" / "atlas"
    atlas_dir.mkdir(parents=True, exist_ok=True)
    cols = 3 if len(frames) == 9 else 4
    rows = math.ceil(len(frames) / cols)
    atlas = Image.new("RGBA", (CANVAS * cols, CANVAS * rows))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, ((index % cols) * CANVAS, (index // cols) * CANVAS))
    base_name = f"{slug}_{state}_atlas"
    atlas.save(atlas_dir / f"{base_name}.webp", "WEBP", quality=90, method=6)
    quarter = atlas.resize((atlas.width // 4, atlas.height // 4), Image.Resampling.LANCZOS)
    quarter.save(atlas_dir / f"{base_name}_quarter.webp", "WEBP", quality=92, method=6)
    if slug in BIG_SLUGS:
        half = atlas.resize((atlas.width // 2, atlas.height // 2), Image.Resampling.LANCZOS)
        half.save(atlas_dir / f"{base_name}_half.webp", "WEBP", quality=90, method=6)
    meta = {
        "meta": {
            "frameWidth": CANVAS,
            "frameHeight": CANVAS,
            "atlasWidth": atlas.width,
            "atlasHeight": atlas.height,
            "frameCount": len(frames),
            "fps": spec.fps,
            "frameDurationSec": 1 / spec.fps,
            "totalDurationSec": len(frames) / spec.fps,
            "layout": {"cols": cols, "rows": rows},
            "footAnchorY": GROUND_Y / CANVAS,
        },
        "frames": [
            {
                "name": f"frame_{index + 1:02}.png",
                "index": index,
                "x": (index % cols) * CANVAS,
                "y": (index // cols) * CANVAS,
                "w": CANVAS,
                "h": CANVAS,
                "tStart": index / spec.fps,
                "tEnd": (index + 1) / spec.fps,
            }
            for index in range(len(frames))
        ],
    }
    (atlas_dir / f"{slug}_{state}_meta.json").write_text(json.dumps(meta, indent=2) + "\n")


def portrait_from_source(source: Image.Image, size: int = 512) -> Image.Image:
    source = source.convert("RGBA")
    left, top, right, bottom = alpha_bbox(source)
    width = right - left
    height = bottom - top
    # Head through upper chest, with a little lateral room for horns, weapons and hair.
    crop_height = max(1, round(height * 0.62))
    crop_top = max(0, top - round(height * 0.025))
    crop_bottom = min(source.height, crop_top + crop_height)
    crop_width = max(width, crop_bottom - crop_top)
    center_x = (left + right) / 2
    crop_left = round(center_x - crop_width / 2)
    crop_right = crop_left + crop_width
    if crop_left < 0:
        crop_right -= crop_left
        crop_left = 0
    if crop_right > source.width:
        crop_left -= crop_right - source.width
        crop_right = source.width
    crop_left = max(0, crop_left)
    portrait = source.crop((crop_left, crop_top, crop_right, crop_bottom))
    fitted = Image.new("RGBA", (size, size))
    scale = min((size * 0.94) / portrait.width, (size * 0.96) / portrait.height)
    resized = portrait.resize((round(portrait.width * scale), round(portrait.height * scale)), Image.Resampling.LANCZOS)
    fitted.alpha_composite(resized, ((size - resized.width) // 2, size - resized.height))
    return fitted


def sync_portrait(portrait: Image.Image, slug: str, image_root: Path, local_images: Path) -> None:
    assert_allowed(slug)
    image_root.mkdir(parents=True, exist_ok=True)
    local_images.mkdir(parents=True, exist_ok=True)
    name = f"{slug}_512.webp"
    canonical = image_root / name
    portrait.save(canonical, "WEBP", lossless=True, method=6)
    shutil.copy2(canonical, local_images / name)


def iter_sources(source_dir: Path, selected: set[str] | None) -> Iterable[tuple[str, Path]]:
    for path in sorted(source_dir.glob("*_full.png")):
        slug = slugify(path.stem.removesuffix("_full"))
        if selected is not None and slug not in selected:
            continue
        assert_allowed(slug)
        yield slug, path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--animations-root", type=Path)
    parser.add_argument("--images-root", type=Path)
    parser.add_argument("--unit", action="append", default=[])
    parser.add_argument("--skip-portraits", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.repo_root.resolve()
    local_assets_root = root.parents[2] / "heroesofcrypto-assets"
    source_dir = (args.source_dir or root / "tmp/imagegen/full-body-feed-v1/final").resolve()
    configured_animations = Path(os.environ["HOC_ANIMATIONS_LOC"]) if os.environ.get("HOC_ANIMATIONS_LOC") else None
    configured_images = Path(os.environ["HOC_IMAGES_LOC"]) if os.environ.get("HOC_IMAGES_LOC") else None
    animations_root = args.animations_root or (
        configured_animations / "output"
        if configured_animations is not None and "Dropbox" not in configured_animations.parts
        else local_assets_root / "animations/output"
    )
    images_root = args.images_root or (
        configured_images
        if configured_images is not None and "Dropbox" not in configured_images.parts
        else local_assets_root / "images"
    )
    selected = {slugify(unit) for unit in args.unit} or None
    if selected:
        for slug in selected:
            assert_allowed(slug)
    sources = list(iter_sources(source_dir, selected))
    expected = len(selected) if selected else 54
    if len(sources) != expected:
        raise RuntimeError(f"Expected {expected} approved primary sources, found {len(sources)} in {source_dir}")
    print(f"Generating {len(sources)} creatures from {source_dir}")
    for index, (slug, path) in enumerate(sources, start=1):
        source = Image.open(path).convert("RGBA")
        base = trim_and_ground(source)
        for state, spec in STATE_SPECS.items():
            frames = build_frames(root, slug, base, state)
            expected_frame_count = 7 if slug == "troglodyte" and state == "walk" else spec.frame_count
            if len(frames) != expected_frame_count:
                raise RuntimeError(f"{slug}/{state}: expected {expected_frame_count} frames, got {len(frames)}")
            save_atlas(frames, animations_root.resolve(), slug, state, spec)
        if not args.skip_portraits:
            sync_portrait(portrait_from_source(source), slug, images_root.resolve(), root / "images")
        print(f"[{index:02}/{len(sources)}] {slug}")
    print("Done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
