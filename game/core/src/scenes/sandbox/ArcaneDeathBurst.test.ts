import { describe, expect, test } from "bun:test";

import { advanceArcaneDeathBurst, ARCANE_DEATH_LIFE, createArcaneDeathBurst } from "./ArcaneDeathBurst";

// The burst is a shader effect, so its LOOK cannot be asserted here — what is pinned is the contract the
// caller depends on: it builds, it is centred and sized as asked, its single uniform advances 0..1, and it
// reports completion exactly once so CombatVisuals destroys it instead of leaking a container per death.
describe("arcane death burst", () => {
    // Pixi touches `document` while building the FIRST filter of a process, which a headless runner does not
    // have, so that one attempt throws and createArcaneDeathBurst correctly reports "no shader" (the caller
    // then falls back to the shatter). Every later build succeeds. Burn that first attempt here so the cases
    // below exercise the real path rather than the one-off headless quirk; a browser never hits it.
    createArcaneDeathBurst(1, 0);

    const uniforms = (burst: ReturnType<typeof createArcaneDeathBurst>) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (burst!.filter.resources as any).arcaneDeathUniforms.uniforms;

    test("builds a centred, additive quad of the requested size", () => {
        const burst = createArcaneDeathBurst(240, 0.5);
        expect(burst).toBeDefined();
        expect(burst!.container.blendMode).toBe("add");
        const bounds = burst!.container.getLocalBounds();
        expect(bounds.width).toBeCloseTo(240, 3);
        expect(bounds.height).toBeCloseTo(240, 3);
        // Centred on its own origin, so the caller only has to position it on the dying unit.
        expect(bounds.x).toBeCloseTo(-120, 3);
        expect(bounds.y).toBeCloseTo(-120, 3);
    });

    test("carries the seed so two deaths draw different crack patterns", () => {
        expect(uniforms(createArcaneDeathBurst(100, 0.25)).uSeed).toBeCloseTo(0.25, 6);
        expect(uniforms(createArcaneDeathBurst(100, 0.9)).uSeed).toBeCloseTo(0.9, 6);
    });

    test("advances progress across its life and finishes exactly at the end", () => {
        const burst = createArcaneDeathBurst(100, 0.1)!;
        expect(uniforms(burst).uProgress).toBe(0);

        expect(advanceArcaneDeathBurst(burst, ARCANE_DEATH_LIFE * 0.25)).toBe(true);
        expect(uniforms(burst).uProgress).toBeCloseTo(0.25, 5);

        expect(advanceArcaneDeathBurst(burst, ARCANE_DEATH_LIFE * 0.5)).toBe(true);
        expect(uniforms(burst).uProgress).toBeCloseTo(0.75, 5);

        // The frame that crosses the end reports done and leaves the uniform untouched.
        expect(advanceArcaneDeathBurst(burst, ARCANE_DEATH_LIFE * 0.3)).toBe(false);
    });
});
