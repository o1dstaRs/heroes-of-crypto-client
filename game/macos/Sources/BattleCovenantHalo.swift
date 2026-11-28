import SwiftUI

@MainActor
enum BattleCovenantHalo {
    private static let turn = 2 * Double.pi

    static func draw(at flag: CGPoint, cell: CGFloat, id: Int, time: TimeInterval, age: TimeInterval,
                     breakAge: TimeInterval?, absorbAge: TimeInterval?, in canvas: GraphicsContext) {
        let phase = Double(String(id).utf8.reduce(UInt32(2166136261)) { ($0 ^ UInt32($1)) &* 16777619 }) /
            4294967296 * turn
        var context = canvas
        context.translateBy(x: flag.x, y: flag.y)
        context.scaleBy(x: max(17, cell * 0.42) * 2.15, y: max(9, cell * 0.20) * 2.75)
        if let absorbAge, (0..<0.65).contains(absorbAge) {
            let progress = absorbAge / 0.65
            let growth = 1 - pow(1 - progress, 3)
            var burst = context
            burst.blendMode = .plusLighter
            burst.opacity *= pow(1 - progress, 0.65)
            let flash = max(0, 1 - progress / 0.28)
            burst.fill(circle(0.27 + growth * 0.13), with: .color(BattlePalette.color(0xff8a20).opacity(flash * 0.32)))
            burst.fill(circle(0.18 + growth * 0.08), with: .color(BattlePalette.color(0xfff1bf).opacity(flash * 0.65)))
            pressureRing(0.28 + growth * 0.65, progress: progress, in: burst)
            for index in 0..<20 {
                let angle = phase + Double(index) * turn / 20
                let reach = 0.3 + growth * (0.55 + Double(index % 3) * 0.1)
                let tail = (1 - progress) * 0.16
                let drop = progress * progress * 0.15
                let spark = Path {
                    $0.move(to: CGPoint(x: cos(angle) * (reach - tail), y: sin(angle) * (reach - tail) - drop))
                    $0.addLine(to: CGPoint(x: cos(angle) * reach, y: sin(angle) * reach - drop))
                }
                burst.stroke(spark, with: .color(BattlePalette.color(index % 3 == 0 ? 0xfff5da : 0xffbd55)),
                             lineWidth: 0.008 * (1 - progress))
            }
        }
        let broken = max(0, (breakAge ?? 0) / 0.85)
        guard broken < 1 else { return }
        let breaking = (breakAge ?? -1) >= 0
        let rise = 1 - pow(1 - broken, 3)
        let pulse = sin(time * 4 + phase)
        let scale = (1 + pulse * 0.012) * (1 + rise * 0.18)
        context.scaleBy(x: scale, y: scale)
        context.opacity *= min(1, age / 0.3) * pow(1 - broken, 0.7)
        if let image = BattleResources.cgImage("ember_covenant_ring") {
            let rect = CGRect(x: -0.5, y: -0.5, width: 1, height: 1)
            let art = Image(decorative: image, scale: 1)
            if !breaking || broken < 0.3 {
                var echo = context
                echo.blendMode = .plusLighter
                echo.opacity *= 0.16 + pulse * 0.035 + (breaking ? (1 - broken / 0.3) * 0.85 : 0)
                echo.rotate(by: .radians(time * 0.13 + phase))
                let spread = rise * 0.11
                echo.draw(art, in: rect.insetBy(dx: -spread, dy: -spread))
            }
            if !breaking {
                var flame = context
                flame.opacity *= 0.83 + pulse * 0.07
                flame.rotate(by: .radians(-time * 0.22 - phase))
                flame.draw(art, in: rect)
            } else {
                for segment in 0..<10 {
                    let start = Double(segment) * turn / 10
                    let rotation = time * 0.22 + phase + sin(Double(segment) * 2.1) * broken * 0.25
                    let center = start + turn / 20 + rotation
                    let distance = rise * (0.22 + Double(segment % 3) * 0.045)
                    var fragment = context
                    fragment.blendMode = .plusLighter
                    fragment.opacity *= (1 - broken) * (1.3 + sin(broken * .pi) * 0.4)
                    fragment.translateBy(x: cos(center) * distance, y: -sin(center) * distance - broken * 0.2)
                    fragment.rotate(by: .radians(-rotation))
                    let size = 1 - broken * 0.25
                    fragment.scaleBy(x: size, y: size)
                    let outline = ((0...6).map { ($0, 0.54) } + (0...6).reversed().map { ($0, 0.20) }).map { step, radius in
                        let angle = start + Double(step) * turn / 60
                        return CGPoint(x: cos(angle) * radius, y: -sin(angle) * radius)
                    }
                    fragment.clip(to: Path { $0.addLines(outline); $0.closeSubpath() })
                    fragment.draw(art, in: rect)
                }
            }
        }
        if breaking { pressureRing(0.36 + rise * 0.36, progress: broken, in: context) }
        var sparks = context
        sparks.blendMode = .plusLighter
        for index in 0..<10 {
            let drift = (time * 0.38 + Double(index) * 0.618 + phase).truncatingRemainder(dividingBy: 1)
            let angle = phase + Double(index) * turn / 10 + time * 0.3
            let radius = 0.37 + drift * 0.045 + broken * 0.16
            let x = cos(angle) * radius
            let y = -sin(angle) * radius - drift * 0.04 - broken * 0.12
            let alpha = (1 - drift) * (breaking ? 1 : 0.6)
            for (size, color, opacity) in [(0.012, UInt32(0xff8c1c), alpha * 0.22), (0.0035, UInt32(0xffefae), alpha)] {
                let spark = CGRect(x: x - size, y: y - size, width: size * 2, height: size * 2)
                sparks.fill(Path(ellipseIn: spark), with: .color(BattlePalette.color(color).opacity(opacity)))
            }
        }
    }

    private static func pressureRing(_ radius: CGFloat, progress: Double, in context: GraphicsContext) {
        let ring = circle(radius)
        context.stroke(ring, with: .color(BattlePalette.color(0xff7a1d).opacity(0.35)), lineWidth: 0.045 * (1 - progress))
        context.stroke(ring, with: .color(BattlePalette.color(0xffe9ab).opacity(0.90 * (1 - progress))), lineWidth: 0.009)
    }

    private static func circle(_ radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2))
    }
}
