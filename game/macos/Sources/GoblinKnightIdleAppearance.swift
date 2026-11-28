import CoreImage

@MainActor
enum GoblinKnightIdleAppearance {
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let renderer = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])
    // The browser's cloth and upper-body motion is authored in the 768px canvas.
    private static let kernel = CIWarpKernel(source: """
        vec2 goblinIdleOffset(vec2 p, float time) {
            float phase = time * 6.28318530718 / 4.2;
            float upper = 1.0 - smoothstep(500.0, 710.0, p.y);
            float edge = 270.0 + 38.0 * smoothstep(430.0, 640.0, p.y);
            float cape = (1.0 - smoothstep(edge - 35.0, edge, p.x)) * smoothstep(240.0, 330.0, p.y)
                * (1.0 - smoothstep(650.0, 708.0, p.y));
            float freeEdge = clamp((405.0 - p.x) / 235.0, 0.0, 1.0);
            float wave = sin(p.y * 0.019 - 2.6 * time) + 0.3 * sin(p.y * 0.038 - 3.7 * time);
            return vec2(5.0 * sin(phase) * upper + 15.0 * cape * freeEdge * wave,
                        2.0 * sin(phase * 2.0) * upper + 5.0 * cape * freeEdge * wave);
        }
        kernel vec2 goblinKnightIdle(vec2 size, float time) {
            vec2 coordinate = destCoord();
            vec2 destination = vec2(coordinate.x, size.y - coordinate.y) * 768.0 / size;
            vec2 source = destination;
            for (int i = 0; i < 4; i++) source = destination - goblinIdleOffset(source, time);
            vec2 pixel = source * size / 768.0;
            return vec2(pixel.x, size.y - pixel.y);
        }
        """)

    static func image(_ source: CGImage, frame: Int, elapsed: TimeInterval) -> CGImage {
        // The sword gesture already has painted cels. The cape moves over the standing cel between gestures.
        guard frame == 0, let kernel else { return source }
        let scale = min(1, 288 / CGFloat(max(source.width, source.height)))
        let pose = CIImage(cgImage: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rect = pose.extent.integral
        let padding = ceil(27 * rect.width / 768)
        let arguments: [Any] = [CIVector(x: rect.width, y: rect.height), elapsed]
        guard let effect = kernel.apply(extent: rect, roiCallback: { _, roi in roi.insetBy(dx: -padding, dy: -padding) },
                                        image: pose, arguments: arguments) else { return source }
        return renderer.createCGImage(effect, from: rect, format: .RGBA8, colorSpace: colorSpace) ?? source
    }
}
