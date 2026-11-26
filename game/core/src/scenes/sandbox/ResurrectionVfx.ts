import { type GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, GlProgram, Mesh, MeshGeometry, Shader } from "pixi.js";
import { RESURRECTION_BURST_DURATION_MS } from "../../settings/statusEffectTiming";
import { rotatingAuraProjection } from "../RotatingAuraProjection";
import { projectBattlefieldPoint } from "./BattlefieldVisualGrid";

/**
 * On the floor: over the terrain, cell highlights (60) and hover silhouettes (110), under the units
 * container (1000), so creatures standing on the sigil cover it.
 */
export const RESURRECTION_SIGIL_Z = 120;
/** Over every figure, so the light reads on the body it raises instead of hiding behind it. */
export const RESURRECTION_LIGHT_Z = 4560;

const VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
void main(){
    vUV=aUV; vColor=uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;

const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}`;

/**
 * Light that comes down on the fallen stack: a pillar from above, a flash on the body as it stands, god rays,
 * and sparks drifting up. `uProgress` runs 0..1 over the effect; UV y runs from the floor (0) up (1).
 */
const LIGHT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uProgress;
uniform float uTime;
uniform float uAspect;
uniform float uBody;
// One creature cell, in the quad's height units: every size below is in cells, so nothing reaches the quad's edge.
uniform float uCell;
${NOISE}
void main(){
    float t=uProgress;
    vec2 p=vec2((vUV.x-.5)*uAspect,vUV.y);
    vec2 c=vec2(0.,uBody);
    // The pillar strikes from above in the first moments, then thins and fades.
    float front=mix(1.02,-.04,smoothstep(0.,.09,t));
    float landed=smoothstep(front,front+.05,vUV.y);
    float flare=exp(-pow((t-.1)/.07,2.));
    float pillarLife=1.-smoothstep(.42,.92,t);
    float w=mix(.2,.46,flare)*(1.-.45*smoothstep(.3,.9,t))*uCell;
    float core=exp(-pow(p.x/(w*.32),2.));
    float glow=exp(-pow(p.x/w,2.));
    float streaks=.55+.45*noise(vec2(p.x/uCell*5.,p.y*5.+uTime*7.));
    float sky=smoothstep(1.,.5,vUV.y)*.7+.3*smoothstep(1.,.88,vUV.y);
    float mask=landed*pillarLife*sky;
    float pillarCore=core*mask;
    float pillarGlow=glow*streaks*mask;
    // The flash covers the moment the body stands back up, then settles into a soft halo.
    vec2 d2=p-c;
    float d=length(vec2(d2.x,d2.y*.85))/uCell;
    float halo=exp(-pow(d/(.4+.55*flare),2.))*(1.8*flare+.45*smoothstep(.05,.2,t)*(1.-smoothstep(.35,.8,t)));
    float bloom=exp(-pow(d/1.05,2.))*(.9*flare+.18*(1.-smoothstep(.2,.7,t)));
    // God rays turn slowly around the body.
    float ang=atan(d2.y,d2.x);
    float rays=pow(.5+.5*sin(ang*11.+uTime*.7),7.)*.8+pow(.5+.5*sin(ang*6.-uTime*.45+1.7),9.)*.6;
    rays*=.6+.4*noise(vec2(ang*3.,uTime*1.3));
    float rayLife=smoothstep(.04,.16,t)*(1.-smoothstep(.45,.85,t));
    float rayLight=rays*exp(-pow(d/1.05,2.))*rayLife*smoothstep(.0,.3,d);
    // Sparks rise from the floor around the body.
    float sparks=0.;
    for(int i=0;i<36;i++){
        float fi=float(i);
        float seed=hash(vec2(fi,3.7));
        float start=.05+seed*.42;
        float life=.38+hash(vec2(fi,9.1))*.36;
        float a=(t-start)/life;
        if(a<0.||a>1.) continue;
        float x0=(hash(vec2(fi,1.3))-.5)*2.*uCell;
        float x=x0*(1.-.35*a)+sin(a*5.+fi*1.7)*.1*uCell;
        float y=.03+a*(2.+1.8*hash(vec2(fi,5.5)))*uCell;
        float r=(.035+.035*hash(vec2(fi,7.7)))*uCell;
        float twinkle=.65+.35*sin(uTime*23.+fi*2.1);
        sparks+=exp(-pow(length(p-vec2(x,y))/r,2.))*sin(a*3.14159)*twinkle;
    }
    vec3 pale=vec3(1.,.97,.86);
    vec3 gold=vec3(1.,.79,.38);
    vec3 amber=vec3(1.,.6,.22);
    vec3 light=pale*pillarCore*1.15+gold*pillarGlow*.45;
    light+=mix(gold,pale,.65)*halo+amber*bloom*.6+gold*rayLight*.55+pale*sparks*1.3;
    light/=1.+max(light.r,max(light.g,light.b))*.35;
    float edge=smoothstep(0.,.08,vUV.x)*smoothstep(1.,.92,vUV.x)*smoothstep(0.,.04,vUV.y);
    light*=edge;
    finalColor=vec4(light,min(.95,max(light.r,max(light.g,light.b))))*vColor;
}`;

/** A golden sigil and a light pool on the floor under the raised stack, projected onto the board. */
const SIGIL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uProgress;
uniform float uTime;
${NOISE}
void main(){
    float t=uProgress;
    vec2 p=(vUV-.5)*2.;
    float r=length(p);
    if(r>1.){finalColor=vec4(0.);return;}
    float grow=1.-pow(1.-smoothstep(0.,.28,t),3.);
    float life=1.-smoothstep(.55,1.,t);
    float R=mix(.3,.8,grow);
    float ring=exp(-pow((r-R)/.022,2.));
    float inner=exp(-pow((r-R*.74)/.016,2.))*smoothstep(.08,.3,t);
    float ang=atan(p.y,p.x);
    float ticks=smoothstep(.72,.97,.5+.5*cos((ang+uTime*.55)*24.))*step(R*.77,r)*step(r,R*.95);
    float glyphs=smoothstep(.55,.9,noise(vec2((ang-uTime*.3)*6.,3.)))*exp(-pow((r-R*.86)/.03,2.));
    float flare=exp(-pow((t-.1)/.08,2.));
    float pool=exp(-r*r*4.5)*(.3+1.1*flare)*(1.-smoothstep(.3,.85,t));
    float wave=exp(-pow((r-mix(.12,1.,smoothstep(.04,.4,t)))/.045,2.))*(1.-smoothstep(.2,.42,t));
    vec3 pale=vec3(1.,.96,.84);
    vec3 gold=vec3(1.,.78,.36);
    vec3 light=gold*(ring*1.2+inner*.75+ticks*.7+glyphs*.6)+pale*(pool*.75+wave*.7);
    light*=life*(1.-smoothstep(.93,1.,r));
    light/=1.+max(light.r,max(light.g,light.b))*.3;
    finalColor=vec4(light,min(.9,max(light.r,max(light.g,light.b))))*vColor;
}`;

interface ResurrectionBurst {
    container: Container;
    meshes: Mesh<MeshGeometry, Shader>[];
    startedAtMs: number;
}

function createMesh(geometry: MeshGeometry, name: string, fragment: string, uniforms: Record<string, number>) {
    const shader = new Shader({
        glProgram: GlProgram.from({ name, vertex: VERTEX, fragment }),
        resources: {
            resurrection: Object.fromEntries(
                Object.entries(uniforms).map(([key, value]) => [key, { value, type: "f32" }]),
            ),
        },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.label = name;
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}

/**
 * Resurrection: a pillar of light comes down on the fallen stack, flashes as it stands, and leaves a golden
 * sigil and rising sparks. It runs on a real-time clock, like the rise it accompanies.
 */
export class ResurrectionVfx {
    private bursts: ResurrectionBurst[] = [];
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => number,
        private readonly now: () => number = () => performance.now(),
    ) {}
    public get active(): boolean {
        return this.bursts.length > 0;
    }
    /** All live bursts' top-level containers (the pillar over the figures, then the sigil under them). */
    public get containers(): Container[] {
        return this.bursts.map((burst) => burst.container);
    }
    /**
     * @param position the raised stack's board position, before the battlefield projection.
     * @param large a 2x2 creature gets a wider pillar and sigil.
     */
    public spawn(position: HoCMath.XY, gs: GridSettings, large = false): void {
        const cell = gs.getCellSize();
        const scale = large ? 1.4 : 1;
        const visual = projectBattlefieldPoint(position, gs);
        const container = new Container();
        container.label = "resurrection";
        const stretch = this.attach(container, RESURRECTION_LIGHT_Z) || 1;
        const sigilLayer = new Container();
        sigilLayer.label = "resurrection-sigil";
        this.attach(sigilLayer, RESURRECTION_SIGIL_Z);
        const meshes: Mesh<MeshGeometry, Shader>[] = [];

        const width = cell * 3.2 * scale;
        const below = cell * 0.55 * scale;
        const height = cell * 6 * scale;
        const total = below + height;
        const left = visual.x - width / 2;
        const right = visual.x + width / 2;
        const bottom = visual.y - below;
        const top = visual.y + height;
        const pillar = createMesh(
            new MeshGeometry({
                positions: new Float32Array([left, bottom, right, bottom, right, top, left, top]),
                uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
            }),
            "resurrection-light",
            LIGHT_FRAGMENT,
            {
                uProgress: 0,
                uTime: 0,
                uAspect: (width * stretch) / total,
                uBody: (below + cell * 0.75 * scale) / total,
                uCell: (cell * scale) / total,
            },
        );
        container.addChild(pillar);
        meshes.push(pillar);

        const radius = cell * 1.25 * scale;
        const projection = rotatingAuraProjection(position, radius, radius, 0, gs, 0, 1, 0.5);
        if (projection) {
            const sigil = createMesh(
                new MeshGeometry({
                    positions: projection.positions,
                    uvs: projection.uvs,
                    indices: projection.indices,
                }),
                "resurrection-sigil",
                SIGIL_FRAGMENT,
                { uProgress: 0, uTime: 0 },
            );
            sigilLayer.addChild(sigil);
            meshes.push(sigil);
        }
        // The sigil layer lives and dies with the pillar's container.
        container.once("destroyed", () => sigilLayer.destroy({ children: true }));
        this.bursts.push({ container, meshes, startedAtMs: this.now() });
        this.update();
    }
    public update(): void {
        const now = this.now();
        for (let index = this.bursts.length - 1; index >= 0; index--) {
            const burst = this.bursts[index];
            const ageMs = Math.max(0, now - burst.startedAtMs);
            if (ageMs >= RESURRECTION_BURST_DURATION_MS) {
                burst.container.destroy({ children: true });
                this.bursts.splice(index, 1);
                continue;
            }
            for (const mesh of burst.meshes) {
                const group = mesh.shader?.resources.resurrection;
                if (!group) continue;
                group.uniforms.uProgress = ageMs / RESURRECTION_BURST_DURATION_MS;
                group.uniforms.uTime = ageMs / 1000;
                group.update();
            }
        }
    }
    public clear(): void {
        for (const burst of this.bursts) burst.container.destroy({ children: true });
        this.bursts = [];
    }
}
