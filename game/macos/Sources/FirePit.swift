import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

struct FirePit: View {
    let projection: BattlefieldProjection
    let boardSize: Int
    let flowing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var displayScale
    @State private var registration: [CGFloat] = []

    nonisolated private static let under = "fire_pit_grok_video_fire_under_v2_64_atlas"
    private static let offsets = Task.detached(priority: .utility) {
        guard let url = Bundle.main.url(forResource: under, withExtension: "webp", subdirectory: "Atlases") else { return [CGFloat]() }
        return FirePitRegistration.load(from: url)
    }

    var body: some View {
        let center = CGFloat(boardSize) / 2
        let stone = projection.quad(centerX: center, centerY: center, width: 4, height: 4)
        let spill = projection.quad(centerX: center + (544.0 / 2 - 268) * 4 / 340,
                                    centerY: center - (560.0 / 2 - 272) * 4 / 270,
                                    width: 4 * 544 / 340, height: 4 * 560 / 270)
        TimelineView(.animation(minimumInterval: 1 / 16, paused: reduceMotion || !flowing)) { timeline in
            let _ = reduceMotion ? BattlefieldAtlas.availability.revision : 0
            let frame = reduceMotion ? 0 : Self.frameIndex(timeline.date.timeIntervalSinceReferenceDate)
            let correction = registration.indices.contains(frame) ? registration[frame] : 0
            let xOffset = projection.point(x: center + correction, y: center).x - projection.point(x: center, y: center).x
            Canvas { context, _ in
                if let pit = rendered(frame: frame, stone: stone, spill: spill, flameOffset: xOffset) {
                    context.draw(Image(decorative: pit.image, scale: 1), in: pit.bounds)
                } else {
                    context.fill(Path(stone.outline), with: .color(BattlePalette.color(0x4d1a10)))
                }
            }
        }
        .task(id: flowing) { if flowing { registration = await Self.offsets.value } }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }

    static func frameIndex(_ time: TimeInterval) -> Int {
        max(0, Int(time * 16)) % 64
    }

    private static let renderer = CIContext(options: [.cacheIntermediates: false])

    private func rendered(frame: Int, stone: BattlefieldProjection.Quad, spill: BattlefieldProjection.Quad,
                          flameOffset: CGFloat) -> (image: CGImage, bounds: CGRect)? {
        let bowl = flowing ? "fire_pit_dark_bowl_v1_512" : "fire_pit_extinguished_deep_background_v16_512"
        let grate = flowing ? "fire_pit_grate_burning_exact_v17_512" : "fire_pit_grate_burning_charred_v18_512"
        guard let base = BattleResources.cgImage(bowl) else { return nil }
        let padding = projection.screenCellWidth * FirePitRegistration.maximumOffset
        let bounds = (flowing ? stone.bounds.union(spill.bounds).insetBy(dx: -padding, dy: 0) : stone.bounds).integral
        let drawScale = min(2, displayScale)
        let extent = CGRect(origin: .zero, size: CGSize(width: bounds.width * drawScale, height: bounds.height * drawScale))

        func point(_ p: CGPoint) -> CGPoint {
            CGPoint(x: (p.x - bounds.minX) * drawScale, y: (bounds.maxY - p.y) * drawScale)
        }

        func project(_ image: CGImage, onto quad: BattlefieldProjection.Quad) -> CIImage {
            let filter = CIFilter.perspectiveTransform()
            filter.inputImage = CIImage(cgImage: image)
            filter.topLeft = point(quad.topLeft)
            filter.topRight = point(quad.topRight)
            filter.bottomRight = point(quad.bottomRight)
            filter.bottomLeft = point(quad.bottomLeft)
            return filter.outputImage ?? .empty()
        }

        func flame(_ resource: String, onto quad: BattlefieldProjection.Quad) -> CIImage? {
            BattlefieldAtlas.frame(resource + ".webp", columns: 8, rows: 8, index: frame, maxDimension: 2048,
                                   inBackground: true)
                .map { project($0, onto: quad).transformed(by: CGAffineTransform(translationX: flameOffset * drawScale, y: 0)) }
        }

        var scene = project(base, onto: stone)
        if flowing, let below = flame(Self.under, onto: stone) {
            scene = below.composited(over: scene)
        }
        if let grateImage = BattleResources.cgImage(grate) {
            scene = project(grateImage, onto: stone).composited(over: scene)
        }
        if flowing {
            for above in [flame("fire_pit_grok_video_fire_over_v2_64_atlas", onto: stone),
                          flame("fire_pit_grok_video_fire_actual_extent_v4_64_atlas", onto: spill)].compactMap({ $0 }) {
                scene = above.composited(over: scene)
            }
        }
        return Self.renderer.createCGImage(scene, from: extent).map { ($0, bounds) }
    }
}
