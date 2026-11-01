import { expect, mock, test } from "bun:test";
import type { IVisibleDamage } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

test.each(
    ["sandbox", "ranked"].flatMap((mode) =>
        (["ember_covenant", "water_shield"] as const).map((shield) => ({ mode, shield })),
    ),
)("$mode renders Thunderbird lightning after $shield absorbs the physical blow", ({ mode, shield }) => {
    const primary = { x: 160, y: 220 };
    const bounce = { x: 224, y: 220 };
    const unit = (point: { x: number; y: number }) => ({
        getVisualCenter: () => point,
        getDamagePredictionAnchor: () => undefined,
        hasAbilityActive: (name: string) => name === "Chain Lightning",
    });
    const attacker = unit({ x: 96, y: 220 });
    const target = unit(primary);
    const units = new Map([
        ["thunderbird", attacker],
        ["target", target],
        ["bounce", unit(bounce)],
    ]);
    const visuals = {
        spawnChainLightning: mock<(points: { x: number; y: number }[], cellSize: number) => void>(() => {}),
        showFloatingDamage: mock<(position: unknown, amount: number) => void>(() => {}),
    };
    const scene = Object.assign(Object.create(mode === "ranked" ? RankedPlayScene.prototype : Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        unitsHolder: { getAllUnits: () => units },
        combatVisuals: visuals,
        showShieldAbsorbs: () => {},
        showFleshShieldAbsorbedDamage: () => {},
        showDevourEssenceHeals: () => {},
    });
    const damage: IVisibleDamage = {
        amount: 0,
        render: true,
        unitId: "target",
        unitPosition: primary,
        unitIsSmall: true,
        hits: [{ amount: 0, unitsDied: 0 }],
        secondary: [
            {
                source: shield,
                unitId: "target",
                position: primary,
                amount: 40,
                unitsDied: 0,
            },
            { source: "chain_lightning", unitId: "target", position: primary, amount: 32, unitsDied: 0 },
            { source: "chain_lightning", unitId: "bounce", position: bounce, amount: 22, unitsDied: 0 },
        ],
    };
    if (mode === "ranked") scene.applyAuthoritativeSecondaryVfx("thunderbird", damage);
    else scene.spawnChainLightningVfx(attacker, target, damage);

    expect(visuals.spawnChainLightning.mock.calls).toEqual([[[primary, bounce], 64]]);
    if (mode === "ranked") expect(visuals.showFloatingDamage.mock.calls.map((args) => args[1])).toEqual([32, 22]);
});
