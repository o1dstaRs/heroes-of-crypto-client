import { type GridSettings } from "@heroesofcrypto/common";
import { GlProgram, Mesh, MeshGeometry, Shader } from "pixi.js";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const BLOOD_PULSE_SPEED = 0.32;
export const BLOOD_DROP_LIMIT = 80;
const SPACING = 0.38;
const SETTLE_TIME = 0.5;
type Bounds = { left: number; right: number; bottom: number; top: number };
type Drop = {
    born: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    vz: number;
    radius: number;
    flight: number;
    life: number;
};
const hash = (n: number) => {
    const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return h - Math.floor(h);
};

/** Analytic trajectory: no integration drift at low frame rates; landed blood stays on the ground. */
export function bloodDropPosition(drop: Drop, now: number, cell: number) {
    const age = Math.max(0, now - drop.born);
    const t = Math.min(age, drop.flight);
    const drag = (1 - Math.exp(-2.4 * t)) / 2.4;
    return {
        x: drop.x + drop.vx * drag,
        y: drop.y + drop.vy * drag,
        z: Math.max(0, drop.vz * t - 3 * cell * t * t),
        age,
        landed: age >= drop.flight,
    };
}

export class ValkyrieBloodSpray {
    public readonly mesh: Mesh<MeshGeometry, Shader>;
    public readonly drops: Drop[] = [];
    private lastTime = -1;
    private lastBounds?: Bounds;
    private cursor = 0;
    private readonly positions = new Float32Array(BLOOD_DROP_LIMIT * 8);
    private readonly material = new Float32Array(BLOOD_DROP_LIMIT * 16);
    public constructor() {
        const uvs = new Float32Array(BLOOD_DROP_LIMIT * 8);
        const indices = new Uint32Array(BLOOD_DROP_LIMIT * 6);
        for (let i = 0; i < BLOOD_DROP_LIMIT; i++) {
            uvs.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
            const k = i * 4;
            indices.set([k, k + 1, k + 2, k, k + 2, k + 3], i * 6);
        }
        const geometry = new MeshGeometry({ positions: this.positions, uvs, indices });
        geometry.addAttribute("aMaterial", { buffer: this.material, format: "float32x4" });
        const shader = new Shader({
            glProgram: GlProgram.from({
                name: "valkyrie-blood-spray",
                vertex: `#version 300 es
in vec2 aPosition,aUV;in vec4 aMaterial;out vec2 vUV;out vec4 vMaterial,vColor;
uniform mat3 uProjectionMatrix,uWorldTransformMatrix,uTransformMatrix;uniform vec4 uWorldColorAlpha,uColor;
void main(){vUV=aUV;vMaterial=aMaterial;vColor=uColor*uWorldColorAlpha;gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`,
                fragment: `#version 300 es
precision highp float;in vec2 vUV;in vec4 vMaterial,vColor;out vec4 finalColor;
void main(){
 vec2 p=vUV;float landed=vMaterial.y,phase=vMaterial.z,seed=vMaterial.w;
 // A rounded leading bead pulls a tapered ligament behind it in flight.
 vec2 bead=(p-vec2(.22,0.))/vec2(.65,.70);
 float beadD=(length(bead)-1.)*.65;
 float tailWidth=.055+.26*smoothstep(-.87,.20,p.x);
 float tailD=max(abs(p.y)-tailWidth,max(-.88-p.x,p.x-.25));
 float blend=clamp(.5+.5*(tailD-beadD)/.14,0.,1.);
 float airD=mix(tailD,beadD,blend)-.14*blend*(1.-blend);
 // Impact opens into uneven fingers, then a thicker pool with a fading wet rim.
 float angle=atan(p.y,p.x);
 float r=length(p);
 float fingers=sin(angle*5.+seed*19.)*.10+sin(angle*9.-seed*11.)*.055;
 float bank=.72+fingers*(.45+.55*exp(-phase*5.));
 float groundD=r-bank;
 float d=mix(airD,groundD,landed);
 float aa=max(fwidth(d),.008);
 float a=(1.-smoothstep(-aa,aa,d))*vMaterial.x;
 vec2 local=mix(bead,p/.78,landed);
 float body=sqrt(max(0.,1.-dot(local,local)));
 float absorption=clamp(body*.8+.12,0.,1.);
 vec3 color=mix(vec3(.13,.002,.008),vec3(.66,.019,.037),absorption);
 // Broad coat reflection plus a small bright glint retain volume at native scale.
 vec2 light=p-vec2(.08,.25);
 float coat=exp(-dot(light/vec2(.35,.20),light/vec2(.35,.20))*2.);
 float glint=exp(-dot(light/vec2(.12,.11),light/vec2(.12,.11))*2.);
 float rim=exp(-pow((d+.045)/.025,2.));
 float crown=exp(-pow((r-(.32+.36*phase))/.045,2.))*exp(-phase*5.);
 color+=vec3(.48,.19,.13)*coat*(1.-landed*.5);
 color+=vec3(.72,.52,.42)*glint*(1.-landed*.65);
 color+=vec3(.18,.024,.023)*rim+vec3(.24,.036,.025)*crown*landed;
 color*=1.-landed*.16;
 finalColor=vec4(color*a,a)*vColor;
}`,
            }),
        });
        this.mesh = new Mesh({ geometry, shader });
        this.mesh.label = "valkyrie-blood-spray";
        this.mesh.eventMode = "none";
        this.mesh.once("destroyed", () => {
            geometry.destroy(true);
            shader.destroy();
            this.drops.length = 0;
        });
    }
    public update(bounds: Bounds, gs: GridSettings, now: number, alpha: number, narrowing = 0): void {
        const cell = gs.getCellSize(),
            width = bounds.right - bounds.left,
            height = bounds.top - bounds.bottom;
        const perimeter = (2 * (width + height)) / cell;
        const previous = this.lastBounds;
        const discontinuity =
            this.lastTime < 0 ||
            now < this.lastTime ||
            now - this.lastTime > 0.25 ||
            (previous &&
                (Math.abs(previous.left - bounds.left) + Math.abs(previous.bottom - bounds.bottom) > cell * 0.75 ||
                    Math.abs(previous.right - previous.left - width) +
                        Math.abs(previous.top - previous.bottom - height) >
                        0.01));
        if (discontinuity) {
            this.drops.length = 0;
            this.lastTime = now;
        }
        const rate = (perimeter * BLOOD_PULSE_SPEED) / SPACING;
        // Every crossed spatial sample emits, including a corner crossed between two frames.
        for (let event = Math.floor(this.lastTime * rate) + 1; event <= Math.floor(now * rate); event++) {
            const born = event / rate;
            let arc = ((event * SPACING) % perimeter) * cell;
            let x = bounds.left,
                y = bounds.bottom,
                tx = 1,
                ty = 0;
            if (arc < width) x += arc;
            else if ((arc -= width) < height) {
                x = bounds.right;
                y += arc;
                tx = 0;
                ty = 1;
            } else if ((arc -= height) < width) {
                x = bounds.right - arc;
                y = bounds.top;
                tx = -1;
                ty = 0;
            } else {
                arc -= width;
                y = bounds.top - arc;
                tx = 0;
                ty = -1;
            }
            for (let j = 0; j < 2; j++) {
                const seed = event * 7 + j * 19;
                const side = hash(seed + 3) > 0.24 ? -1 : 1;
                const outward = side * (0.9 + hash(seed + 1) * 1.8) * cell;
                const along = (0.25 + hash(seed + 2) * 0.7) * cell;
                const vz = (1.1 + hash(seed + 5) * 1.5) * cell;
                const drop = {
                    born,
                    x,
                    y,
                    vx: tx * along - ty * outward,
                    vy: ty * along + tx * outward,
                    vz,
                    radius: (0.032 + hash(seed + 4) * 0.032) * cell,
                    flight: vz / (3 * cell),
                    life: vz / (3 * cell) + SETTLE_TIME,
                };
                if (this.drops.length < BLOOD_DROP_LIMIT) this.drops.push(drop);
                else {
                    this.drops[this.cursor] = drop;
                    this.cursor = (this.cursor + 1) % BLOOD_DROP_LIMIT;
                }
            }
        }
        this.lastTime = now;
        this.lastBounds = { ...bounds };
        this.positions.fill(0);
        this.material.fill(0);
        let slot = 0;
        for (const drop of this.drops) {
            const p = bloodDropPosition(drop, now, cell);
            if (p.age > drop.life) continue;
            // Clip contacts to the playable floor; altitude is added AFTER floor projection.
            const inset = Math.max(0, narrowing) * cell;
            if (
                p.x < gs.getMinX() + inset ||
                p.x > gs.getMaxX() - inset ||
                p.y < gs.getMinY() + inset ||
                p.y > gs.getMaxY() - inset
            )
                continue;
            const ground = projectBattlefieldPoint(p, gs);
            const settledAge = Math.max(0, p.age - drop.flight);
            const fade = p.landed ? Math.max(0, 1 - settledAge / SETTLE_TIME) : Math.min(1, p.age / 0.035);
            const radius = drop.radius * (p.landed ? 1.6 * (0.55 + 0.45 * (1 - Math.exp(-settledAge * 24))) : 1);
            const verticalVelocity = drop.vz - 6 * cell * Math.min(p.age, drop.flight);
            const direction = projectBattlefieldPoint({ x: p.x + drop.vx * 0.02, y: p.y + drop.vy * 0.02 }, gs);
            let dx = direction.x - ground.x,
                dy = direction.y - ground.y + verticalVelocity * 0.02;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len;
            dy /= len;
            if (p.landed) {
                dx = 1;
                dy = 0;
            }
            const rx = radius * (p.landed ? 1.5 : 1 + Math.min(0.9, (Math.abs(verticalVelocity) / cell) * 0.35));
            const ry = radius * (p.landed ? 0.55 : 0.72);
            for (let corner = 0; corner < 4; corner++) {
                const u = corner === 0 || corner === 3 ? -1 : 1,
                    v = corner < 2 ? -1 : 1;
                const offset = slot * 8 + corner * 2;
                this.positions[offset] = ground.x + dx * u * rx - dy * v * ry;
                this.positions[offset + 1] = ground.y + p.z + dy * u * rx + dx * v * ry;
                const materialOffset = slot * 16 + corner * 4;
                this.material[materialOffset] = fade;
                this.material[materialOffset + 1] = p.landed ? 1 : 0;
                this.material[materialOffset + 2] = settledAge / SETTLE_TIME;
                this.material[materialOffset + 3] = hash(drop.born * 17 + drop.vx);
            }
            slot++;
        }
        this.mesh.geometry.getBuffer("aPosition").update();
        this.mesh.geometry.getBuffer("aMaterial").update();
        this.mesh.visible = true;
        this.mesh.alpha = Math.min(1, alpha * 1.25);
    }
}
