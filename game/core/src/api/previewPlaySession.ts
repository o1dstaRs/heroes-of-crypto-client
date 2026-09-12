/*
 * BACKEND-FREE RANKED PLAY SESSION (preview only).
 *
 * The ranked pre-fight placement screen is the one screen that cannot be posed from props: RankedGameView
 * draws it from a server-authoritative PlaySnapshot, and every board action round-trips through the play
 * API. So instead of faking the VIEW, this fakes the SERVER — one in-memory game, served only for the
 * reserved preview game id, holding a placement-phase snapshot and applying the handful of actions the
 * placement screen can produce (place / unplace / lock in / augment / synergy). Everything else is
 * accepted and ignored: this session never starts a fight, and there is no turn engine behind it.
 *
 * The client stays honest — the same fetch, the same actions, the same snapshot pipeline — so what the
 * preview shows is the real screen, not a mock-up of it. Reached at /preview/placement; see
 * ui/PlacementStepPreview.tsx.
 */
import {
    GridConstants,
    GridSettings,
    GridVals,
    HoCConfig,
    Doctrine,
    GridMath,
    PlacementPositionType,
    RectanglePlacement,
    TeamType,
    TeamVals,
    ToFactionName,
    getFactionOf,
    type CreatureId,
} from "@heroesofcrypto/common";

import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import {
    PlayActionType,
    PlayPhase,
    type PlayAction,
    type PlayActionResponse,
    type PlayCell,
    type PlaySnapshot,
    type PlayUnitState,
} from "./play_protocol";

/** The one game id this fake session answers for. Anything else goes to the real API untouched. */
export const PREVIEW_PLACEMENT_GAME_ID = "preview-placement";

export const PREVIEW_LEFT_PLAYER_ID = "preview-player-lower";
export const PREVIEW_RIGHT_PLAYER_ID = "preview-player-upper";

export const isPreviewPlayGame = (gameId: string): boolean => gameId === PREVIEW_PLACEMENT_GAME_ID;

// Stack sizes, mirroring the server's pick->play bridge: a stack is worth ~1000 experience, and a
// creature the config has no exp for falls back to a flat ten.
const STACK_EXPERIENCE = 1000;
const FALLBACK_AMOUNT = 10;

// Two full drafted armies in the [L1, L1, L2, L2, L3, L4] shape a finished draft produces. The lower
// side matches the army the augment preview shows, so walking /preview/augments -> /preview/placement
// reads as one match.
const LEFT_ARMY = [12, 33, 24, 51, 17, 40];
const RIGHT_ARMY = [1, 21, 4, 34, 27, 42];

const PLACEMENT_SECONDS = 120;

/** Long-bodied comparison art spans two cells even while the stable engine catalog remains one-cell. */
const HORIZONTAL_COMPARISON_FOOTPRINTS = new Set(["Wolf", "Centaur", "Wolf Rider", "Nomad"]);

/** The left team's committed augment build: 2 + 2 + 1 + 1 = the Scout doctrine's whole 6-point budget. */
const LEFT_AUGMENTS = { placement: 2, armor: 2, might: 1, empower: 0, sniper: 0, movement: 1 } as const;

export interface PreviewPlacementOptions {
    /** Which seat the viewer holds. The other side is the opponent, redacted exactly as the server does. */
    userTeam: TeamType;
    /** GridVals.* — the map the board is drawn on. */
    gridType: number;
    /** Optional dev-fixture rosters; the regular placement preview keeps its canonical six stacks. */
    leftArmy?: readonly number[];
    rightArmy?: readonly number[];
    /** Lower/upper aliases used by side-neutral dev editors while left/right callers are migrated. */
    lowerArmy?: readonly number[];
    upperArmy?: readonly number[];
    /** Dev comparison views can align a large left roster along the board's bottom edge. */
    spreadLeftArmyAcrossBoard?: boolean;
    /** Lower-team alias for spreadLeftArmyAcrossBoard. */
    spreadLowerArmyAcrossBoard?: boolean;
    /** Consecutive group sizes for horizontal rows (the framing editor uses one row per level). */
    comparisonRowSizes?: readonly number[];
    /** Optional exact ground row for each comparison row; shadow tuning pins its selected unit at the top. */
    comparisonRowGroundYs?: readonly number[];
    /** Place every comparison unit on its own highest legal gameplay row, accounting for footprint height. */
    comparisonAlignToTopPlayableRow?: boolean;
    /** When set, comparison units are packed left-to-right with this many empty cells between footprints. */
    comparisonHorizontalGapCells?: number;
    /** Preserve this many fixed horizontal slots, including empty lowerArmy entries such as 0. */
    comparisonFixedSlotCount?: number;
}

// The footprint pair used to live here, because the wire type had no shape beyond the scalar `size`. It
// is part of PlayUnitState now, so the preview and the real ranked path share one geometry contract and
// only the layout bookkeeping stays local.
type PreviewUnitState = PlayUnitState & {
    previewSlotIndex: number;
};

const buildUnit = (creatureId: number, team: TeamType, index: number): PreviewUnitState | undefined => {
    const name = UNIT_ID_TO_NAME[creatureId];
    if (!name) {
        return undefined;
    }
    const factionName = ToFactionName[getFactionOf(creatureId as CreatureId)];
    const textureName = unitToTextureName(name, TextureType.LARGE);
    let amount = FALLBACK_AMOUNT;
    try {
        // One probe stack to read the creature's experience, then the real one: the stack size feeds
        // stack_power and the derived stats, so it cannot be filled in afterwards.
        const probe = HoCConfig.getCreatureConfig(team, factionName, name, textureName, 1);
        if (probe.exp > 0) {
            amount = Math.max(1, Math.ceil(STACK_EXPERIENCE / probe.exp));
        }
    } catch {
        return undefined;
    }

    const properties = HoCConfig.getCreatureConfig(team, factionName, name, textureName, amount);
    return {
        id: `preview-${team === TeamVals.LEFT ? "left" : "right"}-${index}-${creatureId}`,
        team,
        name,
        creatureId,
        amountAlive: amount,
        amountDied: 0,
        hp: properties.hp,
        maxHp: properties.max_hp,
        attackType: properties.attack_type_selected,
        size: properties.size,
        footprintWidth: HORIZONTAL_COMPARISON_FOOTPRINTS.has(name) ? 2 : properties.footprint_width,
        footprintHeight: properties.footprint_height,
        previewSlotIndex: index,
        // Deployed by deployTeam() below, before the snapshot is ever served.
        baseCell: { x: 0, y: 0 },
        cells: [],
        initiative: properties.initiative,
        morale: properties.morale,
        dead: false,
        placed: false,
        stackPower: properties.stack_power,
        rangeShots: properties.range_shots + 1,
        luck: properties.luck,
        onHourglass: false,
        webMovementLocked: false,
        spellEntriesAuthoritative: false,
    };
};

const GRID = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

/** Placement-zone depth per Placement augment level (the radio labels: 3 partial, 4 full, 6 + edge). */
const PLACEMENT_ZONE_DEPTH = [3, 4, 6];

const cellKey = (cell: PlayCell): number => (cell.x << 4) | cell.y;

/**
 * A fixed rectangular footprint hangs down-left of its max-corner base cell and never rotates. The engine
 * owns that rule (GridMath.getFootprintCellsForAnchor) and the preview must not hold a second copy of it:
 * a divergence here would move the preview's units off the cells a real session would give them.
 */
const footprintOf = (base: PlayCell, width: number, height: number): PlayCell[] =>
    GridMath.getFootprintCellsForAnchor(base, width, height);

/**
 * Deploy a team inside its placement zone, because that is the state a real placement screen opens in:
 * the server auto-places both armies when the session is created (play_session.autoPlaceTeam) and the
 * player rearranges from there. An all-on-the-bench board would be a screen no live match ever shows.
 *
 * Not the server's randomized scatter — a deterministic front-first sweep with a one-cell buffer, so the
 * preview opens the same way every time and the army reads as a formation rather than a pile.
 */
const deployTeam = (units: PreviewUnitState[], team: TeamType, zoneDepth: number): void => {
    const isLeft = team === TeamVals.LEFT;
    const placement = new RectanglePlacement(
        GRID,
        isLeft ? PlacementPositionType.LEFT_BOTTOM : PlacementPositionType.RIGHT_TOP,
        zoneDepth,
        true, // every surface plays the side-oriented board now (left/right x-bands)
    );
    const blocked = new Set<number>();
    // Biggest body first: it needs the largest contiguous hole, and a one-cell stack dropped in the middle
    // of the zone can leave no room for one. Ranked by footprint AREA, not by `size`: a two-cell rectangle
    // carries the same `size` as the square it is half of, so `size` cannot order it against either.
    for (const unit of [...units].sort(
        (a, b) => b.footprintWidth * b.footprintHeight - a.footprintWidth * a.footprintHeight,
    )) {
        const candidates = placement
            .possibleCellPositions(
                unit.footprintWidth === 1 && unit.footprintHeight === 1,
                unit.footprintWidth,
                unit.footprintHeight,
            )
            .filter(Boolean)
            // Front rank first (toward the middle of the board), then top to bottom.
            .sort((a, b) => (isLeft ? b.x - a.x : a.x - b.x) || a.y - b.y);
        for (const base of candidates) {
            const cells = footprintOf(base, unit.footprintWidth, unit.footprintHeight);
            if (cells.some((cell) => blocked.has(cellKey(cell)))) {
                continue;
            }
            unit.placed = true;
            unit.cells = cells;
            unit.baseCell = { ...base };
            // Same one-cell buffer the server keeps between auto-placed stacks — including its bounds
            // check. `cellKey` packs four bits per axis, so an off-board neighbour does not miss, it
            // ALIASES: y = 16 sets the low bit of x, making key(x, 16) === key(x | 1, 0), which would blank
            // a real cell in row 0. Today no caller reaches row 15 (deploy depth is always 3), so this is a
            // trap rather than a live bug — guarded here so a deeper strip cannot spring it.
            for (const cell of cells) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        const neighbour = { x: cell.x + dx, y: cell.y + dy };
                        if (
                            neighbour.x < 0 ||
                            neighbour.y < 0 ||
                            neighbour.x >= GridConstants.GRID_SIZE ||
                            neighbour.y >= GridConstants.GRID_SIZE
                        ) {
                            continue;
                        }
                        blocked.add(cellKey(neighbour));
                    }
                }
            }
            break;
        }
    }
};

/**
 * Deterministic bottom-row layout used only by the creature-framing editor. The real placement preview
 * intentionally stays inside the legal deployment zone; this comparison surface instead gives every
 * model the same ground line so scale and vertical offsets can be compared directly.
 */
const deployComparisonTeam = (
    units: PreviewUnitState[],
    requestedRowSizes?: readonly number[],
    requestedRowGroundYs?: readonly number[],
    requestedHorizontalGapCells?: number,
    requestedFixedSlotCount?: number,
    alignToTopPlayableRow = false,
): void => {
    if (!units.length) return;

    const requestedRows = requestedRowSizes?.map((size) => Math.max(0, Math.round(size))).filter(Boolean);
    const rowSizes = requestedRows?.length ? [...requestedRows] : [units.length];
    const unassignedUnitCount = units.length - rowSizes.reduce((sum, size) => sum + size, 0);
    if (unassignedUnitCount > 0) rowSizes[rowSizes.length - 1] += unassignedUnitCount;
    const rowCount = Math.min(GridConstants.GRID_SIZE, rowSizes.length);
    let unitOffset = 0;

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const rowUnits = units.slice(unitOffset, unitOffset + rowSizes[rowIndex]);
        unitOffset += rowSizes[rowIndex];
        if (!rowUnits.length) break;

        // Keep the whole fixed footprint inside the board. In particular, a 2x1 model starts at max-corner
        // x = 1, so getPositionForCells resolves its render point to the exact centre seam of cells 0 and 1.
        const minBaseX = Math.max(...rowUnits.map((unit) => unit.footprintWidth - 1));
        const maxBaseX = GridConstants.GRID_SIZE - 1;
        const slot = rowUnits.length > 1 ? (maxBaseX - minBaseX) / (rowUnits.length - 1) : 0;
        const requestedGap =
            requestedHorizontalGapCells === undefined
                ? undefined
                : Math.max(0, Math.round(requestedHorizontalGapCells));
        const totalFootprintWidth = rowUnits.reduce((sum, unit) => sum + unit.footprintWidth, 0);
        const horizontalGapCells =
            requestedGap === undefined
                ? undefined
                : Math.min(
                      requestedGap,
                      Math.max(
                          0,
                          Math.floor(
                              (GridConstants.GRID_SIZE - totalFootprintWidth) / Math.max(1, rowUnits.length - 1),
                          ),
                      ),
                  );
        const packedWidth = totalFootprintWidth + Math.max(0, rowUnits.length - 1) * (horizontalGapCells ?? 0);
        let packedLeftX = Math.max(0, Math.floor((GridConstants.GRID_SIZE - packedWidth) / 2));
        const automaticRowGroundY =
            rowCount > 1 ? Math.round((rowIndex * (GridConstants.GRID_SIZE - 1)) / (rowCount - 1)) : 0;
        const rowGroundY = Math.max(
            0,
            Math.min(GridConstants.GRID_SIZE - 1, requestedRowGroundYs?.[rowIndex] ?? automaticRowGroundY),
        );

        rowUnits.forEach((unit, columnIndex) => {
            const fixedSlotCount = Math.max(
                0,
                Math.min(GridConstants.GRID_SIZE, Math.round(requestedFixedSlotCount ?? 0)),
            );
            const fixedSlotIndex = Math.max(0, Math.min(fixedSlotCount - 1, unit.previewSlotIndex));
            const fixedSlotAnchorX =
                fixedSlotCount > 1
                    ? Math.round((fixedSlotIndex * (GridConstants.GRID_SIZE - 1)) / (fixedSlotCount - 1))
                    : Math.floor((GridConstants.GRID_SIZE - 1) / 2);
            const packedBaseX =
                fixedSlotCount > 0
                    ? Math.max(unit.footprintWidth - 1, fixedSlotAnchorX)
                    : packedLeftX + unit.footprintWidth - 1;
            const unitGroundY = alignToTopPlayableRow ? GridConstants.GRID_SIZE - unit.footprintHeight - 1 : rowGroundY;
            const base = {
                x:
                    fixedSlotCount > 0
                        ? packedBaseX
                        : horizontalGapCells === undefined
                          ? Math.round(minBaseX + slot * columnIndex)
                          : packedBaseX,
                y: Math.min(GridConstants.GRID_SIZE - 1, unitGroundY + unit.footprintHeight - 1),
            };
            unit.placed = true;
            unit.cells = footprintOf(base, unit.footprintWidth, unit.footprintHeight);
            unit.baseCell = { ...base };
            if (fixedSlotCount === 0) packedLeftX += unit.footprintWidth + (horizontalGapCells ?? 0);
        });
    }
};

const buildSnapshot = (options: PreviewPlacementOptions): PlaySnapshot => {
    const now = Date.now();
    const leftArmy = options.lowerArmy ?? options.leftArmy ?? LEFT_ARMY;
    const rightArmy = options.upperArmy ?? options.rightArmy ?? RIGHT_ARMY;
    const units = [
        ...leftArmy.map((creatureId, index) => buildUnit(creatureId, TeamVals.LEFT, index)),
        ...rightArmy.map((creatureId, index) => buildUnit(creatureId, TeamVals.RIGHT, index)),
    ].filter((unit): unit is PreviewUnitState => !!unit);

    const viewerIsLeft = options.userTeam === TeamVals.LEFT;
    // Deployed into the DEFAULT (height 3) zone for both sides, deliberately — not into the taller zone
    // the viewer's Placement augment buys. The client derives the legal zone itself from FightProperties,
    // and the depth-3 rectangle is a subset of every deeper one, so this layout is legal whatever the
    // client decides the zone is. Deploying into the augmented zone instead put the army one column outside
    // the drawn zone whenever the client had not yet folded the augment in.
    const leftUnits = units.filter((unit) => unit.team === TeamVals.LEFT);
    const usesComparisonLayout = options.spreadLowerArmyAcrossBoard ?? options.spreadLeftArmyAcrossBoard;
    if (usesComparisonLayout) {
        // Framing/shadow comparison surfaces only need the creature body. Mark the empty spell list as
        // authoritative so RankedPlayScene does not reconstruct a creature's live spellbook while hydrating
        // the visual fixture. That reconstruction can legitimately fail while common's spell roster is being
        // edited (for example Battle Mage still referring to a moved Meteorite); one bad spell must not abort
        // creation of every comparison creature that follows it in the row.
        for (const unit of leftUnits) {
            unit.abilities = [];
            unit.spellEntriesAuthoritative = true;
            unit.spellEntries = [];
        }
        deployComparisonTeam(
            leftUnits,
            options.comparisonRowSizes,
            options.comparisonRowGroundYs,
            options.comparisonHorizontalGapCells,
            options.comparisonFixedSlotCount,
            options.comparisonAlignToTopPlayableRow,
        );
    } else {
        deployTeam(leftUnits, TeamVals.LEFT, PLACEMENT_ZONE_DEPTH[0]);
    }
    deployTeam(
        units.filter((unit) => unit.team === TeamVals.RIGHT),
        TeamVals.RIGHT,
        PLACEMENT_ZONE_DEPTH[0],
    );
    return {
        gameId: PREVIEW_PLACEMENT_GAME_ID,
        phase: PlayPhase.PLACEMENT,
        gridType: options.gridType,
        currentLap: 1,
        fightStarted: false,
        fightFinished: false,
        currentUnitId: "",
        currentTurnTeam: 0,
        latestSequence: 1,
        serverTimeMs: now,
        placementDeadlineMs: now + PLACEMENT_SECONDS * 1000,
        // Board stage of the split placement: augments are already committed (the previous screen), so the
        // picker stays shut and this screen is the positioning one.
        placementStage: 1,
        placementSplit: true,
        hideOpponentRosterDuringSetup: false,
        currentTurnStartMs: 0,
        currentTurnEndMs: 0,
        units,
        players: [
            {
                playerId: PREVIEW_LEFT_PLAYER_ID,
                team: TeamVals.LEFT,
                connected: true,
                aiControlled: false,
                lastSeenMs: now,
            },
            {
                playerId: PREVIEW_RIGHT_PLAYER_ID,
                team: TeamVals.RIGHT,
                connected: true,
                aiControlled: false,
                lastSeenMs: now,
            },
        ],
        readyPlayerIds: [],
        journalTail: [],
        maxLeftUnits: leftArmy.length,
        maxRightUnits: rightArmy.length,
        narrowingLayers: 0,
        centerDried: false,
        upNext: [],
        damageStats: [],
        // The doctrine sets the augment budget the sidebar recaps. The opponent's doctrine, artifacts and
        // augments stay 0 before the fight starts — that redaction is the server's, and copying it keeps
        // the preview from showing information the real screen hides.
        leftDoctrine: viewerIsLeft ? Doctrine.Doctrine.THREE_REVEALS : 0,
        rightDoctrine: viewerIsLeft ? 0 : Doctrine.Doctrine.THREE_REVEALS,
        leftArtifactTier1: viewerIsLeft ? 1 : 0,
        leftArtifactTier2: viewerIsLeft ? 1 : 0,
        rightArtifactTier1: viewerIsLeft ? 0 : 1,
        rightArtifactTier2: viewerIsLeft ? 0 : 1,
        leftAugmentPlacement: viewerIsLeft ? LEFT_AUGMENTS.placement : 0,
        leftAugmentArmor: viewerIsLeft ? LEFT_AUGMENTS.armor : 0,
        leftAugmentMight: viewerIsLeft ? LEFT_AUGMENTS.might : 0,
        leftAugmentEmpower: viewerIsLeft ? LEFT_AUGMENTS.empower : 0,
        leftAugmentSniper: viewerIsLeft ? LEFT_AUGMENTS.sniper : 0,
        leftAugmentMovement: viewerIsLeft ? LEFT_AUGMENTS.movement : 0,
        rightAugmentPlacement: viewerIsLeft ? 0 : LEFT_AUGMENTS.placement,
        rightAugmentArmor: viewerIsLeft ? 0 : LEFT_AUGMENTS.armor,
        rightAugmentMight: viewerIsLeft ? 0 : LEFT_AUGMENTS.might,
        rightAugmentEmpower: viewerIsLeft ? 0 : LEFT_AUGMENTS.empower,
        rightAugmentSniper: viewerIsLeft ? 0 : LEFT_AUGMENTS.sniper,
        rightAugmentMovement: viewerIsLeft ? 0 : LEFT_AUGMENTS.movement,
    } as PlaySnapshot;
};

let session: PlaySnapshot | undefined;

/** (Re)start the fake session. Called by the route on mount so a reload always opens a clean board. */
export const startPreviewPlaySession = (options: PreviewPlacementOptions): void => {
    const next = buildSnapshot(options);
    next.latestSequence = (session?.latestSequence ?? 0) + 1;
    session = next;
};

export const getPreviewPlaySnapshot = (): PlaySnapshot | undefined => {
    if (!session) {
        return undefined;
    }
    const now = Date.now();
    // The countdown chip reads the deadline against server time. In a real match the server auto-starts
    // the fight when it runs out; here there is nothing to start, and an expired deadline leaves the
    // screen frozen at 0:00 with the board locked. So the placement window simply rolls over — the clock
    // stays live and the screen stays usable for as long as it is left open. The sequence is deliberately
    // NOT bumped: this is a clock tick, not a state change, and a bump would rebuild the board every poll.
    const placementDeadlineMs =
        session.placementDeadlineMs > now ? session.placementDeadlineMs : now + PLACEMENT_SECONDS * 1000;
    session = { ...session, serverTimeMs: now, placementDeadlineMs };
    return session;
};

/**
 * A unit's base cell is the max corner of its footprint — the scene rebuilds the footprint from it, so a
 * wrong answer here rebuilds the body in the wrong direction on the next hydrate. The engine's reducer
 * takes the per-axis maximum rather than looking for one cell that dominates on both axes, which is the
 * same answer for a rectangle and a defined one for a truncated cell set.
 */
const baseCellOf = (cells: PlayCell[]): PlayCell => GridMath.getFootprintAnchorForCells(cells) ?? cells[0];

const bump = (snapshot: PlaySnapshot, units?: PlayUnitState[]): PlaySnapshot => ({
    ...snapshot,
    units: units ?? snapshot.units,
    latestSequence: snapshot.latestSequence + 1,
    serverTimeMs: Date.now(),
});

const withUnit = (snapshot: PlaySnapshot, unitId: string, patch: Partial<PlayUnitState>): PlaySnapshot =>
    bump(
        snapshot,
        snapshot.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit)),
    );

const accepted = (action: PlayAction, sequence: number): PlayActionResponse => ({
    accepted: true,
    actionId: action.actionId,
    sequence,
    rejectionReason: "",
    message: "",
});

const rejected = (action: PlayAction, sequence: number, reason: string): PlayActionResponse => ({
    accepted: false,
    actionId: action.actionId,
    sequence,
    rejectionReason: reason,
    message: "",
});

/**
 * Apply one action to the fake session. Deliberately permissive: the placement rules the real server
 * enforces (zone bounds, overlaps) are enforced client-side by the scene before it ever submits, and a
 * preview has nobody to cheat. Only genuinely unanswerable actions are rejected.
 */
export const applyPreviewPlayAction = (action: PlayAction): PlayActionResponse => {
    const current = session;
    if (!current) {
        return rejected(action, 0, "game_not_found");
    }

    switch (action.type) {
        case PlayActionType.PLACE_UNIT: {
            const cells = action.cells ?? [];
            if (!action.unitId || !cells.length) {
                return rejected(action, current.latestSequence, "invalid_placement");
            }
            session = withUnit(current, action.unitId, {
                placed: true,
                cells: cells.map((cell) => ({ ...cell })),
                baseCell: { ...baseCellOf(cells) },
            });
            break;
        }
        case PlayActionType.UNPLACE_UNIT: {
            if (!action.unitId) {
                return rejected(action, current.latestSequence, "unit_not_found");
            }
            session = withUnit(current, action.unitId, { placed: false, cells: [], baseCell: { x: 0, y: 0 } });
            break;
        }
        case PlayActionType.DELETE_UNIT: {
            if (!action.unitId) {
                return rejected(action, current.latestSequence, "unit_not_found");
            }
            session = bump(
                current,
                current.units.filter((unit) => unit.id !== action.unitId),
            );
            break;
        }
        case PlayActionType.READY_PLACEMENT:
        case PlayActionType.START_FIGHT: {
            // Locking in ends the preview's story: there is no opponent to lock in after you and no turn
            // engine to hand the board to, so the screen settles on "waiting for opponent" — which is
            // exactly what a real player sees between their lock-in and the fight.
            const playerId = action.playerId;
            session = bump(current);
            if (playerId && !session.readyPlayerIds.includes(playerId)) {
                session = { ...session, readyPlayerIds: [...session.readyPlayerIds, playerId] };
            }
            break;
        }
        case PlayActionType.PING:
            return accepted(action, current.latestSequence);
        default:
            // Augments, synergies, extra time, aim hints: nothing on this screen reads them back off the
            // snapshot, so accepting without a state change keeps the client's sequence in step.
            session = bump(current);
            break;
    }

    return accepted(action, session.latestSequence);
};

export const PREVIEW_PLACEMENT_MAPS: Record<string, number> = {
    normal: GridVals.NORMAL,
    cemetery: GridVals.BLOCK_CENTER,
    lava: GridVals.LAVA_CENTER,
};
