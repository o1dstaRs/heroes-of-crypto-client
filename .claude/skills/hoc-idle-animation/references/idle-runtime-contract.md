# HOC idle runtime contract

Read this before packaging, runtime replacement, or client integration.

## Storage

- Design/calibration record: `/Users/pro/Workplace/heroesofcrypto-assets/design`.
- Canonical runtime idle: `/Users/pro/Workplace/heroesofcrypto-assets/animations/output/<creature>_idle`.
- Repository intermediates: `game/core/tmp/imagegen` or another ignored local `tmp` folder.
- Keep all assets local; do not save them to Dropbox or another synchronized folder.

Expected runtime shape:

```text
animations/output/<creature>_idle/
├── atlas/
│   ├── <creature>_idle_atlas.webp
│   ├── <creature>_idle_atlas_quarter.webp
│   └── <creature>_idle_meta.json
└── <creature>_idle_preview.webp
```

Use lowercase snake_case names. Do not overwrite an existing idle until the approved new set is staged and the current set is backed up with hashes.

## Frames, anchors, and timing

- Inspect the target creature's installed idle before choosing dimensions. Many current full-body idles use 768x768 frames, but this is evidence rather than a universal requirement.
- Keep frame dimensions identical and names lexical: `frame_01.png`, `frame_02.png`, and so on.
- Grounded creatures need a stable recorded `footAnchorY`; rooted, coiled, wheeled, or flying creatures need an appropriate stable body anchor recorded in the production spec.
- Avoid adding a duplicate copy of frame 1 at the end unless an intentional hold is encoded in timing. A duplicated terminal pose often creates an accidental pause.
- Preserve approved per-frame timing. Do not silently inherit Sprite AI defaults or the timing of a different creature.
- Distinguish preview timing from effective runtime timing. Trace every game-side speed multiplier, pause, and fallback duration, then compare the resulting in-game frame duration with the approved preview. Changing source FPS alone is not evidence that runtime speed changed by the requested percentage.

Build the atlas with the repository packer:

```bash
bun game/core/scripts/frames_to_atlas.js \
  <frames-dir> \
  <staging-dir>/atlas/<creature>_idle_atlas.png \
  <staging-dir>/atlas/<creature>_idle_meta.json \
  --fps <fps> --max-width 4096 --webp-lossless
```

This packer writes uniform-FPS metadata. For uneven timing, deterministically add authoritative `frameDurationsMs`, cumulative `tStart`/`tEnd`, and summed `totalDurationSec`; set legacy `frameDurationSec` to the mean duration and `fps` to its reciprocal. Validate that timing count equals `frameCount`.

Generate `<creature>_idle_preview.webp` separately with the approved durations and record the exact command or script in `PROCESS.md`. Blended in-betweens may be used for an exploratory preview, but not as final frames unless explicitly approved and free of ghosting.

## Promotion and validation

Before promotion:

1. Copy the installed atlas/meta/preview into the calibration record as `runtime-before` and verify its hashes.
2. Stage and inspect the complete new set outside runtime.
3. Obtain explicit approval to replace the installed idle.
4. Install the complete set, then regenerate imports and validate.

Validate transitions as well as the uninterrupted loop:

- `idle -> walk -> idle` returns to the same apparent size, anchor, facing, and ground position;
- `idle -> action/hit -> idle` does not snap, jump, or briefly inherit the action atlas scale;
- generic breathing, bob, recoil, shake, or lunge code does not stack on a full-body authored idle or action;
- replacing idle assets does not disable or overwrite existing walk, attack, hit, or death atlases;
- every approved team orientation and battlefield context resolves the intended idle atlas.

Run from the repository root as applicable:

```bash
bun run --cwd game/core check:image-assets
bun run --cwd game/core generate:animations
bun run --cwd game/core generate:images
bun run check:images
```

Use `bun run --cwd game/core build:images` only when the task authorizes a full generated-image refresh. Verify both the battlefield idle and any UI preview because some consumers derive playback timing or pauses from metadata.

If hashes differ from approved outputs, a required check fails, or playback fails, restore the complete `runtime-before` set, rerun import generation, and verify the restored scene. Do not leave a mixed old/new runtime set. Add hash-pin protection when an approved idle must not be silently replaced by later generation passes.

## Required evidence

Retain with the design record:

- numbered contact sheet;
- dark and light/checker previews;
- actual-size battlefield preview;
- neutral/extreme comparison;
- seam and anchor checks;
- final atlas/meta inspection;
- approval notes and before/after hashes.
