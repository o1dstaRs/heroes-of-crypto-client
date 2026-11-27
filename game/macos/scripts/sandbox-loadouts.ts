import {
    ArtifactTier,
    Tier1Artifact,
    formatArtifactDescription,
    TIER1_ARTIFACT_LIST,
    TIER2_ARTIFACT_LIST,
} from "../../heroes-of-crypto-common/src/artifacts/artifact_properties";
import {
    type AugmentType,
    DefaultPlacementLevel1,
    getArmorPower,
    getEmpowerPower,
    getMightPower,
    getMovementPower,
    getSniperPower,
} from "../../heroes-of-crypto-common/src/augments/augment_properties";
import { MAX_AUGMENT_POINTS, MAX_SYNERGY_LEVEL } from "../../heroes-of-crypto-common/src/constants";
import { FightProperties } from "../../heroes-of-crypto-common/src/fights/fight_properties";
import { FightStateManager } from "../../heroes-of-crypto-common/src/fights/fight_state_manager";
import { ToFactionType } from "../../heroes-of-crypto-common/src/factions/faction_type";
import { PBTypes } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types";
import type { GridType, TeamType } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types_gen";
import {
    artifactBarrelPlacementCells,
    artifactBarrelShooterCells,
    autoPlaceArtifactBarrels,
} from "../../heroes-of-crypto-common/src/grid/artifact_barrels";
import { Grid } from "../../heroes-of-crypto-common/src/grid/grid";
import * as board from "../../heroes-of-crypto-common/src/grid/grid_constants";
import {
    getFootprintCellsForAnchor,
    getPositionForFootprintAnchor,
} from "../../heroes-of-crypto-common/src/grid/grid_math";
import { GridSettings } from "../../heroes-of-crypto-common/src/grid/grid_settings";
import { scatteredMountainsForSeed } from "../../heroes-of-crypto-common/src/grid/scattered_mountains";
import { createCombatFactories, createUnitFromSpec, makeRng } from "../../heroes-of-crypto-common/src/simulation/army";
import {
    DEFAULT_SYNERGY_VARIANTS,
    FACTION_SYNERGY_PAIRS,
    type SpecificSynergy,
    SYNERGY_FACTION_ORDER,
} from "../../heroes-of-crypto-common/src/synergies/synergy_properties";
import { UnitsHolder } from "../../heroes-of-crypto-common/src/units/units_holder";
import { setDeterministicRandomSource } from "../../heroes-of-crypto-common/src/utils/lib";
import { exportBattleState } from "../../heroes-of-crypto-common/zig/parity/state_export";

interface SandboxTeam {
    augments: Partial<Record<AugmentType["type"], number>>;
    synergies: Record<string, SpecificSynergy>;
    tier1: number;
    tier2: number;
    barrels?: { index: number; cell: { x: number; y: number } }[];
}

interface SandboxConfiguration {
    map: GridType;
    boardSeed?: number;
    stacks: Array<{
        name: string;
        faction: string;
        level: number;
        team: TeamType;
        amount: number;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    teams: Record<string, SandboxTeam>;
}

const teams = [PBTypes.TeamVals.LEFT, PBTypes.TeamVals.RIGHT] as const;
const settings = new GridSettings(
    board.GRID_SIZE,
    board.MAX_Y,
    board.MIN_Y,
    board.MAX_X,
    board.MIN_X,
    board.MOVEMENT_DELTA,
    board.UNIT_SIZE_DELTA,
);

// JavaScriptCore does not have the browser's structuredClone. Fight setup clones plain configuration
// structs and arrays, including undefined optional properties.
function cloneConfiguration(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(cloneConfiguration);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneConfiguration(entry)]));
    }
    return value;
}

globalThis.structuredClone ??= cloneConfiguration as typeof structuredClone;

export function configureSandbox(input: SandboxConfiguration) {
    const seed = input.boardSeed ?? 142;
    setDeterministicRandomSource(makeRng(seed));
    try {
        const grid = new Grid(settings, input.map);
        const fightProperties = new FightProperties();
        fightProperties.setGridType(input.map);
        fightProperties.setSideOrientedPlacement(true);
        FightStateManager.getInstance().setFightProperties(fightProperties);
        if (input.map === PBTypes.GridVals.BLOCK_CENTER) {
            grid.setScatteredMountains(scatteredMountainsForSeed(`sim-${seed}`).map(({ cell }) => cell));
        }
        const unitsHolder = new UnitsHolder(grid);
        const { abilityFactory, effectFactory } = createCombatFactories();
        const teamStates = [];
        for (const [index, stack] of input.stacks.entries()) {
            const id = `00000000-0000-5000-8000-${String(index + 1).padStart(12, "0")}`;
            const unit = createUnitFromSpec(
                {
                    creatureName: stack.name,
                    faction: stack.faction,
                    level: stack.level,
                    amount: stack.amount,
                    size: Math.max(stack.width, stack.height),
                    footprintWidth: stack.width,
                    footprintHeight: stack.height,
                },
                stack.team,
                settings,
                abilityFactory,
                effectFactory,
                false,
                id,
            );
            const cells = getFootprintCellsForAnchor(stack, stack.width, stack.height);
            if (!grid.occupyCells(cells, id, stack.team, unit.getAttackRange(), false, false)) {
                throw new Error(`${stack.name} doesn’t fit at that position.`);
            }
            const position = getPositionForFootprintAnchor(settings, stack, stack.width, stack.height);
            unit.setPosition(position.x, position.y);
            unitsHolder.addUnit(unit);
        }
        for (const team of teams) {
            const loadout = input.teams[team];
            fightProperties.setDefaultPlacementPerTeam(team, DefaultPlacementLevel1.THREE_BY_THREE);
            for (const [type, value] of Object.entries(loadout?.augments ?? {})) {
                if (!fightProperties.setAugmentPerTeam(team, { type, value } as AugmentType)) {
                    throw new Error("This army exceeds its augment point budget.");
                }
            }
            fightProperties.setArtifactPerTeam(team, ArtifactTier.TIER_1, loadout?.tier1 ?? 0);
            fightProperties.setArtifactPerTeam(team, ArtifactTier.TIER_2, loadout?.tier2 ?? 0);
            const army = input.stacks.filter((stack) => stack.team === team);
            const count = (faction: string) =>
                new Set(army.filter((stack) => stack.faction === faction).map(({ name }) => name)).size;
            fightProperties.setSynergyUnitsPerFactions(
                team,
                count("Life"),
                count("Chaos"),
                count("Might"),
                count("Nature"),
            );
            const levels = Object.fromEntries(
                SYNERGY_FACTION_ORDER.map((faction) => [
                    faction,
                    Math.min(MAX_SYNERGY_LEVEL, Math.floor(count(faction) / 2)),
                ]),
            );
            for (const faction of SYNERGY_FACTION_ORDER) {
                const variant = loadout?.synergies[faction];
                if (variant && levels[faction] > 0) {
                    fightProperties.updateSynergyPerTeam(team, ToFactionType[faction], variant, levels[faction]);
                }
            }
            const cells = artifactBarrelPlacementCells(grid, fightProperties, team);
            if (loadout?.tier1 === Tier1Artifact.BARREL_BARRICADE && loadout.barrels) {
                for (const barrel of loadout.barrels) {
                    if (cells.some(({ x, y }) => x === barrel.cell.x && y === barrel.cell.y)) {
                        grid.placeArtifactBarrel(team, barrel.index, barrel.cell);
                    }
                }
            } else {
                autoPlaceArtifactBarrels(
                    grid,
                    fightProperties,
                    team,
                    cells,
                    artifactBarrelShooterCells(grid, unitsHolder.getAllUnits().values(), team),
                );
            }
            teamStates.push({
                team,
                cells,
                levels,
                capacity: fightProperties.getNumberOfUnitsAvailableForPlacement(team),
                barrels: grid.getArtifactBarrels(team),
            });
        }
        unitsHolder.applyAugments(fightProperties);
        unitsHolder.applyArtifacts(fightProperties);
        unitsHolder.refreshAuraEffectsForAllUnits();
        unitsHolder.refreshStackPowerForAllUnits();
        unitsHolder.refreshAuraEffectsForAllUnits();
        unitsHolder.refreshStackPowerForAllUnits();
        const snapshot = exportBattleState({ unitsHolder, grid, fightProperties }, { seed, rng: seed });
        const setup = snapshot.setup as { perTeam: Record<number, object> };
        for (const team of teams) {
            Object.assign(setup.perTeam[team], {
                artifactT1: fightProperties.getArtifactTier1(team),
                artifactT2: fightProperties.getArtifactTier2(team),
                augments: { Placement: fightProperties.getAugmentPlacementLevel(team) },
            });
        }
        return { snapshot, teams: teamStates };
    } finally {
        setDeterministicRandomSource(undefined);
    }
}

const artifacts = [...TIER1_ARTIFACT_LIST, ...TIER2_ARTIFACT_LIST].map(({ id, tier, name, ...props }) => ({
    id,
    tier,
    name,
    imageKey: props.imageKey,
    description: formatArtifactDescription({ id, tier, name, ...props }),
}));

const augmentLabels = {
    Placement: ["Height 3 partial", "Height 4 full", "Height 6 full + edge line"],
    Armor: [
        "None",
        ...([1, 2, 3] as const).map((level) => {
            const power = getArmorPower(level);
            return `+${power}% Armor & +${power} Magic Armor`;
        }),
    ],
    Might: ["None", ...([1, 2, 3] as const).map((level) => `+${getMightPower(level)}% Melee attack`)],
    Empower: ["None", ...([1, 2, 3] as const).map((level) => `+${getEmpowerPower(level)}% Magic damage`)],
    Sniper: [
        "None",
        ...([1, 2, 3] as const).map((level) => {
            const [damage, range] = getSniperPower(level);
            return `+${damage}% attack/+${range}% distance`;
        }),
    ],
    Movement: ["None", ...([1, 2] as const).map((level) => `+${getMovementPower(level)} Movement steps`)],
};

Object.assign(globalThis, {
    hocConfigureSandbox: (request: string) =>
        JSON.stringify(configureSandbox(JSON.parse(request) as SandboxConfiguration)),
    hocSandboxLoadoutOptions: JSON.stringify({
        artifacts,
        maximumPoints: MAX_AUGMENT_POINTS,
        augmentLevels: FightProperties.AUGMENT_MAX_LEVEL,
        augmentLabels,
        barrelBarricade: Tier1Artifact.BARREL_BARRICADE,
        synergyVariants: FACTION_SYNERGY_PAIRS,
        synergyDefaults: DEFAULT_SYNERGY_VARIANTS,
    }),
});
