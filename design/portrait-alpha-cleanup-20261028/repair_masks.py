"""Reconstruct portrait mattes without synthesizing, moving or blending source poses.

Dark materials are not a colour key. Only reviewed negative-space components
are removed; the general pass is confined to contours and genuine alpha defects.
"""
from __future__ import annotations
import cv2
import numpy as np
from scipy import ndimage as nd

cv2.setNumThreads(1)

def distance(mask):
    return cv2.distanceTransform(np.uint8(mask), cv2.DIST_L2, 5)

def fill_holes(mask):
    flood = np.pad(np.uint8(mask), 1)
    cv2.floodFill(flood, None, (0, 0), 2)
    return flood[1:-1, 1:-1] != 2

# Smoke, magic and emitted motes retain their deliberate fractional coverage.
SOFT_SUBJECTS = {"fairy", "monk", "nightmare", "tsar_cannon"}
# These palettes contain no green foreground. Exclude green creatures and magic.
GREEN_MATTE_SUBJECTS = {
    "angel", "arbalester", "battle_mage", "blacksmith", "centaur", "champion",
    "crusader", "elf", "healer", "nomad", "peasant", "pikeman", "squire",
    "valkyrie", "wolf_rider", "zena",
}

def reviewed_cavity(slug: str, box, centre, area: int) -> bool:
    x, y, w, h = map(int, box)
    cx, cy = centre
    if slug == "dryad":
        # Air between the taut bow string and the back of the head/neck.
        return (area >= 350 and 80 < cx < 275 and 285 < cy < 435 and h > 25) or (area >= 500 and cx < 100 and 510 < cy < 580 and x < 60 and y > 490 and w > 25 and h > 20)
    if slug == "centaur":
        # Open space under the two bare arms, never the black helmet or horse coat.
        return area >= 2000 and (cx < 145 or cx > 345) and 370 < cy < 650 and h > 55
    if slug == "crusader":
        # The open loop under the bent plume, above the shoulder plate.
        return cx > 355 and ((area >= 1500 and 100 < cy < 430 and h > 70) or (area >= 300 and cy < 300 and x > 350 and y < 250) or (area >= 30 and x > 525 and 350 < y < 440))
    if slug == "elf":
        # Chroma netting trapped between the far cheek and collar, not blond hair.
        return area >= 100 and 330 < cx < 425 and 270 < cy < 405 and h > 20
    return False

def reconstruct_matte(frame: np.ndarray, slug: str, raw: np.ndarray | None = None):
    assert frame.dtype == np.uint8 and frame.shape[2] == 4
    out = frame.copy()
    rgb = out[:, :, :3].astype(np.float32)
    alpha = out[:, :, 3].astype(np.float32) / 255
    original = alpha.copy()
    peak = rgb.max(2)
    removed_cavities = np.zeros(alpha.shape, bool)
    n, labels, stats, centres = cv2.connectedComponentsWithStats(np.uint8((peak <= (14 if slug == "crusader" else 4)) & (alpha > .78)), 8)
    for k in range(1, n):
        if reviewed_cavity(slug, stats[k, :4], centres[k], int(stats[k, 4])):
            removed_cavities |= labels == k
    if removed_cavities.any():
        # Extend only into the adjacent dark video matte; never into painted leaves/string.
        near = distance(~removed_cavities) <= 2
        removed_cavities |= near & (peak < 14)
        alpha[removed_cavities] = 0

    solid = alpha > .5
    outer_depth = distance(solid)
    if raw is not None and slug in GREEN_MATTE_SUBJECTS:
        rr = raw.astype(np.float32)
        green = (rr[:, :, 1] > 35) & (rr[:, :, 1] > np.maximum(rr[:, :, 0], rr[:, :, 2]) * 2 + 8)
        if slug == "elf":
            yy, xx = np.indices(alpha.shape)
            face_margin = (xx > 320) & (xx < 430) & (yy > 200) & (yy < 420)
            green |= face_margin & (rr[:, :, 1] > 20) & (rr[:, :, 1] > np.maximum(rr[:, :, 0], rr[:, :, 2]) * 1.25 + 8)
        # Saturated chroma threads at the silhouette are not dark hair after despill.
        spill = green & (outer_depth <= 3) & (alpha > 0)
        alpha[spill] = 0

    # Fill only tiny enclosed punctures with this same source pose's colour.
    # Real anatomical openings and spaces between limbs remain open.
    filled = fill_holes(alpha > .5)
    punctures = filled & (alpha <= .5)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(np.uint8(punctures), 8)
    restored = np.zeros(alpha.shape, bool)
    if raw is not None and slug not in SOFT_SUBJECTS:
        rp = raw.max(2)
        eligible = (stats[:, 4] <= 24) & (stats[:, 2] <= 8) & (stats[:, 3] <= 10)
        eligible[0] = False
        neutral = raw[:, :, 1].astype(float) < np.maximum(raw[:, :, 0], raw[:, :, 2]).astype(float) * 1.5 + 12
        restored = eligible[labels] & (rp > 12) & neutral & (original <= .5)
        rgb[restored] = raw[restored]
        alpha[restored] = 1
        deep = distance(alpha > .08) > 4
        tissue = deep & (alpha > 0) & (alpha < .98) & ~removed_cavities
        # Existing visible RGB is already foreground colour; do not borrow another pose.
        alpha[tissue] = 1

    # Neutralize black video matte only along the existing outer contour.
    # Fully opaque interior eyes, hair, armour, mouths and scale shadows are invariant.
    solid = alpha > .5
    inside = distance(solid)
    core = (alpha > .98) & (inside >= 3)
    if core.any() and slug not in SOFT_SUBJECTS:
        core_distance, indices = nd.distance_transform_edt(~core, return_indices=True)
        reference = rgb[tuple(indices)]
        ref_peak = reference.max(2)
        coverage = np.clip(peak / np.maximum(ref_peak, 1), 0, 1)
        fringe = (alpha > 0) & (inside < 2) & (core_distance <= 3) & (ref_peak > 45) & (peak < ref_peak * .42)
        alpha[fringe] *= coverage[fringe]
        rgb[fringe] = np.clip(rgb[fringe] / np.maximum(coverage[fringe, None], .05), 0, 255)

    # Remove detached near-black specks, not connected hairs, weapons or coloured particles.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(np.uint8(alpha > .03), 8)
    large = stats[:, 4] >= 100
    large[0] = False
    distance_to_body = distance(~large[labels])
    max_peak = np.zeros(n, np.float32)
    min_distance = np.full(n, np.inf, np.float32)
    np.maximum.at(max_peak, labels.ravel(), peak.ravel())
    np.minimum.at(min_distance, labels.ravel(), distance_to_body.ravel())
    debris = (stats[:, 4] <= 12) & (max_peak < 35) & (min_distance > 3)
    debris[0] = False
    alpha[debris[labels]] = 0
    alpha[alpha < 1 / 255] = 0
    out[:, :, :3] = np.uint8(np.clip(np.rint(rgb), 0, 255))
    out[:, :, 3] = np.uint8(np.clip(np.rint(alpha * 255), 0, 255))
    out[out[:, :, 3] == 0, :3] = 0
    return out, {'removedCavityPixels': int(removed_cavities.sum()), 'restoredPuncturePixels': int(restored.sum()),
                 'changedAlphaPixels': int((out[:, :, 3] != frame[:, :, 3]).sum()),
                 'visibleRgbChanges': int((np.any(out[:, :, :3] != frame[:, :, :3], 2) & (out[:, :, 3] > 0)).sum())}
