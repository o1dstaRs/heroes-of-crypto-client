import {
    allFactions,
    AttackVals,
    getFactionOf,
    HoCConfig,
    TeamVals,
    ToFactionName,
    type AttackType,
    type CreatureId,
    type GameAction,
    type GameEvent,
    type GridType,
    type HoCMath,
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
                if (u) this.combatVisuals?.showFloatingDamage(u.getPosition(), event.damage, undefined, event.unitsDied);
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
    protected override getUpNextUnitIds(): string[] | undefined {
        return this.upNextUnitIds;
    }
    private applyRankedSnapshotMetadata(snapshot: AuthoritativeGameSnapshot): void {
        this.viewerTeam = snapshot.viewerTeam === undefined ? undefined : (snapshot.viewerTeam as TeamType);
        this.setLocalModelTeamOverride(
            snapshot.localModelTeam === undefined ? undefined : (snapshot.localModelTeam as TeamType),
        );
        if (snapshot.gameId !== this.authoritativePlaybackGameId) {
            this.authoritativePlaybackGameId = snapshot.gameId;
            this.playedAuthoritativeActionSequences.clear();
        }
        this.upNextUnitIds = [...(snapshot.upNext ?? [])];
    }
    private syncRankedVisibleTurnState(snapshot: AuthoritativeGameSnapshot): void {
        if (!snapshot.fightStarted || snapshot.fightFinished) {
            return;
        }

        this.syncAuthoritativeActiveUnit(snapshot.currentUnitId || undefined, snapshot.currentLap);
    }
    public override applyAuthoritativeSnapshot(
        snapshot: AuthoritativeGameSnapshot,
        options?: AuthoritativeSnapshotOptions,
    ): void {
        const boardSignature = this.createBoardSignature(snapshot);
        if (snapshot.latestSequence < this.lastAuthoritativeSequence) {
            return;
        }
        this.applyRankedTimer(snapshot);
        this.applyAuthoritativeSceneLog(snapshot);
        this.lastAuthoritativeSequence = snapshot.latestSequence;
        this.applyRankedSnapshotMetadata(snapshot);
        const state = authoritativeSnapshotToSandboxSceneState(snapshot, { hideOpponentPlacements: true });
        if (boardSignature === this.lastBoardSignature) {
            this.syncRankedVisibleTurnState(snapshot);
            this.applyRankedFightStats(snapshot, state.units);
            return;
        }

        // If the caller already animated + applied this snapshot's board changes by playing
        // the matching authoritative action record, skip the destructive full rebuild.
        // hydrateSceneState destroys and recreates every unit, which restarts their idle/move
        // animations — the "re-animates / starts over" glitch. Records already moved units and
        // applied mechanics, so the snapshot's board is redundant here; we only refresh the
        // turn queue / visible state.
        const skipBoardRebuild = !!options?.skipBoardRebuild && snapshot.fightStarted && !snapshot.fightFinished;
        if (skipBoardRebuild) {
            this.lastBoardSignature = boardSignature;
            this.syncRankedVisibleTurnState(snapshot);
            if (this.sc_visibleState) {
                this.sc_visibleState.lapNumber = Math.max(snapshot.currentLap || 0, 0);
                this.sc_visibleStateUpdateNeeded = true;
            }
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
    protected override shouldPlayReplayDoubleShotProjectile(): boolean {
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
        return super.playAuthoritativeActionRecord(action, events, replayStateAfter);
    }
    protected override shouldRenderUnplacedUnitBench(unitState: SandboxSceneUnitState): boolean {
        return this.viewerTeam !== undefined && unitState.team === this.viewerTeam;
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
        if (!gameChanged && maxSequence <= this.rankedSceneLogSequence) {
            return;
        }

        this.rankedSceneLogGameId = snapshot.gameId;
        this.rankedSceneLogSequence = maxSequence;
        const unitNames = new Map(snapshot.units.map((unit) => [unit.id, unit.name]));
        const lines = this.buildAuthoritativeSceneLogLines(journalTail, unitNames);

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
            for (const event of events) {
                const line = this.eventToSceneLogLine(event, unitNames);
                if (line) {
                    lines.push(line);
                }
            }
        }
        return lines;
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
                return `${nameOf(event.attackerId)} attk ${nameOf(event.targetId)} (${event.damage.amount})`;
            case "obstacle_attacked":
                return `${nameOf(event.attackerId)} attacked obstacle (${event.hitsAfter})`;
            case "area_attacked":
                return `${nameOf(event.attackerId)} area attk (${event.damage.amount})`;
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
                if (result.message) {
                    this.sc_sceneLog.updateLog(result.message);
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
        return snapshot.units
            .map((unit) => unit.id)
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
