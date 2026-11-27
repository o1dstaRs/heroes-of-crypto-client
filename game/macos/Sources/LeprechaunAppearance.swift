import CoreImage
import Foundation

enum LeprechaunAppearance {
    private struct Palette: Decodable, Sendable {
        struct Grade: Decodable, Sendable {
            let grade: [CGFloat]
            let tails: [CGFloat]
        }
        let targetHue: [CGFloat]
        let idle: Grade
        let walk: [Grade]
    }

    private static let palette: Palette? = {
        guard let url = Bundle.main.url(forResource: "leprechaun-cloth", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Palette.self, from: data)
    }()
    private static let space = CGColorSpace(name: CGColorSpace.sRGB)!

    // The cloth grade from LeprechaunLabWalkVisuals.ts. Skin, gold, and transparent pixels keep
    // their original colors. Apply it to the decoded atlas once, before the individual crops.
    private static let kernelSource = """
        kernel vec4 leprechaunCloth(__sample pixel, vec3 grade, vec2 tails, vec3 targetHue) {
            vec3 color = unpremultiply(pixel).rgb;
            float value = max(color.r, max(color.g, color.b));
            float chroma = value - min(color.r, min(color.g, color.b));
            float saturation = chroma / max(value, 0.00001);
            float range = max(chroma, 0.00001);
            float sector = value == color.r ? (color.g - color.b) / range :
                value == color.g ? 2.0 + (color.b - color.r) / range : 4.0 + (color.r - color.g) / range;
            float hue = fract(sector / 6.0) * 360.0;
            float cloth = smoothstep(60.0, 75.0, hue) * (1.0 - smoothstep(175.0, 195.0, hue))
                * smoothstep(0.07, 0.15, saturation);
            float shiftedHue = hue < grade.x
                ? targetHue.y + (hue - grade.x) * (targetHue.y - targetHue.x) / (grade.x - tails.x)
                : targetHue.y + (hue - grade.x) * (targetHue.z - targetHue.y) / (tails.y - grade.x);
            float h = clamp(mix(targetHue.y, shiftedHue, 0.45), 85.0, 180.0) / 360.0;
            vec3 hsv = clamp(abs(fract(vec3(h) + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
            vec3 corrected = min(1.0, value * grade.z) * mix(vec3(1.0), hsv, pow(saturation, grade.y));
            return premultiply(vec4(mix(color, corrected, cloth), pixel.a));
        }
        """

    static func grade(_ source: CGImage, resource: String) -> CGImage {
        guard resource.hasPrefix("leprechaun_lab_"), let palette,
              let kernel = CIColorKernel(source: kernelSource) else { return source }
        let renderer = CIContext(options: [.workingColorSpace: space, .outputColorSpace: space,
                                           .cacheIntermediates: false])
        let atlas = CIImage(cgImage: source)
        let target = CIVector(values: palette.targetHue, count: 3)
        func filter(_ rect: CGRect, _ grade: Palette.Grade) -> CIImage? {
            kernel.apply(extent: rect, arguments: [
                atlas, CIVector(values: grade.grade, count: 3), CIVector(values: grade.tails, count: 2), target,
            ])
        }

        var corrected: CIImage?
        if resource.hasPrefix("leprechaun_lab_walk_atlas"), palette.walk.count == 8 {
            let width = atlas.extent.width / 4
            let height = atlas.extent.height / 2
            for (index, grade) in palette.walk.enumerated() {
                let frame = CGRect(x: CGFloat(index % 4) * width, y: CGFloat(1 - index / 4) * height,
                                   width: width, height: height)
                guard let filtered = filter(frame, grade) else { return source }
                corrected = corrected.map { filtered.composited(over: $0) } ?? filtered
            }
        } else {
            corrected = filter(atlas.extent, palette.idle)
        }
        guard let corrected else { return source }
        return renderer.createCGImage(corrected, from: atlas.extent, format: .RGBA8, colorSpace: space) ?? source
    }
}
