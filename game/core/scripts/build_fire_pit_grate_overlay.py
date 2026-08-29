#!/usr/bin/env python3
"""Remove the residual pit/fire matte from the approved grate overlay."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Existing RGBA extraction used as the metal mask")
    parser.add_argument("output", type=Path)
    parser.add_argument("--color-source", type=Path, help="Approved static pit frame supplying exact grate pixels")
    args = parser.parse_args()

    extracted = Image.open(args.source).convert("RGBA")
    color_source = Image.open(args.color_source).convert("RGBA") if args.color_source else extracted
    if color_source.size != extracted.size:
        raise ValueError("color source and extraction must have identical dimensions")
    pixels = np.asarray(color_source).copy()

    # The original extraction contains the accurate metal pixels, but also cell-shaped remnants
    # of the fire/pit matte. Restrict it to the known grate skeleton, then drop its faint matte.
    alpha = np.asarray(extracted)[:, :, 3]
    # Metal must be optically solid: keeping the old 227/240 alpha values lets white-hot fire bleed
    # through the bars even when their draw order is correct.
    thresholded = Image.fromarray(np.where(alpha >= 200, 255, 0).astype(np.uint8), "L")

    skeleton = Image.new("L", extracted.size, 0)
    draw = ImageDraw.Draw(skeleton)
    vertical_centers = (63, 159, 256, 352, 448)
    horizontal_centers = (105, 183, 265, 351, 437)
    for x in vertical_centers:
        draw.rectangle((x - 13, 63, x + 13, 448), fill=255)
    for y in horizontal_centers:
        draw.rectangle((40, y - 12, 472, y + 12), fill=255)
    for x in vertical_centers:
        for y in horizontal_centers:
            draw.ellipse((x - 23, y - 23, x + 23, y + 23), fill=255)
    skeleton = skeleton.filter(ImageFilter.GaussianBlur(0.8))
    cleaned_alpha = ImageChops.multiply(thresholded, skeleton)

    # The user-marked lower grate must act as a hard foreground occluder. Fill its exact bar cores
    # from the approved still frame even where the old extraction had alpha holes or fire contamination.
    lower_occluder = Image.new("L", extracted.size, 0)
    lower_draw = ImageDraw.Draw(lower_occluder)
    lower_horizontal_centers = (351, 437)
    for x in vertical_centers:
        # Continue one constant authored width through the bottom rim. The previous local widening ended
        # early and produced both a visible step and a final strip where fire could leak over the metal.
        lower_draw.rectangle((x - 9, 318, x + 9, 490), fill=255)
        for y in lower_horizontal_centers:
            lower_draw.ellipse((x - 23, y - 23, x + 23, y + 23), fill=255)
    for y in lower_horizontal_centers:
        lower_draw.rectangle((40, y - 10, 472, y + 10), fill=255)
    lower_occluder = lower_occluder.filter(ImageFilter.GaussianBlur(0.65))

    pixels[:, :, 3] = np.asarray(ImageChops.lighter(cleaned_alpha, lower_occluder), dtype=np.uint8)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, "RGBA").save(args.output, "WEBP", lossless=True, method=6)


if __name__ == "__main__":
    main()
