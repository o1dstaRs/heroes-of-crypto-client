import { expect, mock, test } from "bun:test";
import { GridSettings } from "@heroesofcrypto/common";
import { Container } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";

const grid = new GridSettings(4, 400, 0, 400, 0, 0, 0);

function fixture() {
    const status = { active: false, dead: false };
    const aura = mock(() => undefined);
    const burst = mock(() => undefined);
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        getPosition: () => ({ x: 200, y: 200 }),
        getName: () => "Mermaid",
        isDead: () => status.dead,
        hasStatusBuff: (name: string) => name === "Water Shield" && status.active,
        hasStatusEffect: () => false,
        ensureVisual: () => undefined,
        updateWaterShieldAura: aura,
        updateWaterShieldBreak: burst,
        waterShieldWasActive: false,
        waterShieldLabPreview: false,
        waterShieldLabBroken: false,
    });
    const root = new Container();
    return { status, unit, aura, burst, root, sync: () => unit.syncVisual(root, grid) };
}

test("authoritative shield removal starts one rupture clock, never on an unshielded hit or death", () => {
    const { status, unit, aura, burst, root, sync } = fixture();
    sync();
    expect(burst).not.toHaveBeenCalled();
    status.active = true;
    sync();
    expect(aura).toHaveBeenCalledTimes(1);
    expect(burst).not.toHaveBeenCalled();
    status.active = false;
    sync();
    const started = unit.waterShieldBreakStartMs;
    expect(typeof started).toBe("number");
    sync();
    expect(unit.waterShieldBreakStartMs).toBe(started);
    expect(burst).toHaveBeenCalledTimes(2);
    unit.waterShieldBreakStartMs = undefined;
    status.active = true;
    sync();
    status.active = false;
    status.dead = true;
    sync();
    expect(unit.waterShieldBreakStartMs).toBeUndefined();
    expect(burst).toHaveBeenCalledTimes(2);
    root.destroy();
});

test("lab rupture suppresses only artwork, keeps the real buff and restores through idle", () => {
    const { status, unit, aura, burst, root, sync } = fixture();
    status.active = true;
    unit.waterShieldLabPreview = true;
    sync();
    unit.setWaterShieldBreakPreview(true);
    sync();
    expect(status.active).toBe(true);
    expect(aura).toHaveBeenCalledTimes(1);
    expect(burst).toHaveBeenCalledTimes(1);
    unit.waterShieldBreakStartMs = undefined; // completed visual lifetime
    sync();
    expect(aura).toHaveBeenCalledTimes(1);
    unit.setWaterShieldBreakPreview(false);
    sync();
    expect(aura).toHaveBeenCalledTimes(2);
    expect(unit.waterShieldBreakStartMs).toBeUndefined();
    expect(canPreviewCreatureLabState({ name: "Mermaid", abilities: [], spells: [] }, "water_shield_break")).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Wolf", abilities: [], spells: [] }, "water_shield_break")).toBe(false);
    root.destroy();
});
