import CoreImage

@MainActor
enum NightmareIdleAppearance {
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let renderer = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

    // The browser animates the mane and tail on the registered 768px rest pose. Keep the body and hooves fixed.
    private static let kernel = CIKernel(source: """
        vec2 windWeights(vec2 p) {
            float tailEdge = 244.0 - max(0.0, p.y - 430.0) * 0.28;
            float tail = (1.0 - smoothstep(tailEdge - 22.0, tailEdge, p.x)) * smoothstep(414.0, 444.0, p.y);
            float maneEdge = 465.0 + (410.0 - p.y);
            float mane = (1.0 - smoothstep(maneEdge - 28.0, maneEdge, p.x))
                * (1.0 - smoothstep(389.0, 412.0, p.y)) * smoothstep(200.0, 225.0, p.y);
            return vec2(tail, mane);
        }
        vec2 windOffset(vec2 p, float time) {
            vec2 u = clamp(vec2((p.y - 424.0) / 256.0, (640.0 - p.x) / 310.0), 0.0, 1.0);
            vec2 wave = windWeights(p) * u * u * sin(7.22566310326 * u - 2.6 * time);
            return vec2(24.0 * wave.x + 10.0 * wave.y, 7.0 * wave.x + 15.0 * wave.y);
        }
        float flameNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            vec2 axis = vec2(127.1, 311.7);
            vec4 h = fract(sin(vec4(dot(i, axis), dot(i + vec2(1.0, 0.0), axis),
                dot(i + vec2(0.0, 1.0), axis), dot(i + vec2(1.0, 1.0), axis))) * 43758.5453);
            return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
        }
        vec4 poseSample(sampler art, vec2 size, vec2 p) {
            if (p.x < 0.0 || p.y < 0.0 || p.x >= 768.0 || p.y >= 768.0) return vec4(0.0);
            vec2 uv = p * size / 768.0;
            return sample(art, samplerTransform(art, vec2(uv.x, size.y - uv.y)));
        }
        float pigment(vec4 color) {
            vec3 rgb = color.rgb / max(color.a, 0.001);
            return smoothstep(0.07, 0.24, rgb.r - max(rgb.g, rgb.b)) * color.a;
        }
        kernel vec4 nightmareIdle(sampler art, vec2 size, float time) {
            vec2 coord = destCoord();
            vec2 dest = vec2(coord.x, size.y - coord.y) * 768.0 / size;
            vec2 p = dest;
            for (int i = 0; i < 6; i++) p = dest - windOffset(p, time);
            vec2 weights = windWeights(p);
            vec2 flow = vec2(p.x * 0.065, (p.y + time * 68.0) * 0.037);
            float curl = flameNoise(flow) * 0.65 + flameNoise(flow * 2.03 + vec2(4.1, time * 0.7)) * 0.35;
            vec2 flame = p + max(weights.x, weights.y) * vec2((curl - 0.5) * 6.0, sin(p.x * 0.07 + time * 4.3) * 2.0);
            vec4 body = poseSample(art, size, flame);
            float mane = (1.0 - smoothstep(900.0 - p.y, 928.0 - p.y, p.x))
                * (1.0 - smoothstep(399.0, 416.0, p.y)) * smoothstep(195.0, 220.0, p.y);
            float edge = max(0.0, p.y - 430.0) * 0.44;
            float tail = (1.0 - smoothstep(251.0 - edge, 274.0 - edge, p.x)) * smoothstep(388.0, 416.0, p.y);
            float legs = smoothstep(523.0, 557.0, p.y) * (1.0 - smoothstep(704.0, 726.0, p.y))
                * smoothstep(166.0, 190.0, p.x) * (1.0 - smoothstep(600.0, 623.0, p.x));
            float mask = max(max(mane, tail), legs);
            float pulse = smoothstep(0.18, 0.8, curl);
            float heat = clamp(pulse * 0.65 + body.r / max(body.a, 0.001) * 0.55, 0.0, 1.0);
            vec3 core = mix(vec3(1.0, 0.19, 0.008), vec3(1.0, 0.91, 0.42), heat * heat);
            vec3 color = mix(body.rgb, core * body.a, mask * pigment(body) / max(body.a, 0.001) * 0.96);
            vec4 rise = poseSample(art, size, flame + vec2((curl - 0.5) * 15.0, 8.0 + pulse * 24.0));
            float licks = mask * pigment(rise) * (0.45 + pulse * 0.5);
            float glow = mask * (pigment(poseSample(art, size, p + vec2(9.0, 7.0)))
                + pigment(poseSample(art, size, p + vec2(-9.0, 7.0)))
                + pigment(poseSample(art, size, p + vec2(0.0, 15.0)))) * 0.13;
            float added = clamp(licks + glow, 0.0, 1.0) * (1.0 - body.a);
            float alpha = min(body.a + added, 1.0);
            vec3 emission = mix(vec3(1.0, 0.16, 0.006), vec3(1.0, 0.65, 0.075), pulse) * added;
            return vec4(min(color + emission, vec3(alpha)), alpha);
        }
        """)

    static func image(_ source: CGImage, elapsed: TimeInterval) -> CGImage {
        guard let kernel else { return source }
        let scale = min(1, 288 / CGFloat(max(source.width, source.height)))
        let pose = CIImage(cgImage: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rect = pose.extent.integral
        let arguments: [Any] = [pose, CIVector(x: rect.width, y: rect.height), elapsed]
        guard let effect = kernel.apply(extent: rect, roiCallback: { _, _ in rect }, arguments: arguments) else { return source }
        return renderer.createCGImage(effect, from: rect, format: .RGBA8, colorSpace: colorSpace) ?? source
    }
}
