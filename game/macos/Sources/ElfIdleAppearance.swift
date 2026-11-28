import CoreImage

@MainActor
enum ElfIdleAppearance {
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let renderer = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

    // Port of ElfIdleCape.ts. The 768px body coordinates keep the bow and planted boots out of the wind.
    private static let kernel = CIWarpKernel(source: """
        kernel vec2 elfCape(vec2 size, float time, float strength) {
            vec2 coord = destCoord();
            vec2 p = vec2(coord.x, size.y - coord.y) * 768.0 / size;
            float cloth = (1.0 - smoothstep(294.0, 320.0, p.x)) * (1.0 - smoothstep(681.0, 701.0, p.y));
            float bowGuard = smoothstep(270.0, 291.0, p.x) * (1.0 - smoothstep(451.0, 477.0, p.y));
            float along = clamp((p.y - 245.0) / 440.0, 0.0, 1.0);
            float wind = cloth * (1.0 - bowGuard) * pow(along, 4.0) * strength;
            float phase = 7.22566310326 * along - 2.6 * time;
            vec2 source = (p - wind * vec2(18.0 * sin(phase), 4.0 * cos(phase))) * size / 768.0;
            return clamp(vec2(source.x, size.y - source.y), vec2(0.5), size - 0.5);
        }
        """)

    static func image(_ source: CGImage, time: TimeInterval, idleAge: TimeInterval) -> CGImage {
        guard let kernel, idleAge > 0 else { return source }
        let ramp = min(1, idleAge / 0.45)
        let phase = time.truncatingRemainder(dividingBy: 2 * .pi / 2.6)
        let scale = min(1, 384 / CGFloat(max(source.width, source.height)))
        let pose = CIImage(cgImage: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rect = pose.extent
        let arguments: [Any] = [CIVector(x: rect.width, y: rect.height), phase, ramp * ramp * (3 - 2 * ramp)]
        guard let effect = kernel.apply(extent: rect, roiCallback: { _, _ in rect }, image: pose,
                                        arguments: arguments) else { return source }
        return renderer.createCGImage(effect, from: rect, format: .RGBA8, colorSpace: colorSpace) ?? source
    }
}
