import {
    allFactions,
    AttackVals,
    Spell,
    getFactionOf,
    GridMath,
    HoCConfig,
    TeamVals,
    ToFactionName,
    type AttackType,
    type CreatureId,
    type GameAction,
    type GameEvent,
    type GridType,
    type HoCMath,
    type IVisibleDamage,
    type TeamType,
    type Unit,
    type UnitProperties,
} from "@heroesofcrypto/common";

import type {
    AuthoritativeGameSnapshot,
    AuthoritativeJournalEntry,
    AuthoritativeUnitState,
    SceneGameActionTransport,
} from "../game_action_transport";
import type { IFightDeathEntry, IFightStatsReport, IFightStatsSample } from "./VisibleState";
import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState, type SceneActionEngine } from "./Sandbox";
import { animatableEffectNames, diffUnitEffects } from "./effect_pops";
import type { RenderableUnit } from "./RenderableUnit";
import type { UnitsOverlay } from "./UnitsOverlay";
import type { AuthoritativeSnapshotOptions } from "../pixi/PixiScene";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";

export const authoritativeUnitToSandboxUnitState = (
    unitState: AuthoritativeUnitState,
): SandboxSceneUnitState | undefined => {
    const properties = getUnitPropertiesFromAuthoritativeState(unitState);
    if (!properties) {
        return undefined;
    }

    return {
        properties,
        team: unitState.team as TeamType,
        placed: unitState.placed,
        dead: unitState.dead,
        cells: unitState.cells,
        baseCell: unitState.baseCell,
        attackType: unitState.attackType as AttackType,
        onHourglass: unitState.onHourglass,
    };
};

// Fight actions that consume the unit's turn (the engine runs completeTurn for each). A bare
// move_unit is intentionally absent: it leaves the unit active so it can still attack afterwards.
const TURN_ENDING_ACTION_TYPES: ReadonlySet<GameAction["type"]> = new Set<GameAction["type"]>([
    "melee_attack",
    "range_attack",
    "obstacle_attack",
    "area_throw_attack",
    "cast_spell",
    "end_turn",
]);

const isKnownPlacementOpponentUnit = (unitState: AuthoritativeUnitState): boolean =>
    unitState.creatureId > 0 && unitState.name !== "Unknown";

const shouldHidePreFightOpponentUnit = (
    snapshot: AuthoritativeGameSnapshot,
    unitState: AuthoritativeUnitState,
    options: { hideOpponentPlacements?: boolean },
): boolean =>
    !!options.hideOpponentPlacements &&
    !snapshot.fightStarted &&
    !snapshot.fightFinished &&
    snapshot.viewerTeam !== undefined &&
    unitState.team !== snapshot.viewerTeam &&
    !isKnownPlacementOpponentUnit(unitState);

export const authoritativeSnapshotToSandboxSceneState = (
    snapshot: AuthoritativeGameSnapshot,
    options: { hideOpponentPlacements?: boolean } = {},
): SandboxSceneState => ({
    gridType: snapshot.gridType as GridType,
    currentLap: snapshot.currentLap,
    fightStarted: snapshot.fightStarted,
    fightFinished: snapshot.fightFinished,
    currentUnitId: snapshot.currentUnitId || undefined,
    narrowingLayers: snapshot.narrowingLayers,
    centerDried: snapshot.centerDried,
    units: snapshot.units.flatMap((unit) => {
        if (shouldHidePreFightOpponentUnit(snapshot, unit, options)) {
            return [];
        }
        const restored = authoritativeUnitToSandboxUnitState(unit);
        if (
            restored &&
            options.hideOpponentPlacements &&
            !snapshot.fightStarted &&
            !snapshot.fightFinished &&
            snapshot.viewerTeam !== undefined &&
            unit.team !== snapshot.viewerTeam
        ) {
            return [
                {
                    ...restored,
                    placed: false,
                    cells: [],
                    baseCell: { x: 0, y: 0 },
                },
            ];
        }
        return restored ? [restored] : [];
    }),
});

const getUnitPropertiesFromAuthoritativeState = (unitState: AuthoritativeUnitState): UnitProperties | undefined => {
    const unitName = UNIT_ID_TO_NAME[unitState.creatureId] ?? unitState.name;
    const team = unitState.team as TeamType;
    const candidateFactions =
        unitState.creatureId > 0 ? [getFactionOf(unitState.creatureId as CreatureId)] : allFactions;

    for (const faction of candidateFactions) {
        try {
            const baseProperties = HoCConfig.getCreatureConfig(
                team,
                ToFactionName[faction],
                unitName,
                // Real texture name (e.g. "white_tiger_512") so getCreatureConfig derives a valid
                // small_texture_name ("white_tiger_128"). Passing "" yielded "_128", which resolves to no
                // image — hence the blank/placeholder unit avatars on the ranked fight-results overlay.
                unitToTextureName(unitName, TextureType.LARGE),
                Math.max(0, Math.floor(unitState.amountAlive)),
            );
            const hp = unitState.hp > 0 ? unitState.hp : unitState.dead ? 0 : baseProperties.hp;
            return {
                ...baseProperties,
                id: unitState.id,
                team,
                hp,
                max_hp: unitState.maxHp || baseProperties.max_hp,
                amount_alive: Math.max(0, Math.floor(unitState.amountAlive)),
                amount_died: Math.max(0, Math.floor(unitState.amountDied)),
                attack_type_selected:
                    unitState.attackType > 0
                        ? (unitState.attackType as AttackType)
                        : baseProperties.attack_type_selected,
                stack_power: unitState.stackPower || baseProperties.stack_power,
                // Remaining ranged shots are tracked authoritatively by the server; carry the live count
                // through so the left sidebar decrements as the unit fires. The wire value is 1-based
                // (count + 1) so a genuine "0 shots left" survives proto3's zero-default and is told apart
                // from "field absent" (older server / not a ranged unit): absent (0) falls back to the
                // base config, so ranged units never read as 0 just because the server didn't send it.
                range_shots:
                    baseProperties.range_shots > 0 && unitState.rangeShots > 0
                        ? unitState.rangeShots - 1
                        : baseProperties.range_shots,
                // The server (running the common engine) computes morale and speed authoritatively and
                // ships them in the snapshot; carry them through instead of falling back to the base
                // creature config. These survive the client's adjustBaseStats recompute because it
                // preserves initialUnitProperties.morale/speed (synergy bonus is re-derived on top).
                morale: unitState.morale,
                speed: unitState.speed || baseProperties.speed,
                // Luck is the server's already-rolled effective value (incl. the per-turn spread and
                // auras like Leprechaun's Luck Aura). luck_authoritative tells adjustBaseStats to keep
                // it verbatim rather than re-rolling a divergent client-side spread on top.
                luck: unitState.luck,
                luck_mod: 0,
                luck_authoritative: true,
            } as UnitProperties;
        } catch {
            // Legacy snapshots may not carry a usable creature id, so fall through factions.
        }
    }

    return undefined;
};

interface RankedFightRosterEntry {
    smallTextureName: string;
    start: number;
}

export const rankedUnitStartAmount = (unit: SandboxSceneUnitState): number =>
    Math.max(0, Math.floor(unit.properties.amount_alive)) + Math.max(0, Math.floor(unit.properties.amount_died));

export const rankedUnitAliveHealth = (unit: SandboxSceneUnitState): number => {
    const alive = Math.max(0, Math.floor(unit.properties.amount_alive));
    if (alive <= 0) {
        return 0;
    }

    const maxHp = Math.max(1, Math.floor(unit.properties.max_hp));
    const topHp = Math.min(maxHp, Math.max(0, Math.floor(unit.properties.hp)));
    return (alive - 1) * maxHp + topHp;
};

export const rankedUnitStartHealth = (unit: SandboxSceneUnitState): number => {
    const startAmount = rankedUnitStartAmount(unit);
    if (startAmount <= 0) {
        return 0;
    }
    return startAmount * Math.max(1, Math.floor(unit.properties.max_hp));
};

export class RankedPlayScene extends Sandbox {
    private lastAuthoritativeSequence = -1;
    private lastBoardSignature = "";
    private lastPlacementUnitIdsKey = "";
    private readonly lastPlacementStateByUnitId = new Map<string, string>();
    private readonly playedAuthoritativeActionSequences = new Set<number>();
    private authoritativePlaybackGameId = "";
    private readonly rankedStatsLowerRoster = new Map<string, RankedFightRosterEntry>();
    private readonly rankedStatsUpperRoster = new Map<string, RankedFightRosterEntry>();
    // Unit ids already folded into the casualty roster, so each stack is counted exactly once as the
    // roster is accumulated across snapshots (see mergeRankedRoster).
    private readonly rankedStatsCountedUnitIds = new Set<string>();
    private viewerTeam?: TeamType;
    private upNextUnitIds?: string[];
    // Per-unit sets of currently-active debuff / buff names, tracked across snapshots so we can pop a
    // "nice" icon + name animation the moment a new one lands (e.g. Beholder's Spit Ball, or a buff
    // cast). Keyed by unit id (survives unit rebuilds); seeded silently on first sight so reconnects
    // don't burst.
    private readonly unitDebuffs = new Map<string, Set<string>>();
    private readonly unitBuffs = new Map<string, Set<string>>();
    // High-water sequence for effect-pop diffing, kept separate from the board sequence so a freshly
    // applied debuff/buff is popped exactly once, in order — even when the snapshot that carries it is
    // otherwise board-skipped (mid-animation), which used to defer or drop the pop on the receiving side.
    private effectPopsSequence = -1;
    private effectPopsGameId = "";
    // True between an authoritative action's animation finishing and the next snapshot reassigning the
    // active unit — keeps the just-finished unit's pulse aura suppressed across that gap (no flicker).
    private awaitingTurnHandoff = false;
    private rankedStatsGameId = "";
    private rankedStatsStarted = false;
    private rankedStatsLowerStartTotal = 0;
    private rankedStatsUpperStartTotal = 0;
    private rankedStatsLowerStartHealthTotal = 0;
    private rankedStatsUpperStartHealthTotal = 0;
    private rankedStatsLastLowerKilled = 0;
    private rankedStatsLastUpperKilled = 0;
    private rankedStatsLastLowerDamage = 0;
    private rankedStatsLastUpperDamage = 0;
    private rankedStatsSeries: IFightStatsSample[] = [];
    private rankedSceneLogGameId = "";
    private rankedSceneLogSequence = -1;
    // High-water mark for Armageddon-wave VFX driven off the authoritative journal. Tracked separately
    // from the scene-log sequence so the wave's floating damage + shake fire exactly once when the wave
    // first appears, and historical waves already in the journal on (re)join aren't replayed.
    private armageddonVfxGameId = "";
    private armageddonVfxSequence = -1;
    // Remembers every unit's name (and team) as it appears in snapshots, so log lines for units
    // that have since died — and dropped out of the live snapshot — still resolve a real name.
    private readonly rankedUnitNamesById = new Map<string, string>();
    private readonly rankedUnitTeamsById = new Map<string, number>();
    private rankedPlacementDeadlineServerMs = 0;
    private rankedPlacementEndLocalMs = 0;
    private rankedPlacementSecondsMax = 0;
    private rankedTurnStartLocalMs = 0;
    private rankedTurnEndLocalMs = 0;
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return undefined;
    }
    public override setGameActionTransport(transport?: SceneGameActionTransport): void {
        super.setGameActionTransport(transport);
        this.updateUnitsOverlayVisibility();
    }
    protected override updateUnitsOverlayVisibility(): void {
        this.unitsOverlay?.setVisible(false);
        this.unitsOverlay?.clearSelection(false);
    }
    public override selectAuthoritativeUnit(unitId: string): void {
        this.selectSceneUnitForPlacement(unitId);
    }
    public override applyAuthoritativeVfx(events: GameEvent[]): void {
        for (const event of events) {
            if (event.type === "unit_attacked") {
                // AOE attacks (Cyclops' Large Caliber, etc.) carry a per-affected-unit breakdown so each
                // splashed unit gets its own floating number AT ITS OWN POSITION — the single-target
                // payload below only knows the primary target's spot.
                this.applyAuthoritativeSecondaryVfx(event.attackerId, event.damage);
                if (this.applyAuthoritativeSplashVfx(event.attackerId, event.damage)) continue;
                if (!event.damage?.render) continue;
                const target = this.unitsHolder.getAllUnits().get(event.targetId) as RenderableUnit | undefined;
                const pos = target?.getPosition() ?? event.damage?.unitPosition ?? { x: 0, y: 0 };
                const dir = this.getAttackDirection(event.attackerId, event.targetId);
                if (event.damage.hits?.length) {
                    for (const hit of event.damage.hits) {
                        this.combatVisuals?.showFloatingDamage(pos, hit.amount, dir, hit.unitsDied);
                    }
                } else if (event.damage.amount > 0) {
                    this.combatVisuals?.showFloatingDamage(pos, event.damage.amount, dir);
                }
            } else if (event.type === "area_attacked") {
                this.applyAuthoritativeSecondaryVfx(event.attackerId, event.damage);
                if (this.applyAuthoritativeSplashVfx(event.attackerId, event.damage)) continue;
                if (!event.damage?.render) continue;
                const centerPos = event.damage?.unitPosition ?? event.targetPosition ?? { x: 0, y: 0 };
                if (event.damage.hits?.length) {
                    for (const hit of event.damage.hits) {
                        this.combatVisuals?.showFloatingDamage(centerPos, hit.amount, undefined, hit.unitsDied);
                    }
                } else if (event.damage.amount > 0) {
                    this.combatVisuals?.showFloatingDamage(centerPos, event.damage.amount);
                }
            } else if (event.type === "armageddon_applied") {
                const u = this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined;
                if (u)
                    this.combatVisuals?.showFloatingDamage(u.getPosition(), event.damage, undefined, event.unitsDied);
                this.triggerScreenShake(12 + event.wave * 3, 0.5);
            } else if (event.type === "unit_destroyed" || event.type === "unit_deleted") {
                const u = this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined;
                const info = u?.getShatterInfo();
                if (info) this.combatVisuals?.spawnShatter(info);
            }
        }
    }
    private getAttackDirection(attackerId: string, targetId: string): HoCMath.XY | undefined {
        const a = this.unitsHolder.getAllUnits().get(attackerId) as RenderableUnit | undefined;
        const t = this.unitsHolder.getAllUnits().get(targetId) as RenderableUnit | undefined;
        if (!a || !t) return undefined;
        const dx = t.getPosition().x - a.getPosition().x;
        const dy = t.getPosition().y - a.getPosition().y;
        const len = Math.hypot(dx, dy);
        return len < 0.001 ? undefined : { x: dx / len, y: dy / len };
    }
    /**
     * Draw an AOE attack's floating damage on EVERY affected unit at its own position. The engine
     * fills `damage.splash` for Large Caliber / Area Throw; each entry already carries the impact-time
     * position so units that died (and were removed) still show their number. Returns true when it
     * handled the event, so the caller skips the single-target fallback. The damage direction points
     * from the attacker to each splashed unit so the number flings outward correctly.
     */
    private applyAuthoritativeSplashVfx(attackerId: string, damage?: IVisibleDamage): boolean {
        const splash = damage?.splash;
        if (!splash?.length) return false;
        const gs = this.sc_sceneSettings.getGridSettings();
        const attacker = this.unitsHolder.getAllUnits().get(attackerId) as RenderableUnit | undefined;
        // Use the attacker's VISUAL center (not its base cell) so the damage radiates correctly from
        // the middle of a large attacker (e.g. Hydra/Cyclops 2x2) toward each affected unit.
        const attackerPos = attacker?.getVisualCenter(gs);
        for (const entry of splash) {
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const pos = unit?.getVisualCenter(gs) ?? entry.position;
            let dir: HoCMath.XY | undefined;
            if (attackerPos) {
                const dx = pos.x - attackerPos.x;
                const dy = pos.y - attackerPos.y;
                const len = Math.hypot(dx, dy);
                if (len >= 0.001) dir = { x: dx / len, y: dy / len };
            }
            this.combatVisuals?.showFloatingDamage(pos, entry.amount, dir, entry.unitsDied);
        }
        return true;
    }
    /**
     * Draw floating numbers for secondary damage that triggers during an attack — Fire Shield
     * reflect, Chain Lightning bounces, Petrifying Gaze kills, Magic Mirror — each on the affected
     * unit (impact-time position fallback for units that died). Additive: called alongside the
     * splash/primary rendering, never instead of it.
     */
    private applyAuthoritativeSecondaryVfx(attackerId: string, damage?: IVisibleDamage): void {
        const secondary = damage?.secondary;
        if (!secondary?.length) return;
        const gs = this.sc_sceneSettings.getGridSettings();
        // Radiate from the attacker's VISUAL center so a large unit's AOE (e.g. Hydra Skewer Strike)
        // throws each affected unit's number outward at the correct angle from its middle.
        const attackerPos = (
            this.unitsHolder.getAllUnits().get(attackerId) as RenderableUnit | undefined
        )?.getVisualCenter(gs);
        for (const entry of secondary) {
            if (entry.amount <= 0 && entry.unitsDied <= 0) continue;
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const pos = unit?.getVisualCenter(gs) ?? entry.position;
            let dir: HoCMath.XY | undefined;
            if (attackerPos) {
                const dx = pos.x - attackerPos.x;
                const dy = pos.y - attackerPos.y;
                const len = Math.hypot(dx, dy);
                if (len >= 0.001) dir = { x: dx / len, y: dy / len };
            }
            this.combatVisuals?.showFloatingDamage(pos, entry.amount, dir, entry.unitsDied);
        }
    }
    protected override getUpNextUnitIds(): string[] | undefined {
        return this.upNextUnitIds;
    }
    /**
     * Diff each unit's active debuffs AND buffs against the previously-seen sets and pop a nice icon +
     * name (plus a colour wash) over any unit that just gained one — a debuff (e.g. Beholder's Spit Ball
     * landing Sadness / Quagmire / Weakness, violet) or a buff (green). Aura effects are excluded (see
     * animatableEffectNames) since they toggle as units move in and out of range. A unit's effects are
     * seeded silently the first time we see it — and only during the fight — so joining/reconnecting
     * mid-game doesn't burst every existing effect at once.
     */
    private processDebuffPops(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }
        // Own the per-game reset here (this now runs before applyRankedSnapshotMetadata): a new game
        // re-baselines the tracker so the first snapshot seeds silently instead of diffing against the
        // previous fight's effects.
        if (this.effectPopsGameId !== snapshot.gameId) {
            this.effectPopsGameId = snapshot.gameId;
            this.effectPopsSequence = -1;
            this.unitDebuffs.clear();
            this.unitBuffs.clear();
        }
        // Process each snapshot's effects at most once and only forward in sequence: this runs BEFORE the
        // board-rebuild guards (so a debuff applied during an opponent's attack animation still pops on
        // the receiving side), so it must ignore the stale/duplicate re-applies those guards would catch.
        if (snapshot.latestSequence <= this.effectPopsSequence) {
            return;
        }
        this.effectPopsSequence = snapshot.latestSequence;
        const seen = new Set<string>();
        for (const unitState of snapshot.units) {
            seen.add(unitState.id);
            const currentDebuffs = animatableEffectNames(unitState.debuffs ?? []);
            const currentBuffs = animatableEffectNames(unitState.buffs ?? []);
            const diff = diffUnitEffects(
                this.unitDebuffs.get(unitState.id),
                this.unitBuffs.get(unitState.id),
                currentDebuffs,
                currentBuffs,
            );
            this.unitDebuffs.set(unitState.id, currentDebuffs);
            this.unitBuffs.set(unitState.id, currentBuffs);
            if (diff.seeded) {
                continue; // First time we've seen this unit — seed without animating.
            }
            const unit = this.unitsHolder.getAllUnits().get(unitState.id) as RenderableUnit | undefined;
            if (!unit || unit.isDead()) {
                continue;
            }
            if (diff.flash === "debuff") {
                unit.flashDebuffDarken();
            } else if (diff.flash === "buff") {
                unit.flashBuffApplied();
            }
            let stackIndex = 0;
            for (const name of diff.newDebuffs) {
                this.popEffectOnUnit(unit, name, stackIndex++, "debuff");
            }
            for (const name of diff.newBuffs) {
                this.popEffectOnUnit(unit, name, stackIndex++, "buff");
            }
        }
        for (const id of [...this.unitDebuffs.keys()]) {
            if (!seen.has(id)) {
                this.unitDebuffs.delete(id);
                this.unitBuffs.delete(id);
            }
        }
    }
    private applyRankedSnapshotMetadata(snapshot: AuthoritativeGameSnapshot): void {
        this.viewerTeam = snapshot.viewerTeam === undefined ? undefined : (snapshot.viewerTeam as TeamType);
        this.setLocalModelTeamOverride(
            snapshot.localModelTeam === undefined ? undefined : (snapshot.localModelTeam as TeamType),
        );
        if (snapshot.gameId !== this.authoritativePlaybackGameId) {
            this.authoritativePlaybackGameId = snapshot.gameId;
            this.playedAuthoritativeActionSequences.clear();
            // unitDebuffs/unitBuffs are reset by processDebuffPops (which now runs first, keyed on gameId).
        }
        this.upNextUnitIds = [...(snapshot.upNext ?? [])];
    }
    private syncRankedVisibleTurnState(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }

        const newActiveId = snapshot.currentUnitId || undefined;
        // Right after an OPPONENT action the server may reassert the same enemy unit as still-active
        // (e.g. a multi-action unit between its shots) before the turn changes hands. Re-running
        // activation would flash that finished unit's pulse back on for the frames before a different
        // unit takes over, so keep the handoff suppression on and skip reactivation until a different
        // unit becomes active.
        //
        // The viewer's OWN unit is deliberately NOT guarded here: when the server reasserts our own
        // unit as still-active, it genuinely still has an action to take (a bare move that can still
        // attack, OR a multi-shot unit like an Arbalester with Double Shot mid-volley). Skipping
        // reactivation in that case would leave awaitingTurnHandoff stuck true and suppress the active
        // unit's pulse for the entire time the viewer aims the next shot — so always reactivate.
        if (
            this.awaitingTurnHandoff &&
            newActiveId !== undefined &&
            newActiveId === this.getCurrentActiveUnit()?.getId() &&
            this.isEnemyActiveTurn()
        ) {
            return;
        }

        // The turn has now been authoritatively handed over (active unit synced below), so end the
        // post-action aura suppression. This runs synchronously with the reassignment, so the aura
        // switches straight from the old unit (off) to the new one with no flash in between.
        this.awaitingTurnHandoff = false;
        this.syncAuthoritativeActiveUnit(newActiveId, snapshot.currentLap);
    }
    protected override isAwaitingAuthoritativeTurnHandoff(): boolean {
        return this.awaitingTurnHandoff;
    }
    protected override onReplayHangRecovery(): void {
        // The hung replay may have left the board half-applied. Clear the cached signature so the next
        // authoritative snapshot does a full hydrate instead of short-circuiting on an unchanged
        // signature, reconciling the scene to server truth.
        this.lastBoardSignature = "";
    }
    public override applyAuthoritativeSnapshot(
        snapshot: AuthoritativeGameSnapshot,
        options?: AuthoritativeSnapshotOptions,
    ): void {
        // Effect pops (debuff/buff icons) are independent of the board rebuild and use world-attached
        // visuals, so diff them FIRST — before the animation/board-skip guards below can early-return.
        // Otherwise a debuff applied during an opponent's attack (which the receiver is mid-animating)
        // rode a board-skipped snapshot and the pop was deferred to a later snapshot or dropped entirely
        // — the "debuff animation not rendered for the receiver" bug. Its own sequence guard keeps it
        // in-order and idempotent regardless of how many times a snapshot is re-applied.
        this.processDebuffPops(snapshot);

        // The 4s fallback poll can fetch the post-move state and apply it (without skipBoardRebuild)
        // while a move/attack animation is still in flight. hydrateSceneState would then recreate every
        // unit at its final cell and snap the in-progress slide. Ignore such full rebuilds while
        // animating (we don't advance sequence/signature here, so the next snapshot re-syncs once idle).
        // skipBoardRebuild snapshots are safe — they never hydrate — so they still pass through.
        if (!options?.skipBoardRebuild && !options?.forceBoardRebuild && this.isPlayingActionAnimation()) {
            return;
        }
        const boardSignature = this.createBoardSignature(snapshot);
        if (snapshot.latestSequence < this.lastAuthoritativeSequence) {
            return;
        }
        this.applyRankedTimer(snapshot);
        this.applyAuthoritativeSceneLog(snapshot);
        this.lastAuthoritativeSequence = snapshot.latestSequence;
        this.applyRankedSnapshotMetadata(snapshot);
        // (Effect pops already diffed at the top of this method, before the animation/board guards.)
        // Map narrowing is authoritative snapshot state. Reconcile it on every snapshot (idempotent)
        // so the holes render even when the board rebuild that would normally draw them is skipped.
        this.applyAuthoritativeNarrowing(snapshot.narrowingLayers);
        // Death "broken mirror" shatter for any unit that died since the last applied snapshot. Ranked
        // removes dead units via the snapshot rebuild (hydrateSceneState destroys with isDead=false →
        // no shatter) or applyRankedUnitStats (which skips dead units), so only deaths that rode a played
        // action replay shattered on their own — which is why a struck defender shattered but an attacker
        // felled by the counter (reconciled here, after the turn handed off) did not. Runs before the
        // board is rebuilt; getShatterInfo() is null once visuals are torn down, so units the replay
        // already shattered are skipped (no double shatter).
        // Armageddon wave VFX: render the floating damage + screen shake off the journal here (the
        // reliable channel in ranked — the inline engine-event path is suppressed via
        // shouldRenderArmageddonInline()). Runs BEFORE shatterNewlyDeadUnits so a unit the wave kills
        // still has a live position to throw its number from.
        this.renderNewlyAppliedArmageddon(snapshot);
        this.shatterNewlyDeadUnits(snapshot);
        const state = authoritativeSnapshotToSandboxSceneState(snapshot, { hideOpponentPlacements: true });
        // Self-heal an active-unit desync: the server says a unit is active but on our board that unit
        // is missing or dead (e.g. its death was applied locally but the server kept/resurrected it, or
        // a force-recovered replay left the board half-applied). syncAuthoritativeActiveUnit would bail
        // and leave the board with NO active unit — a silent freeze (AI never triggers). Treat it like
        // forceBoardRebuild so the full hydrate below rebuilds from truth and re-activates the unit.
        const activeUnitDesynced =
            snapshot.fightStarted &&
            !snapshot.fightFinished &&
            !!snapshot.currentUnitId &&
            (() => {
                const u = this.unitsHolder.getAllUnits().get(snapshot.currentUnitId);
                return !u || u.isDead();
            })();
        const forceRebuild = !!options?.forceBoardRebuild || activeUnitDesynced;
        // forceBoardRebuild self-heals a desync: the client just had an action rejected because its
        // view disagrees with the server (e.g. a stale ghost unit), so the signature short-circuit
        // (which assumes "same server board => client already in sync") must NOT fire — fall through
        // to the full hydrate below to rebuild from authoritative truth.
        if (boardSignature === this.lastBoardSignature && !forceRebuild) {
            this.syncRankedVisibleTurnState(snapshot);
            this.applyRankedUnitStats(state.units);
            this.reconcileAuraEffectsFromSnapshot(snapshot);
            this.applyRankedFightStats(snapshot, state.units);
            return;
        }

        // If the caller already animated + applied this snapshot's board changes by playing
        // the matching authoritative action record, skip the destructive full rebuild.
        // hydrateSceneState destroys and recreates every unit, which restarts their idle/move
        // animations — the "re-animates / starts over" glitch. Records already moved units and
        // applied mechanics, so the snapshot's board is redundant here; we only refresh the
        // turn queue / visible state.
        const skipBoardRebuild =
            !forceRebuild && !!options?.skipBoardRebuild && snapshot.fightStarted && !snapshot.fightFinished;
        if (skipBoardRebuild) {
            this.lastBoardSignature = boardSignature;
            this.syncRankedVisibleTurnState(snapshot);
            if (this.sc_visibleState) {
                this.sc_visibleState.lapNumber = Math.max(snapshot.currentLap || 0, 0);
                this.sc_visibleStateUpdateNeeded = true;
            }
            // A skip-rebuild snapshot updates stats but never tears down units the server has dropped
            // (a kill conveyed by snapshot rather than a replayed event), so they linger as "ghosts" the
            // AI then targets — which the server rejects as unit_not_found. Remove them here.
            this.reconcileGhostUnits(new Set(state.units.map((u) => u.properties.id)));
            // A replayed action animates the hit but its EVENTS don't mutate the stack counts — apply
            // the authoritative remaining amounts/hp here so attack and retaliation damage actually
            // updates each unit's stack on the board (otherwise it stays frozen at the pre-hit count).
            this.applyRankedUnitStats(state.units);
            // Re-run synergies + POSITION-DEPENDENT auras so the AI/targeting agree with the server on
            // targetability. A skip-rebuild snapshot moves units (animated) but never re-runs the aura
            // pass, so e.g. White Tiger's Disguise Aura (which Hides it when no enemy is within range,
            // making it untargetable) stays stale: the AI sees it Visible and fires a doomed melee that
            // the server rejects (attack_not_available). The move animation has completed (grid occupancy
            // is final) before a skip-rebuild snapshot applies, so the aura range checks are correct here.
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.reconcileAuraEffectsFromSnapshot(snapshot);
            this.applyRankedFightStats(snapshot, state.units);
            return;
        }

        const placementUnitIdsKey =
            !snapshot.fightStarted && !snapshot.fightFinished ? this.createPlacementUnitIdsKey(snapshot) : "";
        const canSkipPreFightHydrate =
            !snapshot.fightStarted &&
            !snapshot.fightFinished &&
            this.viewerTeam !== undefined &&
            this.lastPlacementUnitIdsKey !== "" &&
            placementUnitIdsKey === this.lastPlacementUnitIdsKey &&
            !this.hasVisibleOpponentPlacementChange(snapshot);
        this.lastPlacementUnitIdsKey = placementUnitIdsKey;
        this.rememberPlacementStates(snapshot);
        if (canSkipPreFightHydrate) {
            return;
        }

        const selectedUnitId = this.sc_selectedUnitProperties?.id;

        this.hydrateSceneState(state);
        this.reconcileAuraEffectsFromSnapshot(snapshot);
        this.lastBoardSignature = boardSignature;
        this.applyRankedTimer(snapshot);
        this.syncRankedVisibleTurnState(snapshot);
        this.applyRankedFightStats(snapshot, state.units);
        if (selectedUnitId && !snapshot.fightStarted && !snapshot.fightFinished) {
            this.selectSceneUnitForPlacement(selectedUnitId);
        }
    }
    public override applyAuthoritativeReplaySnapshot(snapshot: AuthoritativeGameSnapshot): void {
        this.lastAuthoritativeSequence = snapshot.latestSequence - 1;
        this.lastBoardSignature = "";
        this.lastPlacementUnitIdsKey = "";
        this.lastPlacementStateByUnitId.clear();
        this.resetRankedFightStats();
        this.rankedSceneLogGameId = "";
        this.rankedSceneLogSequence = -1;
        // Re-baseline the Armageddon high-water mark so the next snapshot doesn't replay historical waves.
        this.armageddonVfxGameId = "";
        this.armageddonVfxSequence = -1;
        // Re-baseline effect pops so the replay's first snapshot seeds silently instead of bursting.
        this.effectPopsGameId = "";
        this.effectPopsSequence = -1;
        this.applyAuthoritativeSnapshot(snapshot);
    }
    public override startScene(): boolean {
        this.createActionEngine().apply({ type: "start_fight" });
        return false;
    }
    public override rematchLastFight(): boolean {
        return false;
    }
    public override canPlayCurrentSandboxReplay(): boolean {
        return false;
    }
    public override playAuthoritativeActionRecord(
        action: GameAction,
        events: GameEvent[],
        stateAfter?: unknown,
    ): Promise<boolean> {
        const authoritativeSequence = this.isAuthoritativeSnapshot(stateAfter) ? stateAfter.latestSequence : undefined;
        if (authoritativeSequence !== undefined && this.playedAuthoritativeActionSequences.has(authoritativeSequence)) {
            return Promise.resolve(true);
        }
        if (authoritativeSequence !== undefined) {
            this.playedAuthoritativeActionSequences.add(authoritativeSequence);
        }

        const replayStateAfter = this.isAuthoritativeSnapshot(stateAfter)
            ? authoritativeSnapshotToSandboxSceneState(stateAfter, { hideOpponentPlacements: true })
            : undefined;
        return super.playAuthoritativeActionRecord(action, events, replayStateAfter).then((played) => {
            // The animation has finished but the turn-handoff snapshot is applied right after (await in
            // RankedGameView), with render frames in between. Suppress the finished unit's pulse aura
            // until that snapshot syncs the new active unit, so it doesn't flash back on for a frame.
            this.awaitingTurnHandoff = true;
            return played;
        });
    }
    protected override getPlacementDrawTeam(): TeamType | undefined {
        return this.viewerTeam;
    }
    /**
     * During placement the opponent's placement zone is never drawn (see getPlacementDrawTeam).
     * Instead, lay out the units we have revealed (scouted) inside the opponent's placement area,
     * each on its own cell so they never stack. These are synthetic display positions — the
     * opponent's real placement cells stay hidden.
     */
    protected override getRevealedOpponentUnitPositions(units: SandboxSceneUnitState[]): Map<string, HoCMath.XY> {
        const positions = new Map<string, HoCMath.XY>();
        if (this.viewerTeam === undefined) {
            return positions;
        }

        const opponentTeam = this.viewerTeam === TeamVals.LOWER ? TeamVals.UPPER : TeamVals.LOWER;
        const revealedUnits = units
            .filter((unit) => unit.team === opponentTeam && (!unit.placed || !unit.cells.length))
            .sort((a, b) => a.properties.id.localeCompare(b.properties.id));
        if (!revealedUnits.length) {
            return positions;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const slots: HoCMath.XY[] = [];
        const seen = new Set<number>();
        for (const placementIndex of [0, 1]) {
            const placement = this.getPlacement(opponentTeam, placementIndex);
            if (!placement) {
                continue;
            }
            for (const cell of placement.possibleCellPositions(true)) {
                if (!cell) {
                    continue;
                }
                const hash = (cell.x << 4) | cell.y;
                if (seen.has(hash)) {
                    continue;
                }
                seen.add(hash);
                slots.push(GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep()));
            }
        }
        if (!slots.length) {
            return positions;
        }
        // Stable order so each revealed unit keeps the same cell across snapshots.
        slots.sort((a, b) => a.y - b.y || a.x - b.x);

        revealedUnits.forEach((unit, index) => {
            // More revealed units than cells is not expected; modulo just keeps it bounded.
            positions.set(unit.properties.id, slots[index % slots.length]);
        });
        return positions;
    }
    protected override shouldRenderUnplacedUnitBench(unitState: SandboxSceneUnitState): boolean {
        return this.viewerTeam !== undefined && unitState.team === this.viewerTeam;
    }
    /**
     * Spread the placement roster evenly across the full board width (like the sandbox
     * UnitsOverlay) instead of the base centered cluster, vertically centered on the board.
     */
    protected override getUnplacedUnitBenchPosition(
        index: number,
        total: number,
        _unitState?: SandboxSceneUnitState,
    ): HoCMath.XY | undefined {
        if (total <= 0) {
            return undefined;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const minX = gs.getMinX();
        const maxX = gs.getMaxX();
        const centerY = (gs.getMinY() + gs.getMaxY()) / 2;
        // (index + 0.5) / total centers each unit in its own equal-width slot, which also keeps a
        // half-slot margin from both board edges so the end units don't overflow.
        const fraction = (index + 0.5) / total;
        return {
            x: minX + (maxX - minX) * fraction,
            y: centerY,
        };
    }
    protected override shouldGhostUnplacedUnitBenchUnit(unitState: SandboxSceneUnitState): boolean {
        return this.viewerTeam !== undefined && unitState.team !== this.viewerTeam;
    }
    protected override shouldShowPlacementBenchToggle(): boolean {
        return this.viewerTeam !== undefined;
    }
    protected override shouldGhostCurrentPlacementBenchUnit(unit: Unit): boolean {
        return this.viewerTeam !== undefined && unit.getTeam() !== this.viewerTeam;
    }
    protected override canSelectUnitForPlacement(unit: Unit): boolean {
        return this.viewerTeam !== undefined && unit.getTeam() === this.viewerTeam;
    }
    /**
     * Suppress hover visuals (move silhouette, attack highlights, spell targeting) when the
     * active unit belongs to the enemy team. The viewer should only see their own unit's
     * hover previews — not the opponent's movement/attack range.
     */
    protected override canShowHoverForActiveUnit(): boolean {
        const currentActiveUnit = this.getCurrentActiveUnit();
        if (!currentActiveUnit || this.viewerTeam === undefined) return false;
        return currentActiveUnit.getTeam() === this.viewerTeam;
    }
    /**
     * The local player may only act on the active unit when it is on their own team. On the opponent's
     * turn this disables every toolbar action button — including the spellbook, which is otherwise a
     * purely-local overlay the server never sees, so it would open over the opponent's turn (bug fix).
     * With no active unit (e.g. placement) there is nothing to gate, so the toolbar stays usable.
     */
    protected override canControlCurrentActiveUnit(): boolean {
        const currentActiveUnit = this.getCurrentActiveUnit();
        if (!currentActiveUnit || this.viewerTeam === undefined) return true;
        return currentActiveUnit.getTeam() === this.viewerTeam;
    }
    /**
     * Show a destination silhouette while an opponent unit's move animates, so the viewer can see
     * the target cell even when no live move-aim was relayed (e.g. the opponent clicked quickly).
     */
    protected override shouldShowMoveDestinationSilhouette(unit: RenderableUnit): boolean {
        if (this.viewerTeam === undefined) {
            return false;
        }
        // Opponent moves always get a destination preview (no live aim is relayed for them).
        if (unit.getTeam() !== this.viewerTeam) {
            return true;
        }
        // The viewer's own moves normally don't need one — the player picked the destination and the
        // locked hover silhouette already marks it. But when the viewer's team is auto-played by the AI
        // toggle, the human ISN'T choosing the destination and there's no hover, so the unit would slide
        // with no preview. Show the same destination silhouette for those AI-driven own moves. Covers
        // both AI paths: the per-team "AI side" set (isTeamAiControlled) and the sc_isAIActive toggle
        // that auto-plays getToggleAiControlledTeam().
        const ownTeam = unit.getTeam();
        return this.isTeamAiControlled(ownTeam) || (this.sc_isAIActive && this.getToggleAiControlledTeam() === ownTeam);
    }
    /**
     * It is the enemy's turn whenever the active unit is on the opposing team from the viewer.
     * Drives the red active-unit aura, movement highlight, and board-edge glow.
     */
    protected override isEnemyActiveTurn(): boolean {
        const currentActiveUnit = this.getCurrentActiveUnit();
        if (!currentActiveUnit || this.viewerTeam === undefined) return false;
        return currentActiveUnit.getTeam() !== this.viewerTeam;
    }
    /**
     * The AI toggle (autobattle) may only auto-play the local player's own units in ranked — never
     * the opponent's. Returning the viewer's team team-gates the toggle-driven AI so enabling it
     * autobattles the player's turns while the opponent stays under the server's control.
     */
    protected override getToggleAiControlledTeam(): TeamType | undefined {
        return this.viewerTeam;
    }
    protected override updateVisibleTurnTimer(): void {
        // The base sets aiToggleOn from the live toggle; this override drives the timer off the server
        // clock and returns before super runs, so mirror the toggle here or the "AI on" badge never shows
        // in ranked until the server marks the player aiControlled (after missed turns).
        this.syncAiToggleToVisibleState();
        if (this.rankedPlacementEndLocalMs > Date.now()) {
            this.syncRankedPlacementTimerToVisibleState();
            return;
        }
        if (this.rankedTurnEndLocalMs <= this.rankedTurnStartLocalMs) {
            super.updateVisibleTurnTimer();
            return;
        }
        this.syncRankedTurnTimerToVisibleState();
    }
    private applyRankedTimer(snapshot: AuthoritativeGameSnapshot): void {
        this.applyRankedPlacementTimer(snapshot);
        this.applyRankedTurnTimer(snapshot);
    }
    private applyRankedPlacementTimer(snapshot: AuthoritativeGameSnapshot): void {
        if (
            snapshot.fightStarted ||
            snapshot.fightFinished ||
            !snapshot.placementDeadlineMs ||
            snapshot.placementDeadlineMs <= 0
        ) {
            this.rankedPlacementDeadlineServerMs = 0;
            this.rankedPlacementEndLocalMs = 0;
            this.rankedPlacementSecondsMax = 0;
            return;
        }

        const localNowMs = Date.now();
        const serverNowMs = snapshot.serverTimeMs || localNowMs;
        const localOffsetMs = localNowMs - serverNowMs;
        this.rankedPlacementEndLocalMs = snapshot.placementDeadlineMs + localOffsetMs;
        const remaining = Math.max(0, (this.rankedPlacementEndLocalMs - localNowMs) / 1000);
        if (snapshot.placementDeadlineMs !== this.rankedPlacementDeadlineServerMs) {
            this.rankedPlacementDeadlineServerMs = snapshot.placementDeadlineMs;
            this.rankedPlacementSecondsMax = Math.max(0.001, Math.ceil(remaining));
        } else {
            this.rankedPlacementSecondsMax = Math.max(this.rankedPlacementSecondsMax, remaining);
        }
        this.syncRankedPlacementTimerToVisibleState();
    }
    private applyRankedTurnTimer(snapshot: AuthoritativeGameSnapshot): void {
        if (
            !snapshot.fightStarted ||
            snapshot.fightFinished ||
            !snapshot.currentTurnStartMs ||
            !snapshot.currentTurnEndMs ||
            snapshot.currentTurnEndMs <= snapshot.currentTurnStartMs
        ) {
            this.rankedTurnStartLocalMs = 0;
            this.rankedTurnEndLocalMs = 0;
            return;
        }

        const localNowMs = Date.now();
        const serverNowMs = snapshot.serverTimeMs || localNowMs;
        const localOffsetMs = localNowMs - serverNowMs;
        this.rankedTurnStartLocalMs = snapshot.currentTurnStartMs + localOffsetMs;
        this.rankedTurnEndLocalMs = snapshot.currentTurnEndMs + localOffsetMs;
        this.syncRankedTurnTimerToVisibleState();
    }
    private syncRankedPlacementTimerToVisibleState(): void {
        if (!this.sc_visibleState || this.rankedPlacementEndLocalMs <= 0) {
            return;
        }

        this.sc_visibleState.secondsMax = Math.max(0.001, this.rankedPlacementSecondsMax);
        const remaining = (this.rankedPlacementEndLocalMs - Date.now()) / 1000;
        this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
        this.sc_visibleState.teamTypeTurn = undefined;
        this.sc_visibleState.lapNumber = 0;
        this.sc_visibleState.canRequestAdditionalTime = false;
        this.sc_visibleStateUpdateNeeded = true;
    }
    private syncRankedTurnTimerToVisibleState(): void {
        if (!this.sc_visibleState || this.rankedTurnEndLocalMs <= this.rankedTurnStartLocalMs) {
            return;
        }

        this.sc_visibleState.secondsMax = Math.max(
            0.001,
            (this.rankedTurnEndLocalMs - this.rankedTurnStartLocalMs) / 1000,
        );
        const remaining = (this.rankedTurnEndLocalMs - Date.now()) / 1000;
        this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
        this.sc_visibleStateUpdateNeeded = true;
    }
    private applyAuthoritativeSceneLog(snapshot: AuthoritativeGameSnapshot): void {
        const journalTail = snapshot.journalTail;
        if (!journalTail) {
            return;
        }

        const maxSequence = journalTail.reduce((max, entry) => Math.max(max, entry.sequence), 0);
        const gameChanged = this.rankedSceneLogGameId !== snapshot.gameId;
        if (gameChanged) {
            this.rankedUnitNamesById.clear();
            this.rankedUnitTeamsById.clear();
        }
        // Accumulate names/teams from every snapshot (even when the log itself doesn't need a
        // rebuild) so a unit that dies and leaves the live snapshot keeps a resolvable name.
        for (const unit of snapshot.units) {
            if (unit.name) {
                this.rankedUnitNamesById.set(unit.id, unit.name);
                this.rankedUnitTeamsById.set(unit.id, unit.team);
            }
        }
        if (!gameChanged && maxSequence <= this.rankedSceneLogSequence) {
            return;
        }

        this.rankedSceneLogGameId = snapshot.gameId;
        this.rankedSceneLogSequence = maxSequence;
        const lines = this.buildAuthoritativeSceneLogLines(journalTail, this.rankedUnitNamesById);

        this.sc_sceneLog.clear();
        for (const line of lines) {
            this.sc_sceneLog.updateLog(line);
        }
    }
    private buildAuthoritativeSceneLogLines(
        journalTail: AuthoritativeJournalEntry[],
        unitNames: ReadonlyMap<string, string>,
    ): string[] {
        const lines: string[] = [];
        const sortedEntries = [...journalTail].sort((a, b) => a.sequence - b.sequence);
        for (const entry of sortedEntries) {
            const events = this.parseJournalEvents(entry);
            // A unit that moved/attacked/cast this entry also emits a trailing "manual" unit_skipped
            // as its turn auto-completes — that isn't a real skip, so don't log "skips turn" for it.
            // Only an explicit end-turn ("Next", which carries no action) or a timeout/effect skip
            // should read as a skip.
            const actedUnitIds = new Set<string>();
            for (const event of events) {
                const actedId = this.actedUnitId(event);
                if (actedId) {
                    actedUnitIds.add(actedId);
                }
            }
            for (const event of events) {
                if (event.type === "unit_skipped" && event.reason === "manual" && actedUnitIds.has(event.unitId)) {
                    continue;
                }
                const line = this.eventToSceneLogLine(event, unitNames);
                if (line) {
                    const actorId = this.logActorUnitId(event);
                    const flag = actorId ? this.logTeamFlag(actorId) : "";
                    lines.push(flag ? `${flag} ${line}` : line);
                }
                // Secondary-damage abilities (Fire Shield / Chain Lightning / Petrifying Gaze / Magic
                // Mirror) ride on the attack's damage payload — each gets its own follow-up log line.
                for (const secondaryLine of this.secondaryLogLines(event, unitNames)) {
                    lines.push(secondaryLine);
                }
            }
        }
        return lines;
    }
    /** Log lines for secondary-damage abilities carried on an attack's damage payload. */
    private secondaryLogLines(event: GameEvent, unitNames: ReadonlyMap<string, string>): string[] {
        const damage = event.type === "unit_attacked" || event.type === "area_attacked" ? event.damage : undefined;
        const secondary = damage?.secondary;
        if (!secondary?.length) {
            return [];
        }
        const lines: string[] = [];
        for (const entry of secondary) {
            if (entry.amount <= 0 && entry.unitsDied <= 0) {
                continue;
            }
            const name = unitNames.get(entry.unitId) ?? "Unit";
            const kills = entry.unitsDied > 0 ? ` 💀 ${entry.unitsDied}` : "";
            let text: string;
            switch (entry.source) {
                case "fire_shield":
                    text = `${name} received (${entry.amount}) from Fire Shield${kills}`;
                    break;
                case "chain_lightning":
                    text = `${name} hit ${entry.amount} by Chain Lightning${kills}`;
                    break;
                case "magic_mirror":
                    text = `${name} hit ${entry.amount} by Magic Mirror${kills}`;
                    break;
                case "fire_breath":
                    text = `${name} hit ${entry.amount} by Fire Breath${kills}`;
                    break;
                case "lightning_spin":
                    text = `${name} hit ${entry.amount} by Lightning Spin${kills}`;
                    break;
                case "skewer_strike":
                    text = `${name} hit ${entry.amount} by Skewer Strike${kills}`;
                    break;
                case "petrifying_gaze":
                    text =
                        entry.unitsDied > 0
                            ? `${entry.unitsDied} ${name} killed by Petrifying Gaze`
                            : `${name} hit (${entry.amount}) by Petrifying Gaze`;
                    break;
                default:
                    continue;
            }
            const flag = this.logTeamFlag(entry.unitId);
            lines.push(flag ? `${flag} ${text}` : text);
        }
        return lines;
    }
    /** Unit id for an event where the unit actively took its turn (so a trailing manual skip is noise). */
    private actedUnitId(event: GameEvent): string | undefined {
        switch (event.type) {
            case "unit_moved":
                return event.unitId;
            case "unit_attacked":
            case "obstacle_attacked":
            case "area_attacked":
                return event.attackerId;
            case "spell_cast":
            case "unit_summoned":
                return event.casterId;
            case "unit_split":
                return event.sourceUnitId;
            default:
                return undefined;
        }
    }
    /** The unit a log line is "about", used to tag the line with its team flag. */
    private logActorUnitId(event: GameEvent): string | undefined {
        switch (event.type) {
            case "unit_moved":
            case "unit_moved_by_system":
            case "unit_skipped":
            case "unit_waited":
            case "unit_defended":
            case "unit_destroyed":
            case "unit_resurrected":
            case "armageddon_applied":
            case "morale_applied":
            case "attack_type_selected":
            case "unit_deleted":
                return event.unitId;
            case "unit_attacked":
            case "obstacle_attacked":
            case "area_attacked":
                return event.attackerId;
            case "spell_cast":
            case "unit_summoned":
                return event.casterId;
            case "unit_split":
                return event.sourceUnitId;
            default:
                return undefined;
        }
    }
    /**
     * Ranked rebuilds its scene log from the authoritative journal and prefixes each line with the
     * acting unit's team flag by unit id (logTeamFlag), so the sandbox's name-based resolver — which
     * would double-tag or mis-tag the already-formatted lines — is disabled here.
     */
    protected override resolveSceneLogTeamFlag(): string {
        return "";
    }
    /** Green/red marker for the acting unit's team (LOWER = green, UPPER = red). */
    private logTeamFlag(unitId: string): string {
        // Prefer the team captured from authoritative snapshots; fall back to the live units holder so
        // units that never appear in a snapshot (a local-model opponent's units, units summoned
        // mid-fight) still get a colour flag instead of an unmarked line.
        const team = this.rankedUnitTeamsById.get(unitId) ?? this.unitsHolder.getAllUnits().get(unitId)?.getTeam();
        if (team === TeamVals.LOWER) {
            return "🟢";
        }
        if (team === TeamVals.UPPER) {
            return "🔴";
        }
        return "";
    }
    private parseJournalEvents(entry: AuthoritativeJournalEntry): GameEvent[] {
        if (!entry.eventsJson.trim()) {
            return [];
        }
        try {
            const parsed = JSON.parse(entry.eventsJson) as unknown;
            return Array.isArray(parsed) ? (parsed as GameEvent[]) : [];
        } catch {
            return [];
        }
    }
    private eventToSceneLogLine(event: GameEvent, unitNames: ReadonlyMap<string, string>): string | undefined {
        const nameOf = (unitId: string): string => unitNames.get(unitId) ?? "Unit";
        const cellLabel = (cell?: HoCMath.XY): string => (cell ? `(${cell.x}, ${cell.y})` : "");

        switch (event.type) {
            case "fight_started":
                return "Fight started!";
            case "lap_initialized":
                return `Lap ${event.lap} started`;
            case "lap_flipped":
                return `Lap ${event.currentLap} started`;
            case "center_dried":
                return "Center dried";
            case "center_obstacle_cleared":
                return "Center obstacle cleared";
            case "narrowing_applied":
                return "Map narrowed";
            case "unit_moved_by_system":
                return `${nameOf(event.unitId)} moved by ${event.reason}`;
            case "unit_destroyed":
                return `${nameOf(event.unitId)} ${
                    event.reason === "dead_cleanup"
                        ? "died"
                        : event.reason === "armageddon"
                          ? "destroyed by Armageddon"
                          : "destroyed by narrowing"
                }`;
            case "unit_resurrected":
                return `${nameOf(event.unitId)} resurrected (${event.amount})`;
            case "armageddon_applied":
                return `${nameOf(event.unitId)} received (${event.damage}) from Armageddon`;
            case "morale_applied":
                return `${nameOf(event.unitId)} is on ${event.kind === "plus" ? "Morale" : "Dismorale"} this lap!`;
            case "unit_skipped":
                return event.reason === "timeout"
                    ? `${nameOf(event.unitId)} turn timed out`
                    : `${nameOf(event.unitId)} skips turn`;
            case "unit_waited":
                return `${nameOf(event.unitId)} waits (hourglass)`;
            case "unit_defended":
                return `${nameOf(event.unitId)} uses Luck Shield`;
            case "attack_type_selected":
                return `${nameOf(event.unitId)} selected ${this.attackTypeLabel(event.attackType)} attack`;
            case "unit_moved":
                return `${nameOf(event.unitId)} moved to${cellLabel(event.targetCells[0] ?? event.path.at(-1))}`;
            case "unit_placed":
                return undefined;
            case "unit_split":
                return `${nameOf(event.sourceUnitId)} split ${event.splitAmount}`;
            case "unit_deleted":
                return `${nameOf(event.unitId)} removed`;
            case "unit_summoned": {
                const at = event.cells[0] ? ` at (${event.cells[0].x}, ${event.cells[0].y})` : "";
                return `${nameOf(event.casterId)} summoned ${event.amount} x ${event.unitName}${at}`;
            }
            case "unit_attacked":
                return `${nameOf(event.attackerId)} ${this.attackIcon(event.attackType, event.damage)} ${nameOf(event.targetId)} (${event.damage.amount})${this.killSuffix(event.damage)}`;
            case "obstacle_attacked":
                return `${nameOf(event.attackerId)} attacked obstacle (${event.hitsAfter})`;
            case "area_attacked":
                return `${nameOf(event.attackerId)} ${this.attackIcon(event.attackType, event.damage)} (${event.damage.amount})${this.killSuffix(event.damage)}`;
            case "spell_cast":
                // Single-target casts (Riot, Magic Mirror, …) carry the target so the log says on whom
                // (matching the sandbox engine text); mass casts (Mass Riot, …) have no single target and
                // read fine from the spell name.
                if (!event.targetId) {
                    return `${nameOf(event.casterId)} cast ${event.spellName}`;
                }
                return event.targetId === event.casterId
                    ? `${nameOf(event.casterId)} cast ${event.spellName} on themselves`
                    : `${nameOf(event.casterId)} cast ${event.spellName} on ${nameOf(event.targetId)}`;
            case "fight_finished":
                return event.winningTeam === TeamVals.NO_TEAM
                    ? "Fight finished! Draw!"
                    : `Fight finished! ${event.winningTeam === TeamVals.LOWER ? "Green" : "Red"} team wins!`;
            case "turn_completed":
            case "next_unit_selected":
                return undefined;
            default:
                return undefined;
        }
    }
    /**
     * Kill-count suffix (e.g. " 💀 3") for an attack's scene-log line. The ranked log is rebuilt from
     * events, so reconstruct the creatures killed from the damage breakdown: hits[] for
     * single/double-shot, splash[] for AOE (Cyclops' Large Caliber / Gargantuan's Area Throw).
     */
    private killSuffix(damage: IVisibleDamage): string {
        const killed =
            (damage.hits?.reduce((sum, hit) => sum + hit.unitsDied, 0) ?? 0) +
            (damage.splash?.reduce((sum, entry) => sum + entry.unitsDied, 0) ?? 0);
        return killed > 0 ? ` 💀 ${killed}` : "";
    }
    /**
     * Icon for an attack's scene-log line so the kind of strike reads at a glance: ⚔️ melee, 🏹
     * range, 💥 splash/AOE (Cyclops' Large Caliber range splash, Gargantuan's Area Throw). AOE is
     * detected via the per-unit splash breakdown so a splashing range shot reads as splash, not a
     * plain arrow.
     */
    private attackIcon(attackType: "melee" | "range" | "area_throw", damage: IVisibleDamage): string {
        if (damage.splash?.length || attackType === "area_throw") {
            return "💥";
        }
        return attackType === "range" ? "🏹" : "⚔️";
    }
    private attackTypeLabel(attackType: AttackType): string {
        if (attackType === AttackVals.RANGE) {
            return "range";
        }
        if (attackType === AttackVals.MAGIC || attackType === AttackVals.MELEE_MAGIC) {
            return "magic";
        }
        if (attackType === AttackVals.MELEE) {
            return "melee";
        }
        return "new";
    }
    /**
     * Ranked drives the Armageddon wave VFX from the authoritative journal (see
     * renderNewlyAppliedArmageddon), not inline from the engine events — the inline path doesn't fire
     * reliably here, which is why the wave's damage numbers never showed.
     */
    protected override shouldRenderArmageddonInline(): boolean {
        return false;
    }
    /**
     * Render the Armageddon wave's floating damage + screen shake from the authoritative snapshot's
     * journal. The wave's `armageddon_applied` events ride on a turn-ending action's journal entry; the
     * scene log already reads them from journalTail reliably, so we render the VFX from the same source.
     * Deduped by a per-game high-water sequence so each wave fires once and historical waves present on
     * (re)join aren't replayed.
     */
    private renderNewlyAppliedArmageddon(snapshot: AuthoritativeGameSnapshot): void {
        const journalTail = snapshot.journalTail;
        if (!journalTail?.length) {
            return;
        }
        const sorted = [...journalTail].sort((a, b) => a.sequence - b.sequence);
        const maxSequence = sorted[sorted.length - 1].sequence;
        // First snapshot for this game: set the baseline without replaying any historical waves.
        if (this.armageddonVfxGameId !== snapshot.gameId) {
            this.armageddonVfxGameId = snapshot.gameId;
            this.armageddonVfxSequence = maxSequence;
            return;
        }
        if (maxSequence <= this.armageddonVfxSequence) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const shakenWaves = new Set<number>();
        for (const entry of sorted) {
            if (entry.sequence <= this.armageddonVfxSequence) {
                continue;
            }
            for (const event of this.parseJournalEvents(entry)) {
                if (event.type !== "armageddon_applied") {
                    continue;
                }
                const unit = this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined;
                const pos = unit?.getVisualCenter(gs);
                if (pos && (event.damage > 0 || event.unitsDied > 0)) {
                    this.combatVisuals?.showFloatingDamage(pos, event.damage, undefined, event.unitsDied);
                }
                if (!shakenWaves.has(event.wave)) {
                    shakenWaves.add(event.wave);
                    this.triggerScreenShake(12 + event.wave * 3, 0.5);
                }
            }
        }
        this.armageddonVfxSequence = maxSequence;
    }
    /**
     * Spawn the "broken mirror" death shatter for any unit that just died, then tear its sprite down.
     * Detect alive→dead transitions by comparing the local board (units with live sprites) against the
     * authoritative snapshot: a unit we are still rendering that the snapshot reports dead/absent has just
     * died. getShatterInfo() returns null once visuals are gone, so a unit the action replay already
     * shattered + destroyed is skipped here — no double shatter. Only runs once the fight is underway.
     */
    private shatterNewlyDeadUnits(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted) {
            return;
        }
        const aliveById = new Map<string, number>();
        for (const u of snapshot.units) {
            aliveById.set(u.id, u.dead ? 0 : Math.max(0, Math.floor(u.amountAlive)));
        }
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const renderable = unit as RenderableUnit;
            const newAlive = aliveById.get(renderable.getId());
            // Still alive server-side → not a death.
            if (newAlive !== undefined && newAlive > 0) {
                continue;
            }
            // No live sprite (never shown, or the replay already shattered + tore it down) → nothing to do.
            const shatterInfo = renderable.getShatterInfo();
            if (!shatterInfo) {
                continue;
            }
            this.combatVisuals?.spawnShatter(shatterInfo);
            // Drop the dead unit's visuals now so the imminent rebuild/skip doesn't leave it on the board,
            // and so a repeated snapshot can't shatter it twice (getShatterInfo is null after this).
            renderable.destroyVisuals();
        }
    }
    /**
     * Reconcile each living unit's remaining stack stats (alive count, top-unit hp, dead count) to the
     * authoritative snapshot WITHOUT a destructive board rebuild. Replayed action events animate a hit
     * but never mutate the stack, and the skip-rebuild snapshot path would otherwise leave the count
     * frozen — so attack/retaliation damage must be applied here. Units that dropped to 0 are left to
     * the unit_destroyed/hydrate paths to remove.
     */
    private applyRankedUnitStats(units: SandboxSceneUnitState[]): void {
        let changed = false;
        for (const u of units) {
            const alive = Math.max(0, Math.floor(u.properties.amount_alive));
            if (alive <= 0) {
                continue;
            }
            const unit = this.unitsHolder.getAllUnits().get(u.properties.id) as RenderableUnit | undefined;
            if (!unit || unit.isDead()) {
                continue;
            }
            const hp = Math.max(0, Math.floor(u.properties.hp));
            if (unit.getAmountAlive() !== alive || unit.getHp() !== hp) {
                unit.setRemainingStats(alive, hp, u.properties.amount_died);
                changed = true;
            }
        }
        if (changed) {
            this.refreshUnits();
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private applyRankedFightStats(snapshot: AuthoritativeGameSnapshot, units: SandboxSceneUnitState[]): void {
        if (this.rankedStatsGameId && this.rankedStatsGameId !== snapshot.gameId) {
            this.resetRankedFightStats();
            this.clearFinishedVisibleState();
        }
        this.rankedStatsGameId = snapshot.gameId;

        if (!snapshot.fightStarted && !snapshot.fightFinished) {
            this.resetRankedFightStats();
            // A fresh game reached placement — drop any finished-overlay state left from the last fight
            // so it can't leak in (finishedByEngine below trusts hasFinished as a per-fight signal).
            this.clearFinishedVisibleState();
            return;
        }
        if (!this.sc_visibleState) {
            return;
        }

        const lap = Math.max(1, Math.floor(snapshot.currentLap || 1));
        this.ensureRankedFightStatsStarted();
        this.mergeRankedRoster(units);
        this.applyServerStartTotals(snapshot);
        this.sampleRankedFightStats(units, lap);

        // The fight is over if ANY authoritative signal says so:
        //   1. finishFight already ran from the fight_finished event (sc_visibleState.hasFinished) — this
        //      is the most reliable, and carries the authoritative winner (event.winningTeam) in teamWin;
        //   2. the snapshot's fightFinished flag / winner (inferRankedWinner);
        //   3. one team has no units left alive (winnerByAliveTotals) — covers servers that only emit the
        //      event without flagging the snapshot, and snapshots whose units already show the wipe.
        // Stale finished-state from a previous game is cleared on gameId change / placement (see top), so
        // hasFinished being set here only ever reflects the current fight.
        const finishedByEngine = !!this.sc_visibleState.hasFinished;
        let winner = this.inferRankedWinner(snapshot, units);
        if (winner === TeamVals.NO_TEAM && snapshot.fightStarted) {
            winner = this.winnerByAliveTotals(units);
        }
        if (winner === TeamVals.NO_TEAM && finishedByEngine) {
            const priorWinner = this.sc_visibleState.teamWin;
            if (priorWinner === TeamVals.LOWER || priorWinner === TeamVals.UPPER) {
                winner = priorWinner;
            }
        }
        const fightOver = winner !== TeamVals.NO_TEAM || finishedByEngine;
        const fightStats = this.buildRankedFightStats(winner, units, lap);
        // Mid-fight (no winner yet) we wait until the roster is captured before publishing stats. But
        // once the fight is OVER we must always publish the finished state — gating it on the start
        // totals could silently swallow the fight-results overlay if the roster snapshot was imperfect.
        if (!fightOver && (fightStats.lowerStartTotal <= 0 || fightStats.upperStartTotal <= 0)) {
            return;
        }

        this.sc_visibleState.hasFinished = fightOver;
        this.sc_visibleState.teamWin = winner !== TeamVals.NO_TEAM ? winner : undefined;
        this.sc_visibleState.fightStats = fightStats;
        this.sc_visibleState.lapNumber = fightStats.totalLaps;
        this.sc_visibleStateUpdateNeeded = true;
    }
    private inferRankedWinner(snapshot: AuthoritativeGameSnapshot, units: SandboxSceneUnitState[]): TeamType {
        if (!snapshot.fightFinished) {
            return TeamVals.NO_TEAM;
        }

        const finishedWinner = snapshot.winnerTeam as TeamType | undefined;
        if (finishedWinner === TeamVals.LOWER || finishedWinner === TeamVals.UPPER) {
            return finishedWinner;
        }

        return this.winnerByAliveTotals(units);
    }
    // The fight is decided once a team has no units left alive — derived purely from the snapshot, so it
    // holds even when the server only emits the fight_finished event without flagging the snapshot
    // (older servers): otherwise the results overlay never appears in ranked.
    private winnerByAliveTotals(units: SandboxSceneUnitState[]): TeamType {
        const lowerAlive = this.aliveTotal(units, TeamVals.LOWER as TeamType);
        const upperAlive = this.aliveTotal(units, TeamVals.UPPER as TeamType);
        if (lowerAlive > 0 && upperAlive <= 0) {
            return TeamVals.LOWER as TeamType;
        }
        if (upperAlive > 0 && lowerAlive <= 0) {
            return TeamVals.UPPER as TeamType;
        }
        return TeamVals.NO_TEAM;
    }
    private resetRankedFightStats(): void {
        this.rankedStatsGameId = "";
        this.rankedStatsStarted = false;
        this.rankedStatsLowerStartTotal = 0;
        this.rankedStatsUpperStartTotal = 0;
        this.rankedStatsLowerStartHealthTotal = 0;
        this.rankedStatsUpperStartHealthTotal = 0;
        this.rankedStatsLastLowerKilled = 0;
        this.rankedStatsLastUpperKilled = 0;
        this.rankedStatsLastLowerDamage = 0;
        this.rankedStatsLastUpperDamage = 0;
        this.rankedStatsSeries = [];
        this.rankedStatsLowerRoster.clear();
        this.rankedStatsUpperRoster.clear();
        this.rankedStatsCountedUnitIds.clear();
    }
    private clearFinishedVisibleState(): void {
        if (this.sc_visibleState?.hasFinished) {
            this.sc_visibleState.hasFinished = false;
            this.sc_visibleState.teamWin = undefined;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    /**
     * Prefer the server's authoritative fight-start army totals when present, overriding what we
     * captured locally. This makes casualty stats correct even when a team has been fully wiped and its
     * units are gone from the snapshot — e.g. a completed game loaded cold (the local capture would see
     * only the survivor's units), or a mid-fight join. Older servers omit these (0) and we keep the
     * locally-captured totals.
     */
    private applyServerStartTotals(snapshot: AuthoritativeGameSnapshot): void {
        if (snapshot.lowerStartUnits && snapshot.lowerStartUnits > 0) {
            this.rankedStatsLowerStartTotal = snapshot.lowerStartUnits;
        }
        if (snapshot.upperStartUnits && snapshot.upperStartUnits > 0) {
            this.rankedStatsUpperStartTotal = snapshot.upperStartUnits;
        }
        if (snapshot.lowerStartHealth && snapshot.lowerStartHealth > 0) {
            this.rankedStatsLowerStartHealthTotal = snapshot.lowerStartHealth;
        }
        if (snapshot.upperStartHealth && snapshot.upperStartHealth > 0) {
            this.rankedStatsUpperStartHealthTotal = snapshot.upperStartHealth;
        }
    }
    private ensureRankedFightStatsStarted(): void {
        if (this.rankedStatsStarted) {
            return;
        }

        this.rankedStatsLowerRoster.clear();
        this.rankedStatsUpperRoster.clear();
        this.rankedStatsCountedUnitIds.clear();
        this.rankedStatsLowerStartTotal = 0;
        this.rankedStatsUpperStartTotal = 0;
        this.rankedStatsLowerStartHealthTotal = 0;
        this.rankedStatsUpperStartHealthTotal = 0;
        this.rankedStatsLastLowerKilled = 0;
        this.rankedStatsLastUpperKilled = 0;
        this.rankedStatsLastLowerDamage = 0;
        this.rankedStatsLastUpperDamage = 0;
        this.rankedStatsSeries = [
            {
                lap: 1,
                lowerKilled: 0,
                upperKilled: 0,
                lowerKilledPct: 0,
                upperKilledPct: 0,
                lowerDamage: 0,
                upperDamage: 0,
                lowerDamagePct: 0,
                upperDamagePct: 0,
            },
        ];

        this.rankedStatsStarted = true;
    }
    /**
     * Fold every unit we can see into the casualty roster + start totals, cumulatively across snapshots
     * (each stack counted once via its id). A unit that dies is dropped from later snapshots, and a
     * cold-loaded / mid-joined client may never see the fight-start roster — capturing only at fight
     * start would then leave those units out of the FALLEN list. A stack's amount_alive + amount_died is
     * constant, so recording its total whenever we first see it is exact regardless of timing.
     */
    private mergeRankedRoster(units: SandboxSceneUnitState[]): void {
        for (const unit of units) {
            const id = unit.properties.id;
            if (!id || this.rankedStatsCountedUnitIds.has(id)) {
                continue;
            }
            const start = rankedUnitStartAmount(unit);
            if (start <= 0) {
                continue;
            }
            const roster =
                unit.team === TeamVals.LOWER
                    ? this.rankedStatsLowerRoster
                    : unit.team === TeamVals.UPPER
                      ? this.rankedStatsUpperRoster
                      : undefined;
            if (!roster) {
                continue;
            }
            this.rankedStatsCountedUnitIds.add(id);
            if (unit.team === TeamVals.LOWER) {
                this.rankedStatsLowerStartTotal += start;
                this.rankedStatsLowerStartHealthTotal += rankedUnitStartHealth(unit);
            } else {
                this.rankedStatsUpperStartTotal += start;
                this.rankedStatsUpperStartHealthTotal += rankedUnitStartHealth(unit);
            }
            const current = roster.get(unit.properties.name);
            if (current) {
                current.start += start;
            } else {
                roster.set(unit.properties.name, {
                    smallTextureName: unit.properties.small_texture_name,
                    start,
                });
            }
        }
    }
    private sampleRankedFightStats(units: SandboxSceneUnitState[], lap: number): boolean {
        if (!this.rankedStatsStarted) {
            return false;
        }

        const lowerKilled = Math.max(
            0,
            this.rankedStatsLowerStartTotal - this.aliveTotal(units, TeamVals.LOWER as TeamType),
        );
        const upperKilled = Math.max(
            0,
            this.rankedStatsUpperStartTotal - this.aliveTotal(units, TeamVals.UPPER as TeamType),
        );
        const lowerDamage = Math.max(
            0,
            this.rankedStatsLowerStartHealthTotal - this.aliveHealthTotal(units, TeamVals.LOWER as TeamType),
        );
        const upperDamage = Math.max(
            0,
            this.rankedStatsUpperStartHealthTotal - this.aliveHealthTotal(units, TeamVals.UPPER as TeamType),
        );
        if (
            lowerKilled === this.rankedStatsLastLowerKilled &&
            upperKilled === this.rankedStatsLastUpperKilled &&
            lowerDamage === this.rankedStatsLastLowerDamage &&
            upperDamage === this.rankedStatsLastUpperDamage
        ) {
            return false;
        }

        this.rankedStatsLastLowerKilled = lowerKilled;
        this.rankedStatsLastUpperKilled = upperKilled;
        this.rankedStatsLastLowerDamage = lowerDamage;
        this.rankedStatsLastUpperDamage = upperDamage;
        this.rankedStatsSeries.push({
            lap,
            lowerKilled,
            upperKilled,
            lowerKilledPct: this.percent(lowerKilled, this.rankedStatsLowerStartTotal),
            upperKilledPct: this.percent(upperKilled, this.rankedStatsUpperStartTotal),
            lowerDamage,
            upperDamage,
            lowerDamagePct: this.percent(lowerDamage, this.rankedStatsLowerStartHealthTotal),
            upperDamagePct: this.percent(upperDamage, this.rankedStatsUpperStartHealthTotal),
        });
        return true;
    }
    private buildRankedFightStats(winner: TeamType, units: SandboxSceneUnitState[], lap: number): IFightStatsReport {
        return {
            winner,
            series: this.rankedStatsSeries.slice(),
            lowerDeaths: this.buildRankedDeathEntries(this.rankedStatsLowerRoster, units, TeamVals.LOWER as TeamType),
            upperDeaths: this.buildRankedDeathEntries(this.rankedStatsUpperRoster, units, TeamVals.UPPER as TeamType),
            lowerStartTotal: this.rankedStatsLowerStartTotal,
            upperStartTotal: this.rankedStatsUpperStartTotal,
            lowerKilledTotal: this.rankedStatsLastLowerKilled,
            upperKilledTotal: this.rankedStatsLastUpperKilled,
            lowerHealthTotal: this.rankedStatsLowerStartHealthTotal,
            upperHealthTotal: this.rankedStatsUpperStartHealthTotal,
            lowerDamageTotal: this.rankedStatsLastLowerDamage,
            upperDamageTotal: this.rankedStatsLastUpperDamage,
            totalLaps: lap,
        };
    }
    private buildRankedDeathEntries(
        roster: ReadonlyMap<string, RankedFightRosterEntry>,
        units: SandboxSceneUnitState[],
        team: TeamType,
    ): IFightDeathEntry[] {
        const aliveByName = new Map<string, number>();
        for (const unit of units) {
            if (unit.team !== team) {
                continue;
            }
            const alive = Math.max(0, Math.floor(unit.properties.amount_alive));
            aliveByName.set(unit.properties.name, (aliveByName.get(unit.properties.name) ?? 0) + alive);
        }

        const deaths: IFightDeathEntry[] = [];
        for (const [name, entry] of roster) {
            const died = Math.max(0, entry.start - (aliveByName.get(name) ?? 0));
            if (died <= 0) {
                continue;
            }
            deaths.push({ name, smallTextureName: entry.smallTextureName, died, start: entry.start, team });
        }
        return deaths.sort((a, b) => b.died - a.died);
    }
    private aliveTotal(units: SandboxSceneUnitState[], team: TeamType): number {
        return units
            .filter((unit) => unit.team === team)
            .reduce((sum, unit) => sum + Math.max(0, Math.floor(unit.properties.amount_alive)), 0);
    }
    private aliveHealthTotal(units: SandboxSceneUnitState[], team: TeamType): number {
        return units.filter((unit) => unit.team === team).reduce((sum, unit) => sum + rankedUnitAliveHealth(unit), 0);
    }
    private percent(value: number, total: number): number {
        if (total <= 0) {
            return 0;
        }
        return Math.round((value / total) * 1000) / 10;
    }
    protected override shouldDeferActionToAuthoritativeReplay(action: GameAction): boolean {
        if (this.isPlayingAuthoritativeReplay()) {
            return false;
        }

        switch (action.type) {
            case "move_unit":
            case "melee_attack":
            case "range_attack":
            case "cast_spell":
            case "obstacle_attack":
            case "area_throw_attack":
                return true;
            default:
                return false;
        }
    }
    protected override createActionEngine(): SceneActionEngine {
        return {
            apply: (action: GameAction) => {
                // While replaying an authoritative record, engine-based replays (cast_spell,
                // area_throw, obstacle_attack, start_fight) call createActionEngine().apply to re-run
                // the action. That must apply LOCALLY — never dispatch to the transport. Re-sending an
                // already-authoritative action double-submits it (the server rejects it as the caster's
                // turn has passed) and, worse, the submit awaits the same authoritative-playback queue
                // we're currently inside, self-deadlocking the replay and freezing the board. Apply via
                // the local engine; the next snapshot reconciles any RNG drift in amounts.
                if (this.isPlayingAuthoritativeReplay()) {
                    return super.createActionEngine().apply(action);
                }
                const result = this.dispatchExternalGameAction(action);
                if (!result.handled) {
                    return {
                        completed: false,
                        events: [],
                        message: "Ranked transport is not connected",
                        rejectionReason: "unsupported_action",
                    };
                }
                // Transport messages here are transient control-flow notices (e.g. "Opponent turn is
                // controlled by the opponent", observer/waiting states), not game events. The ranked
                // scene log is rebuilt from the authoritative journal, so pushing these would spam it
                // (and the local driver retries opponent turns, duplicating each line). Surface the
                // message through the return value for the UI instead of the fight log.
                // A successful turn-ending own action (attack/spell — never a bare move, which keeps the
                // unit active to still strike) opens the handoff window: suppress the finished unit's
                // pulse from the moment of submission until the next authoritative snapshot syncs the
                // active unit, so it never flashes back on at the old position. The snapshot clears the
                // flag — and for a multi-action own unit (e.g. Double Shot mid-volley) it reactivates
                // the same unit, restoring its pulse for the viewer to aim the next shot.
                if (result.completed && TURN_ENDING_ACTION_TYPES.has(action.type)) {
                    this.awaitingTurnHandoff = true;
                }
                let events: GameEvent[] = [];
                if (result.completed && (action.type === "place_unit" || action.type === "select_attack_type")) {
                    const localResult = super.createActionEngine().apply(action);
                    if (!localResult.completed) {
                        return localResult;
                    }
                    events = localResult.events;
                }
                return {
                    completed: result.completed,
                    events,
                    message: result.message,
                };
            },
        };
    }
    private createPlacementUnitIdsKey(snapshot: AuthoritativeGameSnapshot): string {
        // Must include each unit's placement state — not just its id — otherwise unplacing a unit
        // (placed: true -> false) leaves the key unchanged, canSkipPreFightHydrate short-circuits,
        // and the unit never returns to the bench overlay (UNPLACE_UNIT looks like it "does nothing").
        return snapshot.units
            .map(
                (unit) =>
                    `${unit.id}:${unit.placed ? 1 : 0}:${unit.cells.map((cell) => `${cell.x},${cell.y}`).join("-")}`,
            )
            .sort()
            .join("|");
    }
    private isAuthoritativeSnapshot(value: unknown): value is AuthoritativeGameSnapshot {
        return (
            !!value &&
            typeof value === "object" &&
            typeof (value as AuthoritativeGameSnapshot).gameId === "string" &&
            Array.isArray((value as AuthoritativeGameSnapshot).units)
        );
    }
    private rememberPlacementStates(snapshot: AuthoritativeGameSnapshot): void {
        this.lastPlacementStateByUnitId.clear();
        if (snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }
        for (const unit of snapshot.units) {
            this.lastPlacementStateByUnitId.set(unit.id, this.placementStateKey(unit));
        }
    }
    private hasVisibleOpponentPlacementChange(snapshot: AuthoritativeGameSnapshot): boolean {
        if (snapshot.fightStarted || snapshot.fightFinished || this.viewerTeam === undefined) {
            return false;
        }
        for (const unit of snapshot.units) {
            if (unit.team === this.viewerTeam || !isKnownPlacementOpponentUnit(unit)) {
                continue;
            }
            if (this.lastPlacementStateByUnitId.get(unit.id) !== this.placementStateKey(unit)) {
                return true;
            }
        }
        return false;
    }
    private placementStateKey(unit: AuthoritativeUnitState): string {
        const cells = unit.cells.map((cell) => `${cell.x}:${cell.y}`).join(",");
        return `${unit.team}|${unit.name}|${unit.creatureId}|${unit.placed ? 1 : 0}|${unit.dead ? 1 : 0}|${unit.amountAlive}|${cells}`;
    }
    /**
     * Force each Disguise-Aura bearer's "Hidden" buff to match the authoritative snapshot. The client
     * recomputes Hidden locally (refreshStackPowerForAllUnits, position-based), but that recompute can
     * diverge from the ranked server's (aura-range / synergy state), leaving a unit Visible on our board
     * while the server has it Hidden — the AI then fires a melee the server rejects as
     * attack_not_available. The snapshot carries the server's authoritative buff list, so we trust it
     * here and only ever touch units that actually carry the Disguise Aura.
     */
    // Authoritative sets of the position-dependent AURA gates from the last snapshot: units the SERVER
    // has Hidden (Disguise, untargetable) and units it has inside a Range Null Field (ranged-disabled).
    // The client recomputes these locally (refreshStackPowerForAllUnits, re-run after each AI action via
    // refreshUnits) and can diverge, so we cache the server truth and re-assert it both on every snapshot
    // AND right before the AI picks a target (ensureAuthoritativeAuraState) — otherwise a local recompute
    // between snapshot and decision wipes the gate and the AI proposes an engine-rejected attack.
    private authoritativeHiddenIds = new Set<string>();
    private authoritativeRangeNullIds = new Set<string>();
    private reconcileAuraEffectsFromSnapshot(snapshot: AuthoritativeGameSnapshot): void {
        this.authoritativeHiddenIds = new Set(
            snapshot.units.filter((u) => (u.buffs ?? []).includes("Hidden")).map((u) => u.id),
        );
        this.authoritativeRangeNullIds = new Set(
            snapshot.units.filter((u) => (u.debuffs ?? []).includes("Range Null Field Aura")).map((u) => u.id),
        );
        // Sync each unit's "already retaliated this lap" flag from the server so the ranked respond tag
        // reflects real retaliations (the client's FightProperties replied state isn't authoritative in
        // ranked). shouldShowRespondTag reads this per-unit flag.
        const unitsById = this.unitsHolder.getAllUnits();
        for (const snapUnit of snapshot.units) {
            unitsById.get(snapUnit.id)?.setResponded(snapUnit.responded ?? false);
            // Same idea for the once-per-lap hourglass (wait): the Wait button disables on a unit that
            // already used its hourglass this lap. The client's FightProperties hourglass set isn't
            // authoritative in ranked, so drive it off the per-unit flag synced from the snapshot.
            (unitsById.get(snapUnit.id) as RenderableUnit | undefined)?.setHasHourglassed(
                snapUnit.hasHourglassed ?? false,
            );
        }
        this.applyAuthoritativeAuraState();
    }
    /**
     * Force each unit's Hidden buff / Range Null Field debuff to match the last authoritative snapshot.
     * Called on every snapshot and again right before every AI decision (via ensureAuthoritativeAuraState)
     * so a local aura recompute can't leave the gate stale when the AI chooses a target.
     */
    private applyAuthoritativeAuraState(): void {
        for (const [id, unit] of this.unitsHolder.getAllUnits()) {
            const hidden = this.authoritativeHiddenIds.has(id);
            if (hidden !== unit.hasBuffActive("Hidden")) {
                if (hidden) {
                    unit.deleteDebuff("Visible");
                    unit.applyBuff(
                        new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Hidden"), amount: 1 }),
                    );
                } else {
                    unit.deleteBuff("Hidden");
                }
            }
            const rangeNull = this.authoritativeRangeNullIds.has(id);
            if (rangeNull !== unit.hasDebuffActive("Range Null Field Aura")) {
                if (rangeNull) {
                    unit.applyAuraEffect("Range Null Field Aura", "", false, 0, "");
                } else {
                    unit.deleteDebuff("Range Null Field Aura");
                }
            }
        }
    }
    protected override ensureAuthoritativeAuraState(): void {
        this.applyAuthoritativeAuraState();
    }
    private createBoardSignature(snapshot: AuthoritativeGameSnapshot): string {
        return JSON.stringify({
            phase: snapshot.phase,
            gridType: snapshot.gridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId,
            currentTurnTeam: snapshot.currentTurnTeam,
            narrowingLayers: snapshot.narrowingLayers,
            centerDried: snapshot.centerDried,
            viewerTeam: snapshot.viewerTeam,
            winnerTeam: snapshot.winnerTeam,
            upNext: snapshot.upNext ?? [],
            units: snapshot.units.map((unit) => ({
                id: unit.id,
                team: unit.team,
                name: unit.name,
                creatureId: unit.creatureId,
                amountAlive: unit.amountAlive,
                amountDied: unit.amountDied,
                hp: unit.hp,
                maxHp: unit.maxHp,
                attackType: unit.attackType,
                baseCell: unit.baseCell,
                cells: unit.cells,
                dead: unit.dead,
                placed: unit.placed,
                stackPower: unit.stackPower,
            })),
        });
    }
}
