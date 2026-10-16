# Combat sounds

The first library covers every creature in the engine configuration, including summoned and hidden
creatures: one attack and one hurt effect per name. `combat-sound-design.json` holds the
sound direction, short generation prompts, and source duration. `combat-sound-provenance.json`
records the selected sources, ElevenLabs generation IDs when applicable, and measurements of
the actual encoded files.

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
   rather than a claim about an isolated sub-400 ms clip's broadcast loudness.
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
in sequence. Technical selection does not establish artistic fit: the report keeps all takes
available locally for listening and revision.

Every creature row has **Regenerate**. It opens an editable sound description, a library search,
and available mastered alternatives. **Generate 4 takes** uses the server's `ELEVENLABS_API_KEY`;
the key stays in the server environment. Its API permissions must include sound generation.
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

## Provided game effects

`game-sound-design.json` maps the supplied spellbook open/close, resurrection, unit placement,
and heal recordings to event names and duration budgets. Import local files once:

```sh
python3 game/core/scripts/prepare_game_audio.py --source-dir "$HOME/Downloads"
```

Later runs omit `--source-dir` and reuse the originals under `tmp/audio/raw/events`.
The script reuses the combat mastering engine, stages all five effects before publishing,
and records source filenames and SHA-256 hashes in `game-sound-provenance.json`.
Long healing and resurrection effects are trimmed and gently shortened with pitch-preserving
time stretching to fit a 2.5-second budget; the book and placement effects fit one second.
All use the same −20 LUFS target, −3 dBTP ceiling, codec pair, and 32 KiB per-file limit.
Final files live in `public/audio/events` and revisions in `src/ui/audio/gameSoundManifest.json`.

Audition originals and masters at `http://127.0.0.1:5174/tmp/audio/game-sound-review.html`.
Playback uses the same Web Audio effects bus as creature sounds. The spellbook fires only on
an actual open/close transition, including Escape, outside click, and picking a spell. Valid
placement and split gestures play the placement effect. Positive healing plays once per group;
fully resisted healing stays quiet. Both an Angel's resurrection cast and passive self-resurrection
use the shared resurrection VFX trigger in sandbox and ranked replay.

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
