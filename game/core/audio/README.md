# Combat sounds

The first library covers every creature in the engine configuration, including summoned and hidden
creatures: one attack and one hurt effect per name. `combat-sound-design.json` holds the
sound direction, short generation prompts, and source duration. `combat-sound-provenance.json`
records the selected sources, ElevenLabs generation IDs when applicable, and measurements of
the actual encoded files.

The retired Death roster (Skeleton, Imp, Zombie, and Dark Champion) has no creature definitions or
combat audio entries. Both report generation and cached-report recovery filter against the current
sound roster, so older local audition data cannot bring those rows back.

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
in sequence. Castable spells from the five schools, plus Craft and the two runes, are empty
rows on that page until a cast sound exists. System effects, artifacts, and auras are omitted.
A spell row's **Next sound** button does not call ElevenLabs. Each click asks this server for
the next unused CC0 result of the Freesound “spell cast” search, then masters that preview to
the same −20 LUFS, −3 dBTP, mono 48 kHz, Opus and MP3 contract. Casts may run to 2.5 seconds.
A clip that fails the check is skipped, and the next result is tried, up to eight per click.
**Apply to game** copies the chosen pair to `public/audio/spells` and leaves creature attack
and hurt files alone. The Freesound key stays outside the page and outside tracked metadata.
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
and explicit selections in the overrides and provenance. No generation credit is used. Their
active events fit the duration limits after outer-silence trimming, so mastering preserves speed
and pitch and adds the normal 3 ms attack / 20 ms release fades before loudness and codec checks.

| Unit / role       | Provided recording                                       |
| ----------------- | -------------------------------------------------------- |
| Nomad attack      | `sword-stab-flesh-joshua-chivers-1-00-01.mp3`            |
| Squire attack     | `metal-weapon-impact-heavy-joshua-chivers-1-1-00-00.mp3` |
| Berserker attack  | `sword-stab-puncture-flesh-joshua-chivers-1-00-01.mp3`   |
| Champion attack   | `bullet-impacting-flesh-gamemaster-audio-5-5-00-00.mp3`  |
| Healer hurt       | `ouch-female-gfx-sounds-2-2-00-00.mp3`                   |
| Champion hurt     | `groan-painful-male-smartsound-fx-1-00-00.mp3`           |
| Zena attack       | `whoosh-blade-throw-joshua-chivers-1-00-01.mp3`          |
| Angel attack      | `sword-swish-smartsound-fx-1-00-01.mp3`                  |
| Blacksmith attack | `sword-impacting-flesh-gamemaster-audio-1-00-00.mp3`     |
| Troll attack      | `bullet-impacting-body-gamemaster-audio-1-1-00-00.mp3`   |
| Dryad hurt        | `groan-pain-female-smartsound-fx-1-00-00.mp3`            |

Each combat strike triggers its own attack cue. The Berserker regression in
`CombatExchangePlayback.test.ts` passes the recorded two-hit plan through the actual sound player
with a controlled clock, verifies two audible attack starts from one decoded buffer, and covers
a missed first blow and a simultaneous counterattack. Ranked playback inherits the same scene path.

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
