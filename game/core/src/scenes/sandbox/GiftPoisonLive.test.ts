import { expect, spyOn, test } from "bun:test";
import { Container, Sprite, Text, Texture, TextureSource } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { CombatVisuals } from "./CombatVisuals";

function fixture() {
    const root = new Container();
    // Match normal Sandbox/ranked scenes: no archived-effects opt-in.
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 80 }) as GridSettings,
        attachToWorldRoot: (container) => {
            root.addChild(container);
        },
        getUnitsHolder: () => ({ getAllUnits: () => new Map() }) as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    // Keep the actual Pixi scene graph and animation; substitute only canvas-generated texture pixels.
    const internals = visuals as unknown as {
        lightTexture: Texture;
        poisonTexture: Texture;
        abilitySteals: { payload: Container; stolenLabel: Text; drawWeb: boolean }[];
    };
    const light = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
    const poison = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
    internals.lightTexture = light;
    internals.poisonTexture = poison;
    return { root, visuals, internals, light, poison };
}

for (const mode of ["gifted", "copied"] as const) {
    test(`live ${mode} ability flies with its name and arrival waits across a ranked hydrate`, () => {
        const f = fixture();
        const icon = new Texture({ source: new TextureSource({ width: 32, height: 32 }) });
        let arrivals = 0;
        const from = { x: 20, y: 30 };
        const to = { x: 220, y: 130 };
        try {
            f.visuals.spawnAbilityGift(from, to, 80, "Wild Regeneration", mode, icon, () => arrivals++);
            expect(f.root.children).toHaveLength(1);
            expect(arrivals).toBe(0);
            const effect = f.root.children[0];
            const transfer = f.internals.abilitySteals[0];
            expect(transfer.stolenLabel.text).toBe(mode.toUpperCase());
            expect(transfer.stolenLabel.x).toBe(to.x);
            expect(transfer.drawWeb).toBe(false);
            expect(
                transfer.payload.children.some((child) => child instanceof Text && child.text === "Wild Regeneration"),
            ).toBe(true);
            expect(transfer.payload.children.some((child) => child instanceof Sprite && child.texture === icon)).toBe(
                true,
            );

            // The flight uses captured positions, so replacing the board cannot retarget or cancel it.
            from.x = -500;
            to.x = 900;
            f.visuals.update(0.15);
            expect(transfer.payload.x).toBeGreaterThan(20);
            expect(transfer.payload.x).toBeLessThan(220);
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(effect.destroyed).toBe(false);
            expect(f.light.destroyed).toBe(false);
            f.visuals.update(0.3);
            expect(arrivals).toBe(0);
            f.visuals.update(0.02);
            expect(arrivals).toBe(1);
            expect(transfer.payload.x).toBe(220);
            expect(transfer.payload.y).toBe(130);
            f.visuals.update(0.4);
            expect(arrivals).toBe(1);
            expect(effect.destroyed).toBe(true);
            expect(f.root.children).toHaveLength(0);
            expect(icon.destroyed).toBe(false);
        } finally {
            f.visuals.clear();
            icon.destroy(true);
        }
        expect(f.light.destroyed).toBe(true);
    });

    test(`a scene reset cancels a live ${mode} flight without flashing the next fight`, () => {
        const f = fixture();
        let arrivals = 0;
        try {
            f.visuals.spawnAbilityGift(
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                80,
                "Wild Regeneration",
                mode,
                undefined,
                () => arrivals++,
            );
            const effect = f.root.children[0];
            f.visuals.update(0.1);
            f.visuals.clear();
            f.visuals.update(1);
            expect(arrivals).toBe(0);
            expect(effect.destroyed).toBe(true);
            expect(f.root.children).toHaveLength(0);
        } finally {
            f.visuals.clear();
        }
    });

    test(`a same-position ${mode} transfer arrives once without creating a degenerate flight`, () => {
        const f = fixture();
        let arrivals = 0;
        try {
            f.visuals.spawnAbilityGift(
                { x: 20, y: 30 },
                { x: 20, y: 30 },
                80,
                "Wild Regeneration",
                mode,
                undefined,
                () => arrivals++,
            );
            expect(arrivals).toBe(1);
            expect(f.root.children).toHaveLength(0);
            f.visuals.update(1);
            expect(arrivals).toBe(1);
        } finally {
            f.visuals.clear();
        }
    });
}

test("live poison ticks billow over the victim alongside green damage/casualty feedback, then expire", () => {
    const f = fixture();
    const random = spyOn(Math, "random").mockReturnValue(0.5);
    const textureFrom = spyOn(Texture, "from").mockReturnValue(Texture.WHITE);
    try {
        const victim = { x: 120, y: 300 };
        f.visuals.showFloatingDamage(victim, 42, undefined, 2, "#7be639", "#123d0a");
        f.visuals.spawnPoisonCloud(victim, 80);
        expect(f.root.children).toHaveLength(2);
        const [numbers, cloud] = f.root.children;
        expect(numbers.destroyed).toBe(false);
        expect((numbers.children[0] as Text).text).toBe("-42");
        expect((numbers.children[0] as Text).style.fill).toBe("#7be639");
        expect((numbers.children[2] as Text).text).toBe("2");
        expect(cloud.children.length).toBeGreaterThan(0);
        const puffs = cloud.children as Sprite[];
        expect(puffs.every((puff) => !puff.visible)).toBe(true);
        f.visuals.update(0.2);
        expect(puffs.every((puff) => puff.visible && puff.alpha > 0)).toBe(true);
        expect(puffs.every((puff) => puff.x === victim.x && puff.y > victim.y)).toBe(true);
        const size = puffs[0].scale.x;
        f.visuals.update(0.2);
        expect(puffs[0].scale.x).toBeGreaterThan(size);
        f.visuals.update(1);
        expect(cloud.destroyed).toBe(true);
        expect(f.root.children.includes(cloud)).toBe(false);
        // Expiry retires the particles; the scene owns the reusable texture until teardown.
        expect(f.poison.destroyed).toBe(false);
    } finally {
        random.mockRestore();
        textureFrom.mockRestore();
        f.visuals.clear();
    }
    expect(f.poison.destroyed).toBe(true);
});

test("a live poison cloud is removed immediately when its scene is cleared", () => {
    const f = fixture();
    try {
        f.visuals.spawnPoisonCloud({ x: 120, y: 300 }, 80);
        const cloud = f.root.children[0];
        f.visuals.update(0.2);
        f.visuals.clear();
        expect(cloud.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
        expect(f.poison.destroyed).toBe(true);
    } finally {
        f.visuals.clear();
    }
});
