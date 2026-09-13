import { WOLF_POSE_BODY } from "./WolfIdleCalibration";

// Eye/nose centers in the original 768px art. These locate the authored head;
// they do not animate it or replace the movement in the full-body frames.
export const WOLF_HEAD_EYE_NOSE = [
    [623, 263, 694, 313],
    [621, 258, 690, 301],
    [621, 224, 695, 247],
    [621, 179, 704, 183],
    [602, 158, 678, 144],
    [578, 134, 643, 104],
    [555, 109, 615, 59],
    [554, 96, 607, 40],
    [554, 90, 608, 29],
] as const;
export const WOLF_BASE_HEAD_EYE = [651, 258] as const;
const registeredY = (y: number, pose: number): number => {
    const [top, belly] = WOLF_POSE_BODY[pose];
    return y <= top
        ? y + 265 - top
        : y <= belly
          ? 265 + ((y - top) * 220) / (belly - top)
          : 485 + ((y - belly) * 212) / (697 - belly);
};
export const WOLF_HEAD_FRAMES = WOLF_HEAD_EYE_NOSE.map(([ex, ey, nx, ny], pose) => {
    const y = registeredY(ey, pose),
        noseY = registeredY(ny, pose);
    const [a, b, c, d] = WOLF_HEAD_EYE_NOSE[0];
    const angle = Math.atan2(noseY - y, nx - ex) - Math.atan2(registeredY(d, 0) - registeredY(b, 0), c - a);
    const cos = Math.cos(angle),
        sin = Math.sin(angle);
    const dx = WOLF_BASE_HEAD_EYE[0] - a,
        dy = WOLF_BASE_HEAD_EYE[1] - registeredY(b, 0);
    return [ex + cos * dx - sin * dy, y + sin * dx + cos * dy, cos, sin] as const;
});

// Neutral skull, cheeks and ears registered to the original cutout. The same
// correction travels with the head in every pose, so it cannot grow at the seam.
export const WOLF_HEAD_NEUTRAL_LANDMARKS = [
    [611, 142, 577, 160],
    [675, 152, 645, 164],
    [638, 194, 615, 208],
    [651, 258, 623, 263],
    [715, 315, 694, 313],
    [729, 316, 707, 311],
    [658, 368, 646, 365],
    [630, 330, 609, 335],
    [588, 363, 568, 367],
    [593, 432, 585, 435],
    [503, 188, 494, 200],
    [447, 206, 447, 214],
    [475, 270, 471, 270],
    [470, 390, 470, 390],
] as const;
const smooth = (a: number, b: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Inverse head registration in the same upright coordinates as the body filter. */
export function wolfHeadSourcePoint(x: number, y: number, pose: number): { x: number; y: number } {
    const frame = WOLF_HEAD_FRAMES[pose];
    if (!frame) return { x, y };
    const [ex, ey, c, s] = frame,
        rx = x - ex,
        ry = y - ey;
    const nx = 651 + c * rx + s * ry,
        ny = 258 - s * rx + c * ry;
    const weight = smooth(430, 510, nx) * (1 - smooth(420, 485, ny)) * (1 - smooth(350, 460, y));
    if (weight <= 0) return { x, y };
    let dx = 0,
        dy = 0,
        total = 0;
    for (const [ax, ay, bx, by] of WOLF_HEAD_NEUTRAL_LANDMARKS) {
        const d = Math.max(1, (nx - ax) ** 2 + (ny - ay) ** 2),
            w = 1 / (d * d);
        dx += (bx - ax) * w;
        dy += (registeredY(by, 0) - ay) * w;
        total += w;
    }
    dx = (dx / total) * weight;
    dy = (dy / total) * weight;
    return { x: x + c * dx - s * dy, y: y + s * dx + c * dy };
}

export const wolfHeadGeometryGlsl = /* glsl */ `
void headLandmark(vec2 point,vec2 a,vec2 b,inout vec2 displacement,inout float total){
    vec2 delta=point-a;float distance=max(dot(delta,delta),1.0);float weight=1.0/(distance*distance);
    displacement+=(b-a)*weight;total+=weight;
}
vec2 registeredHead(vec2 point,vec4 frame){
    vec2 relative=point-frame.xy;
    vec2 neutral=vec2(651.0,258.0)+vec2(frame.z*relative.x+frame.w*relative.y,-frame.w*relative.x+frame.z*relative.y);
    float weight=smoothstep(430.0,510.0,neutral.x)*(1.0-smoothstep(420.0,485.0,neutral.y))*(1.0-smoothstep(350.0,460.0,point.y));
    if(weight<=0.0)return point;
    vec2 displacement=vec2(0.0);float total=0.0;
    ${WOLF_HEAD_NEUTRAL_LANDMARKS.map(([ax, ay, bx, by]) => `headLandmark(neutral,vec2(${ax.toFixed(1)},${ay.toFixed(1)}),vec2(${bx.toFixed(1)},${registeredY(by, 0).toFixed(5)}),displacement,total);`).join("\n")}
    displacement=displacement/total*weight;
    return point+vec2(frame.z*displacement.x-frame.w*displacement.y,frame.w*displacement.x+frame.z*displacement.y);
}
`;
