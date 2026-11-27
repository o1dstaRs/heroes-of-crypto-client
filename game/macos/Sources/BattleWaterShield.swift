import SwiftUI

@MainActor
enum BattleWaterShield {
    private static let water = BattlePalette.color(0x67d6ea)
    private static let shine = BattlePalette.color(0xc4f2fb)

    static func draw(_ stack: Stack, at position: CGPoint, presentation: CreatureBoardPresentation,
                     facing: CGFloat, projection: BattlefieldProjection, time: Double,
                     front: Bool, in context: GraphicsContext) {
        if stack.name == "Mermaid" {
            let shell = geometry(stack, position: position, presentation: presentation, facing: facing, projection: projection)
            var water = context
            water.translateBy(x: shell.midX, y: shell.midY)
            water.scaleBy(x: shell.width / 2, y: shell.height / 2)
            film(time: time, front: front, in: water)
        } else if !front {
            let pool = groundRing(stack, center: presentation.ground, projection: projection)
            context.fill(Path(ellipseIn: pool), with: .color(water.opacity(0.08)))
            context.stroke(Path(ellipseIn: pool), with: .color(water.opacity(0.62)), lineWidth: 1)
            for index in 0..<8 {
                let angle = Double(index) * .pi / 4 + time * 1.4
                let point = CGPoint(x: pool.midX + cos(angle) * pool.width / 2, y: pool.midY + sin(angle) * pool.height / 2)
                context.fill(Path(ellipseIn: CGRect(x: point.x - 1, y: point.y - 1, width: 2, height: 2)),
                             with: .color(shine.opacity(0.8)))
            }
        }
    }

    static func dissolve(_ burst: BattleWaterShieldBreak, age: Double, time: Double,
                         projection: BattlefieldProjection, in context: GraphicsContext) {
        let stack = burst.stack
        let facing: CGFloat = stack.team == .player ? 1 : -1
        let body = CreatureAnimation.boardPresentation(stack, position: burst.position, projection: projection, facing: facing)
        if stack.name != "Mermaid" {
            let pool = groundRing(stack, center: body.ground, projection: projection)
            let progress = age / burst.duration
            let spread = 1 + 1.25 * (1 - pow(1 - progress, 2))
            let ring = pool.insetBy(dx: pool.width * (1 - spread) / 2, dy: pool.height * (1 - spread) / 2)
            context.stroke(Path(ellipseIn: ring), with: .color(water.opacity(0.75 * (1 - progress))), lineWidth: 1.4)
            return
        }
        let shell = geometry(stack, position: burst.position, presentation: body, facing: facing, projection: projection)
        var liquid = context
        liquid.translateBy(x: shell.midX, y: shell.midY)
        liquid.scaleBy(x: shell.width / 2, y: shell.height / 2)
        if age < 0.40 {
            let opening = max(0, age - 0.025) * 7.4
            let tear = contour(from: 0, to: 2 * .pi, center: CGPoint(x: 0.30, y: -0.28)) { angle in
                max(0, opening - sin(angle * 3 + age * 12) * 0.035 - sin(angle * 5 - age * 9) * 0.018)
            }
            var remainder = Path(CGRect(x: -1.2, y: -1.2, width: 2.4, height: 2.4))
            remainder.addPath(tear)
            var filmLayer = liquid
            filmLayer.clip(to: remainder, style: FillStyle(eoFill: true))
            filmLayer.opacity *= 1 - smoothstep(0.20, 0.40, age)
            film(time: time, front: true, in: filmLayer)
            var lip = liquid
            lip.clip(to: outline(time: time))
            lip.stroke(tear, with: .color(shine.opacity(0.56 * (1 - smoothstep(0.20, 0.38, age)))), lineWidth: 0.035)
        }
        let floor = (body.ground.y - shell.midY) / (shell.height / 2)
        spray(age: age, floor: floor, in: liquid)
    }

    private static func geometry(_ stack: Stack, position: CGPoint, presentation: CreatureBoardPresentation,
                                 facing: CGFloat, projection: BattlefieldProjection) -> CGRect {
        let cell = projection.spriteCellSize
        let flagHeight = max(9, cell * 0.20)
        let flag = CreatureAnimation.flagPosition(for: stack.name, presentation: presentation,
                                                   projection: projection, facing: facing, height: flagHeight)
        let left = projection.point(x: position.x - 0.5, y: position.y).x
        let right = projection.point(x: position.x + 0.5, y: position.y).x
        let width = min(max(1, right - left) * 0.95, presentation.height * 0.84)
        let top = flag.y + flagHeight / 2
        return CGRect(x: presentation.ground.x - width / 2, y: top, width: width,
                      height: max(1, presentation.ground.y - top + cell * 0.045))
    }

    private static func groundRing(_ stack: Stack, center: CGPoint, projection: BattlefieldProjection) -> CGRect {
        let rx = projection.screenCellWidth * (0.52 + 0.40 * CGFloat(stack.footprint.width - 1))
        let ry = projection.screenCellHeight * (0.52 + 0.40 * CGFloat(stack.footprint.height - 1))
        return CGRect(x: center.x - rx, y: center.y - ry, width: 2 * rx, height: 2 * ry)
    }

    private static func film(time: Double, front: Bool, in context: GraphicsContext) {
        let shell = outline(time: time)
        let alpha = front ? 1.0 : 0.24
        context.fill(shell, with: .radialGradient(
            Gradient(stops: [.init(color: .clear, location: 0.48),
                             .init(color: water.opacity(0.07 * alpha), location: 0.83),
                             .init(color: water.opacity(0.31 * alpha), location: 1)]),
            center: .zero, startRadius: 0, endRadius: 1
        ))
        context.stroke(shell, with: .linearGradient(
            Gradient(colors: [shine.opacity(0.79 * alpha), water.opacity(0.37 * alpha), shine.opacity(0.45 * alpha)]),
            startPoint: CGPoint(x: -0.8, y: -1), endPoint: CGPoint(x: 0.7, y: 1)
        ), style: StrokeStyle(lineWidth: 0.034, lineJoin: .round))
        guard front else { return }
        let gleam = contour(from: -2.68 + 0.07 * sin(time), to: -1.39, closed: false) {
            wave(at: $0, time: time) * 0.956
        }
        context.stroke(gleam, with: .linearGradient(Gradient(colors: [.clear, shine.opacity(0.78), .clear]),
                                                    startPoint: CGPoint(x: -0.86, y: -0.46),
                                                    endPoint: CGPoint(x: 0.18, y: -1)),
                       style: StrokeStyle(lineWidth: 0.061, lineCap: .round))
        for index in 0..<7 {
            let seed = Double(index)
            let age = fract(time * (0.12 + seed * 0.006) + seed * 0.618034)
            let y = 0.82 - age * 1.60
            let side = index.isMultiple(of: 2) ? -1.0 : 1.0
            let x = side * (0.44 + 0.12 * sin(seed * 2.4 + time * 0.45)) * sqrt(max(0.05, 1 - y * y))
            let tint = smoothstep(0, 0.16, age) * (1 - smoothstep(0.78, 1, age))
            let bead = Path(ellipseIn: CGRect(x: x - 0.025, y: y - 0.018, width: 0.05, height: 0.036))
            context.stroke(bead, with: .color(shine.opacity(0.66 * tint)), lineWidth: 0.011)
        }
    }

    private static func outline(time: Double) -> Path {
        contour(from: 0, to: 2 * .pi) { wave(at: $0, time: time) }
    }

    private static func contour(from start: Double, to end: Double, center: CGPoint = .zero, closed: Bool = true,
                                radius: (Double) -> Double) -> Path {
        Path { path in
            let steps = closed ? 72 : 20
            for index in 0...steps {
                let angle = start + (end - start) * Double(index) / Double(steps)
                let r = radius(angle)
                let point = CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle))
                if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
            }
            if closed { path.closeSubpath() }
        }
    }

    private static func wave(at angle: Double, time: Double) -> Double {
        let x = cos(angle), y = sin(angle)
        return 1 + sin(4.3 * x + 3.1 * y - time * 1.14) * 0.017 + sin(-3.4 * x + 5.2 * y + time * 0.89) * 0.012
            + sin(10.2 * x - 7.6 * y - time * 1.72) * 0.004 + sin(15.3 * x + 12.1 * y + time * 2.05) * 0.003
    }

    // The same fixed seeds, drag and gravity as the web spray. Each droplet lands at its own floor point.
    private static func spray(age: Double, floor: Double, in context: GraphicsContext) {
        for index in 0..<48 {
            let seed = Double(index)
            let h = hash(seed), h2 = hash(seed + 52)
            let angle = seed * 2.399963 + h * 0.6
            let delay = 0.025 + h2 * 0.11
            let t = age - delay
            guard t >= 0 else { continue }
            let ground = floor + (h2 - 0.5) * 0.25
            let startX = cos(angle) * 0.83
            let startY = min(sin(angle) * 0.81, ground - 0.06)
            let dx = cos(angle) * (1.5 + h * 1.6)
            let dy = sin(angle) * 0.65 - 0.65 - h2 * 0.45
            let drag = index >= 34 ? 1.55 : 0.65
            let hit = (-dy + sqrt(dy * dy + 9.2 * (ground - startY))) / 4.6
            let flight = min(t, hit)
            let x = startX + dx * (1 - exp(-drag * flight)) / drag
            if t < hit {
                let y = startY + dy * flight + 2.3 * flight * flight
                let r = (index < 12 ? 0.060 : 0.035) * (0.75 + h * 0.5) * (index >= 34 ? 0.6 : 1)
                let vx = dx * exp(-drag * flight), vy = dy + 4.6 * flight
                let stretch = r + (index < 12 ? 0.18 * exp(-t * 7) : 0) + hypot(vx, vy) * 0.009
                var drop = context
                drop.translateBy(x: x, y: y)
                drop.rotate(by: .radians(atan2(vy, vx)))
                drop.fill(Path(ellipseIn: CGRect(x: -stretch, y: -r, width: 2 * stretch, height: 2 * r)),
                          with: .color(water.opacity(0.64 * smoothstep(0, 0.025, t))))
                drop.fill(Path(ellipseIn: CGRect(x: -stretch * 0.5, y: -r * 0.7, width: stretch, height: r * 0.6)),
                          with: .color(shine.opacity(0.60 * smoothstep(0, 0.025, t))))
            } else if t - hit < 0.65 {
                let impact = t - hit
                let radius = 0.035 + impact * (index < 12 ? 0.64 : 0.46)
                let ring = CGRect(x: x - radius, y: ground - radius * 0.25, width: radius * 2, height: radius * 0.5)
                context.stroke(Path(ellipseIn: ring),
                               with: .color(shine.opacity(0.46 * (1 - smoothstep(0.10, 0.55, impact)))), lineWidth: 0.024)
            }
        }
    }

    private static func fract(_ x: Double) -> Double { x - floor(x) }
    private static func hash(_ x: Double) -> Double { fract(sin(x * 127.1 + 311.7) * 43_758.5453) }

    private static func smoothstep(_ start: Double, _ end: Double, _ value: Double) -> Double {
        let unit = min(1, max(0, (value - start) / (end - start)))
        return unit * unit * (3 - 2 * unit)
    }
}
