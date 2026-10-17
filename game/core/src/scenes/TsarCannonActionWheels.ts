import { Filter, GlProgram, Matrix, Sprite, Texture } from "pixi.js";

// Replace the existing wheel pixels with the stopped locomotion cel. This is not an extra wheel sprite.
const vertex = `
in vec2 aPosition;out vec2 vInputUv;out vec2 vBodyUv;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;uniform mat3 uBodyMatrix;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*2./uOutputTexture.x-1.;p.y=p.y*2.*uOutputTexture.z/uOutputTexture.y-uOutputTexture.z;
 gl_Position=vec4(p,0.,1.);vInputUv=aPosition*uOutputFrame.zw*uInputSize.zw;
 vBodyUv=(uBodyMatrix*vec3(vInputUv,1.)).xy;
}`;
const fragment = `
precision highp float;in vec2 vInputUv;in vec2 vBodyUv;out vec4 finalColor;
uniform sampler2D uTexture;uniform sampler2D uStoppedWheels;uniform vec4 uWheelFrame;
void main(){
 vec2 p=vBodyUv*1024.-vec2(128.);
 bool wheel=distance(p,vec2(146.,616.))<108. || distance(p,vec2(438.,602.))<131.;
 finalColor=wheel?texture(uStoppedWheels,uWheelFrame.xy+(p/768.)*uWheelFrame.zw):texture(uTexture,vInputUv);
}`;

export function createCannonActionWheelFilter(body: Sprite, frame: Texture): Filter {
    const filter = new Filter({
        glProgram: GlProgram.from({ vertex, fragment }),
        resolution: 2,
        antialias: "inherit",
        resources: {
            uStoppedWheels: frame.source,
            wheels: {
                uBodyMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
                uWheelFrame: {
                    value: new Float32Array([
                        frame.frame.x / frame.source.width,
                        frame.frame.y / frame.source.height,
                        frame.width / frame.source.width,
                        frame.height / frame.source.height,
                    ]),
                    type: "vec4<f32>",
                },
            },
        },
    });
    filter.apply = (...args: Parameters<Filter["apply"]>) => {
        args[0].calculateSpriteMatrix(filter.resources.wheels.uniforms.uBodyMatrix, body);
        Filter.prototype.apply.call(filter, ...args);
    };
    return filter;
}
