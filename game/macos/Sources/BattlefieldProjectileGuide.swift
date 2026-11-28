import SwiftUI

struct BattlefieldProjectileGuide: View {
    enum Kind {
        case ranged(rowScale: CGFloat)
        case magic(positive: Bool)
    }

    let from: CGPoint
    let to: CGPoint
    let cellSize: CGFloat
    let kind: Kind
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startedAt = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { frame in
            let _ = reduceMotion ? BattlefieldAtlas.availability.revision : 0
            let elapsed = reduceMotion ? 0 : max(0, frame.date.timeIntervalSince(startedAt))
            Canvas { context, _ in
                let dx = to.x - from.x
                let dy = to.y - from.y
                let length = hypot(dx, dy)
                guard length > 1 else { return }
                var guide = context
                guide.translateBy(x: from.x, y: from.y)
                guide.rotate(by: .radians(atan2(dy, dx)))
                let scale = cellSize / 128
                switch kind {
                case let .ranged(rowScale): drawRanged(in: guide, length: length, scale: scale, rowScale: rowScale, elapsed: elapsed)
                case let .magic(positive): drawMagic(in: guide, length: length, scale: scale, positive: positive, elapsed: elapsed)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawRanged(in context: GraphicsContext, length: CGFloat, scale: CGFloat, rowScale: CGFloat, elapsed: TimeInterval) {
        guard let head = BattlefieldAtlas.frame(BattleAimArtwork.arrowhead, columns: 1, rows: 1, index: 0, inBackground: true, combat: true),
              let tail = BattlefieldAtlas.frame(BattleAimArtwork.fletching, columns: 1, rows: 1, index: 0, inBackground: true, combat: true),
              let casing = BattlefieldAtlas.frame(BattleAimArtwork.casing, columns: 1, rows: 1, index: 0, inBackground: true, combat: true) else {
            drawGlow(in: context, length: length, width: 4 * scale, color: BattlePalette.gold)
            return
        }
        let headWidth = min(length * 0.6, 56 * 1.35 * 0.8 * 0.7 * 0.9 * 1.15 * 1.15 * 1.2 * 1.07 * scale * rowScale)
        let tailWidth = min(length * 0.6, 74.24 * 0.8 * 0.7 * 1.1 * 0.85 * 0.85 * 1.2 * 1.15 * scale)
        let socket = length - headWidth * 0.43
        let start = tailWidth * 0.12
        let end = max(start, socket + 16 * scale)
        var shaft = context
        shaft.clip(to: Path(CGRect(x: start, y: -cellSize, width: end - start, height: cellSize * 2)))
        let casingWidth = 22 * 1.25 * 1.15 * 0.87 * 1.03 * scale
        let spacing = 38 * 1.3 * 1.3 * 0.93 * scale
        let phase = (elapsed * 36 * 1.3 * 1.25 * scale).truncatingRemainder(dividingBy: spacing)
        for center in stride(from: phase - spacing, to: end + casingWidth, by: spacing) {
            draw(casing, at: center, width: casingWidth, anchorX: 0.5, anchorY: 26 / 54, in: shaft)
        }
        draw(tail, at: 0, width: tailWidth, anchorX: 0.66, anchorY: 91.5 / 176, in: context)
        draw(head, at: length, width: headWidth, anchorX: 0.66, anchorY: 144.5 / 260, in: context)

        let travel = max(1, socket - start)
        let glints = max(6, Int(travel / (64 * scale)))
        for index in 0..<glints {
            let phase = elapsed * 3.4 + Double(index) * 2.17
            let x = start + (Double(index) * travel / Double(glints) + elapsed * 34 * scale)
                .truncatingRemainder(dividingBy: travel)
            let y = sin(phase * 1.37 + Double(index) * 1.91) * 7 * scale
            let glow = 0.5 + 0.5 * sin(phase * 2.1)
            let radius = max(0.65, (1 + glow) * scale)
            context.fill(Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)),
                         with: .color(BattlePalette.color(0xffffd2).opacity(0.67 + glow * 0.3)))
        }
    }

    private func drawMagic(in context: GraphicsContext, length: CGFloat, scale: CGFloat, positive: Bool, elapsed: TimeInterval) {
        let index = Int(elapsed * 4 * 18) % 16
        guard let frame = BattlefieldAtlas.frame(BattleAimArtwork.helix, columns: 4, rows: 4, index: index,
                                                 inBackground: true, combat: true) else {
            let color = BattlePalette.color(positive ? 0x18e875 : 0xff3b12)
            drawGlow(in: context, length: length, width: 6 * scale, color: color)
            return
        }
        let width = 256 * scale
        let height = 64 * scale
        var beam = context
        beam.clip(to: Path(CGRect(x: 0, y: -height / 2, width: length, height: height)))
        beam.blendMode = .plusLighter
        beam.opacity = 0.88 + 0.12 * sin(elapsed * 4 * 2 * .pi * 1.35)
        for x in stride(from: 0, to: length, by: width) {
            beam.draw(Image(decorative: frame, scale: 1), in: CGRect(x: x, y: -height / 2, width: width, height: height))
        }
    }

    private func draw(_ bitmap: CGImage, at x: CGFloat, width: CGFloat, anchorX: CGFloat, anchorY: CGFloat,
                      in context: GraphicsContext) {
        let height = width * CGFloat(bitmap.height) / CGFloat(bitmap.width)
        context.draw(Image(decorative: bitmap, scale: 1),
                     in: CGRect(x: x - width * anchorX, y: -height * anchorY, width: width, height: height))
    }

    private func drawGlow(in context: GraphicsContext, length: CGFloat, width: CGFloat, color: Color) {
        let path = Path { line in
            line.move(to: .zero)
            line.addLine(to: CGPoint(x: length, y: 0))
        }
        context.stroke(path, with: .color(color.opacity(0.2)), style: StrokeStyle(lineWidth: width * 3, lineCap: .round))
        context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: max(1, width), lineCap: .round))
    }
}
