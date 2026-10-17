// Shared by idle, walking and hit reactions. sampleArt samples ungraded source pixels.
export const GOBLIN_ICE_GLOW_GLSL = /* glsl */ `
float ice(vec4 c) {
    vec3 rgb = c.rgb / max(c.a, 0.001);
    return c.a * smoothstep(0.12, 0.48, rgb.b - rgb.r)
        * smoothstep(0.10, 0.40, rgb.g - rgb.r);
}

vec4 goblinIceFigure(vec4 body, vec2 source) {
    float core = ice(body);
    float nearGlow = 0.0;
    float farGlow = 0.0;
    for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.78539816339;
        vec2 direction = vec2(cos(angle), sin(angle));
        nearGlow += ice(sampleArt(source + direction * 3.5)) * 0.125;
        farGlow += ice(sampleArt(source + direction * 14.0)) * 0.125;
    }
    // Only the existing cyan blade and visor emit light. The dark navy cloak keeps its grade.
    vec2 bladeVector = uBlade.zw - uBlade.xy;
    float bladeProjection = clamp(dot(source - uBlade.xy, bladeVector) / max(dot(bladeVector, bladeVector), 1.0), 0.0, 1.0);
    float bladeRegion = 1.0 - smoothstep(22.0, 45.0, length(source - uBlade.xy - bladeVector * bladeProjection));
    float region = max(bladeRegion, max(smoothstep(430.0, 460.0, source.y),
        (1.0 - smoothstep(175.0, 205.0, source.y)) * smoothstep(425.0, 455.0, source.x)));
    core *= region;
    float halo = (nearGlow * 0.95 + farGlow * 0.65) * region;
    float flux = 0.92 + 0.08 * sin(uTime * 1.7);
    float glint = pow(0.5 + 0.5 * sin(source.y * 0.12 + source.x * 0.05 - uTime * 4.1), 12.0);
    vec3 iceColor = vec3(0.22, 0.79, 1.0);
    float alpha = body.a + halo * 0.72 * (1.0 - body.a);
    vec3 emission = iceColor * halo * flux * 0.72
        + vec3(0.50, 0.86, 1.0) * core * (0.32 + 0.30 * glint) * flux;
    // Enchanted weapon: a continuous cold corona with travelling filaments and ice motes.
    vec2 bladeStart = uBlade.xy;
    vec2 bladeTip = uBlade.zw;
    vec2 axis = normalize(bladeTip - bladeStart);
    vec2 normal = vec2(-axis.y, axis.x);
    float along = dot(source - bladeStart, axis);
    float across = dot(source - bladeStart, normal);
    float lengthBlade = length(bladeTip - bladeStart);
    float taper = smoothstep(-10.0, 25.0, along) * (1.0 - smoothstep(lengthBlade - 10.0, lengthBlade + 22.0, along));
    float filament = exp(-pow((abs(across) - 16.0 - 4.0 * sin(along * 0.065 - uTime * 4.0)) / 3.0, 2.0));
    float corona = exp(-abs(across) / 19.0) * 0.30 + filament * 0.45;
    float motes = 0.0;
    for (int j = 0; j < 6; j++) {
        float seed = float(j);
        float travel = fract(uTime * 0.19 + seed * 0.163);
        vec2 mote = bladeStart + axis * (travel * lengthBlade)
            + normal * (24.0 * sin(seed * 4.7 + uTime * 1.4));
        motes += exp(-dot(source - mote, source - mote) / 9.0) * sin(travel * 3.14159);
    }
    float aura = (corona * taper + motes * 0.8) * flux;
    emission += vec3(0.15, 0.64, 1.0) * aura;
    alpha = max(alpha, aura * 0.75);
    return vec4(min(body.rgb + emission, vec3(alpha)), alpha);

}
`;
