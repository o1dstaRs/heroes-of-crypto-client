# Homepage asset handoff

The approved artwork and sprites are stored in the shared Google Drive:
[heroesofcrypto / website / homepage-20260922](https://drive.google.com/drive/folders/1pcP4X2Xv_Rwkiuawb9PE1XcTZd1QZjNv).

The six loose WebP files are the complete runtime set: background, logo, button, sword fire,
axe glow, and plume motion. `manifest.json` includes dimensions, checksums, frame counts and FPS.
`homepage-source-materials.zip` and `source-inventory.json` preserve the design/generation sources,
intermediate variants, references and previous animation versions. Keep those as source materials;
they are not website payloads.

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

   Importing re-encodes the four masters that were authored as lossless WebP, using the `encode`
   recipe recorded per asset in `hero-assets.json`; that needs `cwebp`/`dwebp` on PATH
   (`brew install webp`). It verifies the master's checksum first, so a corrupt or substituted
   download is still rejected before any runtime file is touched. Builds that only verify the
   committed exports — which is every build that does not pass a release directory — need no tools.
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
