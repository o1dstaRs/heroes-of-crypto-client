import { ARBALESTER_LOWER_BODY_DATA, ARBALESTER_LOWER_PROTECTION } from "./ArbalesterAttackLowerBodyData";

/** Native 512px attack calibration. Source artwork and all vertical coordinates remain unchanged. */
export const ARBALESTER_LOWER_ROWS = [240, 270, 310, 340, 366, 390, 410, 430] as const;
export interface ArbalesterLowerBodyFrame {
    source: Float32Array;
    target: Float32Array;
    protection: Float32Array;
    startY: number;
}

// Build once; frame0 and frame11 always bypass calibration.
const profiles: Readonly<Record<string, readonly ArbalesterLowerBodyFrame[]>> = Object.fromEntries(
    Object.entries(ARBALESTER_LOWER_BODY_DATA).map(([state, frames]) => [
        state,
        frames.map((rows, index) => {
            const protection = ARBALESTER_LOWER_PROTECTION[state][index];
            const lastOcclusion = protection.reduce((last, row, y) => (row[0] === 0 ? y : last), -1);
            const source = new Float32Array(rows.flatMap((row) => row.slice(0, 4)));
            const target = new Float32Array(rows.flatMap((row) => row.slice(4, 8)));
            // Register the leather panels progressively from waist to knee. The former
            // row270 offset applied most of the correction immediately below the belt,
            // which bent straight panel seams into an S even with smooth interpolation.
            const panelFraction =
                (ARBALESTER_LOWER_ROWS[1] - ARBALESTER_LOWER_ROWS[0]) /
                (ARBALESTER_LOWER_ROWS[2] - ARBALESTER_LOWER_ROWS[0]);
            for (let anchor = 0; anchor < 4; anchor++) {
                const waistOffset = source[anchor] - target[anchor];
                const kneeOffset = source[8 + anchor] - target[8 + anchor];
                target[4 + anchor] = source[4 + anchor] - (waistOffset + (kneeOffset - waistOffset) * panelFraction);
            }
            return {
                source,
                target,
                protection: new Float32Array(protection.flat()),
                startY: Math.max(state === "melee_attack_up" && index === 0 ? 280 : 240, 241 + lastOcclusion),
            };
        }),
    ]),
);

export function arbalesterAttackLowerBodyFrame(state: string, frame: number): ArbalesterLowerBodyFrame | undefined {
    if (!Number.isInteger(frame) || frame <= 0 || frame >= 11) return undefined;
    return profiles[state]?.[frame - 1];
}

// WebGL's GLSL100 path forbids indexing uniform arrays with a pixel coordinate.
// Constant leaves keep the lookup portable, with at most seven comparisons.
function protectionLookup(first: number, last: number): string {
    if (first === last) return `return uLowerProtection[${first}];`;
    const middle = Math.floor((first + last) / 2);
    return `if (y < ${241 + middle}.0) { ${protectionLookup(first, middle)} }
        else { ${protectionLookup(middle + 1, last)} }`;
}

/** Inverse horizontal sampling only. The original crossbow lies outside these body intervals. */
export const arbalesterLowerBodyShader = /* glsl */ `
uniform mat3 uBodyInverse;
uniform vec4 uLowerSource[8];
uniform vec4 uLowerTarget[8];
uniform vec2 uLowerProtection[112];
uniform float uRepairLower;
uniform float uLowerStartY;
vec2 lowerProtection(float y) { ${protectionLookup(0, 111)} }
float lowerRow(int i) {
    if (i == 0) return 240.0;
    if (i == 1) return 270.0;
    if (i == 2) return 310.0;
    if (i == 3) return 340.0;
    if (i == 4) return 366.0;
    if (i == 5) return 390.0;
    if (i == 6) return 410.0;
    return 430.0;
}
float lowerBodySourceX(float x, float y) {
    if (uRepairLower < 0.5 || y <= lowerRow(0)) return x;
    vec4 s = uLowerSource[7];
    vec4 d = uLowerTarget[7];
    for (int i=1; i<8; i++) {
        if (y <= lowerRow(i)) {
            // Linear panel registration avoids stopping each seam at an intermediate
            // row. Preserve the existing knee/boot sampling from row310 downwards.
            float f = i <= 2 ? (y-lowerRow(i-1))/(lowerRow(i)-lowerRow(i-1))
                : smoothstep(lowerRow(i-1),lowerRow(i),y);
            s = mix(uLowerSource[i-1],uLowerSource[i],f);
            d = mix(uLowerTarget[i-1],uLowerTarget[i],f);
            break;
        }
    }
    float mapped;
    if (x < d.x) mapped = s.x + x - d.x;
    else if (x < d.y) mapped = mix(s.x,s.y,(x-d.x)/max(0.001,d.y-d.x));
    else if (x < d.z) mapped = mix(s.y,s.z,(x-d.y)/max(0.001,d.z-d.y));
    else if (x < d.w) mapped = mix(s.z,s.w,(x-d.z)/max(0.001,d.w-d.z));
    else {
        // A monotone segment joins the body to the unchanged weapon region.
        // Blending a displaced silhouette with identity at its edge can fold the
        // sampling coordinates and draw a second contour. This cannot fold.
        mapped = s.w+x-d.w;
        if (y < 352.0) {
            vec2 gap = lowerProtection(y);
            if (gap.x < 0.5) return x;
            if (gap.x < 511.0) {
                float start = gap.x - (s.w-d.w);
                if (start >= gap.y) return x;
                if (x > start) mapped = x >= gap.y ? x
                    : mix(gap.x,gap.y,(x-start)/(gap.y-start));
            }
        }
    }
    return mix(x,mapped,smoothstep(uLowerStartY,uLowerStartY+20.0,y));
}
`;
