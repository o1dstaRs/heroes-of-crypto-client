# First joint calibration

Use this procedure for the first end-to-end example of an animation family. Its purpose is to turn the user's visual judgment into an observable, repeatable production record without turning one creature's anatomy into a universal rule.

## Stage 1: establish the sources

Create a work folder named `<creature>_<state>_calibration_v1` under `/Users/pro/Workplace/heroesofcrypto-assets/design` with only the subfolders actually needed during the run. If it exists, use the next version or a timestamp; never reuse it destructively. Keep at least:

- the untouched canonical creature source and its hash;
- the untouched Sprite AI download and its metadata;
- extracted motion frames;
- high-resolution redraw frames;
- previews and comparisons;
- `PROCESS.md` and `production-spec.json`.

If the target animation already exists in runtime, copy its atlas/meta into a `runtime-before` subfolder and record their hashes before any replacement. Also record the existing frame count, timing, direction, and anchor so the user can approve any behavioral change rather than only the new artwork.

Choose the identity source deliberately. Prefer a canonical, unclipped, full-body image with the highest usable detail; do not silently use a cropped icon or portrait merely because its filename resembles the creature name. Record why the selected source is canonical for this run.

Sprite AI is currently evidenced by exports from `https://www.sprite-ai.art/`. A local example is `/Users/pro/Workplace/heroesofcrypto-assets/design/peasant_walk_sprite_ai_source_export_v1`: eight 256x256 RGBA frames at 8 fps plus GIF, sheet, and JSON. Inspect the service during the calibration run because its controls and export shape may change. Visually compare all exported representations; the known sample demonstrates that a GIF can be usable while its PNG atlas contains large opaque geometric artifacts.

## Stage 2: approve motion separately from art

Show the raw loop before high-resolution redrawing. Ask the user to judge motion only:

- action readability and direction;
- contact/support phases and weight;
- speed and pauses;
- equipment or body arcs;
- loop seam;
- phases to remove, duplicate, reorder, or exaggerate.
- how the source creature's anatomy and equipment motion maps to the target creature's different hands, weapons, shields, wings, tails, or body plan.

Record the user's reason for every rejection or correction. A statement such as "frame 4 is wrong" is incomplete; capture the observable reason, such as "the rear foot becomes the foreground foot before contact".

## Stage 3: approve one identity key frame

Redraw one demanding key frame before generating the whole sequence. Prefer a frame with maximum limb separation, foreshortening, cloth motion, or equipment movement. Compare it with the canonical creature source at matched scale.

Ask the user to judge identity and rendering:

- exact face, silhouette, proportions, costume, equipment, and markings;
- acceptable pose adaptation versus unwanted redesign;
- material detail, contrast, palette, and outline treatment;
- acceptable amount of motion exaggeration;
- target working frame size and runtime readability.

Freeze the accepted identity wording, target size, camera, and exclusions in the production record before drawing the remaining frames.

## Stage 4: approve the complete loop

Generate the remaining frames from the approved identity basis. Show:

1. a numbered contact sheet;
2. the animation on a dark background;
3. the animation on a light or checker background;
4. a side-by-side or alternating comparison with the low-resolution motion draft;
5. close-ups of fragile details.

Record corrections by frame and by invariant. Frame-specific repair stays in the production record. A correction becomes a skill rule only when it clearly applies across creatures and animation families. Obtain a separate final approval immediately before replacing an existing runtime animation.

## Production record

`production-spec.json` should capture at least:

```json
{
  "schemaVersion": 1,
  "status": "calibration|approved|runtime",
  "creature": "",
  "state": "",
  "direction": "",
  "sources": {
    "creature": { "path": "", "sha256": "" },
    "motion": { "path": "", "sha256": "", "selectedRepresentation": "" },
    "runtimeBefore": { "paths": [], "sha256": [], "meta": {} }
  },
  "spriteAI": {
    "url": "https://www.sprite-ai.art/",
    "prompt": "",
    "settings": {},
    "frameWidth": 0,
    "frameHeight": 0,
    "frameCount": 0,
    "frameDurationsMs": []
  },
  "redraw": {
    "method": "complete-frame|layered|hybrid",
    "workingFrameSize": [0, 0],
    "identityPrompt": "",
    "lockedTraits": [],
    "allowedDeformations": []
  },
  "normalization": {
    "canvasSize": [0, 0],
    "baselineY": 0,
    "targetCharacterHeight": 0,
    "crop": [],
    "alphaMethod": ""
  },
  "export": {
    "fps": 0,
    "layout": { "cols": 0, "rows": 0 },
    "webp": "lossless|quality"
  },
  "approvals": [],
  "corrections": [],
  "qa": {},
  "outputs": {},
  "runtimeAfter": { "paths": [], "sha256": [] }
}
```

Use empty values only while the calibration is in progress. The approved record must contain real values and paths.

## Existing evidence to reuse carefully

- Raw Sprite AI motion: `peasant_walk_sprite_ai_source_export_v1`.
- Repaired Peasant motion reference: `peasant_walk_sprite_ai_hq_v9_white_forks_repaired`.
- Squire walk motion transfer experiments: `squire_walk_peasant_style_v1`, `v2`, and `v3_layered`.
- Rejected puppet idle and accepted-method replacement: `squire_idle_breathing_v1` and `squire_idle_breathing_v2_redrawn`.

These examples establish useful failure modes, but their candidate/runtime status and creature-specific measurements must not be generalized without verification.

## Sprite AI browser and export observations

Observed on 2026-08-29 during `squire_walk_sprite_ai_calibration_v1`:

- The built-in Walk preset used eight 256x256 frames at 8 fps and charged 14 credits. Treat price as live UI state and verify it before every run rather than encoding 14 as a fixed cost.
- The built-in preset disabled the custom prompt field. Record the preset and framing instead of copying stale disabled prompt text from a previous Custom run.
- The reliable transparent sheet path was `Download` -> `Sprite sheet (PNG)` -> choose layout/padding/scale/transparency -> the second `Download`. A first click only opens the export configuration screen.
- A direct page-asset bundle can expose stale sprite resources that do not match the visible preview. Verify creature identity visually before accepting any downloaded or bundled file; prefer the explicit UI export when there is disagreement.
- A transparent Sprite AI sheet can contain unrelated RGB values under alpha 0. Preserve the untouched export, then make a normalized working copy with RGB zeroed only where alpha is zero to prevent texture-filter color bleed.
- Keep the Sprite AI result as motion evidence only. Complex armor, shields, weapons, cloth, and plumes can remain recognizable while still morphing between frames, so they must be redrawn from canonical art before production use.
