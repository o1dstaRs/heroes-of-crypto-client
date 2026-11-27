import CoreImage
import Foundation

@MainActor
enum FairyIdleAppearance {
    private struct Timeline: Decodable {
        let fps: Double
        let cycleMs: Double
        let initial: [[Double]]
        let repeating: [[Double]]
        let hair: [[Double]]
    }

    private final class CachedImage {
        let bitmap: CGImage
        init(_ bitmap: CGImage) { self.bitmap = bitmap }
    }

    private static let timeline: Timeline? = {
        guard let file = Bundle.main.url(forResource: "fairy-idle", withExtension: "json"),
              let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(Timeline.self, from: data)
    }()
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let renderer = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])
    private static let cache: NSCache<NSString, CachedImage> = {
        let result = NSCache<NSString, CachedImage>()
        result.totalCostLimit = 32 * 1024 * 1024
        return result
    }()

    // FairyLabIdleVisuals.ts paints the same registered breathing warp and gesture palette in Pixi.
    // Coordinates use the 768px source frame, with y increasing from the top.
    private static let kernel = CIKernel(source: """
        kernel vec4 fairyIdle(sampler art, vec2 size, vec3 motion, float gesture, vec3 hairGain) {
            vec2 coord = destCoord();
            vec2 p = vec2(coord.x, size.y - coord.y) * 768.0 / size;
            p.x -= motion.x * (1.0 - smoothstep(440.0, 650.0, p.y));
            float lift = 0.45 + 0.55 * smoothstep(110.0, 200.0, p.y);
            p.y -= motion.y * lift * (1.0 - smoothstep(340.0, 620.0, p.y));
            float chest = smoothstep(325.0, 365.0, p.x) * (1.0 - smoothstep(455.0, 495.0, p.x))
                * smoothstep(165.0, 205.0, p.y) * (1.0 - smoothstep(295.0, 360.0, p.y));
            p.x = 406.0 + (p.x - 406.0) / (1.0 + motion.z * chest);
            float head = (1.0 - smoothstep(145.0, 185.0, p.y)) * smoothstep(325.0, 350.0, p.x)
                * (1.0 - smoothstep(480.0, 510.0, p.x));
            p.x = mix(p.x, 455.0 + (p.x - 455.0) / 0.95, head * gesture);
            float boots = smoothstep(560.0, 645.0, p.y) * smoothstep(320.0, 350.0, p.x)
                * (1.0 - smoothstep(500.0, 530.0, p.x));
            p.x = mix(p.x, 420.0 + (p.x - 420.0) / 0.94, boots * gesture);
            vec2 uv = p * size / 768.0;
            vec4 color = sample(art, samplerTransform(art, vec2(uv.x, size.y - uv.y)));
            vec3 graded = vec3(dot(color.rgb, vec3(0.7241, 0.0865, 0.2278)),
                dot(color.rgb, vec3(-0.0489, 0.8999, 0.1832)), dot(color.rgb, vec3(-0.0925, 0.0278, 1.0881)));
            graded *= mix(vec3(1.0), hairGain, 1.0 - smoothstep(100.0, 120.0, p.y));
            graded *= mix(vec3(1.0), vec3(0.88, 1.0, 1.1), boots);
            vec3 surface = max(graded / max(color.a, 0.0001), vec3(0.0001));
            float rg = surface.r / surface.g;
            float gb = surface.g / surface.b;
            float olive = smoothstep(1.55, 1.85, gb) * (1.0 - smoothstep(1.65, 1.85, rg))
                * smoothstep(145.0, 185.0, p.y);
            float skin = smoothstep(1.10, 1.20, rg) * smoothstep(1.07, 1.13, gb)
                * (1.0 - smoothstep(1.45, 1.70, gb)) * smoothstep(0.25, 0.45, surface.r);
            float pink = smoothstep(1.10, 1.25, rg) * (1.0 - smoothstep(1.04, 1.12, gb))
                * smoothstep(145.0, 185.0, p.y);
            graded *= mix(vec3(1.0), vec3(1.0, 1.04, 1.22), olive);
            graded *= mix(vec3(1.0), vec3(1.04, 1.025, 1.05), skin);
            graded *= mix(vec3(1.0), vec3(1.0 - 0.018 * smoothstep(0.65, 0.85, surface.r), 1.025, 1.025), pink);
            return vec4(mix(color.rgb, clamp(graded, vec3(0.0), vec3(color.a)), gesture), color.a);
        }
        """)

    static func image(_ source: CGImage, frame: Int, elapsed: TimeInterval) -> CGImage {
        guard let timeline, let kernel, timeline.cycleMs > 0, timeline.hair.indices.contains(frame) else { return source }
        let milliseconds = max(0, elapsed) * 1000
        let initial = milliseconds < timeline.cycleMs
        let sample = Int(milliseconds.truncatingRemainder(dividingBy: timeline.cycleMs) * timeline.fps / 1000)
        let timelineSamples = initial ? timeline.initial : timeline.repeating
        guard timelineSamples.indices.contains(sample) else { return source }
        let motion = timelineSamples[sample]
        if frame == 0 && motion.allSatisfy({ $0 == 0 }) { return source }
        let key = "\(frame):\(frame > 0 ? 0 : sample):\(frame == 0 && initial)" as NSString
        if let image = cache.object(forKey: key) { return image.bitmap }

        let scale = min(1, 384 / CGFloat(max(source.width, source.height)))
        let scaled = CIImage(cgImage: source).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rect = scaled.extent.integral
        let hair = timeline.hair[frame]
        let uniforms: [Any] = [
            scaled, CIVector(x: rect.width, y: rect.height),
            CIVector(x: motion[0], y: motion[1], z: motion[2]),
            frame > 0 ? 1.0 : 0.0,
            CIVector(x: hair[0], y: hair[1], z: hair[2]),
        ]
        guard let filtered = kernel.apply(extent: rect, roiCallback: { _, _ in rect }, arguments: uniforms),
              let image = renderer.createCGImage(filtered, from: rect, format: .RGBA8, colorSpace: colorSpace) else { return source }
        cache.setObject(CachedImage(image), forKey: key, cost: image.bytesPerRow * image.height)
        return image
    }
}
