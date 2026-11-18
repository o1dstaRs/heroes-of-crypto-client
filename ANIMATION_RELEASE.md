# Local parity release — 2026-11-07 visual update

This release publishes the approved creature animations, combat effects, grayscale turn presentation,
flag/morale pops, shadows and editor defaults for both sandbox and ranked playback. Game art stays
outside Git. Production builds and the deploy readiness check verify all required runtime files
against `game/core/animation-release.json` before copying assets. A stale shared Drive folder fails
with the missing or mismatched filenames instead of silently building old animations.

## Intended combat timing — retain main behavior

The opening attack and its recorded retaliation start in the same presentation frame, including
lethal exchanges. Melee damage is shown at the opening impact; ranged damage is shown at each
projectile's own contact. Never move damage behind completion of the attack clip or serialize the
opening counterattack. A unit's incoming hit animation waits only for its own outgoing animation,
so it cannot cancel an authored shot. Extra blows wait for both opening attacks and their reactions.

These are intentional presentation rules for already-authoritative results, not changes to damage,
retaliation eligibility, ammunition or turn order. Optional status/popup art cannot hold up an attack.
Secondary Petrifying Gaze damage does not create a new hit sequence or cosmetic pause in combat;
the archived preview remains available in the animation lab. Pegasus keeps main's final hit multiplier,
and Wandering Mage keeps main's 720 ms authored melee duration in all three directions.

`combat_exchange.test.ts`, `CombatExchangePlayback.test.ts`, `CombatExchangeAuthoredTiming.test.ts`,
`RankedCombatTiming.test.ts`, the frozen 57-creature `MainCombatTimingParity.test.ts` fixture, and the
Chakram and Fire Shield regressions lock this behavior with controlled
completion gates and clocks. Preserve these assertions during synchronization or conflict resolution.

## Drive image verification — 2026-11-08

All 5,504 pinned runtime files (4,907,751,704 bytes) were verified by size and SHA-256 from the mounted
shared Drive sources and the required members of all eleven resource archives. The archive files were
also checked against their pinned sizes and hashes. No approved artwork was changed.

The restored floor image uses `images/background_stone_tiles_sinister_16x16_original_restored.webp` as
its existing shared source. Its former `background_stone_tiles_sinister_16x16.webp` alias was retired;
the portable restore manifest now points to the surviving filename with the exact same approved hash.
The release-verifier regression also requires every runtime pin to have a matching reproducible source.

## Portrait baseline — main retained

PR #205 retains the portraits from client main `c8284894ac22e0049336a0e05de9ddc1b63a7995`. Roster and draft cards
use main's existing artwork, mirroring, framing, faction backgrounds and shading. Animated sidebar
portraits retain main's original master sheets, playback and 1,084 Q93 pages; the newer frontal card
replacements, revised sidebar contours and Hydra palette are not selected.

The restore manifest copies these exact portrait masters, metadata and pages from the verified shared
Drive paths. It does not overwrite shared masters or apply later repair recipes. Keep the original
`animations/output/sidebar_portraits_paged_v1` folder available. Every reused file is checked by size
and SHA-256 before copying. Non-portrait combat animation and release-tooling changes remain in scope.

## Download and restore

Download every resources ZIP from [local-parity-20261025](https://drive.google.com/drive/folders/1zSPXuiVGXuZW_GQ5KkCmDd68pA1_G7Fy).
The release also reuses exact, unchanged files from the [shared heroesofcrypto folder](https://drive.google.com/drive/folders/1K0HdVnGuX3HJqMX7zPKKy19nrZMrcMo9).
Keep that folder available locally through Google Drive, or download its images and animations/output
folders with their directory structure intact. The old compact archive and source.zip are not required.

**Download all eleven archives. The restore tools verify every archive and shared source revision before a build.**

| Archive                                          | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `resources-01.zip`                               | `d59b0b55f096fd1d8e83569f1d32399833e9f8d806db8aa663331a370e065f11` |
| `resources-02.zip`                               | `e7a5d5b4427698de0693175c6566a6bcee734993b9b402c246f210dc87c892ba` |
| `resources-03.zip`                               | `8a8e6f8d355b58e01e9288b289c875ce687943c46d1ac12b6f106ca56f022a5f` |
| `resources-04.zip`                               | `f2a65b2293f38337cc4039ad79bdddb47c5b5903d0dd93605ea2a869f76b271b` |
| `resources-05.zip`                               | `3c7e436c479acb706bab1ffc5e7eea9f22d65a766eb97ffb65333f34fd48e0b6` |
| `resources-06.zip`                               | `2e1942919d034d57cc2440c05608dcd10e112eeb8e574e8fc81dac19f5a42d7f` |
| `resources-07.zip`                               | `76b379568d29228a5288d4ed79833f25a3fafbd741a512bece998a32ca428e0e` |
| `resources-08.zip`                               | `798e6fbde8c660133ad06968501ceb9f91f8a79b350aa9ee1c4eea8a19b548f7` |
| `resources-09-portrait-mattes.zip`               | `4701c0ceef023d1358df560a6b575024f4cac66a85339f54ee9dff8e50ec483e` |
| `resources-10-troll-contours.zip`                | `776e8d249f1801dc88dc10a263c65b7c405676be4ad00b90aa9e5c89ef5c1ddd` |
| `resources-11-portrait-contours-20261107-v3.zip` | `d6469e957c8ba13f42b0761f9dfd5b175e3b1f3538ef66aa9dbfaf335915e41f` |

Archive 08 retains frontal portrait background alternatives for source history; the release UI uses main's existing faction backgrounds.

Use the client PR checkout and its pinned Bun lockfile (Bun 1.4.4+). The eleven archives
and the verified shared files contain the required runtime assets, settings reference and site exports.
No older compact archive, source ZIP or superseded patch ZIP is required. Follow the restore commands below; the pinned masters reproduce the portrait pages exactly.

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
The 1,084 sidebar portrait pages are copied from main's pinned shared Drive files. The verification
command checks the existing pages against main's catalog; rebuilding a missing page uses main's Q93
recipe and must reproduce its checksum. Later contour-repair pages are not part of the active catalog.
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

## Historical alternative: portrait matte repair — 2026-10-28

The following describes the superseded test portrait package, not the portrait baseline selected above.

Download `resources-09-portrait-mattes.zip` in addition to archives 01–08. It contains
approved sparse pixel corrections and refreshed page metadata. Original portrait masters,
frame order, duration, framing and the local animation editor profile are preserved.
The restore command above applies these corrections while exporting the 1,084 lossless
pages; every page must match the release checksum. No correction runs in the browser.

The repair removes reviewed trapped black background around Dryad’s bow, Centaur’s arms,
Crusader’s plume and Elf’s face; repairs genuine alpha punctures and matte contamination
along contours; and preserves dark materials and deliberate smoke or magic transparency.
All 5,392 played frames are checked against accepted RGBA pixels before lossless export.

## Historical alternative: Troll contour follow-up — 2026-10-29

Archive 10 adds the corrected Troll matte and page metadata. Download archives 01–10
with the current manifest. It clears the trapped black air pocket under the club spike
and keyed fragments around the mane across all 100 original poses. Timing, framing,
opaque inner hair and weapon materials are preserved. The 20 replacement pages are
verified against accepted RGBA pixels and reproduced by the normal restore command.
Archive 09 and the original masters retain the previous correction for selective rollback.

## Original test deployment boundary — 2026-11-07

This visual update retains the test API and its engine/AI revision
`832a54e5b23fd8e1f47f7514ffb906291a6c5f2c`, Premium account state,
and the independently deployed recommendations service. Publish the client and
static site only with the guarded test deployment. See LOCAL_VISUAL_RELEASE.md.
The source snapshot v2 on Drive also contains local experimental gameplay; it is
a reference snapshot and must not replace the live test API.

## Current coordinated engine pin

Client #205 pins published main common `b61c2bfa7faa85e0141eba35a43e639edf5d8bc3`, matching the
authoritative server main package and lockfile. This includes merged common #114, main's confirmed-resistance
events and the current main roster. The user approved deploying the matching test API and client on
2026-11-08; the earlier visual-only API boundary records a historical rollout. Recheck all three pins and
fresh published revisions before upload. Keep the website and independent knowledge service outside this
coordinated test rollout, as described in `LOCAL_VISUAL_RELEASE.md`.

## Champion aura default — 2026-11-08

Champion remains a local `Tie up the Horses Aura` source. The user changed its default range from two
to three cells in both main and #205; its fixed +2 movement still affects walking allies only. Keep
the client gitlink and server package/lockfile on the same common revision above. Main's separate
unit-count/split inputs, Clone/Accept/Split/Delete actions and Start over controls remain in place.
