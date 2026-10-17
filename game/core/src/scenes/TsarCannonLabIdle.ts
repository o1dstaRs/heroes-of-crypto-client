import { Container, Filter, GlProgram, Matrix, Rectangle, Sprite, Texture } from "pixi.js";

import { cannonBarrelPhase, createCannonBarrelFilter } from "./TsarCannonBarrel";
import { createCannonActionWheelFilter } from "./TsarCannonActionWheels";
import { cannonAttackPose, isCannonMechanicalAttack } from "./TsarCannonReactions";
import { syncCannonEngineVfx } from "./TsarCannonEngineVfx";

export const CANNON_MUZZLE = [725, 333] as const;
// Native 768px canvas: one percent upward, plus another two percent outward.
export const CANNON_SMOKE_OFFSET = [4 + 768 * 0.02, -7.68] as const;
export const CANNON_SMOKE_SIZE = [270, 250] as const;
export const CANNON_SMOKE_ORIGIN = [28, 130] as const;
const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
const smokeVertex = `
in vec2 aPosition;
out vec2 vUv;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uSmokeMatrix;
void main() {
    vec2 position=aPosition*uOutputFrame.zw+uOutputFrame.xy;
    position.x=position.x*(2.0/uOutputTexture.x)-1.0;
    position.y=position.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
    gl_Position=vec4(position,0.0,1.0);
    vUv=(uSmokeMatrix*vec3(aPosition*uOutputFrame.zw*uInputSize.zw,1.0)).xy;
}`;
const smokeFragment = `
precision highp float;
in vec2 vUv;
out vec4 finalColor;
uniform float uTime;
uniform float uFade;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0)),f.x),f.y);
}
void main() {
    vec2 p=vUv*vec2(270.,250.)-vec2(28.,130.);
    float density=0.;float shade=0.;
    float newest=floor(uTime/.42);
    for(int i=0;i<9;i++) {
        float id=newest-float(i);
        float seed=hash(vec2(id,17.3));
        float born=(id+seed*.22)*.42;
        float age=uTime-born;
        float life=2.05+hash(vec2(id,42.))*0.65;
        // Short irregular breathing gaps between groups, as in the portrait reference.
        float group=mod(id,9.);
        if(age>0.&&age<life&&group<7.) {
            float h=hash(vec2(id,8.));
            float lift=hash(vec2(id,61.));
            vec2 center=vec2(2.+age*(34.+seed*25.),(h-.5)*12.+age*(lift-.68)*30.);
            center.y+=sin(age*3.+h*6.28)*age*5.;
            float radius=18.+age*(18.+h*10.);
            vec2 q=(p-center)/vec2(radius,radius*(.85+lift*.3));
            float turn=seed*6.283+age*(h-.5)*.9;
            vec2 n=vec2(cos(turn)*q.x-sin(turn)*q.y,sin(turn)*q.x+cos(turn)*q.y);
            // Three connected round lobes per expanding volume, with a changing edge.
            float r=min(length(n-vec2(-.32,.02)),min(length(n-vec2(.25,-.29)),length(n-vec2(.30,.29))));
            float edge=noise(n*3.1+vec2(id*7.,age*.45))*.19;
            float volume=1.-smoothstep(.26,.91+edge,r);
            float curlNoise=noise(n*4.2+vec2(id*11.,-age*.7));
            float fade=smoothstep(0.,.16,age)*(1.-smoothstep(life*.48,life,age));
            float v=volume*fade*(.70+curlNoise*.5);
            density+=v;
            shade+=v*clamp(.57-n.y*.12+curlNoise*.18,.35,.9);
        }
    }
    // Emit inside the dark opening and continue out through the front edge, without a dead strip.
    // Only the actual moving volumes cover the bore; there is no permanent gray aperture fill.
    float aperture=1.-smoothstep(.80,1.,length(p/vec2(12.,55.)));
    float emergence=max(aperture,smoothstep(0.,10.,p.x));
    float alpha=(1.-exp(-density*1.9))*emergence*uFade;
    vec3 color=mix(vec3(.24,.22,.20),vec3(.82,.81,.78),shade/max(.001,density));
    finalColor=vec4(color*alpha,alpha);
}`;
export interface CannonRigAction {
    stateName: string;
    progress: number;
    frameIndex?: number;
    instance?: object;
}
/** One assembled model in every lab action; action clocks still belong to RenderableUnit. */
export function cannonRigPose(action?: CannonRigAction): Float32Array {
    const p = Math.max(0, Math.min(1, action?.progress ?? 0));
    const name = action?.stateName ?? "idle";
    if (name === "death") return new Float32Array([-10 * p, 0.1 * p, 8 * p, 0.38 * p]);
    if (name === "hit") return new Float32Array([Math.sin(p * Math.PI * 4) * (1 - p) * 8, 0, 0, 0]);
    if (name.startsWith("attack") || name.startsWith("melee"))
        return new Float32Array([-14 * Math.sin(p * Math.PI), 0, 0, 0]);
    return new Float32Array(4);
}
interface IdleState {
    layer: Container;
    smoke: Sprite;
    smokeFilter: Filter;
    started: number;
    barrelStarted: number;
    enabled: boolean;
    base?: Texture;
    wheelAtlas?: Texture;
    barrelFilter?: Filter;
    actionWheelFilter?: Filter;
    actionBarrelFilter?: Filter;
    restTexture: Texture;
    wheelPhase: number;
    lastWalkPhase?: number;
}
export const CANNON_WHEEL_FRAME_COUNT = 64;
const wheelFrames = new WeakMap<Texture, Texture[]>();
export const cannonWheelFrameIndex = (phase: number): number =>
    Math.floor(((((phase / (Math.PI * 2)) % 1) + 1) % 1) * CANNON_WHEEL_FRAME_COUNT + 1e-7) % CANNON_WHEEL_FRAME_COUNT;
function cannonWheelFrame(atlas: Texture, phase: number): Texture {
    let frames = wheelFrames.get(atlas);
    if (!frames) {
        frames = Array.from(
            { length: CANNON_WHEEL_FRAME_COUNT },
            (_, i) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle((i % 8) * 768, Math.floor(i / 8) * 768, 768, 768),
                }),
        );
        wheelFrames.set(atlas, frames);
    }
    return frames[cannonWheelFrameIndex(phase)];
}
const states = new WeakMap<Sprite, IdleState>();
export function syncCannonLabIdle(
    body: Sprite,
    enabled: boolean,
    now: number,
    base?: Texture,
    relief?: Texture,
    walkPhase?: number,
    wheelAtlas?: Texture,
    action?: CannonRigAction,
): void {
    syncCannonEngineVfx(body, now, action);
    let state = states.get(body);
    if (!state && (enabled || isCannonMechanicalAttack(action?.stateName))) {
        const layer = new Container({ eventMode: "none" });
        layer.label = "tsar-cannon-muzzle-smoke";
        const smoke = new Sprite(Texture.WHITE);
        smoke.width = CANNON_SMOKE_SIZE[0];
        smoke.height = CANNON_SMOKE_SIZE[1];
        smoke.eventMode = "none";
        const smokeFilter = new Filter({
            glProgram: GlProgram.from({ vertex: smokeVertex, fragment: smokeFragment }),
            resolution: "inherit",
            antialias: "inherit",
            resources: {
                smoke: {
                    uSmokeMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uFade: { value: 0, type: "f32" },
                },
            },
        });
        smokeFilter.apply = (...args: Parameters<Filter["apply"]>) => {
            args[0].calculateSpriteMatrix(smokeFilter.resources.smoke.uniforms.uSmokeMatrix, smoke);
            Filter.prototype.apply.call(smokeFilter, ...args);
        };
        smoke.filters = [smokeFilter];
        layer.addChild(smoke);
        state = {
            layer,
            smoke,
            smokeFilter,
            started: now,
            barrelStarted: now,
            enabled: false,
            restTexture: body.texture,
            wheelPhase: 0,
        };
        states.set(body, state);
        const owned = state;
        body.once("destroyed", () => {
            owned.layer.destroy({ children: true });
            owned.smokeFilter.destroy();
            owned.barrelFilter?.destroy();
            owned.actionWheelFilter?.destroy();
            owned.actionBarrelFilter?.destroy();
            states.delete(body);
        });
    }
    if (!state) return;
    // Integrate route distance; retain orientation at rest and across new routes.
    if (enabled && walkPhase !== undefined && Number.isFinite(walkPhase)) {
        const previous = state.lastWalkPhase ?? 0;
        const delta = walkPhase >= previous ? walkPhase - previous : walkPhase;
        state.wheelPhase = (state.wheelPhase + delta) % (Math.PI * 2);
        state.lastWalkPhase = walkPhase;
    } else state.lastWalkPhase = undefined;
    if (enabled && !state.enabled) {
        state.started = now;
        if (body.texture !== state.base) state.restTexture = body.texture;
    }
    state.enabled = enabled;
    state.layer.visible = enabled && body.visible && !action && walkPhase === undefined;
    const keepStoppedWheels =
        !enabled && wheelAtlas && (action?.stateName === "hit" || isCannonMechanicalAttack(action?.stateName));
    if (keepStoppedWheels && !state.actionWheelFilter) {
        state.actionWheelFilter = createCannonActionWheelFilter(body, cannonWheelFrame(wheelAtlas, state.wheelPhase));
        body.filters = [...(body.filters ?? []), state.actionWheelFilter];
    } else if (!keepStoppedWheels && state.actionWheelFilter) {
        body.filters = (body.filters ?? []).filter((f) => f !== state.actionWheelFilter);
        state.actionWheelFilter.destroy();
        state.actionWheelFilter = undefined;
    }
    const attackRotation = !enabled && isCannonMechanicalAttack(action?.stateName) && base && relief;
    if (attackRotation && action && isCannonMechanicalAttack(action.stateName)) {
        state.actionBarrelFilter ??= createCannonBarrelFilter(body, base, relief);
        const filter = state.actionBarrelFilter;
        filter.resources.barrel.uniforms.uAttackPose.set(
            cannonAttackPose(action.stateName, action.frameIndex ?? Math.round(action.progress * 23)),
        );
        filter.resources.barrel.uniforms.uPhase = cannonBarrelPhase(now - state.barrelStarted);
        if (!(body.filters ?? []).includes(filter)) body.filters = [filter, ...(body.filters ?? [])];
    } else if (state.actionBarrelFilter) {
        body.filters = (body.filters ?? []).filter((f) => f !== state.actionBarrelFilter);
    }
    if (!enabled) {
        // A walk/action may already have installed its texture; never overwrite it.
        if (body.texture === state.base) body.texture = state.restTexture;
        if (state.barrelFilter) body.filters = (body.filters ?? []).filter((f) => f !== state.barrelFilter);
        return;
    }
    const elapsed = Math.max(0, now - state.started);
    if (base?.source && relief?.source) {
        const frame = wheelAtlas ? cannonWheelFrame(wheelAtlas, state.wheelPhase) : base;
        if (state.base?.source !== frame.source || !state.barrelFilter) {
            if (state.barrelFilter) {
                body.filters = (body.filters ?? []).filter((f) => f !== state.barrelFilter);
                state.barrelFilter.destroy();
            }
            state.barrelFilter = createCannonBarrelFilter(body, frame, relief);
        }
        state.base = frame;
        state.wheelAtlas = wheelAtlas;
        body.texture = frame;
        if (!(body.filters ?? []).includes(state.barrelFilter))
            body.filters = [state.barrelFilter, ...(body.filters ?? [])];
        state.barrelFilter.resources.barrel.uniforms.uPhase = cannonBarrelPhase(now - state.barrelStarted);
        state.barrelFilter.resources.barrel.uniforms.uAction = cannonRigPose(action);
    }
    if (body.parent && state.layer.parent !== body.parent) body.parent.addChild(state.layer);
    state.layer.position.copyFrom(body.position);
    state.layer.scale.copyFrom(body.scale);
    state.layer.rotation = body.rotation;
    state.layer.skew.copyFrom(body.skew);
    state.layer.pivot.copyFrom(body.pivot);
    state.layer.zIndex = body.zIndex + 0.01;
    state.layer.alpha = body.alpha;
    state.smoke.position.set(
        CANNON_MUZZLE[0] + CANNON_SMOKE_OFFSET[0] - CANNON_SMOKE_ORIGIN[0] - body.anchor.x * 768,
        CANNON_MUZZLE[1] + CANNON_SMOKE_OFFSET[1] - CANNON_SMOKE_ORIGIN[1] - body.anchor.y * 768,
    );
    state.smokeFilter.resources.smoke.uniforms.uTime = elapsed * 0.001;
    state.smokeFilter.resources.smoke.uniforms.uFade = smooth(0, 650, elapsed) * 0.93;
}
