/** Source-space deformation shared by silk, shadows and spider contacts.
 * Low modes carry the whole connected web; smaller modes trail the gust.
 * The original square attachments remain fixed, rather than rocking the quad.
 */
export const ARACHNA_WEB_SWAY_MS = 5600;
export const ARACHNA_WEB_PULSE_MS = 4000;
export const ARACHNA_WEB_MOTION_LOOP_MS = 28000;
const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Broad tension depression follows the light, with a smaller elastic return. */
export function arachnaPulseTension(x: number, y: number, time: number) {
    const phase =
        (((time % ARACHNA_WEB_PULSE_MS) + ARACHNA_WEB_PULSE_MS) % ARACHNA_WEB_PULSE_MS) / ARACHNA_WEB_PULSE_MS;
    const radius = Math.hypot(x - 320, y - 320);
    const q = phase * 1.6 - 0.28 - (radius - 60) / 385;
    const gate = smooth(0, 0.08, phase) * (1 - smooth(0.9, 0.995, phase)) * smooth(54, 95, radius);
    const load = Math.exp(-((q / 0.18) ** 2)) * gate;
    const recovery = Math.exp(-(((q - 0.28) / 0.21) ** 2)) * gate;
    return { radial: -2.8 * load + 0.8 * recovery, height: -5 * load + 1.5 * recovery };
}
const MODES = [
    { x: 10.5, y: -3.8, height: 5.2, rate: 1, u: 1.1, v: 1.8, phase: 0 },
    { x: 2.1, y: -1.6, height: 1.3, rate: 2, u: -2.8, v: 1.4, phase: -0.8 },
    { x: 0.55, y: 0.7, height: 0.4, rate: 3, u: 4.3, v: -3.2, phase: 1.2 },
];

export function arachnaWebSway(x: number, y: number, time: number) {
    const u = Math.max(0, Math.min(1, (x - 3) / 633));
    const v = Math.max(0, Math.min(1, (y - 3) / 633));
    const pinned = (Math.sin(Math.PI * u) * Math.sin(Math.PI * v)) ** 2;
    const phase = (time * Math.PI * 2) / ARACHNA_WEB_SWAY_MS;
    let dx = 0,
        dy = 0,
        height = 7;
    for (const mode of MODES) {
        const wave = Math.sin(phase * mode.rate + u * mode.u + v * mode.v + mode.phase);
        dx += mode.x * wave;
        dy += mode.y * wave;
        height += mode.height * wave;
    }
    const tension = arachnaPulseTension(x, y, time);
    const radius = Math.max(1, Math.hypot(x - 320, y - 320));
    dx += ((x - 320) / radius) * tension.radial;
    dy += ((y - 320) / radius) * tension.radial;
    height = Math.max(0.35, height + tension.height);
    return { x: dx * pinned, y: (dy - height * 0.7) * pinned, height: height * pinned };
}

const gl = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);
// Generate the GPU coefficients from the CPU modes so carried contacts cannot drift.
export const ARACHNA_WEB_MOTION_GLSL = /* glsl */ `
vec3 webMotion(vec2 uv, float seconds) {
    vec2 q = clamp((uv * 640. - 3.) / 633., 0., 1.);
    float pinned = sin(q.x * 3.14159265359) * sin(q.y * 3.14159265359);
    pinned *= pinned;
    float phase = seconds * 6.28318530718 / ${gl(ARACHNA_WEB_SWAY_MS / 1000)};
    vec3 motion = vec3(0., 0., 7.);
    ${MODES.map((m) => `motion += vec3(${gl(m.x)}, ${gl(m.y)}, ${gl(m.height)}) * sin(phase * ${gl(m.rate)} + q.x * ${gl(m.u)} + q.y * ${gl(m.v)} + ${gl(m.phase)});`).join("\n    ")}
    vec2 p = uv*640.-320.;
    float radius = length(p);
    float beat = fract(seconds/${gl(ARACHNA_WEB_PULSE_MS / 1000)});
    float travel = beat*1.6-.28-(radius-60.)/385.;
    float gate = smoothstep(0.,.08,beat)*(1.-smoothstep(.9,.995,beat))*smoothstep(54.,95.,radius);
    float load = exp(-pow(travel/.18,2.))*gate;
    float recovery = exp(-pow((travel-.28)/.21,2.))*gate;
    motion.xy += p/max(1.,radius)*(-2.8*load+.8*recovery);
    motion.z = max(.35,motion.z-5.*load+1.5*recovery);
    motion.y -= motion.z * .7;
    return motion * pinned;
}
`;
