# Animation and effect release — 2026-10-17

This release publishes the approved creature animations, combat effects, grayscale turn presentation,
flag/morale pops, shadows and editor defaults for both sandbox and ranked playback. Game art stays
outside Git. Production builds and the deploy readiness check verify all 4,524 required runtime files
against `game/core/animation-release.json` before copying assets. A stale shared Drive folder fails
with the missing or mismatched filenames instead of silently building old animations.

## Obtain the assets

Download from the [versioned release folder](https://drive.google.com/drive/folders/17XBPKZw4cglCNnYl3FaKXBGSdKnJNVDv):

| Archive                                | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `assets-compact.zip`                   | `cb3a565c781e1540161d5bb2850addf23f6a46b41d72ae52c791c1c8d1a66130` |
| `restore-tools.zip`                    | `4b248d7b2fdee2a733cb734f72c704b48499d64a4c81f22a2aed829ce5883c76` |
| `animation-release-patch-20261017.zip` | `f3e5562aa279717b63426ab41369334ae9eedd89d502d91fbc5bb698d270b2b5` |

Extract the compact archive into an empty local release directory, then extract `restore-tools.zip`
there, replacing the older scripts. Download the base files listed in `drive-required-files.json`
from the [existing shared art folder](https://drive.google.com/drive/folders/1K0HdVnGuX3HJqMX7zPKKy19nrZMrcMo9).
Run from the extracted release directory:

```sh
python3 restore_compact.py --drive "/path/to/downloaded/heroesofcrypto"
```

Then extract `animation-release-patch-20261017.zip` into that same directory. It supplies the Griffin
question-bow aura and Cyclops boulder that were previously carried in `source.zip`. For these PRs,
use Git for source code; downloading the old `source.zip` is unnecessary. The asset manifest in this
PR is the final verification authority. The portable kit's `verify_compact.py` also checks source
files, so it is intended for installations that extracted `source.zip` as well.

Do not substitute differently hashed source atlases for the approved rendered copies. In particular,
the Nightmare quarter-resolution attacks and Troglodyte walk variants intentionally retain the
approved bytes that the running local sandbox used.

## Build and publish

After the common PR is available, initialize the client's pinned submodule and install dependencies.
Set these paths to the restored assets, then run from the client repository:

```sh
export HOC_IMAGES_LOC="/path/to/release/heroesofcrypto-assets/images"
export HOC_ANIMATIONS_LOC="/path/to/release/heroesofcrypto-assets/animations"
bun install --frozen-lockfile
bun --cwd game/core check:animation-release
bun --cwd game/core build:images
bun run check
```

Use the existing deployment workflow after review. The Vite production build emits content-hashed
asset URLs, so publishing the new build gives browsers the new art. Merge the common PR first;
client and server pin the same published common SHA. Rebuild/restart the authoritative server and
publish the client together through the normal release process. Opening these PRs does not deploy.

## Settings and smoke checks

Approved animation values are versioned in `src/settings/approvedAnimationProfile.json`; safe browser
defaults are in `approvedBrowserPreferences.json` (paths relative to `game/core`). A fresh browser gets
these values without the author's profile, cookies, account, database or local files. Existing user
preferences are preserved. An explicitly configured local editor profile remains a local override.

Check Black Dragon fire, Mantis victim lightning, Crusader six-sword aura, Monk copied-buff and
counter-shot effects, grayscale turn figures, flag/morale pops, and a ranked replay. Build from the
verified resources, not CI image stubs. CI stubs test code contracts and do not contain real art.
