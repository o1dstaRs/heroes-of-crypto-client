# Sidebar portrait matte reconstruction

The original extraction preserved nearly black regions enclosed by a bow string,
limbs or a curved plume. These regions were background rather than material.
`repair_masks.py` reconstructs alpha from each original pose and its same-frame
source RGB. The reviewed component policies intentionally exclude dark armour,
hair, scales, eyes and mouths. Fractional smoke and magic coverage is protected.

The approved export keeps the 55 original master sheets pinned. Sparse literal
RGBA corrections live in the asset release, not Git. Each zlib payload contains
`HPR1`, little-endian width, height and physical frame count, then a record count
per frame followed by sorted eight-byte records: four-byte pixel index and four
literal RGBA bytes. Transparent source RGB is normalized to zero before applying
corrections. Replacement records avoid dependence on decoder-specific hidden RGB.

`src/build/sidebarPortraitRepair.ts` in the core package validates payload identity,
geometry, bounded decompression, record order and page bounds. The versioned
portrait restore script applies the payload while encoding lossless pages. The
browser uses those ready-made pages; no runtime mask or filter is added.

Release qualification compares every played frame against its accepted normalized
RGBA SHA-256, then decodes every exported WebP and compares all alpha and visible
RGB bytes. Frame order, count, dimensions and playback timing remain unchanged.
Representative poses are also inspected on light and dark backgrounds. Original
masters and previous page bytes remain available for selective rollback.

The Troll follow-up clears the reviewed air pocket under the club spike in 36
poses. Its mane uses the same pose's source chroma to remove keyed black fragments
and a narrow antialiased contour, preserving opaque inner strands. Small detached
chroma remnants are removed only in the reviewed mane region. The portrait has no
emitted particles. The second repair is distributed in archive 10; archive 09
remains available for selective rollback to the earlier matte.

Mask regression tests require Python, NumPy, SciPy, OpenCV and Pillow:

```sh
python3 -m unittest discover -s design/portrait-alpha-cleanup-20261028 -p 'test_*.py'
bun test game/core/src/build/sidebarPortraitRepair.test.ts game/core/src/build/sidebarPortraitRepairRelease.test.ts
```
