import { type Filter, type Sprite } from "pixi.js";

export const BOAR_LAB_WALK_SCALE_X = 1.0814132104454686;
export const BOAR_LAB_WALK_SCALE_Y = 1.0466666666666666;
const gradeTag = Symbol.for("hoc.boar.midpoint.palette");
type TaggedGrade = Filter & { [gradeTag]?: boolean };

// Both source artwork and repainted gait now carry their final materials in RGB.
// Remove the rejected runtime palette and procedural fur experiments.
export function syncBoarLabWalkPalette(sprite: Sprite, _walking: boolean, _enabled = true): void {
    const installed = sprite.filters ?? [];
    const remaining = installed.filter((filter) => !(filter as TaggedGrade)[gradeTag]);
    if (remaining.length !== installed.length) sprite.filters = remaining.length ? remaining : null;
}
