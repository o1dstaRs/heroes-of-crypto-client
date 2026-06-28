import {
    allFactions,
    AttackVals,
    getFactionOf,
    GridMath,
    HoCConfig,
    SpellHelper,
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
import type { RenderableUnit } from "./RenderableUnit";
import type { UnitsOverlay } from "./UnitsOverlay";
import type { AuthoritativeSnapshotOptions } from "../pixi/PixiScene";

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
                "",
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
                // The server (running the common engine) computes morale and speed authoritatively and
                // ships them in the snapshot; carry them through instead of falling back to the base
                // creature config. These survive the client's adjustBaseStats recompute because it
                // preserves initialUnitProperties.morale/speed (synergy bonus is re-derived on top).
                morale: unitState.morale,
                speed: unitState.speed || baseProperties.speed,
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
    private viewerTeam?: TeamType;
    private upNextUnitIds?: string[];
    // Per-unit set of currently-active debuff names, tracked across snapshots so we can pop a "nice"
    // icon + name animation the moment a new debuff lands (e.g. Beholder's Spit Ball). Keyed by unit
    // id (survives unit rebuilds); seeded silently on first sight so reconnects don't burst.
    private readonly unitDebuffs = new Map<string, Set<string>>();
    // True between an authoritative action's animation finishing and the next snapshot reassigning the
    // active unit — keeps the just-finished unit's pulse aura suppressed across that gap (no flicker).
    private awaitingTurnHandoff = false;
    // True once the VIEWER's own active unit has submitted a turn-ending action (any attack/spell — a
    // bare move keeps the unit active so it can still strike). Mirrors the enemy-side handoff guard:
    // the server may keep reporting the same own unit as "active" for a beat before the turn changes
    // hands, and its pulse must stay suppressed through that beat instead of flashing back on.
    private ownTurnEnded = false;
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
        const attacker = this.unitsHolder.getAllUnits().get(attackerId) as RenderableUnit | undefined;
        const attackerPos = attacker?.getPosition();
        for (const entry of splash) {
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const pos = unit?.getPosition() ?? entry.position;
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
    protected override getUpNextUnitIds(): string[] | undefined {
        return this.upNextUnitIds;
    }
    /**
     * Diff each unit's active debuffs against the previously-seen set and pop a nice icon + name
     * over any unit that just gained one (e.g. Beholder's Spit Ball landing Sadness / Quagmire /
     * Weakness). A unit's debuffs are seeded silently the first time we see it — and only during the
     * fight — so joining/reconnecting mid-game doesn't burst every existing debuff at once.
     */
    private processDebuffPops(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }
        const seen = new Set<string>();
        for (const unitState of snapshot.units) {
            seen.add(unitState.id);
            const current = new Set((unitState.debuffs ?? []).filter(Boolean));
            const previous = this.unitDebuffs.get(unitState.id);
            this.unitDebuffs.set(unitState.id, current);
            if (!previous) {
                continue; // First time we've seen this unit — seed without animating.
            }
            const unit = this.unitsHolder.getAllUnits().get(unitState.id) as RenderableUnit | undefined;
            if (!unit || unit.isDead()) {
                continue;
            }
            let stackIndex = 0;
            for (const debuffName of current) {
                if (!previous.has(debuffName)) {
                    this.spawnDebuffPop(unit, debuffName, stackIndex++);
                }
            }
        }
        for (const id of [...this.unitDebuffs.keys()]) {
            if (!seen.has(id)) {
                this.unitDebuffs.delete(id);
            }
        }
    }
    private spawnDebuffPop(unit: RenderableUnit, debuffName: string, stackIndex: number): void {
        const [iconTextureName] = SpellHelper.spellToTextureNames(debuffName);
        const iconTexture = this.texAny(iconTextureName);
        if (!iconTexture) {
            return;
        }
        this.combatVisuals?.spawnDebuffPop(unit.getPosition(), iconTexture, debuffName, stackIndex);
    }
    private applyRankedSnapshotMetadata(snapshot: AuthoritativeGameSnapshot): void {
        this.viewerTeam = snapshot.viewerTeam === undefined ? undefined : (snapshot.viewerTeam as TeamType);
        this.setLocalModelTeamOverride(
            snapshot.localModelTeam === undefined ? undefined : (snapshot.localModelTeam as TeamType),
        );
        if (snapshot.gameId !== this.authoritativePlaybackGameId) {
            this.authoritativePlaybackGameId = snapshot.gameId;
            this.playedAuthoritativeActionSequences.clear();
            this.unitDebuffs.clear();
        }
        this.upNextUnitIds = [...(snapshot.upNext ?? [])];
    }
    private syncRankedVisibleTurnState(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }

        const newActiveId = snapshot.currentUnitId || undefined;
        // Right after an action the server may reassert the SAME unit as still-active (e.g. it moved
        // and could still attack) before the turn actually changes hands. Re-running activation here
        // would flash that unit's pulse + selection back on for the frames before a different unit
        // takes over. Keep the handoff suppression on and skip reactivation until a different unit
        // becomes active — for the opponent's unit always, and for the viewer's OWN unit once it has
        // submitted a turn-ending action (ownTurnEnded). A bare own move leaves ownTurnEnded false so
        // the unit still reactivates and the viewer can continue it (move-then-attack).
        if (
            this.awaitingTurnHandoff &&
            newActiveId !== undefined &&
            newActiveId === this.getCurrentActiveUnit()?.getId() &&
            (this.isEnemyActiveTurn() || this.ownTurnEnded)
        ) {
            return;
        }

        // The turn has now been authoritatively handed over (active unit synced below), so end the
        // post-action aura suppression. This runs synchronously with the reassignment, so the aura
        // switches straight from the old unit (off) to the new one with no flash in between.
        this.awaitingTurnHandoff = false;
        this.ownTurnEnded = false;
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
        // Pop an icon + name over any unit that just gained a debuff. Runs before the early-return
        // board-sync paths so it fires whether or not the board itself is rebuilt this snapshot.
        this.processDebuffPops(snapshot);
        // Map narrowing is authoritative snapshot state. Reconcile it on every snapshot (idempotent)
        // so the holes render even when the board rebuild that would normally draw them is skipped.
        this.applyAuthoritativeNarrowing(snapshot.narrowingLayers);
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
            // A replayed action animates the hit but its EVENTS don't mutate the stack counts — apply
            // the authoritative remaining amounts/hp here so attack and retaliation damage actually
            // updates each unit's stack on the board (otherwise it stays frozen at the pre-hit count).
            this.applyRankedUnitStats(state.units);
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
        return this.viewerTeam !== undefined && unit.getTeam() !== this.viewerTeam;
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
            }
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
    /** Green/red marker for the acting unit's team (LOWER = green, UPPER = red). */
    private logTeamFlag(unitId: string): string {
        const team = this.rankedUnitTeamsById.get(unitId);
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
            case "unit_summoned":
                return `${nameOf(event.casterId)} summoned ${event.amount} x ${event.unitName}`;
            case "unit_attacked":
                return `${nameOf(event.attackerId)} ${this.attackIcon(event.attackType, event.damage)} ${nameOf(event.targetId)} (${event.damage.amount})${this.killSuffix(event.damage)}`;
            case "obstacle_attacked":
                return `${nameOf(event.attackerId)} attacked obstacle (${event.hitsAfter})`;
            case "area_attacked":
                return `${nameOf(event.attackerId)} ${this.attackIcon(event.attackType, event.damage)} (${event.damage.amount})${this.killSuffix(event.damage)}`;
            case "spell_cast":
                return `${nameOf(event.casterId)} cast ${event.spellName}`;
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
            const unit = this.unitsHolder.getAllUnits().get(u.properties.id);
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
        }
        this.rankedStatsGameId = snapshot.gameId;

        if (!snapshot.fightStarted && !snapshot.fightFinished) {
            this.resetRankedFightStats();
            return;
        }
        if (!this.sc_visibleState) {
            return;
        }

        const lap = Math.max(1, Math.floor(snapshot.currentLap || 1));
        this.ensureRankedFightStatsStarted(units);
        this.sampleRankedFightStats(units, lap);

        const winner = this.inferRankedWinner(snapshot, units);
        const fightStats = this.buildRankedFightStats(winner, units, lap);
        if (fightStats.lowerStartTotal <= 0 || fightStats.upperStartTotal <= 0) {
            return;
        }

        this.sc_visibleState.hasFinished = winner !== TeamVals.NO_TEAM;
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
    }
    private ensureRankedFightStatsStarted(units: SandboxSceneUnitState[]): void {
        if (this.rankedStatsStarted) {
            return;
        }

        this.rankedStatsLowerRoster.clear();
        this.rankedStatsUpperRoster.clear();
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

        for (const unit of units) {
            const start = rankedUnitStartAmount(unit);
            const startHealth = rankedUnitStartHealth(unit);
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
            if (unit.team === TeamVals.LOWER) {
                this.rankedStatsLowerStartTotal += start;
                this.rankedStatsLowerStartHealthTotal += startHealth;
            } else {
                this.rankedStatsUpperStartTotal += start;
                this.rankedStatsUpperStartHealthTotal += startHealth;
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

        this.rankedStatsStarted = true;
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
                // unit active to still strike) opens the handoff window immediately: suppress the
                // finished unit's pulse from the moment of submission until a DIFFERENT unit is
                // authoritatively activated, so it never flashes back on at the old position or during
                // the brief same-unit reassertion the server emits right before the turn changes hands.
                if (result.completed) {
                    if (TURN_ENDING_ACTION_TYPES.has(action.type)) {
                        this.awaitingTurnHandoff = true;
                        this.ownTurnEnded = true;
                    } else if (action.type === "move_unit") {
                        this.ownTurnEnded = false;
                    }
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
