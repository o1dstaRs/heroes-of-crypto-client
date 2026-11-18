# Current site release — 2026-10-25

The current local site exports, asset manifests, selected feature compositions, and local site design
references are included in the compact `resources-*.zip` package in the [local parity release](https://drive.google.com/drive/folders/1zSPXuiVGXuZW_GQ5KkCmDd68pA1_G7Fy).
See [the complete restore and verification instructions](../ANIMATION_RELEASE.md). The compact release is being verified; verify every archive before deployment.
The versioned `site/public` exports build without access to any developer's machine or Google session.
The sections below document earlier releases and are retained as history.

## Knowledge Base art

`bun run --cwd site sync:art` exports the canonical `HOC_IMAGES_LOC` artwork and the game's current
portrait settings. Generate the full development image manifest first with
`bun run --cwd game/core generate:images`. The portrait export includes mirroring, faction shades,
Chaos background contrast and Hydra's selective green scale palette. It validates every source before
changing existing exports; it never writes to the canonical art directory.

Flat catalog icons receive a content-derived `?v=` URL from `catalog-icon-versions.json`; portraits and
their backgrounds have content-hashed filenames. Updating artwork therefore invalidates browser caches
without waiting for the website's one-day image cache to expire. Run `bun run --cwd site check:art`
after syncing. CI checks exported hashes, icon selections and portrait settings without private Drive
access; a configured art checkout additionally verifies byte parity with the masters.

## Responsive delivery

Astro generates responsive WebP derivatives of the selected tavern during the build. The approved
files in `public` and their manifest checksums remain unchanged;
generated `_astro` files are delivery exports and must never replace the Drive masters.

The hero uses quality 94. The shared button plate uses a 960px, quality-96 export. Matching image
preloads and `srcset` attributes let the browser download the appropriate size without first fetching
the full-size hero. Viewports up to 400px receive a square hero crop with a CSS offset that preserves
the original mobile framing at 58%. Retain both the crop and its offset when changing that layout.
Feature illustrations and game-mode artwork retain their exact original bytes; deferred media
loads them as their sections approach the viewport after the hero has painted.

The original images remain the fallback for older browsers and the largest display sizes. Artwork
verification still checks every release manifest byte-for-byte; responsive exports are reproducible
build outputs rather than independently edited artwork.

# Homepage asset handoff

The approved artwork and sprites are stored in the shared Google Drive:
[heroesofcrypto / website / homepage-20260922](https://drive.google.com/drive/folders/1pcP4X2Xv_Rwkiuawb9PE1XcTZd1QZjNv).

The six loose WebP files are the complete runtime set: background, logo, button, sword fire,
axe glow, and plume motion. `manifest.json` includes dimensions, checksums, frame counts and FPS.
`homepage-source-materials.zip` and `source-inventory.json` preserve the design/generation sources,
intermediate variants, references and previous animation versions. Keep those as source materials;
they are not website payloads.

## Current local preview (2026-09-25)

`hero-assets.json` now pins `homepage-20260925`, with a refined crusader visor,
closed rounded berserker boots and sharper red eyes. All three animation atlases
retain their original coordinates. The release ZIP includes all six WebP exports,
the manifest and source artwork. Its Google Drive upload is **pending**; the older
20260922 Drive folder does not contain this updated background. Before deploying
this revision, upload and verify `homepage-20260925.zip` in the shared website
folder, then import that downloaded release with `sync:hero`. The steps below
record the previous published release and must not be used as the source of the
new background.

## Administrator workflow

1. Update a clean client checkout to the merged PR, initialize its pinned common submodule,
   and install dependencies.
2. Download the six WebP files from the Drive folder (or synchronize the folder with your existing
   authorized Drive setup). Keep their original filenames together in one release directory.
   Downloading the folder as a ZIP and extracting it is also supported.
3. Import and verify them from the client repository:

    ```sh
    bun run --cwd site sync:hero -- /path/to/downloaded/homepage-20260922
    bun run --cwd site build
    ```

    Alternatively, set `HOC_SITE_ASSETS_DIR` to that downloaded/synchronized directory. Both `build`
    and `build:test` then import and verify it before building. The importer validates every input
    before updating runtime files and rejects missing or modified assets.

4. From the server repository, deploy only the site using the existing deployment tool:

    ```sh
    bun run deploy --yes --site-only --client-dir /path/to/heroes-of-crypto-client
    ```

    The tool builds the site, snapshots the deployed release, uploads the output and verifies it,
    with rollback on failure. No backend restart or engine pin change is required for these assets.

5. Verify English/Russian homepages, complete Crusader/Berserker legs, sword fire, axe/plume motion,
   the Play button and language controls. Reduced-motion mode should show the static artwork.

The repository includes exact, checksum-verified exports of the Drive release so CI and repeat
builds do not require a person's Google login. Without `HOC_SITE_ASSETS_DIR`, the build validates
those exports; it never guesses a local source directory. The deployed `dist` contains all runtime
assets, served by the website itself. It has no dependency on any developer's computer. Drive
sharing permissions remain unchanged; do not make sources public solely to serve browser images.

## Feature card editor and artwork (2026-09-24)

Open `/dev/feature-cards` on the local Astro dev server. The editor provides four
faction slots, all 57 roster portraits, dragging, keyboard movement, scale and
horizontal reflection. `Save on homepage` writes `src/data/feature-art.json`.
The six magic previews include the original and five alternatives; selecting an
alternative requires saving. The editor route and write API are development-only.

The release `feature-cards-20260924.zip` is prepared for the shared `website`
Drive folder. It contains 68 runtime WebP assets, generation PNG sources, prompts,
roster and composition JSON, a README, and SHA-256 manifest. `feature-assets.json`
records the deployment export hashes and destinations. Take production artwork
from the shared Drive release; serve the bundled `/assets/` exports. Production
must never access a developer's local paths or the dev editor API.

The battle card is an AI-edited 2v2 illustration based on a gameplay screenshot.
The five magic alternatives remain unselected until the owner chooses one.

2026-09-25: The current battle card uses the owner’s gameplay screenshot with CSS framing, without side panels. Magic variant 6 is the meteor-shower illustration, now selected. The local handoff archive and feature-assets.json include both new WebP exports and source materials; Google Drive upload remains pending.

## Site font delivery

The site loads `public/assets/fonts/hoc-forge/HoCForge-Regular.woff2`, a lossless compressed export
of the adjacent TTF source. Keep all glyphs (including Cyrillic), hinting, and spacing intact.
After changing the source, regenerate with FontTools and Brotli installed:

```sh
python - <<'PY'
from pathlib import Path
from fontTools.ttLib import TTFont

source = Path("site/public/assets/fonts/hoc-forge/HoCForge-Regular.ttf")
font = TTFont(source, recalcTimestamp=False)
font.flavor = "woff2"
font.save(source.with_suffix(".woff2"))
PY
```

The font preload in `BaseLayout.astro` must use the same URL and format as `global.css`.
