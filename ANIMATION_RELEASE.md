# Local parity release — 2026-10-27 update

This release publishes the approved creature animations, combat effects, grayscale turn presentation,
flag/morale pops, shadows and editor defaults for both sandbox and ranked playback. Game art stays
outside Git. Production builds and the deploy readiness check verify all 5,504 required runtime files
against `game/core/animation-release.json` before copying assets. A stale shared Drive folder fails
with the missing or mismatched filenames instead of silently building old animations.

## Download and restore

Download every resources ZIP from [local-parity-20261025](https://drive.google.com/drive/folders/1zSPXuiVGXuZW_GQ5KkCmDd68pA1_G7Fy).
The release also reuses exact, unchanged files from the [shared heroesofcrypto folder](https://drive.google.com/drive/folders/1K0HdVnGuX3HJqMX7zPKKy19nrZMrcMo9).
Keep that folder available locally through Google Drive, or download its images and animations/output
folders with their directory structure intact. The old compact archive and source.zip are not required.

**Download all eight archives. The restore tools verify every archive and shared source revision before a build.**

| Archive | SHA-256 |
| --- | --- |
| `resources-01.zip` | `d59b0b55f096fd1d8e83569f1d32399833e9f8d806db8aa663331a370e065f11` |
| `resources-02.zip` | `e7a5d5b4427698de0693175c6566a6bcee734993b9b402c246f210dc87c892ba` |
| `resources-03.zip` | `8a8e6f8d355b58e01e9288b289c875ce687943c46d1ac12b6f106ca56f022a5f` |
| `resources-04.zip` | `f2a65b2293f38337cc4039ad79bdddb47c5b5903d0dd93605ea2a869f76b271b` |
| `resources-05.zip` | `3c7e436c479acb706bab1ffc5e7eea9f22d65a766eb97ffb65333f34fd48e0b6` |
| `resources-06.zip` | `2e1942919d034d57cc2440c05608dcd10e112eeb8e574e8fc81dac19f5a42d7f` |
| `resources-07.zip` | `76b379568d29228a5288d4ed79833f25a3fafbd741a512bece998a32ca428e0e` |
| `resources-08.zip` | `798e6fbde8c660133ad06968501ceb9f91f8a79b350aa9ee1c4eea8a19b548f7` |

Archive 08 adds the two approved frontal portrait backgrounds used by the release UI.

Use the client PR checkout and its pinned Bun lockfile (Bun 1.4.4+). The eight archives
and the verified shared files contain the required runtime assets, settings reference and site exports.
No older compact archive, source ZIP, patch ZIP or separately downloaded portrait-page supplement is
required. Follow the restore commands below; the pinned masters reproduce the portrait pages exactly.

Do not substitute differently hashed source atlases for the approved rendered copies. In particular,
the Nightmare quarter-resolution attacks and Troglodyte walk variants intentionally retain the
approved bytes that the running local sandbox used.

The Ember Covenant icon and ring are included in this release with their approved hashes.

The 2026-10-24 cleanup removes 452 retired runtime images, including superseded UI and environment
exports, old creature thumbnails, and five unused artifact icons. The restore manifest no longer
requires them. Older archives and authoring packages may still contain these files; the image,
animation-copy, and CI import generators exclude the exact filenames recorded in
`game/core/src/build/retiredImageAssets.json`. Source artwork and versioned release packages remain available.

## Build and publish

After the common PR is available, initialize the client's pinned submodule and install dependencies.
Set these paths to the restored assets, then run from the client repository:

```sh
export HOC_IMAGES_LOC="/path/to/release/heroesofcrypto-assets/images"
export HOC_ANIMATIONS_LOC="/path/to/release/heroesofcrypto-assets/animations"
bun install --frozen-lockfile
python3 game/core/scripts/restore_asset_release.py /path/to/downloads /path/to/new-empty-release --drive /path/to/shared/heroesofcrypto
bun game/core/scripts/restore_sidebar_portrait_pages.ts /path/to/new-empty-release/heroesofcrypto-assets
export HOC_IMAGES_LOC="/path/to/new-empty-release/heroesofcrypto-assets/images"
export HOC_ANIMATIONS_LOC="/path/to/new-empty-release/heroesofcrypto-assets/animations"
bun --cwd game/core check:animation-release
bun --cwd game/core build:images
bun run check
bun --cwd game/core build:test
```

The restore script verifies archive sizes and SHA-256 and all reused Drive files before writing. It
refuses a nonempty destination. Each restored file is verified again. Duplicate content is stored once.
The 1,084 sidebar portrait pages are reproduced losslessly from 55 pinned master sheets using the
versioned recipe; every generated page must match its pinned SHA-256 and size. An encoder mismatch
stops restoration. This saves about 2.3 GB of duplicate pixels without changing the displayed artwork.
Authored frame sequences, previews and unused source materials remain in the owner's local backup;
they are not needed to build or run this release.

`game/core/animation-release.json` pins every required canonical runtime file.
`game/core/asset-release-archives.json` maps each restored path to an archive blob, an exact shared Drive
file, or its reproducible portrait page. The restored config directory is a reference copy: never copy
it over an existing developer's canonical editor profile. Site exports are versioned with the client
and included in the compact package. Browsers load bundled URLs; Drive is needed only for handoff.

## Parity and release sequence

Local and published builds use the same approved animation bytes. Production-only lossy animation
encoding is removed; static portrait preparation remains shared. Native portrait geometry, playback,
palette, framing and gameplay range are preserved. Approved safe browser preferences and card/stat
order are embedded for a fresh browser. Explicit existing browser preferences remain respected.
More time uses the rounded gold button from the test server. AI results no longer wait for a ranked
reward record.

Review and merge the coordinated common, server and client PRs, then publish the test environment
through the guarded deployment commands. Fetch and verify the published revisions immediately before
building and uploading. The client submodule and server package/lockfile must pin the same common
commit. This handoff does not authorize a production deployment.

Validation covers sandbox, draft levels 1–4, artifacts, augments, placement, server-driven human and
AI combat, results, site pages and browser logs. Core tests run in bounded batches so isolated Pixi/React
VMs cannot accumulate until the process exhausts workstation memory. Large game images are hashed
and copied to the build output sequentially after bundling, preserving their bytes without retaining
the complete art package in the bundler heap. The final real-art build peaked at about 1.43 GiB.
