# Heroes of Crypto animation contract

Read this before packaging, runtime promotion, or client integration.

## Storage and promotion boundary

- Canonical design and calibration work: `/Users/pro/Workplace/heroesofcrypto-assets/design`.
- Canonical runtime animations: `/Users/pro/Workplace/heroesofcrypto-assets/animations/output`.
- Repository generation intermediates: `game/core/tmp/imagegen` or another ignored local `tmp` folder.
- Do not write game art to Dropbox or another synchronized folder.
- Do not overwrite runtime atlases while exploring. Promotion requires explicit authorization in the current task and an approved preview.
- Before replacement, save the installed atlas/meta and hashes under the design record. Stage the new files outside runtime, verify them, then install them without deleting the recoverable prior copy.

Use this runtime folder shape:

```text
animations/output/<creature>_<state>/
├── atlas/
│   ├── <creature>_<state>_atlas.webp
│   ├── <creature>_<state>_atlas_quarter.webp
│   └── <creature>_<state>_meta.json
└── <creature>_<state>_preview.webp
```

Use lowercase snake_case names. Directional states follow existing names such as `attack_up`, `attack_down`, `melee_attack_up`, and `melee_attack_down`.

## Frame and timing rules

- The common current working canvas is 768x768 per frame, but inspect the target creature's existing atlas and production record before assuming this size.
- Keep all frames the same dimensions and order them lexically as `frame_01.png`, `frame_02.png`, and so on.
- Preserve per-frame durations when the motion source uses uneven timing. Do not replace timing with Sprite AI's default merely because the draft used 8 fps.
- Record `footAnchorY` for grounded full-body creatures. Use a stable body anchor instead for flying or non-legged creatures when appropriate.
- Choose atlas columns so the full atlas stays within the tool and runtime size limits. Do not assume the source Sprite AI sheet layout is the runtime layout.

## Atlas tool

Reuse the repository tool instead of writing another packer:

```bash
bun game/core/scripts/frames_to_atlas.js \
  <frames-dir> \
  <output-dir>/atlas/<creature>_<state>_atlas.png \
  <output-dir>/atlas/<creature>_<state>_meta.json \
  --fps <fps> --max-width 4096 --webp-lossless
```

The tool creates WebP atlas variants and uniform-FPS metadata. It does not author uneven `frameDurationsMs`. When approved timing is uneven, use a deterministic recorded metadata step that writes `frameDurationsMs`, treats that array as authoritative, computes cumulative `tStart`/`tEnd`, sets `totalDurationSec` to the duration sum, and validates the array length against `frameCount`. Keep the legacy uniform fields internally consistent by setting `frameDurationSec` to the mean duration and `fps` to its reciprocal; consumers that support uneven timing use `frameDurationsMs`. If the approved record requires lossy WebP, pass an explicit quality rather than `--webp-lossless`. Keep the original PNG frames in the design work folder even when runtime packaging removes its temporary PNG atlas.

The packer does not create the animated `*_preview.webp`. Generate that preview separately with a deterministic local script or media tool using the approved frame durations, and record the exact command or script in `PROCESS.md`.

## Client integration

After approved runtime assets are present, run the existing image/animation generation and validation commands; do not hand-edit generated imports. The canonical scanner is `game/core/scripts/generate_animation_atlases.js`, which reads `*_meta.json` and atlas WebPs under the local animations output root. Some UI consumers derive a faster loop and pause from `totalDurationSec`, so verify the actual target scene rather than assuming metadata timing is displayed unchanged.

Run from the repository root as applicable:

```bash
bun run --cwd game/core check:image-assets
bun run --cwd game/core generate:animations
bun run --cwd game/core generate:images
bun run check:images
```

Use `bun run --cwd game/core build:images` only when the task authorizes the full generated-image refresh. Compare the installed hashes after generation. For an approved atlas that must never be silently replaced by a later generation pass, add or extend the repository's hash-pin protection as part of the authorized integration.

If installed hashes differ from the approved outputs, a required check fails, or in-game playback fails, restore the complete `runtime-before` atlas/meta set, rerun `generate:animations` and `generate:images`, and verify the restored scene before attempting another promotion. Do not leave runtime in a partially promoted state.

Run the repository's image checks required by `AGENTS.md` before considering integration complete. Verify the animation in the real game scene at normal display scale, not only in a large preview.

## Required QA artifacts

Keep these with the design record even when they are not runtime files:

- numbered contact sheet;
- dark-background animated preview;
- light/checker alpha preview;
- motion-reference comparison;
- final atlas and metadata inspection;
- production record with hashes and approval notes.
