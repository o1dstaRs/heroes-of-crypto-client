import { expect, mock, spyOn, test } from "bun:test";
import type { GameEvent, GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { OVERHEAD_EFFECT_DURATION_MS } from "../settings/statusEffectTiming";
import { animationAtlases } from "../generated/animation_atlases";
import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";
import { CombatVisuals } from "./sandbox/CombatVisuals";

const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};
const fixture = () => {
    const root = new Container();
    root.scale.set(0.8, -0.5);
    const unit = {
        getId: () => "ally",
        isDead: () => false,
        getFlagEffectAnchor: () => ({ x: 100, y: 200 }),
        flashBuffApplied: mock(() => undefined),
        flashDebuffDarken: mock(() => undefined),
    };
    const units = new Map([
        ["ally", unit],
        ["dead", { ...unit, isDead: () => true }],
    ]);
    const grid = { getCellSize: () => 64 } as GridSettings;
    const holder = { getAllUnits: () => units } as unknown as UnitsHolder;
    const visuals = new CombatVisuals({
        legacyEffectsEnabled: false,
        getGridSettings: () => grid,
        attachToWorldRoot: (object) => root.addChild(object),
        getUnitsHolder: () => holder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { root, unit, units, grid, holder, visuals };
};

test.each([
    { label: "local", Scene: Sandbox },
    { label: "ranked/replay", Scene: RankedPlayScene },
])(
    "$label presents confirmed Spiritual Armor refreshes and lap Morale/Dismorale as visible, finite icons",
    async ({ Scene }) => {
        let now = 1000;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const f = fixture();
        const textures: string[] = [];
        const scene = Object.assign(Object.create(Scene.prototype), {
            unitsHolder: f.holder,
            dyingVisualUnits: [],
            sc_sceneSettings: { getGridSettings: () => f.grid },
            isSceneDestroyed: () => false,
            combatVisuals: f.visuals,
            waitForTexture: async (name: string) => {
                textures.push(name);
                return Texture.WHITE;
            },
        });
        try {
            const armor: GameEvent[] = [
                {
                    type: "effects_applied",
                    applications: [
                        { unitId: "ally", name: "Spiritual Armor", kind: "buff" },
                        { unitId: "ally", name: "Spiritual Armor", kind: "buff" },
                        { unitId: "ally", name: "Spiritual Armor", kind: "buff", resisted: true },
                        { unitId: "ally", name: "Spiritual Armor", kind: "debuff" },
                        { unitId: "ally", name: "Spiritual Armor", kind: "buff", sourceUnitId: "donor" },
                        { unitId: "dead", name: "Spiritual Armor", kind: "buff" },
                        { unitId: "missing", name: "Spiritual Armor", kind: "buff" },
                    ],
                },
            ];
            for (const name of ["Spiritual Armor", "Spiritual Armor", "Morale", "Dismorale"]) {
                if (name === "Spiritual Armor") scene.renderCastOutcomes(armor);
                else scene.spawnMoralePop("ally", name === "Morale" ? "plus" : "minus");
                await flush();
                now += 50;
                f.visuals.update(0);
                const pops = f.root.children.filter((child) =>
                    child.children.some((c) => c.label === `effect-icon:${name}`),
                );
                expect(pops).toHaveLength(1);
                const pop = pops[0];
                const icon = pop.children.find((child) => child.label === `effect-icon:${name}`) as Sprite;
                expect(icon.texture).toBe(Texture.WHITE);
                expect(icon.width).toBeGreaterThan(0);
                expect(pop.alpha).toBeGreaterThan(0);
                expect(pop.children.find((child) => child.label === "effect-caption")?.children[0].label).toBe(
                    `effect-name:${name}`,
                );
                const y = pop.y;
                now += 650;
                f.visuals.update(0);
                expect(pop.y).toBe(y);
                now += OVERHEAD_EFFECT_DURATION_MS - 650;
                f.visuals.update(0);
                expect(pop.destroyed).toBe(true);
            }
            expect(textures).toEqual(["spiritual_armor_256", "spiritual_armor_256", "morale_256", "dismorale_256"]);
            expect(f.unit.flashBuffApplied).toHaveBeenCalledTimes(3);
            expect(f.unit.flashDebuffDarken).toHaveBeenCalledTimes(1);
        } finally {
            f.visuals.clear();
            f.root.destroy({ children: true });
            clock.mockRestore();
        }
    },
);

test.each([
    { label: "local", Scene: Sandbox },
    { label: "ranked/replay", Scene: RankedPlayScene },
])("$label shows every buff's icon under its name, and attack-proc debuffs stay captions", async ({ Scene }) => {
    const f = fixture();
    const textures: string[] = [];
    const scene = Object.assign(Object.create(Scene.prototype), {
        unitsHolder: f.holder,
        sc_sceneSettings: { getGridSettings: () => f.grid },
        isSceneDestroyed: () => false,
        combatVisuals: f.visuals,
        waitForTexture: async (name: string) => {
            textures.push(name);
            return Texture.WHITE;
        },
    });
    try {
        // Blessing has no authored pop: it used to land as a bare caption (owner report, 2026-11-26).
        for (const [name, kind] of [
            ["Blessing", "buff"],
            ["Arrows Wingshield Blessing", "buff"],
            ["Wild Regeneration", "buff"],
            ["Poison", "debuff"],
        ] as const) {
            scene.popEffectOnUnit(f.unit, name, 0, kind);
            await flush();
            const pop = f.root.children.at(-1)!;
            expect(pop.children.find((child) => child.label === "effect-caption")?.children[0].label).toBe(
                `effect-name:${name}`,
            );
            const icon = pop.children.find((child) => child.label === `effect-icon:${name}`) as Sprite | undefined;
            if (kind === "buff") {
                expect(icon?.texture).toBe(Texture.WHITE);
                expect(icon!.width).toBeGreaterThan(0);
            } else expect(icon).toBeUndefined();
        }
        // The pop finds the same art as the sidebar: the Angel's renamed blessing keeps its aura icon.
        expect(textures).toEqual(["blessing_256", "arrows_wingshield_aura_256", "wild_regeneration_256", "poison_256"]);
    } finally {
        f.visuals.clear();
        f.root.destroy({ children: true });
    }
});

test("mass spell captions remain distinct from the shared single-target artwork and match its faction", async () => {
    const meta = animationAtlases["Vfx Ogre Riot"].pop;
    const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const f = fixture();
    try {
        // Reusing the same artwork must not reuse a layer whose caption was fixed by the earlier cast.
        for (const [name, kind] of [
            ["Riot", "ogre_riot"],
            ["Mass Riot", "ogre_riot"],
            ["Magic Mirror", "ogre_magic_mirror"],
            ["Mass Magic Mirror", "ogre_magic_mirror"],
        ] as const) {
            f.visuals.spawnCommonFlagPop(f.unit as unknown as RenderableUnit, kind, "combat", undefined, name);
            await flush();
            const caption = f.root.children
                .flatMap((child) => child.children)
                .filter((child) => child.label === "effect-caption")
                .flatMap((child) => child.children)
                .find((child) => child.label === `effect-name:${name}`);
            expect(caption).toBeDefined();
            expect(caption).toHaveProperty("text", name);
            expect(caption).toHaveProperty("style.fill", "#f2a15f");
        }
        expect(f.root.children).toHaveLength(4);
    } finally {
        f.visuals.clear();
        await flush();
        f.root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});
