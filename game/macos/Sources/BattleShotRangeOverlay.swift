import SwiftUI

struct BattleShotRangeOverlay: View {
    let ranges: [BattleShotRange]
    let projection: BattlefieldProjection

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appearsActive) private var appearsActive

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !appearsActive)) { timeline in
            let phase = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.5) / 2.5
            let pulse = reduceMotion ? 0 : sin(phase * 2 * .pi)
            Canvas { context, _ in
                for range in ranges { draw(range, pulse: pulse, in: context) }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(_ range: BattleShotRange, pulse: Double, in context: GraphicsContext) {
        let bounds = range.bounds
        let quad = projection.quad(centerX: bounds.midX, centerY: bounds.midY, width: bounds.width, height: bounds.height)
        let style: (color: UInt32, asset: String) = switch range.tone {
        case .neutral: (0xaeb9bd, "shot_range_corner_aaa_v1")
        case .friendly: (0x35df72, "shot_range_corner_aaa_v4_green")
        case .enemy: (0xff6260, "shot_range_corner_aaa_v4_red")
        }
        let color = BattlePalette.color(style.color)
        let corners = [quad.bottomLeft, quad.bottomRight, quad.topRight, quad.topLeft]
        for index in corners.indices {
            drawRail(from: corners[index], to: corners[(index + 1) % corners.count], color: color, in: context)
        }
        guard let bitmap = BattleResources.cgImage(style.asset) else { return }
        let image = context.resolve(Image(decorative: bitmap, scale: 1))
        let size = projection.spriteCellSize * (0.37536 * 1.15) * (1 + 0.08 * pulse)
        // The texture's horizontal and vertical rails meet at this measured anchor.
        let art = CGRect(x: -size * 0.137, y: -size * 0.891, width: size, height: size)
        let neighbors = [
            (origin: quad.bottomLeft, horizontal: quad.bottomRight, vertical: quad.topLeft),
            (origin: quad.bottomRight, horizontal: quad.bottomLeft, vertical: quad.topRight),
            (origin: quad.topRight, horizontal: quad.topLeft, vertical: quad.bottomRight),
            (origin: quad.topLeft, horizontal: quad.topRight, vertical: quad.bottomLeft),
        ]
        for (origin, horizontal, vertical) in neighbors {
            let across = direction(from: origin, to: horizontal)
            let inward = direction(from: origin, to: vertical)
            var corner = context
            // The artwork points inward along negative texture Y.
            corner.concatenate(CGAffineTransform(a: across.dx, b: across.dy, c: -inward.dx, d: -inward.dy,
                                                 tx: origin.x, ty: origin.y))
            corner.opacity *= 0.8
            corner.draw(image, in: art)

            var glow = corner
            glow.opacity *= 0.55 + 0.45 * pulse
            glow.blendMode = .plusLighter
            glow.addFilter(.blur(radius: 3))
            glow.draw(image, in: art)
        }
    }

    private func drawRail(from start: CGPoint, to end: CGPoint, color: Color, in context: GraphicsContext) {
        let dx = end.x - start.x, dy = end.y - start.y
        let halfWidth: CGFloat = 1.2
        var rail = context
        rail.translateBy(x: start.x, y: start.y)
        rail.rotate(by: .radians(atan2(dy, dx)))
        let rect = CGRect(x: 0, y: -halfWidth, width: hypot(dx, dy), height: 2 * halfWidth)
        let feather = Gradient(colors: [color.opacity(0), color.opacity(0.375), color.opacity(0.75),
                                        color.opacity(0.375), color.opacity(0)])
        rail.fill(Path(rect), with: .linearGradient(feather, startPoint: CGPoint(x: 0, y: -halfWidth),
                                                    endPoint: CGPoint(x: 0, y: halfWidth)))
    }

    private func direction(from start: CGPoint, to end: CGPoint) -> CGVector {
        let dx = end.x - start.x, dy = end.y - start.y
        let length = max(0.001, hypot(dx, dy))
        return CGVector(dx: dx / length, dy: dy / length)
    }
}
