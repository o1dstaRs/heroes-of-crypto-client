import { join } from "node:path";

import { chargeNoiseBytes, CHARGE_NOISE_SIZE } from "../../core/src/scenes/sandbox/NomadChargeDustShader";
import { SMOKE_CLOUD_VISUALS } from "../../core/src/scenes/sandbox/SmokeCloudLayer";
import { smokeCloudMaterial } from "../../core/src/scenes/sandbox/SmokeCloudShader";

const output = process.argv[2];
if (!output) throw new Error("Pass the app's Resources directory.");

await Promise.all([
    Bun.write(
        join(output, "smoke-cloud.json"),
        JSON.stringify({ ...SMOKE_CLOUD_VISUALS, noiseSize: CHARGE_NOISE_SIZE }),
    ),
    Bun.write(
        join(output, "smoke-noise.dat"),
        chargeNoiseBytes().filter((_, index) => index % 4 === 0),
    ),
    Bun.write(
        join(output, "smoke-cloud.metal"),
        `#include <metal_stdlib>
using namespace metal;
using vec2 = float2;
using vec3 = float3;
using vec4 = float4;
using mat2 = float2x2;
#define atan(y, x) atan2(y, x)
#define mod fmod
#define dFdx dfdx
#define dFdy dfdy
constexpr sampler densitySampler(coord::normalized, address::repeat, filter::linear);
#define SMOKE_NOISE(p) uNoise.sample(densitySampler, p)

struct SmokeMaterial {
    texture3d<float> uNoise;
    float uTime, uSeed, uPresence;
    ${smokeCloudMaterial}
};

struct SmokeVertex { float2 position; float2 uv; };
struct SmokeSample { float4 position [[position]]; float2 uv; };

vertex SmokeSample smokeVertex(uint id [[vertex_id]], const device SmokeVertex* vertices [[buffer(0)]]) {
    return {float4(vertices[id].position, 0.0, 1.0), vertices[id].uv};
}

fragment float4 smokeFragment(SmokeSample sample [[stage_in]], constant float4* clouds [[buffer(0)]],
                              constant float& index [[buffer(1)]], texture3d<float> noise [[texture(0)]]) {
    float4 cloud = clouds[uint(index)];
    SmokeMaterial smoke = {noise, cloud.x, cloud.y, cloud.z};
    return smoke.smokeColor(sample.uv);
}
`,
    ),
]);
