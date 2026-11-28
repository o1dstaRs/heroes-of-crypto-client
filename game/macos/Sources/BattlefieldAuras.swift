import SwiftUI

/// Floor artwork shares the sprite canvas and the board's perspective. Each motif is clipped to its live field.
@MainActor
enum BattlefieldAuraArt {
    static func drawLayer(_ image: CGImage, bounds: CGRect, clip: CGPath, eye: CGPath? = nil,
                          scale: CGFloat, in canvas: GraphicsContext) {
        var context = canvas
        context.clip(to: Path(clip))
        if let eye { context.clip(to: Path(eye), options: .inverse) }
        context.draw(Image(decorative: image, scale: scale), in: bounds)
    }

    static func draw(_ aura: BattlefieldAura, center: CGPoint, facing: CGFloat, board: CGRect,
                     projection: BattlefieldProjection, time: TimeInterval, scale: CGFloat = 1, in canvas: GraphicsContext) {
        let bounds = aura.bounds(center: center)
        let inwardWind = aura.effect.name == "Absorb Penalties Aura"
        if inwardWind || aura.effect.name == "Guiding Winds Aura",
           let rendered = BattlefieldWindAura.image(area: bounds, board: board, projection: projection, time: time,
                                                    opacity: aura.opacity, scale: scale, inward: inwardWind) {
            canvas.draw(Image(decorative: rendered.image, scale: scale), in: rendered.bounds)
            return
        }
        let area = bounds.insetBy(dx: 0.055, dy: 0.055)
        let visible = area.intersection(board)
        guard !visible.isEmpty else { return }
        let field = FloorField(area: area, projection: projection, time: time, facing: facing)
        var context = canvas
        context.clip(to: field.rectangle(visible))
        context.opacity *= aura.opacity

        switch aura.effect.name {
        case "Disguise Aura": field.tiger(revealed: aura.revealed, in: context)
        case "War Anger Aura": field.blood(in: context)
        case "Guiding Winds Aura": field.wind(inward: false, in: context)
        case "Absorb Penalties Aura": field.wind(inward: true, in: context)
        case "Web Aura": field.web(in: context)
        case "Pegasus Might Aura": field.storm(.feathers, in: context)
        case "Range Null Field Aura": field.storm(.tornado, in: context)
        case "Flesh Shield Aura": field.storm(.sand, in: context)
        case "Venom Cloud Aura": field.poison(in: context)
        default: field.waves(positive: aura.effect.positive, in: context)
        }
    }
}

@MainActor
private struct FloorField {
    let area: CGRect
    let projection: BattlefieldProjection
    let time: CGFloat
    let facing: CGFloat

    private var center: CGPoint { CGPoint(x: area.midX, y: area.midY) }
    private var unit: CGFloat { projection.spriteCellSize }

    func tiger(revealed: Bool, in context: GraphicsContext) {
        let tint = BattlePalette.color(revealed ? 0xcf3d23 : 0x69c774)
        let light = BattlePalette.color(revealed ? 0xff9b54 : 0xc8f49a)
        wash(tint, opacity: 0.05, in: context)
        ribbon(tint, light: light, in: context)
        let rim = area.insetBy(dx: 0.23, dy: 0.23)
        let count = max(1, Int((rim.width + rim.height) * 1.1))
        for index in 0..<count {
            let step = CGFloat(index) / CGFloat(count)
            let phase = wrap(step + time * 0.072)
            let point = edge(phase, in: rim)
            let ahead = edge(phase + 0.008, in: rim)
            let side = index.isMultiple(of: 2) ? 1.0 : -1.0
            let dx = ahead.x - point.x
            let dy = ahead.y - point.y
            let yaw = atan2(dy, dx)
            let glow = 0.40 + 0.60 * beat(phase * 3 - time * 0.74)
            var track = context
            track.translateBy(x: point.x - sin(yaw) * unit * 0.045 * side,
                              y: point.y + cos(yaw) * unit * 0.045 * side)
            track.rotate(by: .radians(yaw + side * 0.11))
            track.scaleBy(x: unit * 0.29, y: unit * 0.22)
            let paw = Path { path in
                path.addEllipse(in: CGRect(x: -0.36, y: -0.30, width: 0.50, height: 0.60))
                for (x, y) in [(0.10, -0.46), (0.28, -0.23), (0.28, 0.07), (0.10, 0.31)] {
                    path.addEllipse(in: CGRect(x: x, y: y, width: 0.18, height: 0.15))
                }
            }
            track.fill(paw, with: .color(light.opacity(0.77 * glow)))
        }
    }

    func blood(in context: GraphicsContext) {
        let red = BattlePalette.color(0xac172b)
        let sheen = BattlePalette.color(0xfa775b)
        wash(red, opacity: 0.045, in: context)
        ribbon(red, light: sheen, width: 0.060, in: context)
        for index in 0..<5 {
            let offset = CGFloat(index) / 5
            let travel = wrap(time * 0.42 + offset)
            let source = edge(offset + time * 0.055, in: area.insetBy(dx: 0.15, dy: 0.15))
            let sink = point(center)
            let fade = 0.9 * envelope(travel)
            for drop in 0..<4 {
                let drift = CGFloat(drop) / 4
                let depth = travel * (0.07 + drift * 0.18)
                let x = source.x + (sink.x - source.x) * depth + sin(offset * 24 + drift * 7) * unit * travel * 0.17
                let y = source.y + (sink.y - source.y) * depth
                let size = unit * (0.028 + (1 - drift) * 0.038) * (1 - travel * 0.5)
                context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: size * 1.6, height: size)),
                             with: .color(red.opacity(fade)))
            }
        }
    }

    func wind(inward: Bool, in context: GraphicsContext) {
        let tint = BattlePalette.color(inward ? 0x68517f : 0x4aa592)
        let glint = BattlePalette.color(inward ? 0xb49acd : 0xe9d488)
        wash(tint, opacity: inward ? 0.075 : 0.04, in: context)
        ribbon(tint, light: glint, in: context)
        for index in 0..<3 {
            let phase = wrap(time / 3.2 + CGFloat(index) / 3)
            let radius = 0.15 + (inward ? 1 - phase : phase) * 1.19
            for thread in 0..<3 {
                let angle = CGFloat(thread) * 2 * .pi / 3 + time * 0.52 + CGFloat(index) * 0.8
                let wave = trace(steps: 22) { step in
                    polar(angle + step * 1.94, radius: radius * (0.98 + 0.035 * sin(step * 8 + angle)))
                }
                glow(wave, tint: tint, light: glint, width: inward ? 0.023 : 0.029,
                     alpha: 0.56 * envelope(phase), in: context)
            }
        }
        guard inward else { return }
        for index in 0..<16 {
            let seed = CGFloat(index)
            let phase = wrap(time / 1.85 + seed * 0.618)
            let angle = seed * 2 * .pi / 16
            let head = (0.95 - phase * 0.62) / max(abs(sin(angle)), abs(cos(angle)))
            let trail = trace(steps: 7) { step in polar(angle + step * 0.09, radius: head + step * 0.23) }
            glow(trail, tint: tint, light: glint, width: 0.018, alpha: 0.43 * envelope(phase), in: context)
        }
    }

    func web(in context: GraphicsContext) {
        let shadow = BattlePalette.color(0x302922)
        let silk = BattlePalette.color(0xcfbe9a)
        let green = BattlePalette.color(0x9dbb4d)
        wash(shadow, opacity: 0.13, in: context)
        let spokes = 12
        let spacing = 2 * CGFloat.pi / CGFloat(spokes)
        let angles = (0..<spokes).map { index in
            let slot = CGFloat(index)
            return slot * spacing + 0.08 * sin(slot * 2.9)
        }
        let ends = angles.map { angle in
            polar(angle, radius: 0.94 / max(abs(cos(angle)), abs(sin(angle))))
        }
        func strandPoint(_ index: Int, radius: CGFloat) -> CGPoint {
            let end = ends[index % spokes]
            return CGPoint(x: center.x + (end.x - center.x) * radius, y: center.y + (end.y - center.y) * radius)
        }
        var spokesPath = Path()
        for end in ends {
            spokesPath.move(to: point(center))
            spokesPath.addLine(to: point(end))
        }
        glow(spokesPath, tint: shadow, light: silk, width: 0.016, alpha: 0.47, in: context)
        for ring in 1...6 {
            let radius = CGFloat(ring) * 0.148
            func node(_ index: Int) -> CGPoint {
                strandPoint(index, radius: radius + sin(CGFloat((index % spokes) * 7 + ring)) * 0.031)
            }
            var strand = Path()
            strand.move(to: point(node(0)))
            for index in 0..<spokes {
                let a = node(index)
                let b = node(index + 1)
                let pull: CGFloat = 0.46
                let middle = CGPoint(x: center.x + (a.x + b.x - 2 * center.x) * pull,
                                     y: center.y + (a.y + b.y - 2 * center.y) * pull)
                strand.addQuadCurve(to: point(b), control: point(middle))
            }
            glow(strand, tint: shadow, light: silk, width: 0.015, alpha: 0.44 + 0.13 * beat(radius - time * 0.31), in: context)
        }
        for index in 0..<4 {
            let travel = wrap(time * 0.23 + CGFloat(index) / 4)
            let radius = 0.27 + 0.59 * travel
            let indexOnWeb = index * 3 + 1
            let pulse = trace(steps: 4) { step in strandPoint(indexOnWeb, radius: radius + step * 0.09) }
            glow(pulse, tint: green, light: silk, width: 0.02, alpha: 0.64 * envelope(travel), in: context)
            let direction = angles[indexOnWeb]
            let spider = point(strandPoint(indexOnWeb, radius: 0.57 + 0.24 * sin(time * 1.28 + CGFloat(index) * 3)))
            drawSpider(at: spider, angle: -direction, phase: time * 11 + CGFloat(index), in: context)
        }
    }

    private func drawSpider(at point: CGPoint, angle: CGFloat, phase: CGFloat, in canvas: GraphicsContext) {
        var context = canvas
        context.translateBy(x: point.x, y: point.y)
        context.rotate(by: .radians(angle))
        context.scaleBy(x: unit * 0.20, y: unit * 0.20)
        let brown = BattlePalette.color(0x3f2a1e)
        let amber = BattlePalette.color(0xaf8960)
        var legs = Path()
        for side in [-1.0, 1.0] {
            for leg in 0..<4 {
                let x = CGFloat(leg) * 0.13 - 0.22
                let stride = 0.15 * sin(phase + CGFloat(leg) * .pi + side)
                legs.move(to: CGPoint(x: x, y: 0))
                legs.addLine(to: CGPoint(x: x * 1.5, y: 0.22 * side))
                legs.addLine(to: CGPoint(x: x * 2.1 + stride, y: 0.39 * side))
            }
        }
        context.stroke(legs, with: .color(amber.opacity(0.68)), style: StrokeStyle(lineWidth: 0.075, lineCap: .round))
        var body = Path()
        body.addEllipse(in: CGRect(x: -0.31, y: -0.18, width: 0.47, height: 0.36))
        body.addEllipse(in: CGRect(x: 0.09, y: -0.105, width: 0.19, height: 0.21))
        context.fill(body, with: .color(brown))
        context.stroke(body, with: .color(amber.opacity(0.70)), lineWidth: 0.049)
    }

    enum Storm {
        case feathers, tornado, sand

        var style: (tint: UInt32, light: UInt32, speed: CGFloat) {
            switch self {
            case .feathers: (0xc7883e, 0xffe6ac, 0.62)
            case .tornado: (0x9b9d91, 0xe5dcc4, 1.56)
            case .sand: (0x986439, 0xdab782, 0.83)
            }
        }
    }

    func storm(_ storm: Storm, in context: GraphicsContext) {
        let style = storm.style
        let tint = BattlePalette.color(style.tint)
        let light = BattlePalette.color(style.light)
        let swirl = time * style.speed * facing
        let sandy = storm == .sand
        let drift: CGFloat = sandy ? 0.09 : 0.045
        for index in 0..<12 {
            let offset = CGFloat(index)
            let angle = offset * .pi / 6 + swirl * 0.53
            let orbit = 0.66 + 0.15 * sin(offset * 1.47 + time * 0.72)
            let cloud = polar(angle, radius: orbit)
            softSpot(at: cloud, size: 1.05 + 0.29 * beat(offset * 0.7 + time * 0.3), color: tint,
                     opacity: sandy ? 0.29 : 0.14, in: context)
            let arc = trace(steps: 28) { step in
                let turn = 0.91 + offset.truncatingRemainder(dividingBy: 3) * 0.19
                let radius = orbit - step * 0.20 + drift * sin(step * 9 + offset)
                return polar(angle + facing * step * turn, radius: radius)
            }
            let strength = (storm == .tornado ? 0.38 : 0.27) + 0.16 * beat(offset * 0.54 + time * 0.72)
            glow(arc, tint: tint, light: light, width: storm == .tornado ? 0.034 : 0.022, alpha: strength, in: context)
        }

        var grains = Path()
        for index in 0..<(sandy ? 70 : 34) {
            let sample = CGFloat(index)
            let angle = sample * 2.39996 + swirl * (0.69 + 0.27 * beat(sample * 0.34))
            let orbit = 0.32 + 0.64 * wrap(sample * 0.618)
            let location = point(polar(angle, radius: orbit))
            let size = unit * (0.012 + 0.022 * beat(sample * 0.38 + time * 0.8))
            grains.addEllipse(in: CGRect(x: location.x, y: location.y, width: size * 1.7, height: size))
        }
        context.fill(grains, with: .color(light.opacity(sandy ? 0.59 : 0.50)))
        switch storm {
        case .feathers:
            orbitSilhouettes("vfx_pegasus_feather_atlas_v7.webp", columns: 2, rows: 2, count: 12, size: 0.49, swirl: swirl, in: context)
        case .tornado:
            orbitSilhouettes("vfx_griffin_tornado_silver_v2.webp", columns: 3, rows: 1, count: 9, size: 0.37, swirl: swirl, in: context)
        case .sand:
            break
        }
    }

    private func orbitSilhouettes(_ atlas: String, columns: Int, rows: Int, count: Int, size: CGFloat,
                                  swirl: CGFloat, in canvas: GraphicsContext) {
        let sprites = (0..<(columns * rows)).map {
            BattlefieldAtlas.frame(atlas, columns: columns, rows: rows, index: $0, inBackground: true)
        }
        for index in 0..<count {
            guard let bitmap = sprites[index % sprites.count] else { continue }
            let sample = CGFloat(index)
            let angle = sample * 2 * .pi / CGFloat(count) + swirl * (0.72 + 0.15 * beat(sample * 0.6))
            let orbit = 0.63 + 0.24 * beat(sample * 0.47 + time * 0.16)
            let location = point(polar(angle, radius: orbit))
            let tangent = point(polar(angle + facing * 0.045, radius: orbit))
            let width = unit * size * (0.79 + 0.40 * beat(sample * 0.42 + time * 0.35))
            let height = width * CGFloat(bitmap.height) / CGFloat(bitmap.width) * (0.57 + 0.43 * beat(time * 0.65 + sample))
            var context = canvas
            context.translateBy(x: location.x, y: location.y)
            context.rotate(by: .radians(atan2(tangent.y - location.y, tangent.x - location.x) + 0.33 * sin(time * 3 + sample)))
            context.opacity *= 0.60 + 0.38 * beat(time * 0.48 + sample * 0.61)
            context.draw(Image(decorative: bitmap, scale: 1), in: CGRect(x: -width / 2, y: -height / 2, width: width, height: height))
        }
    }

    func poison(in context: GraphicsContext) {
        let moss = BattlePalette.color(0x5e7a49)
        let mist = BattlePalette.color(0xb2c781)
        softSpot(at: center, size: 1.85, color: moss, opacity: 0.23, in: context)
        for index in 0..<18 {
            let sample = CGFloat(index)
            let phase = wrap(time * 0.092 * facing + sample / 18)
            let billow = 0.74 + 0.40 * beat(time * 0.36 + sample * 0.72)
            let inset = 0.72 * billow + 0.24 * beat(sample * 0.33 + time * 0.20)
            let location = edgePosition(phase, in: area.insetBy(dx: inset, dy: inset))
            softSpot(at: location, size: 1.09 * billow, color: moss, opacity: 0.39, in: context)
            softSpot(at: location, size: 0.78 * billow, color: mist, opacity: 0.15 + 0.15 * beat(time * 0.21 - sample), in: context)
            let curl = trace(steps: 14) { step in
                let distance = inset + 0.066 * sin(step * 8 + sample + time)
                return edgePosition(phase + step * 0.035, in: area.insetBy(dx: distance, dy: distance))
            }
            glow(curl, tint: moss, light: mist, width: 0.018, alpha: 0.18 * billow, in: context)
        }
    }

    private func softSpot(at location: CGPoint, size: CGFloat, color: Color, opacity: Double, in canvas: GraphicsContext) {
        let center = point(location)
        let edge = point(CGPoint(x: location.x + size, y: location.y))
        let height = abs(point(CGPoint(x: location.x, y: location.y + size)).y - center.y)
        var context = canvas
        context.translateBy(x: center.x, y: center.y)
        context.scaleBy(x: abs(edge.x - center.x), y: height)
        let glow = Gradient(stops: [.init(color: color.opacity(opacity), location: 0),
                                    .init(color: color.opacity(opacity * 0.46), location: 0.45),
                                    .init(color: .clear, location: 1)])
        context.fill(Path(ellipseIn: CGRect(x: -1, y: -1, width: 2, height: 2)),
                     with: .radialGradient(glow, center: .zero, startRadius: 0, endRadius: 1))
    }

    func waves(positive: Bool, in context: GraphicsContext) {
        let tint = BattlePalette.color(positive ? 0x48c77c : 0xdb544b)
        wash(tint, opacity: 0.07, in: context)
        ribbon(tint, light: tint, in: context)
        let reach = min(area.width, area.height) * 0.46
        for index in 0..<3 {
            let phase = wrap(time * 0.46 + CGFloat(index) / 3)
            let inset = (1 - phase) * reach
            let crest = area.insetBy(dx: inset, dy: inset)
            glow(rectangle(crest), tint: tint, light: tint, width: 0.044, alpha: 0.54 * envelope(phase), in: context)
        }
    }

    func rectangle(_ bounds: CGRect) -> Path {
        Path(projection.outline(of: bounds))
    }

    private func point(_ position: CGPoint) -> CGPoint { projection.point(x: position.x, y: position.y) }

    private func polar(_ angle: CGFloat, radius: CGFloat) -> CGPoint {
        CGPoint(x: center.x + cos(angle) * radius * area.width / 2,
                y: center.y + sin(angle) * radius * area.height / 2)
    }

    private func edge(_ phase: CGFloat, in bounds: CGRect) -> CGPoint { point(edgePosition(phase, in: bounds)) }

    private func edgePosition(_ phase: CGFloat, in bounds: CGRect) -> CGPoint {
        let distance = wrap(phase) * 2 * (bounds.width + bounds.height)
        if distance < bounds.width { return CGPoint(x: bounds.minX + distance, y: bounds.minY) }
        if distance < bounds.width + bounds.height { return CGPoint(x: bounds.maxX, y: bounds.minY + distance - bounds.width) }
        if distance < 2 * bounds.width + bounds.height {
            return CGPoint(x: bounds.maxX - (distance - bounds.width - bounds.height), y: bounds.maxY)
        }
        return CGPoint(x: bounds.minX, y: bounds.maxY - (distance - 2 * bounds.width - bounds.height))
    }

    private func trace(steps: Int, _ position: (CGFloat) -> CGPoint) -> Path {
        var path = Path()
        path.move(to: point(position(0)))
        for step in 1...steps { path.addLine(to: point(position(CGFloat(step) / CGFloat(steps)))) }
        return path
    }

    private func wrap(_ value: CGFloat) -> CGFloat { value - floor(value) }
    private func beat(_ phase: CGFloat) -> CGFloat { 0.5 + 0.5 * cos(phase * 2 * .pi) }
    private func envelope(_ phase: CGFloat) -> CGFloat { min(1, phase / 0.16, (1 - phase) / 0.31) }

    private func wash(_ color: Color, opacity: Double, in context: GraphicsContext) {
        context.fill(rectangle(area.insetBy(dx: 0.10, dy: 0.10)), with: .color(color.opacity(opacity)))
        context.fill(rectangle(area.insetBy(dx: 0.25, dy: 0.25)), with: .color(color.opacity(opacity)))
    }

    private func ribbon(_ tint: Color, light: Color, width: CGFloat = 0.032, in context: GraphicsContext) {
        let rim = area.insetBy(dx: 0.085, dy: 0.085)
        glow(rectangle(rim), tint: tint, light: tint, width: width, alpha: 0.58, in: context)
        for index in 0..<3 {
            let phase = time / 3.2 + CGFloat(index) / 3
            let braid = trace(steps: 34) { step in
                let inset = 0.07 + 0.045 * sin(step * 9 - time * 2.4 + CGFloat(index))
                return edgePosition(phase + step * 0.15, in: rim.insetBy(dx: inset, dy: inset))
            }
            glow(braid, tint: tint, light: light, width: 0.018, alpha: 0.42, in: context)
        }
    }

    private func glow(_ shape: Path, tint: Color, light: Color, width: CGFloat, alpha: Double,
                      in context: GraphicsContext) {
        let line = max(0.65, unit * width)
        context.stroke(shape, with: .color(tint.opacity(alpha * 0.19)),
                       style: StrokeStyle(lineWidth: line * 4.5, lineCap: .round, lineJoin: .round))
        context.stroke(shape, with: .color(tint.opacity(alpha * 0.43)),
                       style: StrokeStyle(lineWidth: line * 2.1, lineCap: .round, lineJoin: .round))
        context.stroke(shape, with: .color(light.opacity(alpha)),
                       style: StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round))
    }
}
