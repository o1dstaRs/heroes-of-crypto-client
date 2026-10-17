/** Painted fracture, outward debris and settling dust; all motion lives in the cels. */
// Original burst: 845ms. Prior +50%, then another +100% (2x current speed);
// projectile flight and creature action timing are independent of this effect.
export const GARGANTUAN_IMPACT_DURATIONS = Array<number>(24).fill(845 / 1.5 / 2 / 24);
export const GARGANTUAN_IMPACT_FRAME_SIZE = 512;
export const GARGANTUAN_IMPACT_ANCHOR_Y = 0.5;
// Symmetric alpha>=32 envelope around the authored contact (256,256).
export const GARGANTUAN_IMPACT_PAINTED_EXTENT = 270;
export const GARGANTUAN_IMPACT_AREA_CELLS = 3;
// Every cel contains fractured debris; the projectile supplies the intact rock.
export const GARGANTUAN_IMPACT_START_FRAME = 0;

export function gargantuanImpactFrame(elapsedMs: number): number {
    let end = 0;
    for (let i = 0; i < GARGANTUAN_IMPACT_DURATIONS.length; i++) {
        end += GARGANTUAN_IMPACT_DURATIONS[i];
        if (elapsedMs < end) return i;
    }
    return -1;
}
