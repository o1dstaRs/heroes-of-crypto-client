# Test-server visual checkpoint, 9 September 2026

This checkpoint records the changes requested for the creature sidebar and Peasant animation. It does not include unrelated in-progress editor, gameplay, or other creature changes from the shared working directory.

## Recorded behavior

- Selecting a creature with `NO_FACTION` loads its left-hand statistics card. An empty selection stays lazy.
- Peasant has a separate animated sidebar portrait: 34 frames, 572 by 808 pixels, 9.936 FPS, ping-pong timing, fitted to the existing sidebar height.
- Both teams use the same approved 12-frame battlefield Peasant idle. Its moving frames play at 6 × 1.15 FPS before the existing 0.77 rendering-speed factor. The fully upright sixth atlas cell (zero-based index 5) receives an additional 700 ms. The bent first cell has no added hold. Walking and one-shot actions retain sprite ownership.
- Champion's left-hand card uses `champion_left_screen_x2.webp`, independent contain framing, neutral scale/offsets, and the existing 0.96 horizontal art scale.
- The production image policy retains the approved Peasant battlefield atlas, while the sidebar atlas remains a React-owned lazy image.

## Recover the exact artwork

The three required WebP files are versioned under `site/public/assets/game-checkpoints/2026-09-09`, alongside a SHA-256 manifest. Canonical authoring originals stay in the local asset workspace. The checkpoint follows the repository's rule that tracked game artwork belongs under `site/public`.

Verify the archive from the repository root:

```sh
bun game/core/scripts/restore_test_visual_checkpoint.ts
```

A full build still requires the game's usual local asset collection, configured through `HOC_IMAGES_LOC` and `HOC_ANIMATIONS_LOC`. After preparing those runtime images, restore the checkpoint copies and regenerate the image manifest:

```sh
bun game/core/scripts/restore_test_visual_checkpoint.ts --restore-runtime
bun game/core/scripts/generate_image_imports.js
```

Then build the test client using the normal test environment. Do not rerun the image-copy stage after restoring the checkpoint, since that would replace its exact files with whichever authoring copies happen to be installed.

```sh
cd game/core
bunx tsc --noEmit
bun scripts/vite_build.js test
```

The animation geometry and timing are tracked TypeScript; they do not rely on browser storage or server-only code edits. The original test hotfixes used import-map overlays. These source changes make the same requested behavior available to a regular build. Other independent test-server overlays require their own source reconciliation; this is not a byte-for-byte archive of the entire test deployment.

## Regression coverage

`DeferredUnitStatsListItem.test.tsx` checks empty, creature and faction selection. `leftSidebarPortraitAnimation.test.ts` checks the separate portrait contract. `peasantIdleAnimation.test.ts` checks speed, pose and hold boundaries, loop wrap, negative timestamps and phase offsets. The RenderableUnit integration test checks both teams and action ownership. Texture-bundle and production-policy tests check that the required assets survive the production filter.

## Verification of this source checkpoint

Client lint, asset policy and CI-stub type checking passed. The complete core suite passed 1390 tests; the added Champion resolver test passed separately. The focused visual/loader suites passed 147 tests. MCP passed 19 tests and site passed 98. Common's pinned revision passed 3502 tests on the first broad run; the three failures (sandbox process visibility and two parallel-load timeouts) passed on a sequential unrestricted rerun of their two suites (24 tests).

The installed Bun 1.3.14 does not support the repository wrapper's `--timings` argument. Common tests were therefore invoked directly with the equivalent file coverage. No common-source changes or submodule pin updates were made.

A test-mode Vite build with real local artwork succeeded, and the three emitted image hashes match the versioned checkpoint. Browser verification confirmed the lazy card and separate Peasant portrait (235.734375 by 333 CSS pixels). The regular local animation-copy step detects an unrelated pre-existing Thief atlas revision mismatch; it was not bypassed or modified. Type checking against the full local authoring manifest also reports an unrelated missing fire-pit half-atlas key; CI's committed catalog/type contract passes. These local authoring-collection issues are outside this checkpoint.
