import { Container, GlProgram, Mesh, MeshGeometry, Shader } from "pixi.js";

type Point = Readonly<{ x: number; y: number }>;
export type SkewerSpearPose = { origin: Point; phase: number; end?: Point };
const smooth = (v: number): number => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
};

/** Six authored Pikeman cels: windup 0–1, thrust 2–3, recovery 4–5. */
export function skewerSpearEnvelope(phase: number): { reach: number; alpha: number } {
    return {
        reach: smooth((phase - 2) / 1.05),
        alpha: smooth((phase - 2) / 0.18) * (1 - smooth((phase - 3.55) / 0.45)),
    };
}

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
 vUV=aUV; vColor=uColor*uWorldColorAlpha;
 gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.)).xy,0.,1.);
}`;
const fragment = /* glsl */ `#version 300 es
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uLength;
uniform float uReach;
uniform float uPhase;
uniform float uOpacity;
void main(){
 float x=vUV.x*uLength, y=(vUV.y-.5)*.56;
 float tip=uLength*uReach;
 float aa=max(fwidth(y),.0015);
 float behind=tip-x;
 float end=1.-smoothstep(-aa,aa,-behind);
 float start=smoothstep(0.,.055,x);
 float core=exp(-pow(y/.018,2.))*end;
 float halo=exp(-abs(y)*23.)*end;
 // Faceted lance head remains a pointed blade, never a detached travelling orb.
 float bladeW=.09*clamp(behind/.24,0.,1.)*clamp((.36-behind)/.12,0.,1.);
 float blade=(1.-smoothstep(bladeW-aa,bladeW+aa,abs(y)))*step(0.,behind)*step(behind,.36);
 float ridge=exp(-abs(y)*150.)*blade;
 float ribbons=0.;
 for(int i=0;i<3;i++){
   float a=x*16.-uPhase*4.+float(i)*2.094;
   float wave=sin(a)*.055;
   float strand=exp(-pow((y-wave)/.006,2.));
   ribbons+=strand*(.35+.65*pow(.5+.5*cos(a),2.))*end;
 }
 float motes=0.;
 for(int i=0;i<10;i++){
   float f=fract(float(i)*.618+uPhase*.22);
   vec2 p=vec2(f*tip,sin(float(i)*2.4+uPhase*2.)*.115);
   vec2 d=vec2(x,y)-p;
   motes+=exp(-pow(d.x/.017,2.)-pow(d.y/.006,2.))*sin(f*3.14159)*end;
 }
 vec3 rgb=vec3(.035,.40,.56)*halo*.65+vec3(.58,.93,1.)*core*.95
          +vec3(.17,.68,.80)*blade*.9+vec3(.8,.97,1.)*ridge*.65
          +vec3(.09,.69,.84)*ribbons*.65+vec3(.58,.9,1.)*motes*.7;
 float border=smoothstep(0.,.05,vUV.y)*(1.-smoothstep(.95,1.,vUV.y));
 float a=clamp(max(rgb.r,max(rgb.g,rgb.b)),0.,1.);
 finalColor=vec4(rgb,a)*start*border*uOpacity*vColor;
}`;

/** Bounded local emissive mesh, driven by the weapon's authored pose, with no new textures. */
export class SkewerSpears {
    private readonly spears = new Map<
        string,
        {
            root: Container;
            mesh: Mesh<MeshGeometry, Shader>;
            end: Point;
            cell: number;
            follow: () => SkewerSpearPose | undefined;
        }
    >();
    public constructor(private readonly attach: (root: Container, z: number) => void) {}
    public get active(): boolean {
        return this.spears.size > 0;
    }
    public spawn(id: string, end: Point, cell: number, follow: () => SkewerSpearPose | undefined): void {
        this.remove(id);
        if (this.spears.size >= 16 || !follow()) return;
        const geometry = new MeshGeometry({
            positions: new Float32Array([0, -0.28, 1, -0.28, 1, 0.28, 0, 0.28]),
            uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });
        const shader = new Shader({
            glProgram: GlProgram.from({
                name: "skewer-mystic-lance",
                vertex,
                fragment,
                preferredFragmentPrecision: "highp",
            }),
            resources: {
                spear: {
                    uLength: { value: 1, type: "f32" },
                    uReach: { value: 0, type: "f32" },
                    uPhase: { value: 0, type: "f32" },
                    uOpacity: { value: 0, type: "f32" },
                },
            },
        });
        const root = new Container();
        const mesh = new Mesh({ geometry, shader });
        mesh.blendMode = "add";
        root.addChild(mesh);
        this.attach(root, 5490);
        this.spears.set(id, { root, mesh, end: { ...end }, cell, follow });
        this.update();
    }
    public update(): void {
        for (const [id, s] of this.spears) {
            const pose = s.follow();
            if (!pose || pose.phase >= 4) {
                this.remove(id);
                continue;
            }
            const end = pose.end ?? s.end;
            const dx = end.x - pose.origin.x,
                dy = end.y - pose.origin.y;
            const length = Math.hypot(dx, dy);
            const envelope = skewerSpearEnvelope(pose.phase);
            s.root.position.set(pose.origin.x, pose.origin.y);
            s.root.rotation = Math.atan2(dy, dx);
            s.mesh.scale.set(length, s.cell);
            s.root.visible = length > 1 && envelope.alpha > 0;
            const u = s.mesh.shader!.resources.spear.uniforms;
            u.uLength = length / s.cell;
            u.uReach = envelope.reach;
            u.uOpacity = envelope.alpha;
            u.uPhase = pose.phase;
        }
    }
    private remove(id: string): void {
        const s = this.spears.get(id);
        if (!s) return;
        s.mesh.geometry.destroy();
        s.mesh.shader!.destroy();
        s.root.destroy({ children: true });
        this.spears.delete(id);
    }
    public clear(): void {
        for (const id of this.spears.keys()) this.remove(id);
    }
}
