import { Container, Filter, GlProgram, Rectangle, Sprite, Texture } from "pixi.js";

// Shared across all eight poses. Match the actual battlefield figure, not tsar_cannon_final.
export const CANNON_WALK_RGB_CURVES = [
    [
        [0, 0],
        [15, 17],
        [49, 44],
        [104, 70],
        [186, 121],
        [255, 210],
    ],
    [
        [0, 0],
        [10, 8],
        [33, 28],
        [79, 50],
        [151, 99],
        [255, 210],
    ],
    [
        [0, 0],
        [3, 2],
        [17, 14],
        [54, 34],
        [113, 76],
        [255, 210],
    ],
] as const;
export function cannonWalkColor(rgb: readonly number[]): number[] {
    return rgb.map((value, channel) => {
        const curve = CANNON_WALK_RGB_CURVES[channel];
        for (let i = 1; i < curve.length; i++) {
            if (value <= curve[i][0]) {
                const [x0, y0] = curve[i - 1];
                const [x1, y1] = curve[i];
                return y0 + ((y1 - y0) * Math.max(0, value - x0)) / (x1 - x0);
            }
        }
        return curve[curve.length - 1][1];
    });
}
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const number = (n: number) => (n / 255).toFixed(8);
const channelCurve = (c: number) =>
    CANNON_WALK_RGB_CURVES[c]
        .slice(1)
        .map(([x1, y1], i) => {
            const [x0, y0] = CANNON_WALK_RGB_CURVES[c][i];
            return `${number(y1 - y0)} * clamp((rgb[${c}] - ${number(x0)}) / ${number(x1 - x0)}, 0.0, 1.0)`;
        })
        .join(" + ");
let palette: Filter | undefined;
export function syncCannonWalkPalette(sprite: Sprite, enabled: boolean): void {
    if (enabled && !palette)
        palette = new Filter({
            glProgram: GlProgram.from({
                vertex,
                fragment: `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
void main() {
    vec4 pixel = texture(uTexture, vTextureCoord);
    vec3 rgb = pixel.rgb / max(pixel.a, 0.00001);
    vec3 graded = vec3(${channelCurve(0)}, ${channelCurve(1)}, ${channelCurve(2)});
    finalColor = vec4(graded * pixel.a, pixel.a);
}`,
            }),
            resolution: "inherit",
            antialias: "inherit",
        });
    const current = sprite.filters ?? [];
    if (current.includes(palette!) === enabled) return;
    const remaining = current.filter((f) => f !== palette);
    sprite.filters = enabled ? [palette!, ...remaining] : remaining.length ? remaining : null;
}

// Both wheel rims stay in contact throughout the source loop. Emit a paired light
// scuff every one-eighth of the 1.3-cell cycle, independently of display FPS.
export const CANNON_DUST_INTERVAL = 1.3 / 8;
export const CANNON_DUST_LIFE_MS = 460;
const wheelBottoms = [710, 721];

interface Walk {
    frameIndex: number;
    gaitDistanceCells?: number;
}
interface Puff {
    sprite: Sprite;
    born: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    sx: number;
    sy: number;
}
interface Dust {
    layer: Container;
    pool: Sprite[];
    puffs: Puff[];
    walk?: object;
    distance: number;
    next: number;
    x: number;
    y: number;
    serial: number;
}
const dustStates = new WeakMap<Sprite, Dust>();
const framesByTexture = new WeakMap<Texture, Texture[]>();

export function syncCannonWheelDust(
    sprite: Sprite,
    walk: Walk | undefined,
    enabled: boolean,
    now: number,
    atlas?: Texture,
    emit = false,
): void {
    let state = dustStates.get(sprite);
    if (!state && enabled && walk && sprite.parent && atlas?.source) {
        const layer = new Container();
        layer.label = "tsar-cannon-wheel-dust";
        layer.eventMode = "none";
        state = {
            layer,
            pool: [],
            puffs: [],
            distance: 0,
            next: CANNON_DUST_INTERVAL,
            x: sprite.x,
            y: sprite.y,
            serial: 0,
        };
        dustStates.set(sprite, state);
        const owned = state;
        sprite.once("destroyed", () => {
            owned.layer.destroy({ children: true });
            for (const puff of owned.pool) puff.destroy();
        });
    }
    if (!state) return;
    if (sprite.parent && state.layer.parent !== sprite.parent) sprite.parent.addChild(state.layer);
    state.layer.zIndex = sprite.zIndex - 0.01;
    state.layer.visible = enabled && sprite.visible;
    let frames = atlas ? framesByTexture.get(atlas) : undefined;
    if (!frames && atlas?.source) {
        const w = atlas.width / 2,
            h = atlas.height / 2;
        frames = Array.from(
            { length: 4 },
            (_, i) =>
                new Texture({ source: atlas.source, frame: new Rectangle((i % 2) * w, Math.floor(i / 2) * h, w, h) }),
        );
        framesByTexture.set(atlas, frames);
    }
    // Reset on a new route or stop. No wall-clock spawning while stationary.
    if (state.walk !== walk || !enabled) {
        state.walk = walk;
        state.distance = walk?.gaitDistanceCells ?? 0;
        state.next = state.distance + CANNON_DUST_INTERVAL;
        state.x = sprite.x;
        state.y = sprite.y;
    }
    if (enabled && walk && emit && frames) {
        const distance = walk.gaitDistanceCells ?? 0;
        const dx = sprite.x - state.x,
            dy = sprite.y - state.y;
        const length = Math.hypot(dx, dy);
        if (distance > state.distance && length > 0.00001) {
            // Bound catch-up on a suspended tab; old puffs would already be invisible.
            state.next = Math.max(state.next, distance - CANNON_DUST_INTERVAL * 3);
            while (state.next <= distance + 1e-9) {
                const t = Math.max(0, Math.min(1, (state.next - state.distance) / (distance - state.distance)));
                for (let wheel = 0; wheel < 2; wheel++) {
                    const puff = state.pool.pop() ?? new Sprite(frames[0]);
                    puff.label = "cannon-wheel-puff";
                    puff.anchor.set(0.77, 0.84);
                    puff.tint = 0xb6a38b;
                    const localX = ([146, 438][wheel] - sprite.anchor.x * 768) * sprite.scale.x;
                    const localY = (wheelBottoms[wheel] - sprite.anchor.y * 768) * sprite.scale.y;
                    const cos = Math.cos(sprite.rotation),
                        sin = Math.sin(sprite.rotation);
                    const x = state.x + dx * t + localX * cos - localY * sin,
                        y = state.y + dy * t + localX * sin + localY * cos;
                    // Atlas plume extends left of its contact; mirror it for leftward travel.
                    const sx = (dx < 0 ? -1 : 1) * Math.abs(sprite.scale.x) * 0.25;
                    const sy = Math.sign(sprite.scale.y) * Math.abs(sprite.scale.y) * 0.25;
                    state.layer.addChild(puff);
                    state.puffs.push({ sprite: puff, born: now, x, y, dx: dx / length, dy: dy / length, sx, sy });
                }
                state.serial++;
                state.next += CANNON_DUST_INTERVAL;
            }
        }
        state.distance = distance;
        state.x = sprite.x;
        state.y = sprite.y;
    }
    for (let i = state.puffs.length - 1; i >= 0; i--) {
        const puff = state.puffs[i],
            age = (now - puff.born) / CANNON_DUST_LIFE_MS;
        if (age >= 1 || !enabled) {
            state.layer.removeChild(puff.sprite);
            puff.sprite.visible = false;
            state.pool.push(puff.sprite);
            state.puffs.splice(i, 1);
            continue;
        }
        if (frames) puff.sprite.texture = frames[Math.min(3, Math.floor(Math.max(0, age) * 4))];
        puff.sprite.visible = true;
        puff.sprite.position.set(
            puff.x - puff.dx * age * 12 * Math.abs(puff.sx),
            puff.y - puff.dy * age * 12 * Math.abs(puff.sy),
        );
        puff.sprite.scale.set(puff.sx * (0.72 + age * 0.48), puff.sy * (0.72 + age * 0.48));
        puff.sprite.alpha = sprite.alpha * 0.5 * Math.min(1, age * 9 + 0.18) * (1 - age) ** 1.5;
    }
}
