import {
    AbilityFactory,
    createAIStrategy,
    creatureInfo,
    DEFAULT_AI_VERSION,
    EffectFactory,
    FightProperties,
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    HoCConfig,
    HoCLib,
    PathHelper,
    PlacementPositionType,
    RectanglePlacement,
    TeamVals,
    ToFactionName,
    Unit,
    UnitsHolder,
    UnitVals,
    type Augment,
    type SpecificSynergy,
    type TeamType,
} from "@heroesofcrypto/common";
import { finalizeA19Placement } from "../../../../heroes-of-crypto-common/src/ai/placement/adapter";
import {
    cells,
    valid,
    type Point,
    type PublicInput,
} from "../../../../heroes-of-crypto-common/src/ai/placement/layout";
import { chooseA19TerrainPlacement } from "../../../../heroes-of-crypto-common/src/ai/placement/terrain_reflection";

/** Run the shipped placement strategy on detached, public-only draft units. Nothing is applied to the match. */
export function recommendPremiumDraftFormation(
    input: PublicInput,
    baseline: readonly Point[],
    settings: GridSettings,
    depth: number,
    variants?: Record<string, SpecificSynergy>,
    publicMapSeed?: string,
): Point[] | undefined {
    if (!input.bodies.length) return [];
    if (!valid(input, baseline)) return undefined;
    const manager = FightStateManager.getInstance();
    const previousFight = manager.getFightProperties();
    const previousRandom = HoCLib.captureDeterministicRandomState();
    try {
        // Native constructors allocate UUIDs and choose initial terrain. Previewing must consume neither
        // the live RNG nor its UUID sequence, even if the placement strategy throws.
        let seed = 1;
        HoCLib.setDeterministicRandomSource(() => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
        const fight = new FightProperties();
        manager.setFightProperties(fight);
        fight.setGridType(input.map);
        fight.setSideOrientedPlacement(true);
        const team = input.left ? TeamVals.LEFT : TeamVals.RIGHT;
        const enemyTeam = input.left ? TeamVals.RIGHT : TeamVals.LEFT;
        fight.setDoctrinePerTeam(team, input.doctrine);
        if (variants) fight.setSynergyVariants(variants);
        input.artifacts.forEach((artifact, index) => fight.setArtifactPerTeam(team, index + 1, artifact));
        for (const augment of input.augments)
            fight.setAugmentPerTeam(team, { type: augment.kind, value: augment.value } as Augment.AugmentType);

        const grid = new Grid(settings, input.map);
        const holder = new UnitsHolder(grid);
        const effects = new EffectFactory();
        const abilities = new AbilityFactory(effects);
        const makeUnit = (creature: number, amount: number, id: string, unitTeam: TeamType, position: Point) => {
            const info = creatureInfo(creature)!;
            const config = {
                ...HoCConfig.getCreatureConfig(unitTeam, ToFactionName[info.faction], info.name, "", amount),
                id,
            };
            const unit = Unit.createUnit(config, settings, unitTeam, UnitVals.CREATURE, abilities, effects, false);
            const center = GridMath.getPositionForCells(
                settings,
                GridMath.getFootprintCellsForAnchor(position, info.footprintWidth, info.footprintHeight),
            );
            if (!center) throw new Error("Invalid projected footprint");
            unit.setPosition(center.x, center.y, false);
            holder.addUnit(unit);
            return unit;
        };
        const own = input.bodies.map((body, index) =>
            makeUnit(body.creature, body.amount, body.id, team, baseline[index]),
        );
        // Only revealed identities enter. These are neutral projected stacks, never actual enemy setup.
        for (const [index, id] of input.enemyIds.entries()) {
            const info = creatureInfo(id);
            if (info)
                makeUnit(id, Math.ceil(1000 / info.exp), `enemy:${index}`, enemyTeam, { x: input.left ? 14 : 3, y: 3 });
        }
        if (variants) {
            for (const side of [team, enemyTeam]) {
                const ids = side === team ? input.bodies.map((body) => body.creature) : input.enemyIds;
                const infos = [...new Set(ids)].flatMap((id) => creatureInfo(id) ?? []);
                const count = (faction: string) =>
                    infos.filter((info) => ToFactionName[info.faction] === faction).length;
                fight.setSynergyUnitsPerFactions(side, count("Life"), count("Chaos"), count("Might"), count("Nature"));
            }
        }
        holder.applyAugments(fight);
        holder.applyArtifacts(fight);
        holder.refreshStackPowerForAllUnits();
        const placement = new RectanglePlacement(
            settings,
            input.left ? PlacementPositionType.LEFT_BOTTOM : PlacementPositionType.RIGHT_BOTTOM,
            depth,
            false,
        );
        const selected = createAIStrategy(DEFAULT_AI_VERSION).placeArmy(own, {
            team,
            grid,
            unitsHolder: holder,
            pathHelper: new PathHelper(settings),
            placement,
            setupPlacementPolicy: "public-roster",
            publicOpponentCreatureIds: input.enemyIds,
            revealedOpponentCreatures: input.enemyIds,
        });
        const zone = new RectanglePlacement(
            settings,
            input.left ? PlacementPositionType.LEFT_BOTTOM : PlacementPositionType.RIGHT_TOP,
            depth,
            true,
        );
        const occupied = new Set<number>();
        const rotated = new Map<string, Point>();
        // Native strategies use the classic board frame. Retain real rectangular footprints when rotating
        // into the displayed side board, repairing only collisions/zone edges to the nearest legal anchor.
        for (const body of [...input.bodies].sort((a, b) => b.width * b.height - a.width * a.height)) {
            const anchor = selected.get(body.id);
            if (!anchor) return undefined;
            const target = { x: anchor.y, y: settings.getGridSize() - anchor.x + body.width - 2 };
            const legal = zone
                .possibleCellPositions(true, body.width, body.height)
                .filter((point) => cells(body, point).every((cell) => !occupied.has((cell.x << 4) | cell.y)))
                .sort(
                    (a, b) =>
                        Math.max(Math.abs(a.x - target.x), Math.abs(a.y - target.y)) -
                            Math.max(Math.abs(b.x - target.x), Math.abs(b.y - target.y)) ||
                        a.x - b.x ||
                        a.y - b.y,
                );
            if (!legal[0]) return undefined;
            rotated.set(body.id, legal[0]);
            for (const cell of cells(body, legal[0])) occupied.add((cell.x << 4) | cell.y);
        }
        const envelope = {
            team,
            gridType: input.map,
            sideOrientedPlacement: true,
            legalCellHashes: zone.possibleCellHashes(),
            publicOpponentCreatureIds: input.enemyIds,
            artifacts: [input.artifacts[0] ?? 0, input.artifacts[1] ?? 0] as const,
            doctrine: input.doctrine,
            augments: input.augments,
        };
        // Keep the model's serving-domain guard; incomplete drafts and unsupported builds use native A19.
        let final = finalizeA19Placement(own, envelope, rotated);
        if (publicMapSeed)
            final = chooseA19TerrainPlacement(
                own,
                { ...envelope, gridSettings: settings, publicMapSeed },
                final,
            ).positions;
        const result = input.bodies.map((body) => final.get(body.id)!);
        return result.every(Boolean) && valid(input, result) ? result : undefined;
    } catch {
        return undefined;
    } finally {
        manager.setFightProperties(previousFight);
        HoCLib.restoreDeterministicRandomState(previousRandom);
    }
}
