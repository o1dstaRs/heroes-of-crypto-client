import { OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { Assets, Container, GlProgram, Mesh, MeshGeometry, Shader, type Texture } from "pixi.js";
import { images } from "../../imageAssets";

type Anchor = Readonly<{ x: number; y: number }>;
export const TERRIFYING_GAZE_DURATION_MS = OVERHEAD_EFFECT_DURATION_MS;
const MAX_POPS = 24;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main(){
    vUV=aUV;
    vColor=uColor*uWorldColorAlpha;
    gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uEyes;
uniform float uAge;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.-15.)+10.);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
vec3 eyes(vec2 p){
    float opening=mix(.09,1.,smoothstep(.025,.22,uAge))*(1.-.65*smoothstep(.70,1.,uAge));
    vec2 uv=vec2(p.x,.49+(p.y-.5)*.64/opening);
    float edge=step(0.,uv.y)*step(uv.y,1.);
    return texture(uEyes,clamp(uv,vec2(.001),vec2(.999))).rgb*edge;
}
void main(){
    float fade=smoothstep(0.,.085,uAge)*(1.-smoothstep(.65,1.,uAge));
    vec2 p=vUV;
    p.y+=.055*smoothstep(.55,1.,uAge);
    vec3 source=eyes(p);
    vec3 halo=vec3(0);
    for(int i=0;i<8;i++){
        float a=float(i)*.785398163;
        halo+=eyes(p+vec2(cos(a),sin(a))*.024)*.065;
    }
    float pulse=exp(-pow((uAge-.30)/.095,2.));
    float flow=noise(vec2(p.x*8.,p.y*5.+uAge*1.9))*.65
              +noise(vec2(p.x*17.-uAge*.5,p.y*10.+uAge*3.))*.35;
    float body=exp(-pow((p.x-.5)/.40,4.)-pow((p.y-.51)/.22,2.));
    float smoke=pow(flow,2.4)*body*.17;
    float flecks=0.;
    float aa=max(fwidth(p.x),.002);
    for(int i=0;i<8;i++){
        float seed=float(i);
        float life=fract(uAge*.85+seed*.119);
        vec2 center=vec2(.14+hash(vec2(seed,4))*.72,.60-life*.35);
        center.x+=sin(life*3.+seed)*.025;
        vec2 d=p-center;
        flecks+=exp(-pow(d.x/(aa*1.2),2.)-pow(d.y/.013,2.))*sin(life*3.14159);
    }
    vec3 rgb=source*(.94+pulse*.28)+halo*(.7+pulse*.5)
            +vec3(.34,.006,.012)*smoke+vec3(.65,.018,.006)*flecks*.20;
    float coverage=max(smoothstep(.008,.18,source.r)*.94,max(halo.r,smoke*.45));
    coverage=max(coverage,flecks*.23);
    float border=smoothstep(0.,.08,p.x)*(1.-smoothstep(.92,1.,p.x))
                *smoothstep(0.,.06,p.y)*(1.-smoothstep(.90,1.,p.y));
    coverage=max(coverage,max(rgb.r,max(rgb.g,rgb.b)));
    finalColor=vec4(rgb,clamp(coverage,0.,1.))*fade*border*vColor;
}`;

export function createTerrifyingGazeMesh(texture: Texture, size: number): Mesh<MeshGeometry, Shader> {
    const geometry = new MeshGeometry({
        positions: new Float32Array([-size / 2, -size * 0.82, size / 2, -size * 0.82, size / 2, 0, -size / 2, 0]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
        glProgram: GlProgram.from({
            name: "terrifying-gaze-flag",
            vertex,
            fragment,
            preferredFragmentPrecision: "highp",
        }),
        resources: {
            uEyes: texture.source,
            uEyesSampler: texture.source.style,
            gaze: { uAge: { value: 0, type: "f32" } },
        },
    });
    return new Mesh({ geometry, shader });
}

type Pop = {
    container: Container;
    mesh: Mesh<MeshGeometry, Shader>;
    shader: Shader;
    started: number;
    follow: () => Anchor | undefined;
    offset: number;
};

export class TerrifyingGazePops {
    private readonly pops = new Map<string, Pop>();
    private readonly pending = new Set<string>();
    private generation = 0;
    public constructor(
        private readonly attach: (container: Container, zIndex: number) => void,
        private readonly now: () => number = () => performance.now(),
        private readonly load: () => Promise<Texture> = () => Assets.load<Texture>(images.terrifying_gaze_256),
    ) {}
    public get active(): boolean {
        return this.pops.size > 0;
    }
    public async spawn(id: string, cell: number, follow: () => Anchor | undefined): Promise<void> {
        if (this.pops.has(id) || this.pending.has(id) || this.pops.size + this.pending.size >= MAX_POPS) return;
        const generation = this.generation;
        const started = this.now();
        this.pending.add(id);
        try {
            const texture = await this.load().catch(() => undefined);
            if (!texture) return;
            if (generation !== this.generation || this.now() - started >= TERRIFYING_GAZE_DURATION_MS) return;
            const position = follow();
            if (!position) return;
            const container = new Container();
            const mesh = createTerrifyingGazeMesh(texture, cell * 1.45);
            container.addChild(mesh);
            container.scale.set(1, -1);
            const offset = cell * 0.07;
            container.position.set(position.x, position.y + offset);
            this.attach(container, 5520);
            this.pops.set(id, { container, mesh, shader: mesh.shader!, started, follow, offset });
            this.update();
        } finally {
            if (generation === this.generation) this.pending.delete(id);
        }
    }
    public update(): void {
        const now = this.now();
        for (const [id, pop] of this.pops) {
            const elapsed = Math.max(0, now - pop.started);
            const position = pop.follow();
            if (elapsed >= TERRIFYING_GAZE_DURATION_MS || !position) {
                this.remove(id, pop);
                continue;
            }
            pop.shader.resources.gaze.uniforms.uAge = elapsed / TERRIFYING_GAZE_DURATION_MS;
            pop.container.position.set(position.x, position.y + pop.offset);
            const transform = pop.container.parent?.getGlobalTransform();
            if (transform) {
                const x = Math.hypot(transform.a, transform.b),
                    y = Math.hypot(transform.c, transform.d);
                pop.container.scale.set(1, -x / Math.max(0.001, y));
            }
        }
    }
    private remove(id: string, pop: Pop): void {
        pop.mesh.geometry.destroy();
        pop.shader.destroy();
        pop.container.destroy({ children: true });
        this.pops.delete(id);
    }
    public clear(): void {
        this.generation++;
        this.pending.clear();
        for (const [id, pop] of this.pops) this.remove(id, pop);
    }
}
