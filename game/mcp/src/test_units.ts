import {
    AbilityFactory,
    EffectFactory,
    FactionVals,
    GridConstants,
    GridMath,
    GridSettings,
    MovementVals,
    TeamVals,
    Unit,
    UnitLevelVals,
    UnitProperties,
    UnitSizeVals,
    UnitVals,
    AttackVals,
    type AttackType,
    type Grid,
    type MovementType,
    type TeamType,
    type UnitLevelType,
    type UnitSizeType,
    type UnitType,
    type UnitsHolder,
} from "@heroesofcrypto/common";

interface XY {
    x: number;
    y: number;
}

const MCP_GRID_SETTINGS = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

export interface McpUnitOptions {
    name?: string;
    team?: TeamType;
    attackType?: AttackType;
    attack?: number;
    armor?: number;
    magicResist?: number;
    luck?: number;
    damageMin?: number;
    damageMax?: number;
    rangeShots?: number;
    amountAlive?: number;
    maxHp?: number;
    exp?: number;
    stackPower?: number;
    attackRange?: number;
    shotDistance?: number;
    morale?: number;
    speed?: number;
    movementType?: MovementType;
    size?: UnitSizeType;
    level?: UnitLevelType;
    unitType?: UnitType;
    spells?: string[];
    abilities?: string[];
    auraEffects?: string[];
    auraRanges?: number[];
    auraIsBuff?: boolean[];
    summoned?: boolean;
}

export function createMcpUnit(options: McpUnitOptions = {}): Unit {
    const effectFactory = new EffectFactory();
    const abilityFactory = new AbilityFactory(effectFactory);
    const abilities = options.abilities ?? [];
    const abilityDescriptions = abilities.map(() => "");
    const abilityStackPowered = abilities.map(() => false);
    const abilityAuras = abilities.map(() => false);
    const spells = options.spells ?? [];
    const auraEffects = options.auraEffects ?? [];
    const auraRanges = options.auraRanges ?? [];
    const auraIsBuff = options.auraIsBuff ?? [];
    const noStrings: string[] = [];
    const noNumbers: number[] = [];

    return Unit.createUnit(
        new UnitProperties(
            FactionVals.MIGHT,
            options.name ?? "MCP Unit",
            options.maxHp ?? 10,
            3,
            options.morale ?? 0,
            options.luck ?? 0,
            options.speed ?? 1,
            options.armor ?? 10,
            options.attackType ?? AttackVals.MELEE,
            options.attack ?? 10,
            options.damageMin ?? 1,
            options.damageMax ?? 1,
            options.attackRange ?? 1,
            options.rangeShots ?? 0,
            options.shotDistance ?? 16,
            options.magicResist ?? 0,
            options.movementType ?? MovementVals.WALK,
            options.exp ?? 0,
            options.size ?? UnitSizeVals.SMALL,
            options.level ?? UnitLevelVals.FIRST,
            spells,
            abilities,
            abilityDescriptions,
            abilityStackPowered,
            abilityAuras,
            noStrings,
            noStrings,
            noStrings,
            noNumbers,
            noNumbers,
            noNumbers,
            noStrings,
            noStrings,
            noStrings,
            noNumbers,
            noNumbers,
            noNumbers,
            auraEffects,
            auraRanges,
            auraIsBuff,
            noStrings,
            options.amountAlive ?? 1,
            0,
            options.team ?? TeamVals.UPPER,
            options.unitType ?? UnitVals.CREATURE,
            "",
            "",
            options.stackPower ?? 1,
            "",
        ),
        MCP_GRID_SETTINGS,
        options.team ?? TeamVals.UPPER,
        options.unitType ?? UnitVals.CREATURE,
        abilityFactory,
        effectFactory,
        options.summoned ?? false,
    );
}

export function placeMcpUnit(grid: Grid, unitsHolder: UnitsHolder, unit: Unit, cell: XY): void {
    const gridSettings = grid.getSettings();
    const position = GridMath.getPositionForCell(
        cell,
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );
    unit.setPosition(position.x, position.y);
    grid.occupyCell(
        cell,
        unit.getId(),
        unit.getTeam(),
        unit.getAttackRange(),
        unit.hasAbilityActive("Made of Fire"),
        unit.hasAbilityActive("Made of Water"),
    );
    unitsHolder.addUnit(unit);
}
