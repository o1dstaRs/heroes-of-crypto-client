import { OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { Assets, Container, GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";
import { images } from "../../imageAssets";
import { retainFlagAtlas, releaseFlagAtlas } from "./CommonFlagPops";

type Anchor = Readonly<{ x: number; y: number }>;
export const REGENERATION_ENGINE_DURATION_MS = OVERHEAD_EFFECT_DURATION_MS;
export const REGENERATION_ENGINE_MAX_POPS = 24;
const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV;
out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha; uniform vec4 uColor;
void main(){vUV=aUV;vColor=uColor*uWorldColorAlpha;
gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform sampler2D uArt; uniform float uAge; uniform float uStraight;
const float PI=3.14159265;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float band(float d,float width){return exp(-d*d/(width*width));}
vec4 cel(vec2 uv,vec2 tile){vec4 c=texture(uArt,(clamp(uv,vec2(.002),vec2(.998))+tile)/4.);c.rgb*=mix(1.,c.a,uStraight);return c;}
vec4 art(vec2 uv){
    // Only two fixed painted states; all light, reveal and healing progression are continuous.
    vec4 wounded=cel(uv,vec2(2,0)),healed=cel(uv,vec2(2,2));
    float front=mix(.92,.13,smoothstep(.18,.66,uAge));
    float heal=smoothstep(front-.07,front+.07,uv.y);
    vec4 c=mix(wounded,healed,heal);
    // Remove the old painted ring outside the central hand so the engine owns the sigil.
    float width=mix(.065,.19,(1.-smoothstep(.34,.50,uv.y)));
    float silhouette=1.-smoothstep(width,width+.025,abs(uv.x-.505));
    silhouette*=smoothstep(.06,.12,uv.y)*(1.-smoothstep(.88,.93,uv.y));
    return c*silhouette;
}
void main(){
    float t=clamp(uAge,0.,1.);
    vec2 p=vUV;
    float envelope=smoothstep(0.,.10,t)*(1.-smoothstep(.78,1.,t));
    float reveal=smoothstep(.02,.19,t);
    float phase=smoothstep(.15,.68,t);
    vec2 q=p-vec2(.50,.43);
    float r=length(q),a=atan(q.y,q.x);
    float aa=max(fwidth(p.x),.0008);
    float radius=.275;
    float circuit=(1.-smoothstep(.78,.98,t))*smoothstep(.01,.18,t);
    float arcA=.42+.58*smoothstep(-.3,.55,sin(a*3.+t*4.8));
    float arcB=.28+.72*smoothstep(-.5,.5,sin(a*7.-t*5.));
    float ring=band(r-radius,aa*.65)*arcA+band(r-radius-.018,aa*.50)*arcB*.7;
    float halo=band(r-radius,.011)*arcA*.16+band(r-radius,.035)*.045;
    float marks=pow(max(0.,cos((a+t*.25)*32.)),18.)*band(r-radius-.009,.007)*.7;
    float sweepAngle=t*5.5-2.;
    vec2 sweep=q-vec2(cos(sweepAngle),sin(sweepAngle))*radius;
    float star=band(length(sweep),.012)*1.7+band(sweep.x,.0015)*band(sweep.y,.027)*.6+band(sweep.y,.0015)*band(sweep.x,.027)*.6;
    float pulse=exp(-pow((t-.62)/.09,2.));
    vec3 gold=vec3(1.,.53,.13),cyan=vec3(.04,.76,1.);
    vec3 emission=(vec3(1.,.84,.42)*ring*1.25+gold*(marks*.85+halo*1.8+star*.85))*circuit;
    // Four counter-rotating diamond glyphs, with restrained halos.
    for(int i=0;i<8;i++){
      float angle=float(i)*PI*.25-t*.65;
      vec2 d=q-vec2(cos(angle),sin(angle))*radius;
      float diamond=abs(abs(d.x)+abs(d.y)-.010);
      float glyph=mix(band(diamond,aa*.65),band(length(d)-.009,aa*.65),mod(float(i),2.));
      emission+=vec3(1.,.78,.30)*glyph*.85*circuit;
    }
    float front=mix(.92,.13,phase);
    vec4 c=art(p);
    float n=noise(p*28.+vec2(t*.8,-t*3.));
    float disintegrate=smoothstep(.7,1.,t);
    float dissolve=smoothstep(disintegrate-.12,disintegrate+.10,n);
    float bodyFade=smoothstep(.02,.17,t)*(1.-smoothstep(.74,.94,t));
    c*=bodyFade*mix(1.,dissolve,smoothstep(.65,.8,t));
    // Narrow moving highlight exposes the actual anatomical surface.
    float healBand=band(p.y-front,.027)*smoothstep(.10,.23,t)*(1.-smoothstep(.67,.78,t));
    vec3 lit=c.rgb*(.84+healBand*.12);
    emission+=cyan*healBand*c.a*.18;
    // Flowing energy wraps behind and in front of the hand, never moving its silhouette.
    for(int i=0;i<2;i++){
      float f=float(i);float phaseLine=p.y*13.-t*9.+f*PI;
      float x=.50+sin(phaseLine)*(.075+.030*sin(p.y*6.));
      float d=abs(p.x-x);
      float along=smoothstep(.12,.24,p.y)*(1.-smoothstep(.82,.93,p.y));
      float z=cos(phaseLine);
      float occlusion=mix(1.-c.a*.92,1.,smoothstep(-.2,.3,z));
      float core=band(d,aa*.75)*.36,glow=band(d,.010)*.12;
      emission+=cyan*(core+glow)*along*occlusion*envelope*(.65+pulse*.22);
    }
    // Soft emission around the same painted hand, eight taps, not a full-screen bloom filter.
    vec3 bloom=vec3(0.);
    for(int i=0;i<8;i++){
      float th=float(i)*PI*.25;
      vec4 s=art(p+vec2(cos(th),sin(th))*.022);
      bloom+=s.rgb*.018;
    }
    emission+=bloom*bodyFade*(.5+pulse);
    float mist=noise(vec2(p.x*9.+t*.4,p.y*6.+t*2.))*noise(p*17.-vec2(0.,t*3.));
    emission+=cyan*mist*exp(-dot(q*vec2(4.,2.8),q*vec2(4.,2.8)))*.065*envelope;
    // Deterministic trajectories; late sparks peel away from the healing crest.
    for(int i=0;i<24;i++){
      float seed=float(i),h=hash(vec2(seed,3.));
      float life=fract(t*.85+seed*.0618);
      float angle=seed*2.39996+t*(.6+h*.5);
      float rad=.10+h*.19+life*.035;
      vec2 center=vec2(.50,.66-life*.52)+vec2(cos(angle)*rad,sin(angle)*rad*.45);
      vec2 d=p-center;
      float size=.0017+h*.0015;
      float dotLight=band(length(d),max(size,aa*.8));
      float glow=band(length(d),.009)*.12;
      float blink=pow(sin(life*PI),1.5)*(0.45+0.55*pow(sin(seed+t*8.),2.));
      emission+=mix(cyan,gold,step(.48,h))*(dotLight+glow)*blink*envelope*.65;
    }
    float edge=smoothstep(0.,.06,p.x)*(1.-smoothstep(.94,1.,p.x))*smoothstep(0.,.06,p.y)*(1.-smoothstep(.94,1.,p.y));
    emission=1.-exp(-emission*1.25);
    vec3 rgb=lit+emission*(1.-lit*.6);
    float alpha=max(c.a,max(emission.r,max(emission.g,emission.b)));
    finalColor=vec4(rgb,clamp(alpha,0.,1.))*edge*envelope*vColor;
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
        private readonly attach: (c: Container, z: number) => void,
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
                mesh = createWildRegenerationMesh(texture, cell * 1.305);
            container.addChild(mesh);
            container.scale.set(1, -1);
            this.pops.set(id, { container, mesh, started: this.now(), follow, offset: cell * 0.07 });
            container.position.set(pos.x, pos.y + cell * 0.07);
            this.attach(container, 5520);
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
