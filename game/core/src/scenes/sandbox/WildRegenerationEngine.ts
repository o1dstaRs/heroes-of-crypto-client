import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { Assets, Container, GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";
import { images } from "../../imageAssets";
import { retainFlagAtlas, releaseFlagAtlas } from "./CommonFlagPops";

type Anchor = Readonly<{ x: number; y: number }>;
export const REGENERATION_ENGINE_DURATION_MS = OVERHEAD_EFFECT_DURATION_MS;
export const REGENERATION_ENGINE_MAX_POPS = 24;
export const REGENERATION_ENGINE_SIZE_CELLS = 1.48;
const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha; uniform vec4 uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;
gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;
// One bounded material: two fixed hand states, a healing front, a traced seal and finite motes.
// No animated atlas playback and no postprocess filter. See the sourced recipe in hoc-engine-vfx.
const fragment = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform sampler2D uArt; uniform float uAge; uniform float uStraight;
const float PI=3.14159265;
const float TAU=6.2831853;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float band(float d,float width){return exp(-d*d/(width*width));}
mat2 rotate(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec4 cel(vec2 uv,vec2 tile){
    vec4 c=texture(uArt,(clamp(uv,vec2(.002),vec2(.998))+tile)/4.);
    c.rgb*=mix(1.,c.a,uStraight);return c;
}
vec4 art(vec2 uv,float front){
    vec4 wounded=cel(uv,vec2(2,0)),healed=cel(uv,vec2(2,2));
    float heal=smoothstep(front-.055,front+.055,uv.y);
    vec4 c=mix(wounded,healed,heal);
    // Keep the original anatomy, trim the painted outer seal, then rebuild its motion in the shader.
    float width=mix(.073,.195,1.-smoothstep(.34,.51,uv.y));
    float silhouette=1.-smoothstep(width,width+.020,abs(uv.x-.505));
    silhouette*=smoothstep(.065,.12,uv.y)*(1.-smoothstep(.85,.925,uv.y));
    return c*silhouette;
}
void main(){
    float t=clamp(uAge,0.,1.);
    float aa=max(fwidth(vUV.x),.001);
    float birth=smoothstep(.015,.16,t);
    float release=smoothstep(.69,1.,t);
    float envelope=birth*(1.-release);
    float healing=smoothstep(.19,.61,t);
    float crest=band(t-.55,.095);
    // Small upward emergence settles before the healing crest: the wrist remains above the flag.
    float scale=mix(.88,1.,smoothstep(0.,.22,t))+.025*crest;
    vec2 p=(vUV-vec2(.5,.53))/scale+vec2(.5,.53);
    p.y+=(1.-birth)*.045-release*.025;
    vec2 q=p-vec2(.5,.43);
    float r=length(q),a=atan(q.y,q.x);
    vec3 gold=vec3(1.,.62,.22),ivory=vec3(1.,.87,.55),teal=vec3(.08,.85,.73);
    float front=mix(.94,.10,healing);
    vec4 c=art(p,front);
    // Delayed, continuous erosion, with the brightest edge facing the direction of travel.
    float erosion=noise(p*23.+vec2(0.,-t*.7));
    float dissolve=1.-smoothstep(erosion-.10,erosion+.10,release);
    c*=birth*(1.-smoothstep(.77,.97,t))*mix(1.,dissolve,release);
    float healBand=band(p.y-front,.022)*smoothstep(.13,.25,t)*(1.-smoothstep(.59,.73,t));
    vec3 body=c.rgb*(.91+.10*healBand);
    vec3 emission=teal*healBand*c.a*.44;

    // A broad dark-free halo supports the hand, without filling the whole circle with light.
    float palm=exp(-dot(q*vec2(7.,5.5),q*vec2(7.,5.5)));
    emission+=teal*palm*(.028+.045*crest)*envelope;
    // Trace two open arcs from the wrist; hold the completed seal briefly, then let its ends disperse.
    float radius=.276+.012*release;
    float turn=.13*smoothstep(.10,.70,t);
    float angle=fract((a+PI*.5)/TAU+turn);
    float trace=smoothstep(.015,.26,t);
    float arc=1.-smoothstep(trace-.055,trace+.015,angle);
    float gaps=.40+.60*smoothstep(-.35,.2,cos(a*3.-.45));
    float sealLife=birth*(1.-smoothstep(.67,.94,t));
    float seal=band(r-radius,max(.0016,aa*.58))*gaps*arc;
    float echo=band(r-radius-.021,max(.0012,aa*.40))
        *(1.-smoothstep(.55,.88,fract(-a/TAU+turn)))*.40;
    float rimGlow=band(r-radius,.012)*.17*arc;
    emission+=(ivory*seal*.68+gold*(echo+rimGlow)) *sealLife;
    // Six small, deliberately spaced engraved stars; no wheel of competing sparkling dots.
    for(int i=0;i<6;i++){
        float k=float(i),angleGlyph=k*TAU/6.-PI*.5-turn*.7;
        vec2 d=rotate(-angleGlyph)*(q-vec2(cos(angleGlyph),sin(angleGlyph))*radius);
        float star=band(abs(d.x)+abs(d.y)-.008,aa*.45);
        float tip=band(d.x,aa*.55)*band(d.y,.019);
        float appear=smoothstep(.08+k*.018,.19+k*.018,t);
        emission+=gold*(star*.42+tip*.32)*appear*sealLife;
    }
    // The healing current wraps in depth. Back halves are hidden by the hand's coverage.
    for(int i=0;i<2;i++){
        float k=float(i),phase=p.y*11.5+t*7.8+k*PI;
        float width=.073+.027*sin(p.y*5.);
        float x=.5+sin(phase)*width;
        float d=abs(p.x-x);
        float z=cos(phase);
        float cover=mix(1.-c.a*.94,1.,smoothstep(-.22,.24,z));
        float along=smoothstep(.12,.24,p.y)*(1.-smoothstep(.81,.92,p.y));
        float current=(band(d,max(.002,aa*.65))*.30+band(d,.011)*.13);
        emission+=teal*current*along*cover*envelope*(.72+crest*.35);
    }
    // Four local taps preserve a legible contour; this is a local halo, not physical bloom.
    for(int i=0;i<4;i++){
        float theta=float(i)*PI*.5;
        vec4 sampleArt=art(p+vec2(cos(theta),sin(theta))*.016,front);
        emission+=sampleArt.rgb*.024*envelope*(.6+crest*.5);
    }
    // One restrained expanding pulse marks completion of healing, behind the silhouette.
    float pulseAge=clamp((t-.49)/.38,0.,1.);
    float pulseLife=sin(pulseAge*PI)*(1.-pulseAge);
    emission+=gold*band(r-(.11+pulseAge*.23),.008)*pulseLife*.22*(1.-c.a);
    // Finite, staggered motes. No fract(time) wrap: nothing respawns during the dissolve.
    for(int i=0;i<14;i++){
        float k=float(i),h=hash(vec2(k,3.));
        float age=(t-(.09+h*.35))/.48;
        float life=clamp(age,0.,1.);
        float theta=k*2.39996;
        float spread=.12+h*.13+life*.035;
        vec2 center=vec2(.5,.68-life*.48)+vec2(cos(theta)*spread,sin(theta)*.12);
        center.x+=sin(life*2.4+k)*.016;
        vec2 d=p-center;
        float size=max(aa*.65,.0015+h*.0012);
        float spark=band(length(d),size)+band(length(d),.009)*.085;
        float lifeFade=smoothstep(0.,.17,life)*(1.-smoothstep(.55,1.,life));
        emission+=mix(teal,ivory,step(.62,h))*spark*lifeFade*.52;
    }
    emission=1.-exp(-emission);
    // Premultiplied source-over keeps the pale palm textured and avoids additive white clipping.
    float lightAlpha=max(emission.r,max(emission.g,emission.b));
    vec3 rgb=emission+body*(1.-lightAlpha*.72);
    float alpha=c.a+lightAlpha*(1.-c.a);
    float edge=smoothstep(0.,.055,p.x)*(1.-smoothstep(.945,1.,p.x))
        *smoothstep(0.,.045,p.y)*(1.-smoothstep(.95,1.,p.y));
    float lifetime=smoothstep(0.,.025,t)*(1.-smoothstep(.93,1.,t));
    finalColor=vec4(min(rgb,vec3(alpha)),alpha)*edge*lifetime*vColor;
}`;

export function createWildRegenerationMesh(texture: Texture, size: number): Mesh<MeshGeometry, Shader> {
    const geometry = new MeshGeometry({
        positions: new Float32Array([-size / 2, -size, size / 2, -size, size / 2, 0, -size / 2, 0]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
        glProgram: GlProgram.from({ name: "wild-regeneration-engine", vertex, fragment }),
        resources: {
            uArt: texture.source,
            uArtSampler: texture.source.style,
            regeneration: {
                uAge: { value: 0, type: "f32" },
                uStraight: { value: texture.source.alphaMode === "no-premultiply-alpha" ? 1 : 0, type: "f32" },
            },
        },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.label = "wild-regeneration-engine";
    mesh.eventMode = "none";
    mesh.once("destroyed", () => {
        shader.destroy();
        geometry.destroy(true);
    });
    return mesh;
}

export class WildRegenerationEngine {
    private generation = 0;
    private leaseHeld = false;
    private readonly pending = new Set<string>();
    private readonly pops = new Map<
        string,
        {
            container: Container;
            mesh: Mesh<MeshGeometry, Shader>;
            started: number;
            follow: () => Anchor | undefined;
            offset: number;
        }
    >();
    public constructor(
        private readonly attach: FlagOverlayAttach,
        private readonly now = () => performance.now(),
        private readonly load: () => Promise<Texture> = () =>
            Assets.load<Texture>(images.vfx_wild_regeneration_pop_atlas),
    ) {}
    public get active(): boolean {
        return this.pops.size > 0;
    }
    public async spawn(id: string, cell: number, follow: () => Anchor | undefined): Promise<void> {
        if (
            this.pending.has(id) ||
            this.pops.has(id) ||
            this.pending.size + this.pops.size >= REGENERATION_ENGINE_MAX_POPS
        )
            return;
        if (!this.leaseHeld) {
            this.leaseHeld = true;
            retainFlagAtlas("wild_regeneration");
        }
        const generation = this.generation;
        this.pending.add(id);
        try {
            const texture = await this.load().catch(() => undefined);
            if (!texture || generation !== this.generation) return;
            const pos = follow();
            if (!pos) return;
            const container = new Container(),
                mesh = createWildRegenerationMesh(texture, cell * REGENERATION_ENGINE_SIZE_CELLS);
            container.addChild(mesh);
            container.scale.set(1, -1);
            this.pops.set(id, { container, mesh, started: this.now(), follow, offset: cell * 0.07 });
            container.position.set(pos.x, pos.y + cell * 0.07);
            this.attach(container, 5520, follow);
            this.update();
        } finally {
            if (generation === this.generation) this.pending.delete(id);
        }
    }
    public update(): void {
        for (const [id, pop] of this.pops) {
            const age = Math.max(0, this.now() - pop.started),
                pos = pop.follow();
            if (!pos || age >= REGENERATION_ENGINE_DURATION_MS) {
                pop.container.destroy({ children: true });
                this.pops.delete(id);
                continue;
            }
            pop.mesh.shader!.resources.regeneration.uniforms.uAge = age / REGENERATION_ENGINE_DURATION_MS;
            pop.container.position.set(pos.x, pos.y + pop.offset);
            const m = pop.container.parent?.getGlobalTransform();
            if (m) pop.container.scale.set(1, -Math.hypot(m.a, m.b) / Math.max(0.001, Math.hypot(m.c, m.d)));
        }
    }
    public clear(): void {
        this.generation++;
        this.pending.clear();
        for (const p of this.pops.values()) p.container.destroy({ children: true });
        this.pops.clear();
        if (this.leaseHeld) {
            this.leaseHeld = false;
            releaseFlagAtlas("wild_regeneration");
        }
    }
}
