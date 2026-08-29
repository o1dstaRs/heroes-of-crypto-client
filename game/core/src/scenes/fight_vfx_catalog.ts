/*
 * -----------------------------------------------------------------------------
 * This file is part of the Heroes of Crypto game client.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import type { GameEvent } from "@heroesofcrypto/common";

/**
 * SINGLE SOURCE OF TRUTH for which fight-stream `GameEvent`s drive combat VFX and, for the ones that do,
 * WHERE the VFX must be wired so it fires in BOTH Sandbox (local play) and ranked (server-authoritative).
 *
 * WHY THIS EXISTS: `RankedPlayScene extends Sandbox`, but the two scenes reach VFX through DIFFERENT paths.
 * So a new animation is easy to wire in the Sandbox path and silently forget in ranked (Water Shield,
 * poison cloud, craft forge, freeze crust all shipped that way). This catalog is a `Record` over the FULL
 * `GameEvent["type"]` union, so adding a new event type FAILS TO COMPILE here until it is classified —
 * forcing the "does this need an animation, and is it wired in BOTH paths?" decision at review time.
 *
 * It is documentation the compiler keeps complete; it does not by itself prove each site calls
 * `combatVisuals`. When you wire a new animation, update its entry AND the routing it names.
 *
 * RANKED VFX PATHS (see the `ranked-vfx-routing` memory for the gotchas):
 *  - "replay":        inherited Sandbox `playReplay*` methods re-animate each opponent action locally
 *                     (attacks, casts, moves, area throws). A `*Vfx` helper here must be called from BOTH
 *                     the live method (e.g. `executeAttackSequence`) AND the replay method.
 *  - "journal":       `renderNewlyApplied{Morale,Armageddon,Poison}` render STANDALONE lap-start events off
 *                     `snapshot.journalTail`, deduped by a per-game high-water sequence. The inline Sandbox
 *                     path is suppressed in ranked (`shouldRender*Inline() -> false`).
 *  - "snapshot-diff": `shatterNewlyDeadUnits` / `processDebuffPops` / `applyRankedFightStats` /
 *                     `hydrateSceneState` reconcile deaths, debuff pops, the finish overlay and terrain
 *                     from the authoritative snapshot.
 *
 * ⚠️  `RankedPlayScene.applyAuthoritativeVfx` is DEAD CODE — `manager.ApplyAuthoritativeVfx` has NO callers.
 *     Do NOT wire new ranked VFX there; use one of the three live paths above.
 */
export type RankedVfxPath = "none" | "replay" | "journal" | "snapshot-diff";

export interface FightEventVfx {
    /** Does this event drive any combat animation/VFX at all? */
    readonly rendered: boolean;
    /** The live ranked path that fires it (or "none" when `rendered` is false). */
    readonly ranked: RankedVfxPath;
    /** One-liner: what the VFX is + the Sandbox trigger / shared helper / ranked method. */
    readonly note: string;
}

export const FIGHT_EVENT_VFX: Record<GameEvent["type"], FightEventVfx> = {
    // ---- combat VFX ----
    unit_attacked: {
        rendered: true,
        ranked: "replay",
        note: "attack lunge + floating damage; showReplayAttackDamage (replay) / executeAttackSequence (live). Ability VFX ride the same event via shared spawn*Vfx helpers called from BOTH paths — incl. spawnFireDamageVfx (Fire Shield reflect / dragon-breath burn / Fireforged Sword), keyed off damage.secondary. Ranked runs NEITHER sandbox path: it renders damage.secondary itself in applyAuthoritativeSecondaryVfx, which colours each number by source (getSecondaryDamageStyle) and draws the Chain Lightning arc from the authoritative bounce entries",
    },
    area_attacked: {
        rendered: true,
        ranked: "replay",
        note: "AOE splash + secondary numbers; playReplayAreaThrowAction->performAreaThrow->showSplashDamage. The boulder impact (flash + shockwave ring + dust + rock chips) rides the SAME splash[] through the shared renderAreaImpactVfx, called from showSplashDamage (both sandbox paths) AND ranked's applyAuthoritativeSplashVfx, which runs neither of them. Centre and reach are derived from the splash entries, so the ring stops where the damage did",
    },
    obstacle_attacked: { rendered: true, ranked: "replay", note: "obstacle hit; playReplayObstacleAttackAction" },
    ability_stolen: {
        rendered: true,
        ranked: "replay",
        note: "theft icon flight; spawnAbilityStealVfx from playReplayAttackRecord/Retaliation (replay) + executeAttackSequence (live)",
    },
    spell_cast: {
        rendered: true,
        ranked: "replay",
        note:
            "craft forge / rune enchant / castling; playReplayCastSpellAction (replay) + " +
            "castAreaSpellAtCell/castSpellOnTarget (live). Heal '+N' + burst ride the SAME event via the " +
            "shared renderHealVfx, called from all three — driven by the authoritative healed[] (the " +
            "replay reads record.events, never its local re-run). Offensive fire spells ride it the same " +
            "way via renderSpellDamageVfx off damaged[]: thrown ones sweep embers caster->victim, called-down " +
            "ones just burst, and Ring of Fire instead lays ONE spawnFireRing on event.targetCell (no " +
            "per-victim sweeps — those read as a volley of fire arrows and hid the ring). A Magic Mirror " +
            "rebound (damaged[].rebounded) takes the mirror treatment instead of the fire: " +
            "spawnMagicMirrorRebound draws the glass pane on the holder (damaged[].reboundedFromUnitId) and " +
            "the shard back into the caster, with a cyan damage number so it never reads as the caster's own hit. " +
            "Wild Regeneration's authoritative abilityTransfers[] drives spawnAbilityTransferVfx in both " +
            "castSpellOnTarget (live sandbox) and playReplayCastSpellAction (ranked/replay): a green ability " +
            "card flies caster->recipient and resolves as GIFTED or COPIED without inferring snapshot diffs. " +
            "Whirlpool's persistent water vortex is status-driven in RenderableUnit: hasStatusEffect reads " +
            "the live Sandbox debuff object or Ranked's authoritative applied_debuffs snapshot",
    },
    unit_moved: { rendered: true, ranked: "replay", note: "move slide; playReplayMoveRecord" },
    unit_summoned: {
        rendered: true,
        ranked: "replay",
        note: "authoritative summon spawn; cast replay + Infest attack replay",
    },
    unit_resurrected: { rendered: true, ranked: "replay", note: "resurrect; playReplayCastSpellAction" },
    unit_destroyed: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "broken-mirror death shatter (freeze-aware); shatterNewlyDeadUnits + spawnDeathVfx",
    },
    unit_deleted: { rendered: true, ranked: "snapshot-diff", note: "death shatter (same as unit_destroyed)" },
    armageddon_applied: {
        rendered: true,
        ranked: "journal",
        note: "wave damage + screen shake; renderNewlyAppliedArmageddon (inline suppressed in ranked)",
    },
    morale_applied: {
        rendered: true,
        ranked: "journal",
        note: "lap-start Morale/Dismorale pop; renderNewlyAppliedMorale (inline suppressed in ranked)",
    },
    effects_applied: {
        rendered: true,
        ranked: "replay",
        note: "scene-log for every application; Dulling Defense VFX is event-driven at attack/response impact, while other buff/debuff pops ride the snapshot diff",
    },
    poison_ticked: {
        rendered: true,
        ranked: "journal",
        note: "green DoT number + poison cloud; renderNewlyAppliedPoison -> renderPoisonTickVfx",
    },
    narrowing_applied: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "board narrowing holes; applyAuthoritativeNarrowing",
    },
    center_dried: {
        rendered: true,
        ranked: "replay",
        note: "center pool dry-swap; replay + hydrateSceneState(centerDried)",
    },
    center_obstacle_cleared: {
        rendered: true,
        ranked: "replay",
        note: "center obstacle cleared; replay + snapshot rebuild",
    },
    fight_finished: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "end-of-fight overlay/casualties; applyRankedFightStats (filtered out of replay)",
    },

    // ---- no combat VFX (turn/board state or scene-log only) ----
    fight_started: { rendered: false, ranked: "none", note: "visible-state refresh only" },
    lap_initialized: { rendered: false, ranked: "none", note: "lap bookkeeping" },
    lap_flipped: { rendered: false, ranked: "none", note: "lap bookkeeping (morale/poison ride separate events)" },
    attack_type_selected: { rendered: false, ranked: "none", note: "turn state + scene-log line" },
    next_unit_selected: { rendered: false, ranked: "none", note: "turn order" },
    turn_completed: { rendered: false, ranked: "none", note: "turn end" },
    unit_defended: { rendered: false, ranked: "none", note: "defend (shield stat only)" },
    unit_waited: { rendered: false, ranked: "none", note: "hourglass state (synced onHourglass flag)" },
    unit_skipped: {
        rendered: false,
        ranked: "none",
        note: "skip; the stop-icon rides the snapshot `skipping` field (setSkipping), not this event",
    },
    unit_placed: { rendered: false, ranked: "none", note: "placement (board rebuild)" },
    unit_split: { rendered: false, ranked: "none", note: "split (board rebuild)" },
    unit_moved_by_system: { rendered: false, ranked: "none", note: "forced move (narrowing/system); no distinct VFX" },

    // ---- Smoke (Wandering Mage's Book of Chaos) ----
    // Rendered by SmokeCloudLayer, which is STATE-driven, not event-driven: it reconciles every frame
    // against FightProperties.smokeClouds. That store rides the ranked snapshot (and is captured by
    // battle_snapshot), so one code path covers sandbox and ranked without either replaying these events —
    // the same treatment narrowing and terrain get, and the reason "snapshot-diff" is the ranked path here.
    // Placing/clearing is therefore never missed by a dropped or reordered event. The events remain the
    // engine's audit trail (and drive the scene log). NOTE: SmokeLayer is movement DUST, a different thing.
    smoke_placed: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "cells gain a drifting fBM cloud; SmokeCloudLayer reconciles from fightProperties.smokeClouds",
    },
    smoke_dispel: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "a creature stepped in — the cloud fades out (never pops) via SmokeCloudLayer",
    },
    smoke_expired: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "cloud ran out of laps; thins on its last lap, then fades via SmokeCloudLayer",
    },
    vine_placed: {
        rendered: true,
        ranked: "snapshot-diff",
        note:
            "cells gain creeping vines; VineLayer reconciles from fightProperties.vines, like smoke. " +
            "A snareResisted save also pops RESISTED over the target — rendered from the authoritative " +
            "record in replay (renderSnareResistVfx), since the local re-apply re-rolls that save",
    },
    vine_expired: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "vines ran out of laps; VineLayer withers them off the cells it no longer sees in the store",
    },
    fire_wall_placed: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "3 cells catch fire; FireWallLayer reconciles from fightProperties.fireWalls, like smoke",
    },
    fire_wall_expired: {
        rendered: true,
        ranked: "snapshot-diff",
        note: "wall ran out of laps; FireWallLayer burns it down off cells it no longer sees in the store",
    },
    // The one fire-wall event that is NOT snapshot-driven: a burn happens once, at a moment, so the floating
    // damage number has to ride the event (the store only says which cells are alight, never who they hurt).
    fire_wall_burned: {
        rendered: true,
        ranked: "replay",
        note: "a creature walked into the flames; pops the damage it took over the crossing",
    },
};
