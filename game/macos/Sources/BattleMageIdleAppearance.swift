import CoreImage

@MainActor
enum BattleMageIdleAppearance {
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let renderer = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

    // Replay the browser's BattleMageLabIdleVisuals on the same 768px standing art.
    private static let kernel = CIKernel(source: """
        float mageGlow(vec2 point, vec2 size) {
            vec2 q = point / size;
            return exp(-dot(q, q));
        }
        float mageGlint(vec2 p, vec2 center, float phase, float time) {
            vec2 d = p - center;
            float pulse = pow(max(0.0, sin(time * 1.8 + phase)), 12.0);
            return pulse * (mageGlow(d, vec2(1.25, 10.0)) + mageGlow(d, vec2(8.0, 1.25))
                + 0.3 * mageGlow(d, vec2(5.0)));
        }
        float mageFlame(vec2 p, float x, float height, float phase, float time) {
            float h = (253.0 - p.y) / height;
            float wave = sin(h * 9.0 - time * 4.0 + phase) + 0.4 * sin(h * 17.0 - time * 6.0 + phase);
            float center = x + wave * (5.0 + 13.0 * h);
            float width = mix(11.0, 0.8, clamp(h, 0.0, 1.0))
                * (1.0 + 0.24 * sin(h * 12.0 - time * 5.2 + phase));
            float distance = (p.x - center) / width;
            return exp(-distance * distance) * smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.78, 1.0, h));
        }
        kernel vec4 battleMageIdle(sampler art, vec2 size, vec2 sway, float time, float fireTime) {
            vec2 coordinate = destCoord();
            vec2 p = vec2(coordinate.x, size.y - coordinate.y) * 768.0 / size;
            p -= sway * (1.0 - smoothstep(350.0, 650.0, p.y));
            vec2 source = p;
            // The cape moves behind the shoulders. The lower coat and boots keep their registration.
            float cloth = (1.0 - smoothstep(295.0, 330.0, p.x)) * (1.0 - smoothstep(658.0, 679.0, p.y));
            float along = clamp((p.y - 255.0) / 420.0, 0.0, 1.0);
            float windPhase = 6.2831853 * 1.15 * along - 2.6 * time;
            float wind = cloth * pow(along, 4.0) * smoothstep(0.0, 0.45, time);
            source -= wind * vec2(13.0 * sin(windPhase), 4.0 * cos(windPhase));

            float flameRegion = (1.0 - smoothstep(255.0, 276.0, p.y))
                * smoothstep(165.0, 182.0, p.x) * (1.0 - smoothstep(266.0, 287.0, p.x));
            float flameTip = 1.0 - smoothstep(170.0, 258.0, p.y);
            source.x += flameRegion * flameTip * (10.0 * sin(p.y * 0.085 + fireTime * 4.4)
                + 5.0 * sin(p.y * 0.14 - fireTime * 5.6));
            source.y += flameRegion * flameTip * 7.0 * sin(p.x * 0.09 + fireTime * 3.3);
            vec2 uv = source * size / 768.0;
            vec4 body = sample(art, samplerTransform(art, vec2(uv.x, size.y - uv.y)));

            vec2 orb = p - vec2(228.0, 246.0);
            float pulse = 0.85 + 0.12 * sin(fireTime * 3.1) + 0.06 * sin(fireTime * 8.7);
            float halo = mageGlow(orb, vec2(55.0, 57.0) * 1.15) * 0.48 * pulse;
            float core = mageGlow(orb, vec2(12.0)) * 1.10 * pulse;
            float fire = mageFlame(p, 207.0, 112.0 + 22.0 * sin(fireTime * 2.4), 0.0, fireTime)
                + mageFlame(p, 238.0, 134.0 + 25.0 * sin(fireTime * 2.1), 2.0, fireTime)
                + mageFlame(p, 253.0, 86.0 + 18.0 * sin(fireTime * 2.7), 4.0, fireTime)
                + 0.60 * mageFlame(p, 223.0, 100.0 + 24.0 * sin(fireTime * 2.9), 1.2, fireTime);
            float angle = atan(orb.y, orb.x + 0.0001);
            float ringDistance = (length(orb) - 29.0) / 2.8;
            float orbit = exp(-ringDistance * ringDistance)
                * pow(0.5 + 0.5 * sin(angle * 3.0 + fireTime * 3.4), 5.0);
            float sparks = 0.0;
            for (int i = 0; i < 8; i++) {
                float seed = float(i);
                float life = fract(fireTime * (0.27 + seed * 0.016) + seed * 0.173);
                vec2 center = vec2(228.0 + sin(seed * 8.4 + life * 3.0) * (19.0 + life * 12.0), 235.0 - life * 113.0);
                float fade = sin(life * 3.14159265);
                sparks += mageGlow(p - center, vec2(2.2, 4.2)) * fade * fade;
            }
            float jewels = mageGlint(p, vec2(429.0, 200.0), 0.0, time)
                + mageGlint(p, vec2(440.0, 341.0), 2.3, time)
                + mageGlint(p, vec2(433.0, 67.0), 4.0, time);
            float metal = mageGlint(p, vec2(381.0, 184.0), 1.1, time)
                + mageGlint(p, vec2(586.0, 239.0), 3.3, time);
            vec3 emission = vec3(0.52, 0.10, 1.0) * (halo + fire * 0.85)
                + vec3(0.95, 0.64, 1.0) * (core + sparks + orbit * 0.65)
                + (vec3(0.85, 0.55, 1.0) * jewels + vec3(1.0, 0.82, 0.55) * metal) * body.a;
            float glowAlpha = clamp(max(max(emission.r, emission.g), emission.b), 0.0, 1.0);
            float alpha = body.a + glowAlpha * (1.0 - body.a);
            return vec4(min(body.rgb + emission, vec3(alpha)), alpha);
        }
        """)

    static func image(_ source: CGImage, elapsed: TimeInterval) -> CGImage {
        guard let kernel else { return source }
        let time = (elapsed.isFinite ? max(0, elapsed) : 0) * 1.25
        let ramp = min(1, time / 0.45)
        let fade = ramp * ramp * (3 - 2 * ramp)
        let phase = time / 4.8 * 2 * .pi
        let sway = CIVector(x: 5 * sin(phase) * fade, y: 1.6 * sin(2 * phase) * fade)
        let scale = min(1, 288 / CGFloat(max(source.width, source.height)))
        let pose = CIImage(cgImage: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rect = pose.extent.integral
        let arguments: [Any] = [pose, CIVector(x: rect.width, y: rect.height), sway, time, time * 2.6]
        guard let effect = kernel.apply(extent: rect, roiCallback: { _, _ in rect }, arguments: arguments) else { return source }
        return renderer.createCGImage(effect, from: rect, format: .RGBA8, colorSpace: colorSpace) ?? source
    }
}
