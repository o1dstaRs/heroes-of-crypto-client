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
        note: "attack lunge + floating damage; showReplayAttackDamage (replay) / executeAttackSequence (live)",
    },
    area_attacked: {
        rendered: true,
        ranked: "replay",
        note: "AOE splash + secondary numbers; playReplayAreaThrowAction->performAreaThrow->showSplashDamage",
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
            "replay reads record.events, never its local re-run)",
    },
    unit_moved: { rendered: true, ranked: "replay", note: "move slide; playReplayMoveRecord" },
    unit_summoned: { rendered: true, ranked: "replay", note: "summon; playReplayCastSpellAction" },
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

    // ---- Smoke (Ash Moth's Book of Chaos) — NOT YET RENDERED ----
    // Classified honestly rather than wired, so this catalog keeps telling the truth. These three are a
    // KNOWN GAP, not a decision that smoke is invisible by design: a cloud halves ranged damage through the
    // cell it sits on, so a player who cannot see it cannot play around it. The state is authoritative and
    // already available on both paths — FightProperties.smokeClouds rides the snapshot (and is captured by
    // battle_snapshot), so a board layer can be driven from it rather than from these events, the same way
    // narrowing/terrain are. NOTE: the existing SmokeLayer is movement DUST, unrelated to this spell.
    smoke_placed: { rendered: false, ranked: "none", note: "TODO board layer: cells gain a cloud for N laps" },
    smoke_dispel: { rendered: false, ranked: "none", note: "TODO board layer: a creature stepped in, cloud clears" },
    smoke_expired: { rendered: false, ranked: "none", note: "TODO board layer: cloud ran out of laps" },
};
