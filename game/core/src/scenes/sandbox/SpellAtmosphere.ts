import { Container, Filter, GlProgram, Matrix, Sprite, Texture } from "pixi.js";

export type SpellAtmosphereSample = {
    x: number;
    y: number;
    width: number;
    height: number;
    light: number;
    heat?: number;
    water?: number;
    cool?: number;
};
export type SpellAtmosphereEmitter = (sample: SpellAtmosphereSample) => void;
const LIMIT = 16;
const vertex = `
in vec2 aPosition; out vec2 vTextureCoord;
uniform vec4 uInputSize,uOutputFrame,uOutputTexture;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*2./uOutputTexture.x-1.;p.y=p.y*(2.*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
 gl_Position=vec4(p,0.,1.);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
const fragment = `
in vec2 vTextureCoord;out vec4 finalColor;
uniform sampler2D uTexture;uniform vec4 uInputClamp;uniform mat3 uWorld,uToTexture;uniform float uTime;
${Array.from({ length: LIMIT }, (_, i) => `uniform vec4 uRegion${i},uEnergy${i};`).join("\n")}
float noise(vec2 p){return sin(p.x*1.17+sin(p.y*1.63))*.55+sin(p.y*2.31-p.x*.72)*.3+sin(p.x*4.11+p.y*3.19)*.15;}
void source(vec2 world,vec4 region,vec4 energy,inout vec2 warp,inout vec3 illumination){
 if(region.z<=0. || region.w<=0.)return;
 vec2 q=(world-region.xy)/region.zw;float radius=length(q);
 float mask=1.-smoothstep(.2,1.,radius);
 if(mask<=0.)return;
 vec2 flow=q*vec2(13.,19.)-vec2(uTime*.7,uTime*9.);
 float n=noise(flow),detail=noise(flow*2.07+uTime*3.);
 // Convective heat rises through the affected region, fading continuously at its edge.
 warp+=vec2(n,detail*.38)*mask*energy.y*min(region.z,region.w)*.016;
 // Small inward ripples and tangential refraction remain inside the painted water footprint.
 float ripple=sin(radius*43.-uTime*9.+n*.6);
 warp+=(q*ripple+vec2(-q.y,q.x)*n*.45)*mask*energy.z*min(region.z,region.w)*.009;
 vec3 color=mix(vec3(1.,.34,.065),vec3(.25,.65,1.),energy.w);
 illumination+=color*energy.x*mask*mask;
}
void main(){
 vec2 world=(uWorld*vec3(vTextureCoord,1.)).xy;vec2 warp=vec2(0.);vec3 light=vec3(0.);
 ${Array.from({ length: LIMIT }, (_, i) => `source(world,uRegion${i},uEnergy${i},warp,light);`).join("\n")}
 vec2 uv=(uToTexture*vec3(world+warp,1.)).xy;
 vec4 c=texture(uTexture,clamp(uv,uInputClamp.xy,uInputClamp.zw));
 // A multiplicative material response retains creature detail. No alpha change or silhouette enlargement.
 light=min(light,vec3(1.25));
 vec3 rgb=c.rgb*(vec3(1.)+light*.9)+c.a*light*.035;
 finalColor=vec4(min(rgb,vec3(c.a)),c.a);
}`;

class SpellAtmosphereFilter extends Filter {
    public constructor(private readonly origin: Sprite) {
        const sources = Object.fromEntries(
            Array.from({ length: LIMIT }, (_, i) => [
                [`uRegion${i}`, { value: new Float32Array(4), type: "vec4<f32>" }],
                [`uEnergy${i}`, { value: new Float32Array(4), type: "vec4<f32>" }],
            ]).flat(),
        );
        super({
            glProgram: GlProgram.from({ vertex, fragment }),
            resolution: "inherit",
            padding: 4,
            resources: {
                atmosphere: {
                    uWorld: { value: new Matrix(), type: "mat3x3<f32>" },
                    uToTexture: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    ...sources,
                },
            },
        });
    }
    public setSources(samples: readonly SpellAtmosphereSample[], time: number): void {
        const uniforms = this.resources.atmosphere.uniforms;
        uniforms.uTime = time;
        for (let i = 0; i < LIMIT; i++) {
            const s = samples[i];
            uniforms[`uRegion${i}`].set(s ? [s.x, s.y, s.width, s.height] : [0, 0, 0, 0]);
            uniforms[`uEnergy${i}`].set(s ? [s.light, s.heat ?? 0, s.water ?? 0, s.cool ?? 0] : [0, 0, 0, 0]);
        }
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        // Pixi supplies the exact cropped filter frame and camera transform; never assume screen-sized UVs.
        args[0].calculateSpriteMatrix(this.resources.atmosphere.uniforms.uWorld, this.origin);
        this.resources.atmosphere.uniforms.uToTexture.copyFrom(this.resources.atmosphere.uniforms.uWorld).invert();
        super.apply(...args);
    }
}

/** One transient world pass, shared by both fire renderers. It never touches HUD/React layers. */
export class SpellAtmosphere {
    private samples: SpellAtmosphereSample[] = [];
    private origin?: Sprite;
    private world?: Container;
    private filter?: SpellAtmosphereFilter;
    public constructor(private readonly attach: (container: Container, z: number) => void) {}
    public begin(): void {
        this.samples.length = 0;
    }
    public readonly emit: SpellAtmosphereEmitter = (sample) => {
        if (
            [
                sample.x,
                sample.y,
                sample.width,
                sample.height,
                sample.light,
                sample.heat ?? 0,
                sample.water ?? 0,
                sample.cool ?? 0,
            ].every(Number.isFinite) &&
            sample.width > 0 &&
            sample.height > 0
        )
            this.samples.push(sample);
    };
    public update(time = performance.now()): void {
        if (!this.samples.length) {
            this.detach();
            return;
        }
        if (!this.origin) {
            this.origin = new Sprite(Texture.WHITE);
            // Texture-normalized coordinates become world units through the 1x1 reference sprite.
            this.origin.width = this.origin.height = 1;
            this.origin.renderable = false;
            this.attach(this.origin, 0);
            this.world = this.origin.parent ?? undefined;
        }
        if (!this.world || this.world.destroyed) return;
        this.filter ??= new SpellAtmosphereFilter(this.origin);
        // Prefer the strongest flashes when many simultaneous previews exceed the uniform budget.
        this.samples.sort(
            (a, b) => b.light + (b.heat ?? 0) + (b.water ?? 0) - (a.light + (a.heat ?? 0) + (a.water ?? 0)),
        );
        this.filter.setSources(this.samples.slice(0, LIMIT), time / 1000);
        const installed = this.world.filters ?? [];
        if (!installed.includes(this.filter)) this.world.filters = [...installed, this.filter];
    }
    private detach(): void {
        if (this.world && !this.world.destroyed && this.filter) {
            const filters = (this.world.filters ?? []).filter((f) => f !== this.filter);
            this.world.filters = filters.length ? filters : null;
        }
    }
    public clear(): void {
        this.detach();
        this.filter?.destroy();
        this.filter = undefined;
        this.origin?.destroy();
        this.origin = undefined;
        this.world = undefined;
        this.samples = [];
    }
}
