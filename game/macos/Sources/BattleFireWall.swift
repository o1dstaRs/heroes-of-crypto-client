import SwiftUI

enum BattleTerrainAim {
    static func drawSmoke(_ anchor: Cell, projection: BattlefieldProjection, pulse: Double, in context: GraphicsContext) {
        for dx in -1...1 {
            for dy in -1...1 {
                let cell = Cell(x: anchor.x + Int32(dx), y: anchor.y + Int32(dy))
                let path = Path(projection.spellAimOutline(cell))
                context.fill(path, with: .color(BattlePalette.color(0x8b93a3).opacity(0.28 + 0.14 * pulse)))
                stroke(path, color: BattlePalette.color(0xd2d8e4).opacity(0.7), width: 2, projection: projection, in: context)
            }
        }
    }

    static func drawFireWall(_ aim: BattleFireWallAim, projection: BattlefieldProjection, pulse: Double, in context: GraphicsContext) {
        let lit = Set(aim.lit)
        for cell in aim.footprint {
            let path = Path(projection.spellAimOutline(cell))
            let burns = lit.contains(cell)
            context.fill(path, with: .color(BattlePalette.color(0xb03000).opacity(burns ? 0.3 + 0.16 * pulse : 0.08)))
            stroke(path, color: BattlePalette.color(0xff8a2b).opacity(burns ? 0.8 : 0.3),
                   width: 2, projection: projection, in: context)
        }
        if let first = aim.footprint.first, let last = aim.footprint.last, first != last {
            let axis = Path { path in
                path.move(to: projection.center([first]))
                path.addLine(to: projection.center([last]))
            }
            stroke(axis, color: BattlePalette.color(0xffd04a).opacity(0.5 + 0.3 * pulse),
                   width: 3, projection: projection, rounded: true, in: context)
        }
    }

    private static func stroke(_ path: Path, color: Color, width: CGFloat, projection: BattlefieldProjection,
                               rounded: Bool = false, in canvas: GraphicsContext) {
        let ratio = projection.screenCellHeight / max(0.001, projection.screenCellWidth)
        var context = canvas
        context.scaleBy(x: 1, y: ratio)
        context.stroke(path.applying(CGAffineTransform(scaleX: 1, y: 1 / ratio)), with: .color(color),
                       style: StrokeStyle(lineWidth: width * projection.worldPointScale, lineCap: rounded ? .round : .butt))
    }
}

enum BattleFireWall {
    struct Tile {
        let depth: CGFloat
        private let ground: Path
        private let x: CGFloat
        private let base: CGFloat
        private let width: CGFloat
        private let height: CGFloat
        private let phase: Double

        init(_ cell: Cell, projection: BattlefieldProjection) {
            let logicalX = CGFloat(cell.x) + 0.5
            let logicalY = CGFloat(cell.y) + 0.5
            let center = projection.point(x: logicalX, y: logicalY)
            let front = projection.point(x: logicalX, y: logicalY - 0.5)
            let back = projection.point(x: logicalX, y: logicalY + 0.5)
            width = projection.point(x: logicalX + 0.5, y: logicalY).x - projection.point(x: logicalX - 0.5, y: logicalY).x
            height = width * 1.5
            x = center.x
            base = front.y + 0.06 * (front.y - back.y)
            depth = center.y
            phase = Double(cell.x) * 0.19 + Double(cell.y) * 0.31
            ground = Path(projection.tile(cell).outline)
        }

        func drawGround(life: Double, in context: GraphicsContext) {
            let center = CGPoint(x: x, y: depth)
            let color = BattlePalette.color(0xe8500a).opacity(0.4 * life)
            context.fill(ground, with: .radialGradient(Gradient(colors: [color, .clear]),
                                                       center: center, startRadius: 0, endRadius: width * 0.58))
        }

        func drawFlame(time: TimeInterval, life: Double, in canvas: GraphicsContext) {
            var context = canvas
            context.opacity *= life
            let height = height * (0.4 + 0.6 * life)
            for i in 0..<5 {
                let p = particles[i]
                let age = fraction(time * 0.36 + p.phase + phase)
                let w = width * (0.24 + age * 0.42)
                let center = CGPoint(x: x + width * (p.x * 0.5 + sin(time + p.phase * 9) * age * 0.1),
                                     y: base - height * (0.76 + age * 0.51))
                Self.glow(BattlePalette.color(0x8a7160), opacity: sin(age * .pi) * 0.25,
                          center: center, width: w, height: w * 1.24, in: context)
            }
            for i in 5..<37 {
                let p = particles[i]
                let age = fraction(time * (0.72 + p.speed * 0.6) + p.phase + phase)
                let taper = pow(1 - age, 0.7)
                let w = width * (0.18 + p.size * 0.25) * (0.4 + taper * 0.6)
                let h = height * (0.28 + p.size * 0.17) * (0.5 + taper * 0.5)
                let rise = min(height - h * 0.5, h * 0.5 + height * pow(age, 0.75))
                let sway = sin(time * 6.0 - age * 5 + phase * 7) * age * 0.13
                let center = CGPoint(x: x + width * (p.x * (1 - age * 0.25) + sway), y: base - rise)
                let color = Color(red: 1 - age * 0.32, green: 0.78 - age * 0.66, blue: 0.34 - age * 0.30)
                Self.glow(color, opacity: min(1, age / 0.05) * min(1, (1 - age) / 0.28) * 0.84,
                          center: center, width: w, height: h, in: context)
            }
            context.blendMode = .plusLighter
            for p in particles.suffix(7) {
                let age = fraction(time * (0.55 + p.speed * 0.5) + p.phase + phase)
                let center = CGPoint(x: x + width * (p.x + sin(time * 4 + phase) * age * 0.16),
                                     y: base - height * age * (2.1 - age * 0.75))
                let w = width * (0.015 + p.size * 0.015)
                let rect = CGRect(x: center.x - w / 2, y: center.y - w, width: w, height: w * 2)
                context.fill(Path(ellipseIn: rect), with: .color(BattlePalette.color(0xffae50).opacity(sin(age * .pi) * 0.8)))
            }
        }

        private static func glow(_ color: Color, opacity: Double, center: CGPoint, width: CGFloat, height: CGFloat,
                                 in canvas: GraphicsContext) {
            guard width > 0, height > 0 else { return }
            var context = canvas
            context.translateBy(x: center.x, y: center.y)
            context.scaleBy(x: width, y: height)
            let body = Path(ellipseIn: CGRect(x: -0.5, y: -0.5, width: 1, height: 1))
            let gradient = Gradient(stops: [.init(color: color.opacity(opacity), location: 0),
                                            .init(color: color.opacity(opacity * 0.55), location: 0.48),
                                            .init(color: .clear, location: 1)])
            context.fill(body, with: .radialGradient(gradient, center: .zero, startRadius: 0, endRadius: 0.5))
        }
    }

    private static func fraction(_ value: Double) -> Double { value - floor(value) }

    private static let particles = (0..<44).map { index in
        func seed(_ salt: Int) -> Double { fraction(sin(Double(index + salt) * 127.1 + 311.7) * 43758.5453) }
        return (phase: seed(1), x: seed(47) - 0.5, speed: seed(91), size: seed(151))
    }
}
