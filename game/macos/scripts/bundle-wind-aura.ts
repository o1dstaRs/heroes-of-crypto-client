import { join } from "node:path";

import { dryadWindFieldMaterial, dryadWindRimMaterial } from "../../core/src/scenes/DryadWindShader";
import { GRIFFIN_TORNADO_ART } from "../../core/src/scenes/GriffinTornadoAura";
import { griffinTornadoDustMaterial } from "../../core/src/scenes/GriffinTornadoDustShader";
import { griffinTornadoMaterial } from "../../core/src/scenes/GriffinTornadoShader";
import { WYVERN_POISON_ART } from "../../core/src/scenes/WyvernPoisonAura";
import {
    wyvernAirMaterial,
    wyvernFloorMaterial,
    wyvernPoisonCommonMaterial,
    wyvernTrailMaterial,
} from "../../core/src/scenes/WyvernPoisonShader";

const resources = process.argv[2];
if (!resources) throw new Error("Pass the app's Resources directory.");

// Keep the shader math in the web client and supply the renderer's Metal bindings here.
function fragment(name: string, material: string): string {
    return `
float4 ${name}Color(vec2 vUV, float uTime, float uPerimeter, float uAspect, float uInward) {
    ${material}
}

fragment float4 ${name}(WindSample sample [[stage_in]], constant float4& uniforms [[buffer(0)]],
                       constant float& inward [[buffer(1)]]) {
    return ${name}Color(sample.uv, uniforms.x, uniforms.y, uniforms.z, inward) * uniforms.w;
}
`;
}

await Bun.write(
    join(resources, "wind-aura.metal"),
    `#include <metal_stdlib>
using namespace metal;
using vec2 = float2;
using vec3 = float3;
using vec4 = float4;
using mat2 = float2x2;
#define atan(y, x) atan2(y, x)
#define mod(x, y) ((x) - (y) * floor((x) / (y)))

struct WindVertex { float2 position; float2 uv; };
struct WindSample { float4 position [[position]]; float2 uv; };

vertex WindSample windVertex(uint id [[vertex_id]], const device WindVertex* vertices [[buffer(0)]]) {
    return {float4(vertices[id].position, 0, 1), vertices[id].uv};
}

${fragment("windField", dryadWindFieldMaterial)}
${fragment("windRim", dryadWindRimMaterial)}

${griffinTornadoMaterial}
${griffinTornadoDustMaterial}

fragment float4 griffinWind(WindSample sample [[stage_in]], constant float4& uniforms [[buffer(0)]]) {
    return griffinWindColor(sample.uv, uniforms.x) * uniforms.w;
}

fragment float4 griffinDust(WindSample sample [[stage_in]], constant float4& uniforms [[buffer(0)]]) {
    return griffinDustColor(sample.uv, uniforms.x) * uniforms.w;
}

${wyvernPoisonCommonMaterial}
${wyvernFloorMaterial}
${wyvernAirMaterial}
${wyvernTrailMaterial}

fragment float4 wyvernFloor(WindSample sample [[stage_in]], constant float4* uniforms [[buffer(0)]]) {
    return wyvernFloorColor(sample.uv, uniforms[0].x, uniforms[1]) * uniforms[0].w;
}

fragment float4 wyvernAir(WindSample sample [[stage_in]], constant float4* uniforms [[buffer(0)]],
                          constant float& index [[buffer(1)]]) {
    const float4 plume = uniforms[uint(index)];
    return wyvernAirColor(sample.uv, uniforms[0].x, plume.x, plume.y) * plume.w;
}

fragment float4 wyvernTrail(WindSample sample [[stage_in]], constant float4* uniforms [[buffer(0)]],
                            constant float& index [[buffer(1)]]) {
    const float4 wake = uniforms[uint(index)];
    return wyvernTrailColor(sample.uv, wake.x, wake.y) * wake.w;
}
`,
);

await Bun.write(join(resources, "griffin-aura.json"), JSON.stringify(GRIFFIN_TORNADO_ART));
await Bun.write(join(resources, "wyvern-aura.json"), JSON.stringify(WYVERN_POISON_ART));
