import { Filter, GlProgram, Matrix, Sprite, Texture } from "pixi.js";

export const CANNON_BARREL_PERIOD_MS = 6000;
export const cannonBarrelPhase = (elapsedMs: number): number =>
    ((Math.max(0, elapsedMs) % CANNON_BARREL_PERIOD_MS) / CANNON_BARREL_PERIOD_MS) * Math.PI * 2;

const vertex = `
in vec2 aPosition;out vec2 vUv;out vec2 vInputUv;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;uniform mat3 uBodyMatrix;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*2./uOutputTexture.x-1.;p.y=p.y*2.*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z;
 gl_Position=vec4(p,0.,1.);
 vInputUv=aPosition*uOutputFrame.zw*uInputSize.zw;
 vUv=(uBodyMatrix*vec3(aPosition*uOutputFrame.zw*uInputSize.zw,1.)).xy;
}`;
const fragment = `
precision highp float;in vec2 vUv;in vec2 vInputUv;out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBase;uniform sampler2D uRelief;uniform vec4 uBaseFrame;uniform vec4 uAction;uniform vec4 uAttackPose;uniform float uPhase;uniform float uPixelSize;
vec4 art(vec2 p){return texture(uBase,uBaseFrame.xy+clamp(p/768.,.0001,.9999)*uBaseFrame.zw);}
float panel(float x,float a,float b){return smoothstep(a,a+2.,x)*(1.-smoothstep(b-2.,b,x));}
vec3 relief(vec2 uv){
 uv=fract(uv);
 // Wrap the painted material through a short seam blend, never crossfade animation poses.
 vec3 a=texture(uRelief,uv).rgb,b=texture(uRelief,vec2(uv.x,uv.y+.94)).rgb;
 return mix(b,a,smoothstep(0.,.06,uv.y));
}
void main(){
 bool attack=uAttackPose.x>800.;
 vec2 native=vUv*uAttackPose.x-vec2(uAttackPose.y);
 vec2 p=native-vec2(uAction.x,uAction.z);
 if(attack){
   vec2 d=p-vec2(420.,374.);float c=cos(uAttackPose.z),s=sin(uAttackPose.z);
   p=vec2(420.,374.)+vec2(c*d.x+s*d.y,-s*d.x+c*d.y)+vec2(uAttackPose.w,0.);
 }
 // Keep the approved wheels/chassis exactly as rasterized by Pixi. Only the barrel needs re-sampling.
 if((p.y>440.||p.y<240.||p.x<128.||p.x>744.)&&uAction.x==0.&&uAction.y==0.&&uAction.z==0.){
   finalColor=texture(uTexture,vInputUv);return;
 }
 vec2 pivot=vec2(380.,690.);vec2 d=p-pivot;
 float cs=cos(-uAction.y),sn=sin(-uAction.y);
 p=pivot+vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y);
 vec4 original=attack?texture(uTexture,vInputUv):art(p);vec3 rgb=original.rgb/max(original.a,.001);
 vec2 q=(p-vec2(725.,333.))/vec2(18.,76.);float r=length(q);float mask=0.;vec2 uv;
 if(p.x>705.&&r<1.03){
   uv=vec2(.65+(r-.7)*.3,(atan(q.y,q.x)-uPhase)/6.2831853+.5);
   mask=smoothstep(.70,.79,r)*(1.-smoothstep(.97,1.03,r));
 }else{
   float a=asin(clamp((p.y-333.)/70.,-.999,.999));
   float x=p.x>503.&&p.x<610.? .225+(p.x-503.)/107.*.55:p.x/768.+.17;
   uv=vec2(x,(a-uPhase)/6.2831853+.5);
   float mount=1.-smoothstep(.83,1.12,length((p-vec2(420.,374.))/vec2(48.,55.)));
   mask=(panel(p.x,174.,207.)+panel(p.x,231.,282.)+panel(p.x,309.,331.)+panel(p.x,358.,455.)+panel(p.x,503.,610.)+panel(p.x,684.,709.))
    *smoothstep(259.,266.,p.y)*(1.-smoothstep(388.,402.,p.y))*(1.-mount);
 }
 // Supersample the new broad relief at its screen footprint to suppress subpixel shimmer.
 vec2 dx=vec2(uPixelSize*.0014,0.);
 vec2 dy=vec2(0.,uPixelSize*.28/(6.2831853*sqrt(max(100.,4900.-(p.y-333.)*(p.y-333.)))));
 vec3 detail=(relief(uv-dx-dy)+relief(uv+dx-dy)+relief(uv-dx+dy)+relief(uv+dx+dy))*.25;
 // Fixed low-frequency illumination is separate from the rotating material.
 vec3 light=vec3(0.);float weights=0.;
 for(int i=-3;i<=3;i++){vec4 c=art(p+vec2(0.,float(i)*5.));light+=c.rgb;weights+=c.a;}
 light/=max(weights,.001);
 float luma=dot(detail,vec3(.2126,.7152,.0722));
 vec3 painted=light*clamp(luma/.245,.40,1.95);
 if(attack){
   // The stationary trunnion and authored shot smoke occlude the spinning metal.
   float mount=1.-smoothstep(.80,1.12,length((native-vec2(420.,374.))/vec2(48.,55.)));
   mask*=1.-mount;
   mask*=smoothstep(1.10,1.45,rgb.r/max(rgb.b,.001));
 }
 vec3 c=mix(rgb,painted,clamp(mask,0.,1.));
 finalColor=vec4(clamp(c,0.,1.)*original.a,original.a);
 finalColor.rgb*=1.-uAction.w;
}`;

/** Continuous axial motion of an independently rotating mechanical part; chassis stays pixel-fixed. */
export function createCannonBarrelFilter(body: Sprite, base: Texture, relief: Texture): Filter {
    const filter = new Filter({
        glProgram: GlProgram.from({ vertex, fragment }),
        resolution: 2,
        antialias: "inherit",
        resources: {
            uBase: base.source,
            uRelief: relief.source,
            barrel: {
                uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                uPhase: { value: 0, type: "f32" },
                uBaseFrame: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
                uAction: { value: new Float32Array(4), type: "vec4<f32>" },
                uAttackPose: { value: new Float32Array([768, 0, 0, 0]), type: "vec4<f32>" },
                uPixelSize: { value: 1, type: "f32" },
            },
        },
    });
    filter.apply = (...args: Parameters<Filter["apply"]>) => {
        args[0].calculateSpriteMatrix(filter.resources.barrel.uniforms.uBodyMatrix, body);
        const art = filter.resources.barrel.uniforms.uAttackPose[0] > 800 ? base : body.texture;
        const frame = art.frame,
            source = art.source;
        filter.resources.barrel.uniforms.uBaseFrame.set([
            frame.x / source.width,
            frame.y / source.height,
            frame.width / source.width,
            frame.height / source.height,
        ]);
        filter.resources.barrel.uniforms.uPixelSize =
            1 / Math.max(0.03, Math.hypot(body.worldTransform.a, body.worldTransform.b));
        Filter.prototype.apply.call(filter, ...args);
    };
    return filter;
}
