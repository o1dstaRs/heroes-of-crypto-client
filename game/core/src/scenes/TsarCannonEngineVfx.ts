import { Container, Filter, GlProgram, Matrix, Sprite, Texture } from "pixi.js";
import { cannonAttackPose, CANNON_SHOT_RELEASE_FRAME, isCannonAttack } from "./TsarCannonReactions";

/** Continuous density fields, shared by the muzzle gases and the short projectile wake. */
export const CANNON_GAS_GLSL = `
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){return noise(p)*.55+noise(p*2.03+17.)*.27+noise(p*4.17+31.)*.13+noise(p*8.29+53.)*.05;}
vec4 gas(vec2 q,float seed,float age,float heat){
 vec3 n=vec3(q*2.5+vec2(seed*13.,-age*.45),seed+age*.33);
 float turb=fbm(n+fbm(n*.7)*1.8);
 float r=length(q);
 float edge=1.-smoothstep(.53,.98,r+(turb-.5)*.40);
 float depth=sqrt(max(0.,1.-dot(q,q)));
 float density=edge*(.65+turb*.65)*depth;
 float alpha=1.-exp(-density*2.5);
 float grad=fbm(n+vec3(-.12,-.16,.06))-turb;
 float shade=clamp(.42-q.y*.21+depth*.23+grad*2.1,.12,.92);
 vec3 smoke=mix(vec3(.075,.067,.058),vec3(.72,.70,.65),shade);
 vec3 fire=mix(vec3(.48,.055,.006),vec3(1.,.74,.28),smoothstep(.3,.7,turb));
 smoke=mix(smoke,fire,heat*depth*(.55+turb*.45));
 return vec4(smoke*alpha,alpha);
}
vec4 over(vec4 top,vec4 bottom){return top+bottom*(1.-top.a);}
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),.001),0.,1.));}
`;

const vertex = `
in vec2 aPosition;out vec2 vUv;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;uniform mat3 uMatrix;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*2./uOutputTexture.x-1.;p.y=p.y*2.*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z;
 gl_Position=vec4(p,0.,1.);vUv=(uMatrix*vec3(aPosition*uOutputFrame.zw*uInputSize.zw,1.)).xy;}
`;
const fragment = `
precision highp float;in vec2 vUv;out vec4 finalColor;
uniform float uAge;uniform float uSeed;uniform float uKind;
${CANNON_GAS_GLSL}
void main(){
 vec2 p=vUv*vec2(640.,480.)-vec2(uKind<.5?70.:300.,240.);
 float age=uAge;vec4 outPixel=vec4(0.);
 if(uKind<.5){
  // Expanding, curling gunpowder gases; front advances while the back remains connected to the bore.
  for(int i=0;i<11;i++){
   float id=float(i),s=hash(vec3(id,uSeed,4.));
   float born=id*.013;float a=age-born;
   if(a>=0.&&a<.85){
    float theta=s*6.283+a*(s-.5)*2.;
    float speed=85.+s*100.;
    vec2 c=vec2(12.+a*speed,(s-.5)*28.-a*a*45.);
    c+=vec2(cos(theta),sin(theta))*(12.+a*34.);
    float radius=23.+sqrt(a)*95.;
    vec2 q=(p-c)/vec2(radius*1.08,radius);
    vec4 cloud=gas(q,id+uSeed,a,max(0.,1.-age/.14));
    float fade=smoothstep(0.,.025,a)*(1.-smoothstep(.28,.85,a));
    cloud*=fade*.54;outPixel=over(cloud,outPixel);
   }
  }
  float flash=exp(-age*38.);
  float cone=exp(-pow((p.y+sin(p.x*.055+uSeed)*4.)/(13.+max(0.,p.x)*.13),2.))*exp(-max(0.,p.x)/77.);
  cone*=smoothstep(-7.,5.,p.x)*(1.-smoothstep(180.,260.,p.x));
  float hot=clamp(cone*flash*2.1,0.,1.);
  outPixel=over(vec4(vec3(1.,.79,.40)*hot,hot),outPixel);
 }
 // Fine ballistic metal sparks; streak lengths follow actual velocity instead of fixed star shapes.
 for(int i=0;i<24;i++){
  float id=float(i),s=hash(vec3(id,uSeed,7.)),h=hash(vec3(id,uSeed,19.));
  float life=.22+h*.37;
  if(age<life){
   float theta=uKind<.5?(s-.5)*1.0:2.8+s*4.5;
   vec2 velocity=vec2(cos(theta),sin(theta))*(420.+h*580.);
   vec2 c=velocity*age+vec2(0.,155.*age*age);
   vec2 tail=c-(velocity+vec2(0.,310.*age))*(.016+h*.020);
   float dist=segment(p,c,tail),fade=pow(1.-age/life,.85);
   float core=exp(-dist*dist/(10.+h*7.));
   float glow=exp(-dist*dist/100.)*.40;
   float a=clamp((core+glow)*fade,0.,1.);
   vec3 color=mix(vec3(1.,.24,.025),vec3(1.,.91,.62),core*(1.-age/life));
   outPixel=over(vec4(color*a,a),outPixel);
  }
 }
 if(uKind>.5){
  float flash=exp(-dot(p,p)/220.)*exp(-age*52.);
  outPixel=over(vec4(vec3(1.,.84,.49)*flash,flash),outPixel);
 }
 float clipFade=smoothstep(0.,.025,vUv.x)*smoothstep(0.,.025,vUv.y)*(1.-smoothstep(.975,1.,vUv.x))*(1.-smoothstep(.975,1.,vUv.y));
 finalColor=outPixel*clipFade;
}
`;

export interface CannonVfxAction {
    stateName: string;
    frameIndex?: number;
    progress: number;
    instance?: object;
}
interface Burst {
    layer: Container;
    sprite: Sprite;
    filter: Filter;
    born: number;
    kind: "hit" | "shot";
    origin: { x: number; y: number };
    angle: number;
}
interface State {
    action?: object | string;
    frame: number;
    fired: boolean;
    serial: number;
    bursts: Burst[];
}
const states = new WeakMap<Sprite, State>();

function spawn(now: number, kind: "hit" | "shot", action: CannonVfxAction, serial: number): Burst {
    const layer = new Container({ eventMode: "none" });
    layer.label = `tsar-cannon-engine-${kind}`;
    const sprite = new Sprite(Texture.WHITE);
    sprite.width = 640;
    sprite.height = 480;
    if (kind === "hit") sprite.blendMode = "add";
    layer.addChild(sprite);
    const filter = new Filter({
        glProgram: GlProgram.from({ vertex, fragment }),
        resolution: 2,
        antialias: "inherit",
        resources: {
            burst: {
                uMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                uAge: { value: 0, type: "f32" },
                uKind: { value: kind === "hit" ? 1 : 0, type: "f32" },
                uSeed: { value: serial * 1.618, type: "f32" },
            },
        },
    });
    filter.apply = (...args: Parameters<Filter["apply"]>) => {
        args[0].calculateSpriteMatrix(filter.resources.burst.uniforms.uMatrix, sprite);
        Filter.prototype.apply.call(filter, ...args);
    };
    sprite.filters = [filter];
    let origin = { x: 415, y: 419 },
        angle = 0;
    if (kind === "shot" && isCannonAttack(action.stateName)) {
        const pose = cannonAttackPose(action.stateName, action.frameIndex ?? CANNON_SHOT_RELEASE_FRAME);
        angle = pose[2];
        origin = {
            x: 420 + Math.cos(angle) * (725 - 420 - pose[3]) - Math.sin(angle) * (333 - 374),
            y: 374 + Math.sin(angle) * (725 - 420 - pose[3]) + Math.cos(angle) * (333 - 374),
        };
    }
    sprite.pivot.set((kind === "shot" ? 70 : 300) / 640, 240 / 480);
    // Texture.WHITE is 1x1: pivot remains in texture coordinates while width scales it to native pixels.
    return { layer, sprite, filter, born: now, kind, origin, angle };
}
function dispose(b: Burst): void {
    b.layer.destroy({ children: true });
    b.filter.destroy();
}

/** One burst per authored hit/release; continues its own lifetime after the body returns to idle. */
export function syncCannonEngineVfx(body: Sprite, now: number, action?: CannonVfxAction): void {
    let state = states.get(body);
    if (!state) {
        if (!action || (action.stateName !== "hit" && !isCannonAttack(action.stateName))) return;
        state = { frame: -1, fired: false, serial: 0, bursts: [] };
        states.set(body, state);
        const owned = state;
        body.once("destroyed", () => {
            owned.bursts.forEach(dispose);
            states.delete(body);
        });
    }
    const frame = action?.frameIndex ?? Math.floor((action?.progress ?? 0) * 23);
    const key = action?.instance ?? action?.stateName;
    if (key !== state.action || frame < state.frame) {
        state.action = key;
        state.fired = false;
    }
    state.frame = frame;
    const hit = action?.stateName === "hit";
    const shot = isCannonAttack(action?.stateName) && frame >= CANNON_SHOT_RELEASE_FRAME;
    if (action && !state.fired && (hit || shot)) {
        state.fired = true;
        // Bound resource use under repeated manual lab triggers.
        if (state.bursts.length >= 4) dispose(state.bursts.shift()!);
        state.bursts.push(spawn(now, hit ? "hit" : "shot", action, ++state.serial));
    }
    for (let i = state.bursts.length - 1; i >= 0; i--) {
        const b = state.bursts[i],
            age = (now - b.born) / 1000;
        if (age > (b.kind === "hit" ? 0.62 : 0.99) || action?.stateName === "death") {
            dispose(b);
            state.bursts.splice(i, 1);
            continue;
        }
        if (body.parent && b.layer.parent !== body.parent) body.parent.addChild(b.layer);
        b.layer.position.copyFrom(body.position);
        b.layer.scale.copyFrom(body.scale);
        b.layer.rotation = body.rotation;
        b.layer.skew.copyFrom(body.skew);
        b.layer.pivot.copyFrom(body.pivot);
        b.layer.zIndex = body.zIndex + 0.02;
        b.layer.alpha = body.alpha;
        b.layer.visible = body.visible;
        const size = body.texture.width,
            pad = size === 1024 ? 128 : 0;
        b.sprite.position.set(b.origin.x + pad - body.anchor.x * size, b.origin.y + pad - body.anchor.y * size);
        b.sprite.rotation = b.angle;
        b.filter.resources.burst.uniforms.uAge = Math.max(0, age);
    }
}
