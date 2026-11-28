import SwiftUI

@MainActor
enum BattleStackFlag {
    static func height(for cellSize: CGFloat) -> CGFloat { max(9, cellSize * 0.20) }

    static func draw(amount: Int, team: Team, id: Int, active: Bool, status: BattleFlagStatus, time: TimeInterval, animateCloth: Bool,
                     cellSize: CGFloat, pixelWidth: CGFloat, at center: CGPoint, in context: GraphicsContext) {
        let width = max(17, cellSize * 0.42)
        let height = height(for: cellSize)
        let rect = CGRect(x: center.x - width / 2, y: center.y - height / 2, width: width, height: height)
        if status.responded, let art = BattleResources.cgImage("tag") {
            let side = width * 2.25
            context.draw(Image(decorative: art, scale: 1),
                         in: CGRect(x: center.x - side / 2, y: center.y - side * 0.4, width: side, height: side * 0.8))
        }
        let notch = width * 0.14
        let sample = floor(time * 20) / 20
        let phase = Double((id * 173) % 1000) * 2 * .pi / 1000
        let wave = animateCloth && !active
        func offset(_ index: Int) -> CGFloat {
            if !wave { return 0 }
            let u = Double(index) / 12
            return -height * 0.14 * pow(u, 4) * sin(2 * .pi * 1.15 * u - 2.6 * sample + phase)
        }
        let top = (0...12).map { index in
            CGPoint(x: rect.minX + width * CGFloat(index) / 12, y: rect.minY + offset(index) * 0.82)
        }
        let bottom = (0...12).map { index in
            CGPoint(x: rect.minX + width * CGFloat(index) / 12, y: rect.maxY + offset(index))
        }
        let path = Path { path in
            path.move(to: top[0])
            for point in top.dropFirst() { path.addLine(to: point) }
            path.addLine(to: CGPoint(x: rect.maxX - notch, y: (top[12].y + bottom[12].y) / 2))
            for point in bottom.reversed() { path.addLine(to: point) }
            path.closeSubpath()
        }
        let tones = Gradient(colors: [BattlePalette.cloth(team), BattlePalette.clothCenter(team), BattlePalette.cloth(team)])
        context.fill(path, with: .linearGradient(tones, startPoint: CGPoint(x: rect.minX, y: center.y),
                                                endPoint: CGPoint(x: rect.maxX, y: center.y)))
        let inset = max(0.6, height * 0.07)
        let panel = CGRect(x: rect.minX + inset * 2, y: rect.minY + inset * 2,
                           width: width - notch - inset * 3, height: height - inset * 4)
        context.fill(Path(roundedRect: panel, cornerRadius: inset), with: .color(.black.opacity(0.1)))
        let hem = Path { path in
            path.addLines(top.map { CGPoint(x: $0.x, y: $0.y + inset) })
        }
        context.stroke(hem, with: .color(.white.opacity(0.32)), lineWidth: 0.5)
        context.stroke(path, with: .color(BattlePalette.color(0xb08a45)), lineWidth: 0.75)

        let label = String(amount)
        let fitted = min(height, width * 0.72 / (CGFloat(label.count) * 0.62))
        let font = BattleResources.display(fitted * (label.count == 3 ? 1.45 : 1.15) * 1.06)
        context.draw(Text(label).font(font).fontWeight(.black).foregroundStyle(.white),
                     at: CGPoint(x: center.x - notch * 0.18, y: center.y))

        if status.immobilized, let art = BattleResources.cgImage("immobilized_chain_ball") {
            let size = height * 2.492
            let origin = CGPoint(x: rect.minX - height * 0.18 - size * 0.86, y: center.y - size * 0.208)
            var metal = context
            metal.addFilter(.colorMultiply(Color(white: 0.6)))
            metal.draw(Image(decorative: art, scale: 1), in: CGRect(origin: origin, size: CGSize(width: size, height: size)))
        }
        if status.waiting, let art = BattleResources.cgImage("hourglass") {
            let x = status.immobilized ? rect.minX - height * 2.3 : rect.minX - height * (0.5 - 9.0 / 64.0)
            context.draw(Image(decorative: art, scale: 1),
                         in: CGRect(x: x - height / 2, y: rect.minY, width: height, height: height))
        }

        if active && amount > 0 {
            pointer(above: rect, time: time, animated: animateCloth, pixelWidth: pixelWidth, in: context)
        }
    }

    private static func pointer(above flag: CGRect, time: TimeInterval, animated: Bool,
                                pixelWidth: CGFloat, in context: GraphicsContext) {
        let breath = 0.5 - cos(2 * .pi * time / 1.4) / 2
        let pulse = animated ? breath * breath * (3 - 2 * breath) : 0
        let scale = CGFloat(1 + pulse * 0.08)
        let gap = max(2, flag.height * 0.13) + flag.width * (0.06 / 0.42)
        let tip = CGPoint(x: flag.midX, y: flag.minY - gap)
        // Keep the width and height ratios from the web client's active-turn pointer.
        let sizeScale: CGFloat = 1.06 * 1.3 * 1.5
        let halfWidth = flag.width * 0.16 * sizeScale * scale
        let shaft = halfWidth * 0.42
        let height = flag.height * 0.82 * sizeScale * scale
        let shoulder = tip.y - height * 0.47
        let top = tip.y - height
        let arrow = Path { path in
            path.move(to: CGPoint(x: tip.x - shaft, y: top))
            path.addLine(to: CGPoint(x: tip.x + shaft, y: top))
            path.addLine(to: CGPoint(x: tip.x + shaft, y: shoulder))
            path.addLine(to: CGPoint(x: tip.x + halfWidth, y: shoulder))
            path.addLine(to: tip)
            path.addLine(to: CGPoint(x: tip.x - halfWidth, y: shoulder))
            path.addLine(to: CGPoint(x: tip.x - shaft, y: shoulder))
            path.closeSubpath()
        }
        let halo = 0.32 + pulse * 0.58
        let gold = BattlePalette.color(0xffd05a)
        var glow = context
        glow.opacity *= halo
        glow.blendMode = .plusLighter
        glow.addFilter(.blur(radius: CGFloat(1.6 + halo * 1.4)))
        glow.drawLayer { layer in
            layer.stroke(arrow, with: .color(gold.opacity(0.16)),
                         style: StrokeStyle(lineWidth: flag.height * 0.34 * scale, lineJoin: .round))
            layer.stroke(arrow, with: .color(gold.opacity(0.36)),
                         style: StrokeStyle(lineWidth: flag.height * 0.16 * scale, lineJoin: .round))
        }
        context.fill(arrow, with: .color(BattlePalette.color(0xffc83d)))
        context.stroke(arrow, with: .color(BattlePalette.color(0x100d08)), lineWidth: pixelWidth)
    }
}
