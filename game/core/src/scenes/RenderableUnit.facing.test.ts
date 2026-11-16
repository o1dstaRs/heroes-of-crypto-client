import { expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
const create = (team: TeamType = TeamVals.LEFT, faction = "Life", name = "Squire") => {
    const effects = new EffectFactory();
    return RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(team, faction, name, "", 1),
            new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06),
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => undefined,
    );
};
test.each([TeamVals.LEFT, TeamVals.RIGHT])(
    "team %i follows movement without a walk atlas and retains its pose through teardown",
    (team) => {
        const unit = create(team);
        unit.hasAnimationState = () => false;
        unit.setBoardFacingFromMovement(-4);
        expect(unit.getBoardFacingDirection()).toBe(-1);
        unit.setBoardFacingFromMovement(4);
        expect(unit.getBoardFacingDirection()).toBe(1);
        unit.destroyVisuals();
        expect(unit.getBoardFacingDirection()).toBe(1);
    },
);
test("attacks choose their logical target side; vertical and invalid vectors preserve facing", () => {
    const unit = create();
    unit.hasAnimationState = () => false;
    unit.setPosition(100, 100);
    unit.faceBoardTarget({ x: 0, y: 120 });
    expect(unit.getBoardFacingDirection()).toBe(-1);
    for (const direction of [0, 0.00001, Number.NaN, Number.POSITIVE_INFINITY]) {
        unit.setBoardFacingFromMovement(direction);
        unit.setBoardFacing(direction);
        expect(unit.getBoardFacingDirection()).toBe(-1);
    }
    unit.faceBoardTarget({ x: 200, y: 50 });
    expect(unit.getBoardFacingDirection()).toBe(1);
    unit.faceBoardTarget({ x: 200, y: 300 });
    expect(unit.getBoardFacingDirection()).toBe(1);
    unit.destroyVisuals();
});

test("replay reconstruction restores a saved pose independently of the stack's team", async () => {
    const { Sandbox } = await import("./Sandbox");
    const source = create(TeamVals.RIGHT);
    source.setBoardFacing(1);
    const effects = new EffectFactory();
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06) },
        abilityFactory: new AbilityFactory(effects),
        texAny: () => undefined,
    });
    const restored = scene.createRenderableUnitFromSceneState({
        properties: source.getAllProperties(),
        team: TeamVals.RIGHT,
        placed: true,
        dead: false,
        cells: [{ x: 12, y: 6 }],
        baseCell: { x: 12, y: 6 },
        facingDirection: source.getBoardFacingDirection(),
    }) as RenderableUnit;
    expect(restored.getBoardFacingDirection()).toBe(1);
    restored.destroyVisuals();
    source.destroyVisuals();
});

test("being hit cannot replace the direction of the last deliberate move or attack", () => {
    const unit = create(TeamVals.LEFT, "Chaos", "Wandering Mage");
    unit.hasAnimationState = () => false;
    unit.setBoardFacing(-1);
    unit.applyHitReaction(-40, 0);
    expect(unit.getBoardFacingDirection()).toBe(-1);
    unit.destroyVisuals();
});
