import { expect, spyOn, test } from "bun:test";

// Engine damage and healing can be fractional (a 0.5 multiplier, Mass Heal's 2.5 per creature), and a
// client-side sum once printed "-90.23182481481284". Floaters show at most hundredths, like the sidebar.
test("damage and heal floaters print at most two decimals, trailing zeroes dropped", async () => {
    const { Container, Text } = await import("pixi.js");
    const { CombatVisuals } = await import("./sandbox/CombatVisuals");
    const root = new Container();
    root.scale.y = -1;
    const clock = spyOn(performance, "now").mockImplementation(() => 1000);
    const at = { x: 100, y: 200 };
    const unit = {
        getId: () => "victim",
        isDead: () => false,
        getFlagEffectAnchor: () => at,
        getDamagePredictionAnchor: () => at,
    } as unknown as import("./RenderableUnit").RenderableUnit;
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 64 }),
        getUnitsHolder: () => ({ getAllUnits: () => new Map([["victim", unit]]) }),
        attachToWorldRoot: (node: InstanceType<typeof Container>) => {
            root.addChild(node);
        },
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    } as unknown as import("./sandbox/CombatVisuals").ICombatVisualsContext);
    const texts = (): string[] => {
        const found: string[] = [];
        const walk = (node: InstanceType<typeof Container>): void => {
            if (node instanceof Text) found.push(node.text);
            for (const child of node.children) walk(child as InstanceType<typeof Container>);
        };
        walk(root);
        return found;
    };
    try {
        visuals.showFloatingDamage(at, 90.23182481481284, undefined, 0);
        visuals.showFloatingDamage(at, 159.5, undefined, 0);
        visuals.showFloatingDamage(at, 25, undefined, 0);
        visuals.showHealPop(at, 253.5);
        visuals.update(0);
        expect(texts()).toEqual(expect.arrayContaining(["-90.23", "-159.5", "-25", "+253.5 HP"]));
        expect(texts().some((text) => /\.\d{3,}/.test(text))).toBe(false);
    } finally {
        clock.mockRestore();
    }
});
