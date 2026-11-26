import { expect, test } from "bun:test";
import {
    FightProperties,
    GridConstants,
    GridSettings,
    TeamVals,
    type TeamType,
    type Unit,
} from "@heroesofcrypto/common";
import { Container, Graphics, Texture } from "pixi.js";
import { ANGEL_WINGSHIELD_ABILITY, ANGEL_WINGSHIELD_TEXTURE_KEY } from "./AngelWingshieldAura";
import { Sandbox } from "./Sandbox";
import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";
import { creatureEffectAssetKeys } from "../pixi/imageAssetTiers";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

function unit(
    name: string,
    options: { id?: string; team?: TeamType; blessing?: boolean; dead?: boolean; hidden?: boolean } = {},
): Unit {
    return {
        getId: () => options.id ?? name,
        getName: () => name,
        getTeam: () => options.team ?? TeamVals.LEFT,
        isDead: () => !!options.dead,
        getAbility: (ability: string) =>
            (options.blessing ?? name === "Angel") && ability === ANGEL_WINGSHIELD_ABILITY ? {} : undefined,
        hasBuffActive: (buff: string) => !!options.hidden && buff === "Hidden",
        getAuraRanges: () => [],
    } as unknown as Unit;
}

function scene(fields: { active?: Unit; hovered?: Unit; selected?: Unit; viewerTeam?: TeamType }) {
    const units = new Map([fields.active, fields.hovered, fields.selected].flatMap((u) => (u ? [[u.getId(), u]] : [])));
    return Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: fields.active,
        selectedBoardUnit: fields.selected,
        hoverManager: { hoveredUnitId: fields.hovered?.getId() },
        unitsHolder: { getAllUnits: () => units },
        getViewerTeam: () => fields.viewerTeam,
    }) as { angelWingshieldOwner(): Unit | undefined; hasGameplayVisuals(): boolean };
}

test("the Wingshield previews for an active, hovered or selected Angel with the blessing, and nobody else", () => {
    const angel = unit("Angel");
    expect(scene({ active: angel }).angelWingshieldOwner()).toBe(angel);
    expect(scene({ hovered: angel }).angelWingshieldOwner()).toBe(angel);
    expect(scene({ selected: angel }).angelWingshieldOwner()).toBe(angel);
    expect(scene({ active: angel }).hasGameplayVisuals()).toBe(true);

    expect(scene({ active: unit("Crusader") }).angelWingshieldOwner()).toBeUndefined();
    expect(scene({ active: unit("Angel", { blessing: false }) }).angelWingshieldOwner()).toBeUndefined();
    expect(scene({ hovered: unit("Angel", { dead: true }) }).angelWingshieldOwner()).toBeUndefined();
    // A hidden enemy Angel is not revealed by its blessing; a hidden ally still shows it.
    const hiddenEnemy = unit("Angel", { team: TeamVals.RIGHT, hidden: true });
    expect(scene({ active: hiddenEnemy, viewerTeam: TeamVals.LEFT }).angelWingshieldOwner()).toBeUndefined();
    const hiddenAlly = unit("Angel", { team: TeamVals.LEFT, hidden: true });
    expect(scene({ active: hiddenAlly, viewerTeam: TeamVals.LEFT }).angelWingshieldOwner()).toBe(hiddenAlly);
});

test("the drawer paints the shield over the floor for that Angel and clears it once no Angel is previewed", () => {
    const fightProps = new FightProperties();
    fightProps.startFight();
    const root = new Container();
    const ctx = {
        fightProps,
        gridSettings: gs,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        hoverManager: { drawHoverBattlefieldFootprint: () => {} },
        arachnaWebAuraContainer: root,
        angelWingshieldOwnerId: "angel",
        getAngelWingshieldTexture: () => Texture.WHITE,
    } as unknown as IGameplayDrawContext;
    const g = new Graphics();
    try {
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        const floor = root.children.find((child) => child.label === "angel-wingshield-floor");
        const arrows = root.children.find((child) => child.label === "angel-wingshield-breaking-arrows");
        expect(floor?.visible).toBe(true);
        expect(arrows?.visible).toBe(true);

        SandboxDrawer.drawGameplayVisuals(g, { ...ctx, angelWingshieldOwnerId: undefined });
        expect(root.children.every((child) => !child.visible)).toBe(true);
    } finally {
        g.destroy();
        root.destroy({ children: true });
    }
});

test("an Angel on the roster preloads the Wingshield art with its other effects", () => {
    expect(creatureEffectAssetKeys("Angel")).toContain(ANGEL_WINGSHIELD_TEXTURE_KEY);
});
