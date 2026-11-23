# Combat sounds

The first library covers every creature in the engine configuration, including summoned and hidden
creatures: one attack and one hurt effect per name, plus an optional movement recording.
The audition page has an empty movement slot for every creature without a selected recording.
`combat-sound-design.json` holds the
sound direction, short generation prompts, and source duration. `combat-sound-provenance.json`
records the selected sources, ElevenLabs generation IDs when applicable, and measurements of
the actual encoded files.

The retired Death roster (Skeleton, Imp, Zombie, and Dark Champion) has no creature definitions or
combat audio entries. Both report generation and cached-report recovery filter against the current
sound roster, so older local audition data cannot bring those rows back.

A creature listed in `creatures.json` without a `CreatureVals` id is not in the game yet and needs no
sounds. The Phoenix is one: its sounds were removed, and its generated attack screech
(`pPa8h8wSR18nr4YNoAM0`) became the Griffin's attack at the owner's request. The design now gives that
prompt to the Griffin, so a full run selects the same take for it.

Inspect the creature's complete portrait and current battlefield figure before authoring a
prompt. Resolve their canonical keys in `src/pixi/creaturePortraitAssetKeys.ts` and
`src/pixi/battlefieldTextureKeys.ts`; record the inspected keys and physical attack basis in
the creature's `art_reference`. The audition dialog shows those images and notes. Its default
prompt follows the current authored design; provenance preserves the prompt used for each
older recording. A visible weapon's physical swing leads the sound, with magical accents
secondary. A swing plays on a miss too, so contact impacts belong to the contact trigger.

Final assets live locally in `game/core/public/audio/combat`: mono 48 kHz WebM/Opus at 64 kbps,
with 96 kbps MP3 fallback. Each file must be at most 32 KiB and 1.6 seconds long. Raw takes,
uncompressed masters, temporary download URLs, and the audition report stay in the ignored
`game/core/tmp/audio` directory. Neither generation nor mastering writes to a synchronized art folder.

## Mastering

`scripts/prepare_combat_audio.py` uses the Python standard library and FFmpeg; no Python packages
are required. It does not call the generation API or spend credits. Its inputs are saved MCP
status receipts named `pilot-run.json` and `batch-*-complete.json`, with `run.generations` and
`run.media`. The generation IDs and prompts match takes to the sound design.

From the repository root:

```sh
python3 game/core/scripts/prepare_combat_audio.py --jobs 4
python3 game/core/scripts/test_prepare_combat_audio.py
```

Use `--only blacksmith,wolf` for a pilot or `--download-only` to save completed takes without
mastering. Generation is a separate ElevenLabs MCP step: create SFX nodes using
`eleven_text_to_sound_v2`, the design's duration, `prompt_influence=0.7`, and `loop=false`.
Run at most ten new nodes at a time with the connector's default variation count. Poll existing
sessions; do not run a successful node again just because another take is still queued.

The mastering pipeline:

1. Decode to mono, remove sub-bass below 70 Hz, and gently roll off above 14 kHz.
2. Reject silent takes. Find the first and last sustained event with a relative RMS threshold,
   keeping a little pre-roll and tail. Preserve silence inside the effect.
3. Select a take by technical characteristics: sustained activity, separated bursts, and crest factor.
   Add 3 ms and 20 ms edge fades to avoid clicks.
4. Match perceived loudness to −20 LUFS. Measure eight consecutive repetitions **only for analysis**,
   because R128's 400 ms block cannot measure the shortest isolated effects reliably. The exported
   sound contains one event. These measurements are for consistent comparison of this library,
   rather than a claim about an isolated sub-400 ms clip's broadcast loudness. A sound the owner chose to
   sit quieter records a negative `level_db` in its selected source and is mastered to −20 LUFS plus that.
5. Apply gain and oversampled peak limiting, then encode both formats. Decode and measure both outputs
   as repeated PCM so MP3 encoder padding cannot bias the measurement;
   compensate for codec overshoot until each is within 0.75 LUFS of target and at most −3 dBTP.
6. Reject output over the duration/size budget or with more than 25 ms leading or 65 ms trailing
   quiet padding. Write metrics, waveforms, provenance, and cache revisions from the final files.

Peak normalization alone cannot match perceived volume. The library shares a loudness target and
peak ceiling; natural crest factors remain different. Forcing every waveform to exactly the same
peak and average would require altering its character. The runtime compressor protects against
several correctly mastered effects summing too loudly during an area attack.

## Audition

```sh
python3 game/core/scripts/serve_audio_review.py --port 5174
```

Open `http://127.0.0.1:5174/tmp/audio/review.html`. Filter by unit or role, switch codec, compare
the selected source with its master, inspect waveforms and trim amounts, or play the visible set
in sequence. Castable spells from the five schools, plus Craft and the two runes, are empty
rows on that page until a cast sound exists. System effects, artifacts, and auras are omitted.
A spell row's **Next sound** button does not call ElevenLabs. Each click asks this server for
the next unused CC0 result of the Freesound “spell cast” search, then masters that preview to
the same −20 LUFS, −3 dBTP, mono 48 kHz, Opus and MP3 contract. Casts may run to 2.5 seconds.
A clip that fails the check is skipped, and the next result is tried, up to eight per click.
**Apply to game** copies the chosen pair to `public/audio/spells` and leaves creature attack
and hurt files alone. It also publishes `spellSoundManifest.json` and the selected source path,
source metadata, and encoded measurements in `spell-sound-provenance.json`. Spell playback
uses that manifest on the shared effects bus, with the caster's usual cue as the fallback
when no spell recording is selected. The Freesound key stays outside the page and outside tracked metadata.
Technical selection does not establish artistic fit: the report keeps all takes
available locally for listening and revision.

Every creature row and dialog has separate **Regenerate · ElevenLabs** and **Regenerate · Suno**
buttons. Clicking one creates a new direction and then generates with that provider. **Review takes**
opens the dialog without generating anything. ElevenLabs produces four takes with an explicit
duration; Suno produces two takes for two generation credits, plus up to one download credit per take.

**Regenerate means the current sound is rejected.** Before either audio provider is called, a vision
model inspects the current full-body portrait, battlefield figure, and configured action atlas. It
combines these with current creature descriptions, ability descriptions, the shared game sound style,
the rejected prompt, the last eight attempts, and optional feedback. It must invent a materially
different acoustic concept that still fits the creature and action. Exact and near-copy prompts are
rejected before audio generation; missing art or a model failure never falls back to the old prompt.
Each batch shows the new prompt, visual observations, why it fits, and what changed. Playing a take
selects its direction to reject on the next regeneration. ElevenLabs uses prompt influence `0.3`.

The sound director uses the existing local Codex login through an isolated, ephemeral, read-only
`codex exec` inference with attached images and tools disabled. This uses model quota in addition to
the selected audio provider's generation credits. Jobs retain portable image keys and hashes, game
context, feedback, and generated direction. Applying a take preserves that provenance and updates the
authored prompt and inspected art references for future work. Credentials remain local to each tool.

Suno's `sounds-create` has no duration parameter: a request for one second can return several
seconds. The Suno prompt requests one brief event, but this is not a duration guarantee. The page
shows each original's reported duration alongside the batch's game limit. New generated takes
must fit the sound design's duration, as well as the overall 1.6-second combat limit. Long Suno
takes are edited locally: prefer a complete prominent event between quiet gaps, otherwise keep
the main attack and end near a quiet dip within the budget. Apply a 3 ms fade-in and a 20–40 ms
fade-out, then run the normal loudness/codec checks. No speed or pitch change is used.
The raw source is preserved. `crop_to_duration`, `duration_limit_ms`, and `duration_edit` record
the policy, source interval, and fades so later mastering reproduces the edit. The page shows the
cut and lets the user audition before applying; waveform analysis alone cannot establish artistic
fit. Unedited sources retain the length rejection. Existing shipped sounds are unchanged.

**Regenerate similar** is reserved for generation conditioned on the actual current audio.
It is disabled while no compatible short-SFX reference model is connected, and the server rejects
that mode before making a paid request. The verified ElevenLabs SFX MCP model and Suno's
`sounds-create` tool accept text only; Suno's song reference/cover tools are not a short-SFX
replacement. Do not implement this button by silently reusing a prompt or applying audio filters.

Suno uses the existing Codex OAuth connection through `codex app-server`. The ephemeral thread
only hosts MCP tools; it does not start a model turn. Configure the `suno` MCP server at
`https://api.suno.com/mcp`, enable it, and run `codex mcp login suno` if it is not already connected.
Suno Sounds requires a signed-in Pro or Premier account and two generation credits. The page displays
generation and download balances separately; a zero download balance does not block generation.
The server rechecks the account before creation. Without download credits or download access, it
creates a listening-only batch and skips download requests. Each completed take immediately gets a
**Listen to take … in Suno** link, even while the other take is generating. These links play the original
Suno audio; local trimming, mastering, and applying to the game require downloading it later.
**Check existing downloads** can recover the same saved takes when downloads become available.
With downloads available, it downloads and runs the same mastering checks as other sources.
It records the authored and actual provider
prompts, clip IDs, and file hashes; OAuth tokens and signed download URLs are never saved in jobs.

An interrupted Suno batch has **Resume this Suno batch**. Known clip IDs resume downloads;
an uncertain creation reuses the same provider idempotency key within 23 hours. It never starts
a second batch automatically. Downloads are first requested without credit approval. If Suno
requires a download credit, the page shows an explicit approval button for that take. An uncertain
confirmed download is not repeated automatically. Explicit insufficient-download-credit refusals
remain recoverable and are distinguished from unknown outcomes. **Check existing downloads** probes
the saved clips without approving a charge or regenerating them. Completed clips link to Suno for
listening while downloads are blocked. Existing mastered takes remain available.

ElevenLabs uses the server's `ELEVENLABS_API_KEY`, which stays in the server environment.
Its API permissions must include sound generation.
The separate account-read permission is not required. A clean ElevenLabs editor link also works
with the connected workspace login. Generation spends credits and is never automatically retried;
request IDs prevent duplicate POSTs from charging twice. Jobs and successful partial results stay
under `tmp/audio/revisions` and survive page reloads.

**Apply to game** publishes the selected pair of files, provenance, cache revision, and report.
Choosing a generated take also saves its prompt as the direction for later regeneration.
It records the source in `combat-sound-overrides.json`, so a future mastering run preserves your
choice. Originals and unused alternatives remain in ignored local storage. Refresh the game after
applying a take. A checked-in override references a local original: restore that original from its
recorded provider generation or library source before remastering on another machine.

Abomination's replacement review includes four normalized alternatives from Ogrebane's
[Monster Sound Effects 2](https://opengameart.org/content/monster-sound-effects-2), listed as CC0
by its author, alongside newly generated grunt variations. Library imports preserve the source
page, author, license, filename, and hash instead of claiming an ElevenLabs generation ID.

Angel's sword alternatives use artisticdude's CC0
[Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack), originally recorded
for Summoning Wars. These brief weapon-swing foley recordings provide a physical alternative
to the rejected abstract enchanted-blade generations. The design is grounded in Angel's
long steel sword as shown in both inspected creature images.

The user-selected Uppbeat recordings below replace only their listed unit/role. Originals stay
under `tmp/audio/raw/provided/<hash>/`, with filenames, embedded artist/title metadata, SHA-256,
and explicit selections in the overrides and provenance. No generation credit is used.
Selections preserve speed and pitch and use the normal 3 ms attack / 20 ms release fades before
loudness and codec checks. Excerpts also record their exact original bounds and the original and
excerpt hashes, so later mastering uses the same selected event.

| Unit / role                                  | Provided recording                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abomination hurt                             | Whole growl, 0.235–1.810 s of `wendigo-monster-fang-growth-gfx-sounds-wendigo-monster-fangs-growing-short-fang-growth-1-0m03s.mp3` (onset to decay, 120 ms fade)                                   |
| Abomination attack                           | `punch-blood-crunch-betacut-1-00-01.mp3`                                                                                                                                                           |
| Valkyrie attack                              | `crowbar-swing-attack-joshua-chivers-1-00-00.mp3`                                                                                                                                                  |
| Tsar Cannon attack                           | `cannon-fired-gamemaster-audio-4-4-00-01.mp3`                                                                                                                                                      |
| Tsar Cannon hurt                             | `temple-lock-mechanism-engaging-gfx-sounds-temple-lock-puzzle-mechanism-2-0m01s.mp3` (quiet tail trimmed)                                                                                          |
| Mantis attack                                | `combat-bloody-hit-epic-stock-media-1-00-00.mp3`                                                                                                                                                   |
| Mermaid attack                               | `whoosh-splash-betacut-1-00-01.mp3`                                                                                                                                                                |
| Mermaid hurt                                 | `splash-small-movement-in-water-mechanical-wave-11-00-02.mp3`                                                                                                                                      |
| Elf attack                                   | `punch-block-hit-gfx-sounds-1-00-00.mp3`                                                                                                                                                           |
| Black Dragon attack                          | Blast and natural fade, 0.041–1.616 s of `swoosh-dragon-breathing-fire-gregor-quendel-1-00-02.mp3`                                                                                                 |
| Wolf attack                                  | Opening snarl, 0–0.610 s of `wolf-attack-growl-gfx-sounds-2-2-00-03.mp3`                                                                                                                           |
| Wolf hurt                                    | `dog-growl-small-aggressive-doug-organ-dog-play-growl-05-1-0m01s.mp3` (silent lead-in and tail trimmed)                                                                                            |
| Wyvern attack                                | `gore-blood-splatter-epic-stock-media-1-00-01.mp3`                                                                                                                                                 |
| Nomad attack                                 | `sword-stab-flesh-joshua-chivers-1-00-01.mp3`                                                                                                                                                      |
| Squire attack                                | `metal-weapon-impact-heavy-joshua-chivers-1-1-00-00.mp3`                                                                                                                                           |
| Berserker attack                             | `sword-stab-puncture-flesh-joshua-chivers-1-00-01.mp3`                                                                                                                                             |
| Champion attack                              | `bullet-impacting-flesh-gamemaster-audio-5-5-00-00.mp3`                                                                                                                                            |
| Healer attack                                | `slap-in-the-face-gamemaster-audio-1-00-00.mp3`                                                                                                                                                    |
| Healer hurt                                  | `ouch-female-gfx-sounds-2-2-00-00.mp3`                                                                                                                                                             |
| Champion hurt                                | `groan-painful-male-smartsound-fx-1-00-00.mp3`                                                                                                                                                     |
| Zena attack                                  | `whoosh-blade-throw-joshua-chivers-1-00-01.mp3`                                                                                                                                                    |
| Angel attack                                 | `sword-impact-swing-joshua-chivers-1-00-00.mp3`                                                                                                                                                    |
| Blacksmith attack                            | `metallic-anvil-impact-jam-fx-metal-anvil-impact-1-0m04s.mp3`                                                                                                                                      |
| Troll attack                                 | `bullet-impacting-body-gamemaster-audio-1-1-00-00.mp3`                                                                                                                                             |
| Dryad hurt                                   | `groan-pain-female-smartsound-fx-1-00-00.mp3`                                                                                                                                                      |
| Arachna Queen attack                         | `spider-monster-angry-screech-epic-stock-media-1-00-01.mp3`                                                                                                                                        |
| Arachna Queen hurt                           | `spider-monster-scream-epic-stock-media-1-00-00.mp3`                                                                                                                                               |
| Arachna Spider hurt                          | `spider-monster-growl-epic-stock-media-1-00-01.mp3`                                                                                                                                                |
| White Tiger attack                           | Last growl, 4.080–5.500 s of `lion-attacking-growl-gfx-sounds-2-2-00-05.mp3`                                                                                                                       |
| Thunderbird attack                           | The scream, 1.640–2.800 s of `hawk-attack-gfx-sounds-1-00-07.mp3` (wind before it left out), 300 ms fade-out                                                                                       |
| Thunderbird hurt                             | `hawk-scream-epic-stock-media-1-00-01.mp3` (silent lead-in and tail trimmed)                                                                                                                       |
| Unicorn hurt                                 | `horse-whinny-cartoon-squeal-epic-stock-media-farmgameanimalhorsecartoonwhinnyneigh1-1-0m01s.mp3`                                                                                                  |
| Hydra attack                                 | Opening 0.050–1.400 s of `snake-hissing-long-smartsound-fx-animal-snake-snake-large-02-1-0m02s.mp3`                                                                                                |
| Nightmare attack                             | `horse-snorting-epic-stock-media-1-00-00.mp3`                                                                                                                                                      |
| Goblin Knight attack                         | `sword-swing-clash-joshua-chivers-1-00-01.mp3`                                                                                                                                                     |
| Peasant hurt                                 | `male-yell-angry-joshua-chivers-1-00-00.mp3`                                                                                                                                                       |
| Champion, Unicorn, Nightmare movement        | 1.350–2.820 s of `horse-galloping-ambient-loop-bosnow-1-00-16.mp3`                                                                                                                                 |
| Arachna Queen, Arachna Spider movement       | 0.850–2.270 s of `insects-skittering-scratching-gfx-sounds-insect-creature-fast-movement-sharp-1-0m02s.mp3`                                                                                        |
| Hyena attack                                 | `beast-bite-joshua-chivers-3-3-00-01.mp3`                                                                                                                                                          |
| Hyena hurt                                   | First grunt and its decay, 0–1.060 s of `monster-roar-guttural-grunting-ra-music-1-00-03.mp3` (before the second grunt)                                                                            |
| Trent attack                                 | `zombie-death-impact-gfx-sounds-1-00-00.mp3`                                                                                                                                                       |
| Trent hurt                                   | `tree-monster-painful-groan-epic-stock-media-1-00-01.mp3`                                                                                                                                          |
| Battle Mage, Healer, Wandering Mage movement | Four footsteps, 0.520–2.050 s of `footsteps-walking-on-parquet-floor-hard-slippers-vadi-sound-2-2-00-02.mp3`, cut one step period apart and kept whole (`keep_edges`) so the loop keeps its rhythm |
| Centaur movement                             | Four steps, 3.160–6.080 s of `footsteps-walking-on-concrete-boots-gfx-sounds-2-2-00-15.mp3`, played 2× faster with pitch preserved, kept whole (`keep_edges`)                                      |
| Magic Dragon movement                        | First wing swoosh, 0–1.200 s of `swoosh-dragon-flight-gregor-quendel-1-00-03.mp3`                                                                                                                  |
| Wolf movement                                | Two leaf-crunch steps, 0.180–1.420 s of `footsteps-walking-on-wet-leaves-vadi-sound-1-00-06.mp3`, kept whole (`keep_edges`)                                                                        |
| Leprechaun movement                          | Three steps, 0.636–2.186 s of `footsteps-walk-on-concrete-floor-vadi-sound-4-4-00-04.mp3`, kept whole (`keep_edges`)                                                                               |
| Mermaid movement                             | `splash-small-rock-thrown-in-water-mechanical-wave-15-00-01.mp3`                                                                                                                                   |
| Mantis movement                              | Continuous chirping, 0–1.300 s of `insectoid-monster-chirping-gfx-sounds-2-2-00-01.mp3`                                                                                                            |
| Monk attack (ranged)                         | Peak and shimmer tail, 0.740–1.800 s of `whoosh-magic-shimmer-roy-s-noise-2-2-00-09.mp3` (melee uses the Battle Mage attack)                                                                       |
| Battle Mage attack (melee)                   | `punch-body-hit-joshua-chivers-2-2-00-00.mp3`                                                                                                                                                      |
| Battle Mage hurt                             | `combat-male-punch-groan-gfx-sounds-1-1-00-00.mp3`                                                                                                                                                 |
| Behemoth attack                              | `anime-punch-cinematic-gfx-sounds-1-1-00-01.mp3`                                                                                                                                                   |
| Behemoth hurt                                | Opening growl, 0–0.775 s of `monkey-growl-gfx-sounds-1-1-00-02.mp3` (before its brighter second phrase)                                                                                            |
| Behemoth idle (turn loop)                    | `monkey-growling-aggressively-felix-blume-1-00-04.mp3`                                                                                                                                             |
| Wolf Rider idle (turn loop)                  | `werewolf-howl-distant-dark-locran-2-2-00-07.mp3` (silent lead-in and tail trimmed), at 60% volume (`level_db` −4.44)                                                                              |
| Black Dragon idle (turn loop)                | `t-rex-breathing-epic-stock-media-1-00-06.mp3`                                                                                                                                                     |

**Turn idle loops.** The optional `idle` role loops for the active creature while its turn waits for a
decision (the player or the AI is still thinking), at half the level of the hits, and stops the moment the
creature starts acting, the turn passes, or the fight ends. Replays stay silent. An idle loop keeps its
whole phrase (up to 8 s and 160 KB per codec, `ROLE_LIMITS` in `scripts/prepare_combat_audio.py`) instead
of the 1.6 s one-shot budget; it shares the loudness target and true-peak ceiling. Creatures without an
idle recording stay silent while thinking.

Angel’s attack uses `sword-impact-swing-joshua-chivers-1-00-00.mp3`, replacing the earlier
SmartSound sword swish. The 0.909-second master preserves its speed and pitch.

Blacksmith’s anvil attack trims 3.48 seconds of trailing silence to a 0.60-second hit.
His hurt sound uses the opening 0–0.950 seconds of
`death-grunt-male-smartsound-fx-soft-3-00-03.mp3`, mastered to a 0.814-second reaction
with the original speed and pitch preserved.
Elf’s hurt sound uses the opening 0–1.600 seconds of
`death-whimper-female-smartsound-fx-short-2-00-04.mp3`, ending at the first quiet gap;
the mastered reaction lasts 1.374 seconds. Both selections preserve speed and pitch.

Abomination’s longer hurt recording is cropped to a 1.55-second event with a 40 ms tail fade.
Black Dragon’s fire breath uses a 1.59-second event with a 20 ms tail fade. Exact crop bounds
are recorded in provenance, and both originals stay intact.

Each combat strike triggers its own attack cue. The Berserker regression in
`CombatExchangePlayback.test.ts` passes the recorded two-hit plan through the actual sound player
with a controlled clock, verifies two audible attack starts from one decoded buffer, and covers
a missed first blow and a simultaneous counterattack. Ranked playback inherits the same scene path.

## Provided game effects

`game-sound-design.json` maps the supplied spellbook open/close, resurrection, unit placement, split,
heal, Blacksmith casting, summoning, miss, Water Shield, Ember Covenant and Last Fuse recordings to event names and duration budgets. Import local files once:

```sh
python3 game/core/scripts/prepare_game_audio.py --source-dir "$HOME/Downloads"
```

Later runs omit `--source-dir` and reuse the originals under `tmp/audio/raw/events`.
The script reuses the combat mastering engine, stages all configured effects before publishing,
and records source filenames and SHA-256 hashes in `game-sound-provenance.json`.
Long healing and resurrection effects are trimmed and gently shortened with pitch-preserving
time stretching to fit a 2.5-second budget; the book and placement effects fit one second.
All use the same −20 LUFS target, −3 dBTP ceiling, codec pair, and 32 KiB per-file limit.
Final files live in `public/audio/events` and revisions in `src/ui/audio/gameSoundManifest.json`.

The main `tmp/audio/review.html` includes shared effects under the **Game effects** filter;
`tmp/audio/game-sound-review.html` also remains available. Originals are playable when cached locally.
Playback uses the same Web Audio effects bus as creature sounds. The spellbook fires only on
an actual open/close transition, including Escape, outside click, and picking a spell. A valid
placement or Clone plays the placement effect. A split plays Gamemaster Audio's
`igniting-gas-fire-large-gamemaster-audio-faster-1-00-00.mp3` (`split`, 0.230 seconds) only once the new
stack is on the board: in the sandbox after the engine accepts it (dragging or the SPLIT button), and
in ranked or co-op after the server accepts it and the board updates, never when the request is sent or
rejected. Positive healing plays once per group;
fully resisted healing stays quiet. Both an Angel's resurrection cast and passive self-resurrection
use the shared resurrection VFX trigger in sandbox and ranked replay.

Blacksmith's Craft cast uses `blacksmith-crafting-metal-epic-stock-media-1-00-03.mp3`, edited at the
user's request: its first two hammer strikes (onsets 71 and 625 ms, 300 ms each) play three times in a
row, then 0.6 s of the closing sizzle fades out (`audio/game-sound-design.json` records the exact recipe;
the composite is rebuilt locally as `blacksmith-craft-two-strikes-x3.wav`). The 2.358-second master keeps
speed and pitch. Armor and Weapon Runes use the Blacksmith's own strike sound, like other casts without
a dedicated spell sound. Both apply to direct AI/Premium actions and authoritative replay. Rejected casts stay
quiet, and ranked submissions wait for replay, so the craft cue plays once instead of the
attack cue. Both use the shared effects bus, mute/volume controls, and scene cancellation.

The Mermaid's Water Shield dissolving (the burst when the shield absorbs a hit and breaks, and the
animation lab's dissolve preview) plays betacut's `object-hits-water-betacut-1-00-02.mp3` once, as the
`water_shield_dissolve` game sound (1.240 seconds; speed and pitch kept). Its watery tail is shortened:
the recording stops at 1.4 seconds with a 400 ms fade (`end_cut` in `audio/game-sound-design.json`).
Dying with the shield up is not a dissolve and stays quiet.

The Hydra's Ember Covenant breaking (its army's rings dissolving, from an absorbed hit or the
blessing running out) plays the first part of Gregor Quendel's
`swoosh-flame-sizzle-gregor-quendel-1-00-02.mp3` once for the whole army, as the
`ember_covenant_dissolve` game sound: the swoosh and its sizzle, cut at 1.95 seconds with a 400 ms
fade before the recording's second burst (1.800 seconds; speed and pitch kept). It is triggered by
`EmberCovenantRings` in sandbox and ranked alike. A carrier dying or leaving the board with its ring
up stays quiet.

Each Last Fuse explosion plays GFX Sounds' `muddy-explosion-gfx-sounds-wet-mud-explosion-4-4-0m06s.mp3`
as the `last_fuse_explosion` game sound: the blast from its onset and its wet splatter, cut at 2.3 seconds
of the recording with a 500 ms fade (1.724 seconds; speed and pitch kept). `LastFuseVfx` triggers it when a
blast actually starts, so chained explosions are heard one after another at their 0.18-second delays,
simultaneous ones once, and the hits on neighbouring stacks add no sound of their own.

All positive `unit_summoned` events use
`magic-whoosh-ethereal-harp-swirl-bosnow-harp-magic-whoosh-1-0m03s.mp3`, trimmed to 2.092 seconds.
The cue plays once per simultaneous group, including Summon Wolves, merged summons, and Infest
hatchlings. It follows the shared event presentation in sandbox and ranked replay. Rejected casts
and zero-amount events stay quiet; the original speed and pitch are preserved.

Fireball casts use
`magic-fire-spell-fiery-impactful-epic-stock-media-questgamemagicfirespellflamecasthit3-1-0m03s.mp3`
(2.430 seconds). Fire Strike casts (Battle Mage is its only caster) separately use GFX Sounds'
`fire-torch-whoosh-movement-gfx-sounds-1-00-01.mp3` (0.694 seconds after trimming its quiet tail).
Meteor Shower casts use Gamemaster Audio's `lightning-strike-with-sparks-gamemaster-audio-4-4-00-02.mp3`
(2.074 seconds after trimming its quiet tail); Meteorite, Battle Mage's version, has no sound of its own.
All three trim quiet edges without speed or pitch changes, use the 2.5-second spell budget,
and play once for an accepted cast in manual, AI/Premium, and authoritative replay paths.
Listen to these in their spell rows on `tmp/audio/review.html`, alongside the shared summon effect.

Confirmed missed strikes use `swish-bullet-flyby-faster-gamemaster-audio-4-4-00-00.mp3`,
trimmed to 0.314 seconds with speed and pitch preserved. The normal attack cue still plays at
the swing/release; the swish plays at missed contact and no hurt cue is emitted. Each actual
blow has its own identity, including simultaneous counters, double attacks, and ranged impacts.
The shared engine records ordinary counter misses in `IVisibleDamage.missedResponse`, since
zero HP loss alone cannot distinguish a miss from an absorbed hit. Publish that common change
with the client and server pins when deploying; older recordings can only sound misses they recorded.

## Playback

`src/ui/audio/combatSounds.ts` preloads the current battle's roster, decodes/caches audio buffers,
falls back from Opus to MP3, and follows the existing effects level and mute setting. It drops
downloads arriving more than 150 ms after a contact, suppresses duplicate reports within 60 ms
per unit/role, caps simultaneous combat voices at six, and cancels pending/active sounds when
the battle scene ends. Music remains on its existing separate channel.

Melee attacks play when the strike starts; authored ranged attacks play at projectile release.
Damage reactions play at actual contact, including counterattacks and lethal hits. Secondary
damage, spell damage, poison, fire-wall burns, and Armageddon use the same unit identity as their
damage numbers. A missed attack has no hurt reaction. Casters play their unit's effect when a
successful cast starts. Bow/cannon creatures use an appropriate existing weapon sound when
fighting in melee.

Movement playback belongs to `MoveAnimationManager`: a single movement loop follows the whole route,
including corners, and stops on arrival, cancellation, forced completion, or scene teardown.
It fades in over 20 ms and out over 30 ms at 65% of the combat cue gain. Mute stops active loops;
a decoded recording cannot start after the move has ended. Swaps and carried units do not trigger
movement sounds. Champion, Unicorn, Nightmare, Arachna Queen, and Arachna Spider currently have
movement recordings; the remaining slots stay silent, and movement generation is disabled in the
review page. Selected movement
overrides survive full mastering runs alongside attack and hurt cues.
