import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { Sandbox } from "./Sandbox";
import { CommonFlagPops } from "./sandbox/CommonFlagPops";

test("Small Specie appears on the attacker when its level-four strike misses the actual living fairy", () => {
    const pops: string[] = [];
    const labels: string[] = [];
    let level = 4;
    let enabled = true;
    let dead = false;
    let previewAttacker: { getId: () => string; getName: () => string; getLevel: () => number } | undefined;
    const fairy = {
        getId: () => "fairy",
        getName: () => "Fairy",
        getVisualCenter: () => ({ x: 40, y: 60 }),
        hasAbilityActive: (name: string) => enabled && name === "Small Specie",
        isDead: () => dead,
    };
    const other = { ...fairy, getId: () => "other", hasAbilityActive: () => false };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["fairy", fairy],
                    ["other", other],
                ]),
        },
        combatVisuals: {
            spawnCommonFlagPop: (unit: typeof fairy, kind: string) => pops.push(`${unit.getId()}:${kind}`),
            showMissLabel: (_pos: unknown, _direction: unknown, unit: typeof fairy) => labels.push(unit.getId()),
        },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: fairy }),
        penetratingBiteLabVictim: () => previewAttacker,
        moveAnimManager: { isMoving: () => false },
    });
    const attacker = { getId: () => "attacker", getName: () => "Behemoth", getLevel: () => level };
    scene.showAttackMissedVfx(attacker, fairy, undefined);
    scene.showAttackMissedVfx(attacker, fairy, { missed: false });
    expect(pops).toEqual([]);
    scene.showAttackMissedVfx(attacker, other, { unitId: "fairy", missed: true });
    expect(pops).toEqual(["attacker:small_specie"]);
    expect(labels).toEqual([]);
    scene.showAttackMissedVfx(attacker, fairy, { unitId: "other", missed: true });
    level = 3;
    scene.showAttackMissedVfx(attacker, fairy, { missed: true });
    level = 4;
    enabled = false;
    scene.showAttackMissedVfx(attacker, fairy, { missed: true });
    enabled = true;
    dead = true;
    scene.showAttackMissedVfx(attacker, fairy, { missed: true });
    expect(pops).toHaveLength(1);
    expect(labels).toEqual(["other", "fairy", "fairy", "fairy"]);
    dead = false;
    expect(scene.playCreatureAnimationLabState("small_specie").ok).toBe(false);
    expect(pops).toHaveLength(1);
    previewAttacker = attacker;
    expect(scene.playCreatureAnimationLabState("small_specie").ok).toBe(true);
    expect(pops).toEqual(["attacker:small_specie", "attacker:small_specie"]);
    scene.showAttackMissedVfx({ ...attacker, getId: () => "second-attacker" }, fairy, { missed: true });
    expect(pops.at(-1)).toBe("second-attacker:small_specie");
    expect(canPreviewCreatureLabState({ name: "Fairy", abilities: ["Small Specie"], spells: [] }, "small_specie")).toBe(
        true,
    );
    expect(
        canPreviewCreatureLabState({ name: "Leprechaun", abilities: ["Lucky Strike"], spells: [] }, "small_specie"),
    ).toBe(false);
});

test("nine Small Specie cels follow the mirrored flag, replay on the next dodge and end after 650 ms", async () => {
    const meta = animationAtlases["Vfx Small Specie"].pop;
    expect(meta.frameCount).toBe(9);
    expect(meta.frameDurationsMs?.reduce((a, b) => a + b, 0)).toBe(650);
    expect(isLazyCombatEffectAssetKey("vfx_small_specie_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_small_specie_pop_atlas")).toBe(false);
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    let now = 0;
    let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
    const pops = new CommonFlagPops(
        "small_specie",
        (c) => root.addChild(c),
        () => now,
    );
    try {
        await pops.spawn("fairy", anchor, 64, () => anchor);
        const pop = root.children[0];
        const sprite = pop.children[0] as Sprite;
        const first = sprite.texture;
        const seen = new Set<Texture>();
        for (now = 0; now < 650; now += 5) {
            pops.update(0);
            seen.add(sprite.texture);
        }
        expect(seen.size).toBe(9);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        now = 640;
        anchor = { x: 180, y: 260 };
        await pops.spawn("fairy", anchor, 64, () => anchor);
        expect(root.children).toHaveLength(1);
        expect(sprite.texture).toBe(first);
        expect(pop.position.x).toBe(180);
        expect(pop.position.y).toBeCloseTo(260 + 64 * 0.07);
        now = 1289;
        pops.update(0);
        expect(pops.active).toBe(true);
        now = 1290;
        pops.update(0);
        expect(pops.active).toBe(false);
        expect(pop.destroyed).toBe(true);
        await pops.spawn("fairy", anchor, 64, () => anchor);
        anchor = undefined;
        pops.update(0);
        expect(pops.active).toBe(false);
    } finally {
        pops.clear();
        await Promise.resolve();
        expect(atlas.source.destroyed).toBe(false);
        load.mockRestore();
        unload.mockRestore();
        root.destroy({ children: true });
    }
});
