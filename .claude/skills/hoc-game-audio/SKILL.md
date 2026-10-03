---
name: hoc-game-audio
description: Generate, source, master, audition, and integrate Heroes of Crypto sound effects for unit attacks, damage, healing, resurrection, placement, and spellbook UI. Use for new or replacement effects, provided recordings, silence trimming, consistent loudness, compression, or playback fixes. Excludes music, spoken dialogue, and creature artwork.
---

# Heroes of Crypto game audio

Run commands from the repository root. Reuse the existing pipeline described in
[the audio notes](../../../game/core/audio/README.md); do not create a second mastering
script or playback system. Follow the repository's shared-main and local-storage rules.

## Pick the scope

- For playback fixes, keep existing assets and edit the shared combat paths.
- For mastering existing takes, reuse local receipts and downloads; this spends no generation credits.
- For requested new or replacement sounds, generate only the affected unit/role combinations.
  Read [the ElevenLabs workflow](references/elevenlabs.md) before using the connector.
- For licensed library imports, record source and reuse terms. The current collector accepts
  ElevenLabs receipts plus explicit selections in `game/core/audio/combat-sound-overrides.json`.
  A selected local source uses `source_id`, a portable path under `tmp/audio`, and real source
  metadata (author, page URL, license, and file hash); do not fabricate provider generation IDs.
- For provided UI/spell effects, maintain `game/core/audio/game-sound-design.json` and use
  `game/core/scripts/prepare_game_audio.py`. Its optional `--source-dir` imports named local
  recordings; later runs reuse cached originals. It calls the same mastering engine.

Derive unit names from `game/heroes-of-crypto-common/src/configuration/creatures.json`, including
summoned and hidden creatures. Match their exact names in
`game/core/audio/combat-sound-design.json`; each needs `attack` and `hurt` entries.
Treat the current roster count as data, not a fixed requirement.

## Sound direction and mastering

Before writing or revising a creature prompt, inspect its actual full-body art and current
battlefield figure with the image viewer. Resolve keys through
`game/core/src/pixi/creaturePortraitAssetKeys.ts`,
`game/core/src/pixi/battlefieldTextureKeys.ts`, and the existing generated art set in
`game/core/images`; use the configured canonical local art location if an image is missing.
Do not infer the weapon from the name, faction, attack type, or a small face thumbnail.
For creatures without a full-body portrait selector, inspect their canonical complete figure.
Check the attack animation too when its action is ambiguous. Record the inspected asset keys
and concrete attack basis in the creature's `art_reference` entry in the sound design.
The audition dialog displays these references; this metadata means the art was actually viewed.

Describe the visible weapon/material, physical motion, and weight first. An Angel with a long
steel sword needs an audible sword swing; its golden glow can justify a subtle secondary
accent, but "enchanted" or "celestial" must not replace the blade's physical sound.
Translate the art into acoustic instructions rather than feeding its visual description to
the SFX model. Separate a swing from contact: a weapon swing can play on a miss, so do not
put a victim impact or blade clash into it. Prefer reusable weapon foley when generated takes
keep sounding like generic magic. Update the authored design prompt before regenerating;
the UI's default follows that direction, while provenance retains the old source prompt.

Use dry, close, brief fantasy effects with consistent space and texture. Give units distinct
weapon/material, vocal, or magical identities. Ask for one clear event with immediate onset;
avoid music, room ambience, long reverb, or intelligible speech. A damage reaction should be a
brief pain/impact response rather than another full attack or a long death performance.
Preserve the established sound direction unless the user requests a different one.

The current encoded-output contract is:

| Property               | Requirement                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Perceived loudness     | −20 LUFS, within 0.75 LU, using the pipeline's repeated-PCM measurement                                                         |
| True peak              | At most −3 dBTP after encoding and decoding                                                                                     |
| Duration and file size | Combat at most 1.6 seconds; provided effects use their design's budget, currently up to 2.5 seconds. All codecs at most 32 KiB. |
| Quiet edges            | At most 25 ms leading and 65 ms trailing under the pipeline's threshold                                                         |
| Delivery               | Mono 48 kHz; WebM/Opus 64 kbps VBR plus MP3 96 kbps fallback                                                                    |

Peak normalization alone does not equalize perceived volume. Keep a shared loudness target
and peak ceiling rather than forcing every sound to identical peaks and RMS. For very short
effects, analyze eight consecutive repetitions of **decoded PCM** without inserted silence;
export one event. Looping compressed containers can reintroduce encoder padding and bias
measurements. Measure both final codecs, including true-peak overshoot.

The script rejects empty takes, trims only outside the sustained event, preserves internal
pauses, applies edge fades, and selects a take by technical characteristics. That selection
does not prove artistic fit; use the audition report before declaring the timbre approved.

```sh
python3 game/core/scripts/prepare_combat_audio.py --download-only
python3 game/core/scripts/prepare_combat_audio.py --jobs 4
```

Requires Python 3 and FFmpeg on `PATH`. Defaults keep receipts, raw takes, masters,
metrics, and the generated report in ignored `game/core/tmp/audio`; selected runtime assets
go in `game/core/public/audio/combat`. Keep all of these on local storage.
`--only blacksmith,wolf` is a pilot option: it skips provenance and manifest updates.
Finish changes to shipped sounds with a full run so measurements and cache revisions match.

The full run updates `game/core/audio/combat-sound-provenance.json` and
`game/core/src/ui/audio/combatSoundManifest.json`. Cache revisions hash both codecs.
Never put signed download URLs, OAuth links/tokens, raw recordings, or personal absolute paths
in tracked metadata. Preserve a replacement chosen by ear in `combat-sound-overrides.json`;
its selected source replaces automated candidate scoring for that role.

For provided files, run:

```sh
python3 game/core/scripts/prepare_game_audio.py --source-dir "$HOME/Downloads"
```

Keep originals intact. The script stages all masters before publishing, trims quiet edges,
and shortens a long effect with pitch-preserving `atempo` only when its design budget requires
it. It updates `game-sound-provenance.json`, `gameSoundManifest.json`, and encoded event
files under `game/core/public/audio/events`. Re-run without `--source-dir` to use cached inputs.
Open `tmp/audio/game-sound-review.html` on the same local review server to audition them.

## Audition and game integration

```sh
python3 game/core/scripts/serve_audio_review.py --port 5174
```

Open `http://127.0.0.1:5174/tmp/audio/review.html` to compare sources and masters, filter units,
switch codecs, and play a sequence at one volume. Reuse an existing server or choose a free
port if occupied. Listen for unrelated noises, truncated tails, clicks, repeated events,
overly harsh transients, and reactions that do not fit the creature. Keep alternate takes
locally for revisions; distinguish measured quality from listening judgments.

Each combat row's **Regenerate** control supports an editable prompt, four mastered variations,
and **Apply to game**. The local server uses `ELEVENLABS_API_KEY` from its environment; keys
never enter browser JavaScript or tracked metadata. It needs sound-generation permission,
not account-read permission. If generation is unavailable, use the page's clean ElevenLabs
editor link or the connected MCP tools. Never repeat an ambiguous paid request; reconcile
the persisted job under `tmp/audio/revisions` first. The Apply action publishes both codecs,
the explicit source override, provenance, cache revision, and report together. Refresh the game
to use the replacement. Selecting a generated take also persists its edited prompt in the sound
design for future regeneration. Lookup reusable library sounds before spending credits when they fit.

`game/core/src/ui/audio/combatSounds.ts` is the player. Preserve its settings subscription,
Opus-to-MP3 fallback, decoded-buffer cache, battle-roster preload, voice cap and bus compressor,
duplicate-contact suppression, late-download cutoff, and scene cancellation.

Wire attacks to melee strike starts and ranged projectile releases. Wire hurt reactions to
positive damage at actual contact, including counters, secondary/spell damage, and lethal
hits; capture the victim identity before the engine removes a dead unit. Misses have no hurt
reaction. Ranged creatures fighting in melee need the appropriate weapon fallback.
Use the shared `Sandbox.ts` / `sandbox/CombatVisuals.ts` paths and check authoritative replay
in `RankedPlayScene.ts`; avoid adding a second trigger for the same contact.

Provided effects use `game/core/src/ui/audio/gameSounds.ts` on the same effects bus.
Spellbook sounds follow actual state changes, including toolbar, Escape, outside click, and
spell selection; repeated setters stay quiet and late loads must check the current book state.
Placement plays after a valid placement/split rather than during dragging or hydration.
Heal plays for positive restored HP, once per simultaneous group. Both Angel spell resurrection
and passive self-resurrection go through `renderResurrectionVfx` so their sound stays shared
between sandbox and ranked replay. Preserve the scene's liveness guard and mute behavior.

## Verify and hand off

```sh
PYTHONDONTWRITEBYTECODE=1 python3 game/core/scripts/test_prepare_combat_audio.py
PYTHONDONTWRITEBYTECODE=1 python3 game/core/scripts/test_audio_review.py
bun test --cwd game/core src/ui/audio/combatSounds.test.ts src/ui/audio/gameSounds.test.ts src/scenes/CombatExchangePlayback.test.ts src/scenes/GameSoundEvents.test.ts
bun run typecheck
git diff --check
```

For changes to assets or the pipeline, confirm every roster entry has both valid codecs,
encoded measurements meet the contract, and manifest revisions match the shipped bytes.
For playback changes, also check real browser decoding, mute/volume, simultaneous contacts,
and scene teardown. Follow the full repository gate before a requested push or deploy.

Report actual coverage, measured duration/loudness/peak/size, playback wiring, verification,
and an audition link. Say when sounds are technically checked but still need artistic listening.
Maintain this canonical directory and the relative symlink
`.agents/skills/hoc-game-audio -> ../../.claude/skills/hoc-game-audio` together.
