import { Filter, GlProgram, Matrix, type Sprite } from "pixi.js";
import { waterSurfaceFunctions } from "./WaterShieldShader";

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocal;
uniform vec4 uInputSize,uOutputFrame,uOutputTexture;
uniform mat3 uSpriteMatrix;
void main(){
    vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
    p.x=p.x*2./uOutputTexture.x-1.;
    p.y=p.y*(2.*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
    gl_Position=vec4(p,0.,1.);
    vTextureCoord=aPosition*uOutputFrame.zw*uInputSize.zw;
    vLocal=(uSpriteMatrix*vec3(vTextureCoord,1.)).xy;
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord,vLocal;
out vec4 finalColor;
uniform sampler2D uTexture,uBackTexture,uBody;
uniform vec4 uInputSize,uInputClamp;
uniform vec4 uAtlasClamp;
uniform mat3 uLocalToFilter,uAtlasMatrix,uSpriteMatrix;
uniform float uTime,uRadiusX,uAlpha,uStrength,uBodyStrength,uBurst;
${waterSurfaceFunctions}
float creatureAlpha(vec2 local){
    vec2 uv=(uAtlasMatrix*vec3(local,1.)).xy;
    vec2 inside=step(uAtlasClamp.xy,uv)*step(uv,uAtlasClamp.zw);
    return texture(uBody,clamp(uv,uAtlasClamp.xy,uAtlasClamp.zw)).a*inside.x*inside.y;
}
void main(){
    vec2 p=waterPoint(vLocal,uRadiusX);
    vec3 waves=waterWaves(p,uTime);
    float surface=length(p)-waves.x;
    float aa=max(fwidth(surface),.002);
    float mask=(1.-smoothstep(1.-aa,1.+aa,surface))*waterRemaining(p,uBurst);
    float z=sqrt(max(0.,1.-min(surface*surface,1.)));
    // Refraction vanishes at the boundary, so pixels outside the bubble never swim.
    float gate=1.-smoothstep(.80,1.,surface);
    vec2 localOffset=vec2(uRadiusX,.495)*(-p*.10+waves.yz*.32)*z*gate;
    vec2 offset=(uLocalToFilter*vec3(localOffset,0.)).xy;
    // Bound displacement in logical screen pixels, independent of atlas size/facing/DPR.
    float pixels=length(offset/uInputSize.zw);
    offset*=min(1.,4./max(pixels,.001))*uAlpha*uStrength;
    // Protect the current animated silhouette AND any body pixels the background ray would pull in.
    // Sampling the midpoint also protects narrow limbs/trident crossed by the displacement.
    vec2 sampledLocalOffset=(uSpriteMatrix*vec3(offset,0.)).xy;
    float bodyMask=max(creatureAlpha(vLocal),max(
        creatureAlpha(vLocal+sampledLocalOffset*.5),creatureAlpha(vLocal+sampledLocalOffset)));
    offset*=mix(1.,uBodyStrength,smoothstep(.015,.55,bodyMask));
    // Reject a displaced point outside the optical shell instead of pulling in foreground pixels.
    vec2 displacedPoint=waterPoint(vLocal+localOffset,uRadiusX);
    float displacedSurface=length(displacedPoint)-waterWaves(displacedPoint,uTime).x;
    offset*=1.-smoothstep(.97,1.,displacedSurface);
    vec4 unchanged=texture(uBackTexture,clamp(vTextureCoord,uInputClamp.xy,uInputClamp.zw));
    vec4 bent=texture(uBackTexture,clamp(vTextureCoord+offset,uInputClamp.xy,uInputClamp.zw));
    vec4 scene=mix(unchanged,bent,mask*uAlpha);
    vec4 film=texture(uTexture,vTextureCoord);
    finalColor=film+scene*(1.-film.a);
}`;

/** A bounded scene-color copy, supplied/returned by Pixi's filter pool each frame. */
export class WaterShieldRefractionFilter extends Filter {
    public constructor(private sprite: Sprite) {
        super({
            glProgram: GlProgram.from({ name: "water-shield-refraction", vertex, fragment }),
            blendRequired: true,
            resolution: "inherit",
            antialias: "off",
            padding: 5,
            resources: {
                uBody: sprite.texture.source,
                optics: {
                    uSpriteMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uLocalToFilter: { value: new Matrix(), type: "mat3x3<f32>" },
                    uTime: { value: 0, type: "f32" },
                    uRadiusX: { value: 0.405, type: "f32" },
                    uAlpha: { value: 1, type: "f32" },
                    uStrength: { value: 1, type: "f32" },
                    uBodyStrength: { value: 0.12, type: "f32" },
                    uBurst: { value: -1, type: "f32" },
                    uAtlasMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                    uAtlasClamp: { value: new Float32Array(4), type: "vec4<f32>" },
                },
            },
        });
    }
    public update(sprite: Sprite, nowMs: number, radiusX: number, burstAge = -1): void {
        this.sprite = sprite;
        const uniforms = this.resources.optics.uniforms;
        uniforms.uTime = nowMs / 1000;
        uniforms.uRadiusX = radiusX;
        uniforms.uBurst = burstAge;
        this.syncBodyTexture();
    }
    private syncBodyTexture(): void {
        const texture = this.sprite.texture;
        texture.textureMatrix.update();
        this.resources.uBody = texture.source;
        const uniforms = this.resources.optics.uniforms;
        uniforms.uAtlasMatrix.copyFrom(texture.textureMatrix.mapCoord);
        uniforms.uAtlasClamp.set(texture.textureMatrix.uClampFrame);
    }
    public override apply(...args: Parameters<Filter["apply"]>): void {
        const uniforms = this.resources.optics.uniforms;
        this.syncBodyTexture();
        args[0].calculateSpriteMatrix(uniforms.uSpriteMatrix, this.sprite);
        uniforms.uLocalToFilter.copyFrom(uniforms.uSpriteMatrix).invert();
        uniforms.uAlpha = this.sprite.getGlobalAlpha();
        super.apply(...args);
    }
}
