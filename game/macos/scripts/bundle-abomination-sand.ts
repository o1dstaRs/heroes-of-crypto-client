import { join } from "node:path";

import {
    ABOMINATION_SAND_LAYER_OPACITY,
    ABOMINATION_SAND_VARIANTS,
    abominationSandMaterial,
} from "../../core/src/scenes/AbominationSandShader";

const resources = process.argv[2];
if (!resources) throw new Error("Pass the app's Resources directory.");

const style = ABOMINATION_SAND_VARIANTS[0];
const styleArguments = [
    style.arms,
    style.pitch,
    style.tightness,
    style.background,
    style.gain,
    style.scale,
    style.squareShape,
].map((value) => (Number.isInteger(value) ? `${value}.0` : String(value)));

function fragment(name: string, base: number, front: number, air: number): string {
    return `
fragment float4 ${name}(SandSample sample [[stage_in]], constant SandUniforms& uniforms [[buffer(0)]],
                        constant float& phase [[buffer(1)]]) {
    SandMaterial sand = {uniforms.clock.x, phase, ${styleArguments.join(", ")},
                         ${base}.0, ${front}.0, ${air}.0, uniforms.motion, uniforms.step,
                         uniforms.wakes[0], uniforms.wakes[1], uniforms.wakes[2],
                         uniforms.wakes[3], uniforms.wakes[4], uniforms.wakes[5]};
    return sand.sandColor(sample.uv) * (${ABOMINATION_SAND_LAYER_OPACITY} * uniforms.clock.y);
}
`;
}

await Bun.write(
    join(resources, "abomination-sand.metal"),
    `#include <metal_stdlib>
using namespace metal;
using vec2 = float2;
using vec3 = float3;
using vec4 = float4;
using mat2 = float2x2;
#define atan(y, x) atan2(y, x)

struct SandMaterial {
    float uTime, uPhaseOffset, uArms, uPitch, uTightness, uBackground, uGain, uScale, uSquareShape;
    float uBaseLayer, uFrontLayer, uAirLayer;
    float4 uMotion, uStep, uWake0, uWake1, uWake2, uWake3, uWake4, uWake5;
    ${abominationSandMaterial}
};

struct SandUniforms { float4 clock, motion, step; float4 wakes[6]; };
struct SandVertex { float2 position; float2 uv; };
struct SandSample { float4 position [[position]]; float2 uv; };

vertex SandSample sandVertex(uint id [[vertex_id]], const device SandVertex* vertices [[buffer(0)]]) {
    return {float4(vertices[id].position, 0.0, 1.0), vertices[id].uv};
}

${fragment("sandBase", 1, 0, 0)}
${fragment("sandCoil", 0, 0, 0)}
${fragment("sandAir", 0, 0, 1)}
${fragment("sandVeil", 0, 1, 0)}
`,
);
