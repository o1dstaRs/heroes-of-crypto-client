import CoreImage
import SwiftUI

/// Samples the composed battlefield colour before we paint damage numbers or controls over it.
@MainActor
enum BattlefieldOptics {
    struct Field {
        enum Medium { case heat, water }

        let medium: Medium
        let center: CGPoint
        let radii: CGSize
        let strength: CGFloat
        let time: TimeInterval
        var burst: TimeInterval = -1
        var bodyID: Int? = nil

        var bounds: CGRect {
            CGRect(x: center.x - radii.width * 1.06, y: center.y - radii.height * 1.06,
                   width: radii.width * 2.12, height: radii.height * 2.12)
        }
    }

    struct BodyMask {
        let image: CGImage
        let bounds: CGRect
        let mirrored: Bool

        func texture(viewport: CGSize, scale: CGFloat) -> CIImage {
            let pixels = BattlefieldOptics.pixelBounds(bounds, viewport: viewport, scale: scale)
            return CIImage(cgImage: image).transformed(by: CGAffineTransform(
                a: (mirrored ? -1 : 1) * pixels.width / CGFloat(image.width), b: 0, c: 0,
                d: pixels.height / CGFloat(image.height), tx: mirrored ? pixels.maxX : pixels.minX, ty: pixels.minY
            ))
        }
    }

    private static let inputsPerPass = 8
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private static let context = CIContext(options: [.cacheIntermediates: false,
                                                     .workingColorSpace: colorSpace,
                                                     .outputColorSpace: colorSpace])

    static func heatSources(_ values: [Float]) -> [Field] {
        stride(from: 0, to: values.count, by: 6).compactMap { offset in
            guard offset + 5 < values.count, values[offset..<(offset + 6)].allSatisfy(\.isFinite),
                  values[offset + 2] > 0, values[offset + 3] > 0, values[offset + 4] > 0 else { return nil }
            return Field(medium: .heat, center: CGPoint(x: CGFloat(values[offset]), y: CGFloat(values[offset + 1])),
                         radii: CGSize(width: CGFloat(values[offset + 2]), height: CGFloat(values[offset + 3])),
                         strength: CGFloat(values[offset + 4]), time: Double(values[offset + 5]))
        }
    }

    @ViewBuilder
    static func compose<Scene: View>(_ scene: Scene, size: CGSize, scale: CGFloat, fields: [Field],
                                     bodyMasks: () -> [Int: BodyMask]) -> some View {
        if size.width > 0, size.height > 0, !fields.isEmpty {
            let renderer = ImageRenderer(content: scene.frame(width: size.width, height: size.height))
            let scale = min(max(scale, 1), 2)
            let _ = renderer.scale = scale
            if let image = renderer.cgImage {
                ZStack(alignment: .topLeading) {
                    Image(decorative: image, scale: scale)
                    if let patch = refract(image, viewport: size, scale: scale, fields: fields, bodyMasks: bodyMasks()) {
                        Image(decorative: patch.image, scale: scale)
                            .position(x: patch.bounds.midX, y: patch.bounds.midY)
                    }
                }
            } else {
                scene
            }
        } else {
            scene
        }
    }

    static func refract(_ image: CGImage, viewport: CGSize, scale: CGFloat, fields: [Field],
                        bodyMasks: [Int: BodyMask] = [:]) -> (image: CGImage, bounds: CGRect)? {
        let visible = CGRect(origin: .zero, size: viewport)
        let sources = fields.filter { $0.bounds.intersects(visible) }
        guard let first = sources.first else { return nil }
        let base = CIImage(cgImage: image)
        let bounds = sources.dropFirst().reduce(first.bounds) { $0.union($1.bounds) }.intersection(visible)
        let rectangle = pixelBounds(bounds, viewport: viewport, scale: scale).integral.intersection(base.extent)
        guard !rectangle.isEmpty else { return nil }

        var scene = base.clampedToExtent()
        for field in sources where field.medium == .water {
            let body = field.bodyID.flatMap { bodyMasks[$0] }?.texture(viewport: viewport, scale: scale)
            let bounds = body?.extent ?? .zero
            let transparent = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0))
                .cropped(to: base.extent)
            let arguments: [Any] = [
                scene, body ?? transparent, region(field, viewport: viewport, scale: scale),
                CIVector(x: bounds.minX, y: bounds.minY, z: bounds.maxX, w: bounds.maxY),
                CIVector(x: field.strength, y: field.time, z: field.burst, w: scale),
            ]
            let padding = ceil(4 * scale) + 1
            guard let next = waterKernel?.apply(extent: base.extent, roiCallback: { _, area in
                area.insetBy(dx: -padding, dy: -padding)
            }, arguments: arguments) else { return nil }
            scene = next.clampedToExtent()
        }

        let heat = sources.filter { $0.medium == .heat }
        for start in stride(from: 0, to: heat.count, by: inputsPerPass) {
            let batch = heat[start..<min(start + inputsPerPass, heat.count)]
            var arguments: [Any] = []
            for source in batch {
                arguments.append(region(source, viewport: viewport, scale: scale))
                arguments.append(CIVector(x: source.strength, y: source.time))
            }
            for _ in batch.count..<inputsPerPass {
                arguments.append(CIVector(x: 0, y: 0, z: 0, w: 0))
                arguments.append(CIVector(x: 0, y: 0))
            }
            let padding = ceil(batch.reduce(1) { offset, field in
                offset + field.strength * min(field.radii.width, field.radii.height) * 0.017
            } * scale)
            guard let next = heatKernel?.apply(extent: base.extent, roiCallback: { _, area in
                area.insetBy(dx: -padding, dy: -padding)
            }, image: scene, arguments: arguments) else { return nil }
            scene = next.clampedToExtent()
        }
        guard let patch = context.createCGImage(scene, from: rectangle) else { return nil }
        let screenBounds = CGRect(x: rectangle.minX / scale, y: viewport.height - rectangle.maxY / scale,
                                  width: rectangle.width / scale, height: rectangle.height / scale)
        return (patch, screenBounds)
    }

    private nonisolated static func pixelBounds(_ bounds: CGRect, viewport: CGSize, scale: CGFloat) -> CGRect {
        CGRect(x: bounds.minX * scale, y: (viewport.height - bounds.maxY) * scale,
               width: bounds.width * scale, height: bounds.height * scale)
    }

    private static func region(_ field: Field, viewport: CGSize, scale: CGFloat) -> CIVector {
        CIVector(x: field.center.x * scale, y: (viewport.height - field.center.y) * scale,
                 z: field.radii.width * scale, w: field.radii.height * scale)
    }

    private static let heatKernel: CIWarpKernel? = {
        let arguments = (0..<inputsPerPass).map { "vec4 region\($0), vec2 energy\($0)" }.joined(separator: ", ")
        let calls = (0..<inputsPerPass).map { "warp += displacement(p, region\($0), energy\($0));" }.joined(separator: "\n")
        return CIWarpKernel(source: """
            float heatNoise(vec2 p) {
                return sin(p.x*1.17+sin(p.y*1.63))*.55+sin(p.y*2.31-p.x*.72)*.3+sin(p.x*4.11+p.y*3.19)*.15;
            }
            vec2 displacement(vec2 p, vec4 region, vec2 energy) {
                if(energy.x<=0. || region.z<=0. || region.w<=0.) return vec2(0.);
                vec2 q = (p-region.xy)/region.zw;
                float radius = length(q);
                if(radius>=1.) return vec2(0.);
                vec2 flow = q*vec2(13.,19.)-vec2(energy.y*.7,energy.y*9.);
                float mask = 1.-smoothstep(.2,1.,radius);
                return vec2(heatNoise(flow),heatNoise(flow*2.07+energy.y*3.)*.38)*
                       mask*energy.x*min(region.z,region.w)*.016;
            }
            kernel vec2 heat(\(arguments)) {
                vec2 p = destCoord();
                vec2 warp = vec2(0.);
                \(calls)
                return p+warp;
            }
            """)
    }()

    private static let waterKernel = CIKernel(source: """
        vec3 waterWave(vec2 p, float time) {
            vec4 angle = vec4(dot(p,vec2(4.3,3.1)),dot(p,vec2(-3.4,5.2)),
                              dot(p,vec2(10.2,-7.6)),dot(p,vec2(15.3,12.1)))+time*vec4(-1.14,.89,-1.72,2.05);
            vec4 amplitude = vec4(.017,.012,.004,.003);
            vec4 slope = cos(angle)*amplitude;
            return vec3(dot(sin(angle),amplitude),dot(slope,vec4(4.3,-3.4,10.2,15.3)),
                        dot(slope,vec4(3.1,5.2,-7.6,12.1)));
        }
        float bodyAlpha(sampler body, vec4 bounds, vec2 p) {
            vec2 inside = step(bounds.xy,p)*step(p,bounds.zw);
            return sample(body,samplerTransform(body,p)).a*inside.x*inside.y;
        }
        kernel vec4 water(sampler scene, sampler body, vec4 region, vec4 bounds, vec4 state) {
            vec2 p = destCoord();
            vec4 unchanged = sample(scene,samplerTransform(scene,p));
            vec2 q = (p-region.xy)/region.zw;
            q.y = -q.y;
            float radius = length(q);
            if (radius>1.06 || state.z>=.40) return unchanged;
            vec3 wave = waterWave(q,state.y);
            float surface = radius-wave.x;
            vec2 x = q+vec2(1./region.z,0.);
            vec2 y = q+vec2(0.,1./region.w);
            float aa = max(abs(length(x)-waterWave(x,state.y).x-surface)+abs(length(y)-waterWave(y,state.y).x-surface),.002);
            float mask = (1.-smoothstep(1.-aa,1.+aa,surface))*state.x;
            if (state.z>=0.) {
                vec2 tear = q-vec2(.30,-.28);
                float angle = atan(tear.y,tear.x);
                float edge = length(tear)-max(0.,state.z-.025)*7.4+
                             sin(angle*3.+state.z*12.)*.035+sin(angle*5.-state.z*9.)*.018;
                mask *= smoothstep(-.025,.025,edge)*(1.-smoothstep(.20,.40,state.z));
            }
            vec2 bend = (-q*.10+wave.yz*.32)*
                        sqrt(max(0.,1.-min(surface*surface,1.)))*(1.-smoothstep(.80,1.,surface));
            vec2 offset = bend*vec2(region.z,-region.w);
            offset *= min(1.,4.*state.w/max(.001,length(offset)))*state.x;
            // Guard the destination and the entire short ray, including thin limbs or a trident.
            float silhouette = max(bodyAlpha(body,bounds,p),max(bodyAlpha(body,bounds,p+offset*.5),bodyAlpha(body,bounds,p+offset)));
            offset *= mix(1.,.12,smoothstep(.015,.55,silhouette));
            float displaced = length(q+bend)-waterWave(q+bend,state.y).x;
            offset *= 1.-smoothstep(.97,1.,displaced);
            return mix(unchanged,sample(scene,samplerTransform(scene,p+offset)),mask);
        }
        """)
}
