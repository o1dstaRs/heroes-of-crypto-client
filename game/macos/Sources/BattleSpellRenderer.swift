import JavaScriptCore
import OSLog
import SwiftUI

/// Runs the same spell effects as the browser, with Canvas drawing their recorded display list.
@MainActor
final class BattleSpellRenderer {
    struct Layer {
        let depth: CGFloat
        let commands: [Float]
        var wall = false
    }

    struct Frame {
        let layers: [Layer]
        let lights: [Float]
        let mirrors: [Mirror]
    }

    struct Mirror {
        let from: CGPoint
        let to: CGPoint
        let age: TimeInterval
    }

    private struct Scheduled {
        enum Effect {
            case cast(BattleDamageCast)
            case crossing(BattleFireTraversal)
        }

        let effect: Effect
        let playbackStart: Date
        var sent = false

        var starts: Date {
            switch effect {
            case let .cast(cast): playbackStart.addingTimeInterval(cast.start)
            case let .crossing(move): playbackStart.addingTimeInterval(move.start)
            }
        }

        var ends: Date {
            switch effect {
            case let .cast(cast): playbackStart.addingTimeInterval(cast.ends)
            case let .crossing(move): playbackStart.addingTimeInterval(move.ends)
            }
        }
    }

    private struct Material {
        let bytes: Data
        let image: CGImage
        let isWhite: Bool
    }

    private static let log = Logger(subsystem: "io.heroesofcrypto.skirmish", category: "SpellRenderer")
    private let atlases = Dictionary(uniqueKeysWithValues: (BattleDamageSpellRules.bundled?.atlases ?? []).map { ($0.id, $0) })
    private var context: JSContext?
    private var api: JSValue?
    private var activated = false
    private var materials: [Int: Material] = [:]
    private var tinted: [UInt64: CGImage] = [:]
    private var playbackStart: Date?
    private var scheduled: [Scheduled] = []
    private var projectedTo: CGRect?
    private var activeWalls: [BattleTerrainTile] = []
    private var wallDecay: Date?
    private var hadStunStars = false

    func prewarm() {
        for atlas in BattleDamageSpellRules.bundled?.atlases ?? [] { BattlefieldAtlas.prefetch(atlas.resource, combat: true) }
        prepare()
    }

    func drawStunStars(_ flags: [Int: CGPoint], cell: CGFloat, seconds: TimeInterval, in context: GraphicsContext) {
        guard !flags.isEmpty || hadStunStars else { return }
        hadStunStars = !flags.isEmpty
        prepare()
        let units = flags.keys.sorted().compactMap { id in
            flags[id].map { ["id": CGFloat(id), "x": $0.x, "y": $0.y] }
        }
        guard let buffer = api?.invokeMethod("drawStunStars", withArguments: [seconds * 1000, cell, units]) else { return }
        draw(Layer(depth: 0, commands: copyBuffer(buffer)), in: context)
    }

    func frame(playback: BattlePlayback, battle: BattleView, projection: BattlefieldProjection, now: Date) -> Frame? {
        if playbackStart != playback.started {
            playbackStart = playback.started
            if playback.resetsCombatCues { clear() }
            for action in playback.actions {
                if let cast = action.damageCast, cast.spell != .fireWall {
                    scheduled.append(Scheduled(effect: .cast(cast), playbackStart: playback.started))
                }
                if let move = action.fireTraversal {
                    scheduled.append(Scheduled(effect: .crossing(move), playbackStart: playback.started))
                }
            }
        }
        scheduled.removeAll { $0.ends <= now }
        let revealed = (battle.fireTiles ?? []).filter { tile in
            guard let transition = playback.fireTransitions[tile.cell], transition.ignites else { return true }
            return now >= transition.started
        }
        let burning = revealed + activeWalls.filter { tile in
            guard let transition = playback.fireTransitions[tile.cell], !transition.ignites else { return false }
            return now < transition.started
        }
        if burning.isEmpty && activeWalls.isEmpty && scheduled.isEmpty && (wallDecay ?? .distantPast) <= now { return nil }
        prepare()
        guard let api else { return nil }

        if projectedTo != projection.artworkRect {
            resetRenderer()
            projectedTo = projection.artworkRect
            for index in scheduled.indices { scheduled[index].sent = false }
        }
        if burning != activeWalls {
            if burning.count < activeWalls.count { wallDecay = now.addingTimeInterval(0.5) }
            activeWalls = burning
            let cells = burning.map { tile -> [String: Any] in
                let metrics = projection.terrainMetrics(tile.cell)
                return ["x": tile.cell.x, "y": tile.cell.y, "l": tile.laps,
                        "world": ["x": metrics.center.x, "y": -metrics.center.y,
                                  "width": metrics.width, "height": metrics.height,
                                  "cellSize": metrics.cellSize, "depthY": -projection.terrainDepth(tile.cell)]]
            }
            api.invokeMethod("setWalls", withArguments: [cells, projection.spriteCellSize, now.timeIntervalSince1970 * 1000])
        }

        for index in scheduled.indices where !scheduled[index].sent && scheduled[index].starts <= now {
            let event = scheduled[index]
            let payload = project(event, onto: projection)
            api.invokeMethod("begin", withArguments: [payload])
            scheduled[index].sent = true
        }
        var burningBodies: [String: [String: CGFloat]] = [:]
        let elapsed = now.timeIntervalSince(playback.started)
        for event in scheduled where event.sent {
            guard case let .crossing(move) = event.effect, let stack = battle.stacks.first(where: { $0.id == move.actor }) else { continue }
            let position = playback.logicalPosition(stack, at: elapsed)
            let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: false)
            let pose = playback.pose(for: stack, elapsed: elapsed, idleTime: 0, fallen: false)
            let center = spriteAnchor(stack, position: position, facing: facing, projection: projection, pose: pose, x: 0.5, y: 0.5)
            burningBodies[String(move.actor)] = ["x": center.x, "y": -center.y]
        }
        guard let value = api.invokeMethod("render", withArguments: [now.timeIntervalSince1970 * 1000, burningBodies]), value.isObject,
              let layers = value.forProperty("layers"), let count = layers.forProperty("length")?.toInt32(), count >= 0 else { return nil }
        let display = (0..<Int(count)).compactMap { index -> Layer? in
            guard let layer = layers.atIndex(index), let data = layer.forProperty("commands"),
                  let z = layer.forProperty("depth")?.toDouble() else { return nil }
            let commands: [Float] = copyBuffer(data)
            return commands.isEmpty ? nil : Layer(depth: z, commands: commands, wall: layer.forProperty("wall")?.toBool() == true)
        }
        let lights: [Float] = value.forProperty("lights").map { copyBuffer($0) } ?? []
        let mirrors = scheduled.flatMap { event -> [Mirror] in
            guard case let .cast(cast) = event.effect, !cast.mirrors.isEmpty else { return [] }
            let age = now.timeIntervalSince(event.playbackStart) - cast.impact
            guard age >= 0 && age < 0.44 else { return [] }
            @MainActor func body(_ stack: Stack) -> CGPoint {
                spriteAnchor(stack, position: BattlefieldProjection.logicalCenter(stack.cells),
                             facing: stack.team == .player ? 1 : -1, projection: projection,
                             pose: CreaturePose(action: .idle, time: 0), x: 0.5, y: 0.5)
            }
            return cast.mirrors.map { Mirror(from: body($0), to: body(cast.actor), age: age) }
        }
        return Frame(layers: display, lights: lights, mirrors: mirrors)
    }

    private func prepare() {
        guard !activated else { return }
        activated = true
        guard let url = Bundle.main.url(forResource: "damage-spells", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8), let context = JSContext() else { return }
        self.context = context
        context.exceptionHandler = { _, error in
            if let message = error?.toString() { Self.log.error("\(message, privacy: .public)") }
        }
        context.evaluateScript(script)
        guard let api = context.objectForKeyedSubscript("hocSpellEffects"), api.isObject,
              let pixels = api.forProperty("materialPixels"), let count = pixels.forProperty("length")?.toInt32(), count > 0 else { return }
        self.api = api
        for index in 0..<Int(count) {
            guard let value = pixels.atIndex(index) else { continue }
            let bytes: [UInt8] = copyBuffer(value)
            let data = Data(bytes)
            guard let image = Self.materialImage(data) else { continue }
            let white = stride(from: 0, to: bytes.count, by: 4).allSatisfy {
                bytes[$0] == 255 && bytes[$0 + 1] == 255 && bytes[$0 + 2] == 255
            }
            materials[index + 1] = Material(bytes: data, image: image, isWhite: white)
        }
    }

    private func clear() {
        scheduled = []
        projectedTo = nil
        resetRenderer()
    }

    private func resetRenderer() {
        api?.invokeMethod("clear", withArguments: [])
        activeWalls = []
        wallDecay = nil
    }

    private func copyBuffer<T>(_ value: JSValue) -> [T] {
        guard let context, let object = value.jsValueRef else { return [] }
        let length = JSObjectGetTypedArrayLength(context.jsGlobalContextRef, object, nil)
        guard length > 0, let bytes = JSObjectGetTypedArrayBytesPtr(context.jsGlobalContextRef, object, nil) else { return [] }
        return Array(UnsafeBufferPointer(start: bytes.assumingMemoryBound(to: T.self), count: length))
    }

    private func project(_ event: Scheduled, onto projection: BattlefieldProjection) -> [String: Any] {
        let size = projection.spriteCellSize
        func coords(_ point: CGPoint) -> [String: CGFloat] { ["x": point.x, "y": -point.y] }
        let start = event.starts.timeIntervalSince1970 * 1000
        if case let .crossing(move) = event.effect {
            let cells = move.cells.map { cell in
                ["cell": ["x": CGFloat(cell.x), "y": CGFloat(cell.y)], "center": coords(projection.center([cell]))]
            }
            return ["kind": "Fire Wall Crossing", "start": start, "size": size, "flying": move.flying, "actor": move.actor,
                    "moveDuration": move.arrival - move.start, "speed": move.speed, "crossings": cells,
                    "path": move.path.map { ["x": $0.x, "y": $0.y] }]
        }
        guard case let .cast(cast) = event.effect else { return [:] }
        func footprint(_ cells: [Cell], padding: Int32 = 0) -> [String: Any] {
            guard let x1 = cells.map(\.x).min(), let x2 = cells.map(\.x).max(),
                  let y1 = cells.map(\.y).min(), let y2 = cells.map(\.y).max() else { return [:] }
            let bounds = projection.quad(centerX: CGFloat(x1 + x2 + 1) / 2, centerY: CGFloat(y1 + y2 + 1) / 2,
                                         width: CGFloat(x2 - x1 + 1 + 2 * padding),
                                         height: CGFloat(y2 - y1 + 1 + 2 * padding)).bounds
            return ["center": coords(CGPoint(x: bounds.midX, y: bounds.midY)), "width": bounds.width, "height": bounds.height]
        }
        let targetCells = cast.target?.cells ?? cast.centreCell.map { [$0] } ?? []
        let facing: CGFloat = if let destination = cast.destination, abs(destination.x - cast.origin.x) > 0.03 {
            destination.x > cast.origin.x ? 1 : -1
        } else { cast.actor.team == .player ? 1 : -1 }
        let origin = spriteAnchor(cast.actor, position: cast.origin, facing: facing, projection: projection,
                                  pose: CreaturePose(action: .cast, time: cast.start - cast.poseStart, verticalAttack: cast.direction),
                                  x: cast.actor.name == "Battle Mage" ? 0.67 : 0.5, y: cast.actor.name == "Battle Mage" ? 0.37 : 0.5)
        var payload: [String: Any] = ["kind": cast.spell.rawValue, "size": size,
                                      "start": start, "from": coords(origin)]
        if let flight = cast.flight { payload["flight"] = flight }
        switch cast.spell {
        case .fireStrike, .fireball, .lightningStrike:
            if let victim = cast.target {
                let position = BattlefieldProjection.logicalCenter(victim.cells)
                let point = spriteAnchor(victim, position: position, facing: victim.team == .player ? 1 : -1,
                                         projection: projection, pose: CreaturePose(action: .idle, time: 0),
                                         x: 0.5, y: cast.spell == .lightningStrike ? 0.5 : 0.45)
                payload["to"] = coords(point)
                let centre = projection.center(victim.cells)
                payload["ground"] = ["center": coords(centre), "width": size, "height": size * 0.65]
            } else if let destination = cast.destination {
                payload["to"] = coords(projection.point(x: destination.x, y: destination.y))
            }
            if cast.spell == .fireball, let centre = cast.centreCell {
                payload["ground"] = footprint([centre])
                payload["area"] = footprint([centre], padding: 1)
            }
            if cast.spell == .fireStrike, let release = cast.release, release > cast.start {
                payload["handDuration"] = (release - cast.start) * 1000
                payload["hand"] = (0..<12).map { index in
                    let t = cast.start - cast.poseStart + Double(index) / 11 * (release - cast.start)
                    return coords(spriteAnchor(cast.actor, position: cast.origin, facing: facing, projection: projection,
                                               pose: CreaturePose(action: .cast, time: t, verticalAttack: cast.direction),
                                               x: cast.actor.name == "Battle Mage" ? 0.67 : 0.5,
                                               y: cast.actor.name == "Battle Mage" ? 0.37 : 0.5))
                }
            }
        case .ringOfFire:
            payload["ground"] = footprint(targetCells)
            payload["area"] = footprint(targetCells, padding: 1)
        case .meteorShower, .meteorite:
            payload["cells"] = cast.area.map { footprint([$0]) }
        case .fireWall: break
        }
        return payload
    }

    private func spriteAnchor(_ stack: Stack, position: CGPoint, facing: CGFloat, projection: BattlefieldProjection,
                              pose: CreaturePose, x: CGFloat, y: CGFloat) -> CGPoint {
        let body = CreatureAnimation.boardPresentation(stack, position: position, projection: projection, facing: facing)
        guard let frame = CreatureAnimation.frame(stack.name, pose: pose, inBackground: true) else {
            return CGPoint(x: body.ground.x + (x - 0.5) * body.height * facing, y: body.ground.y - body.height * (1 - y))
        }
        let height = body.height * frame.heightScale
        let width = height * CGFloat(frame.image.width) / CGFloat(frame.image.height) * body.widthScale * frame.widthRatio
        return CGPoint(x: body.ground.x + (x - frame.anchorX) * width * facing,
                       y: body.ground.y + (y - frame.foot) * height)
    }

    func draw(_ layer: Layer, in canvas: GraphicsContext) {
        let list = layer.commands
        var offset = 0
        while offset + 10 < list.count {
            let type = Int(list[offset])
            let value = { (index: Int) in CGFloat(list[offset + index]) }
            let color = UInt32(list[offset + 3])
            var context = canvas
            context.opacity *= Double(list[offset + 1])
            if list[offset + 2] == 1 { context.blendMode = .plusLighter }
            if list[offset + 4] > 0 { context.addFilter(.blur(radius: value(4))) }
            context.concatenate(CGAffineTransform(a: value(5), b: value(6), c: value(7), d: value(8), tx: value(9), ty: value(10)))

            switch type {
            case 0:
                guard offset + 16 < list.count else { return }
                let key = Int(list[offset + 11]), frame = Int(list[offset + 12])
                let rect = CGRect(x: value(13), y: value(14), width: value(15), height: value(16))
                drawTexture(key, frame: frame, color: color, rect: rect, in: context)
                offset += 17
            case 1:
                guard offset + 12 < list.count else { return }
                let width = value(11), count = Int(list[offset + 12])
                guard count >= 4, count.isMultiple(of: 2), offset + 13 + count <= list.count else { return }
                var path = Path()
                path.move(to: CGPoint(x: value(13), y: value(14)))
                for point in stride(from: 15, to: 13 + count, by: 2) {
                    path.addLine(to: CGPoint(x: value(point), y: value(point + 1)))
                }
                if width > 0 {
                    context.stroke(path, with: .color(BattlePalette.color(color)),
                                   style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
                } else {
                    path.closeSubpath()
                    context.fill(path, with: .color(BattlePalette.color(color)))
                }
                offset += 13 + count
            case 2:
                guard offset + 13 < list.count else { return }
                let radius = value(13)
                let rect = CGRect(x: value(11) - radius, y: value(12) - radius, width: radius * 2, height: radius * 2)
                context.fill(Path(ellipseIn: rect), with: .color(BattlePalette.color(color)))
                offset += 14
            default: return
            }
        }
    }

    func drawLights(_ samples: [Float], in canvas: GraphicsContext) {
        for offset in stride(from: 0, to: samples.count, by: 6) where offset + 5 < samples.count {
            let light = Double(samples[offset + 4]), cool = Double(samples[offset + 5])
            guard light > 0 else { continue }
            var context = canvas
            context.blendMode = .plusLighter
            context.translateBy(x: CGFloat(samples[offset]), y: CGFloat(samples[offset + 1]))
            context.scaleBy(x: CGFloat(samples[offset + 2]), y: CGFloat(samples[offset + 3]))
            let tint = Color(red: 1 - cool * 0.75, green: 0.34 + cool * 0.31, blue: 0.065 + cool * 0.935)
            let strength = min(0.52, light * 0.32)
            let glow = Path(ellipseIn: CGRect(x: -1, y: -1, width: 2, height: 2))
            context.fill(glow, with: .radialGradient(Gradient(colors: [tint.opacity(strength), tint.opacity(strength * 0.36), .clear]),
                                                     center: .zero, startRadius: 0.15, endRadius: 1))
        }
    }

    func drawMirror(_ mirror: Mirror, size: CGFloat, in canvas: GraphicsContext) {
        let dx = mirror.to.x - mirror.from.x, dy = mirror.to.y - mirror.from.y
        let distance = max(1, hypot(dx, dy))
        let ux = dx / distance, uy = dy / distance
        let glass = BattlePalette.color(0x9fe8ff), rim = BattlePalette.color(0xe8fbff)
        var context = canvas
        context.blendMode = .plusLighter
        if mirror.age < 0.42 {
            let progress = mirror.age / 0.42
            let opening = min(1, progress / 0.25)
            let fade = min(1, (1 - progress) / 0.55)
            let w = size * 0.52 * opening, h = size * 0.2 * opening
            var pane = context
            pane.translateBy(x: mirror.from.x + ux * size * 0.42, y: mirror.from.y + uy * size * 0.42)
            pane.rotate(by: .radians(atan2(uy, ux) + .pi / 2))
            let frame = Path(ellipseIn: CGRect(x: -w, y: -h, width: w * 2, height: h * 2))
            pane.fill(frame, with: .color(glass.opacity(0.3 * fade)))
            pane.stroke(frame, with: .color(rim.opacity(0.95 * fade)), lineWidth: size * 0.05)
            let streak = Path { path in
                path.move(to: CGPoint(x: -w * 0.55, y: -h * 0.5))
                path.addLine(to: CGPoint(x: w * 0.55, y: h * 0.5))
            }
            pane.stroke(streak, with: .color(rim.opacity(0.75 * fade)), lineWidth: size * 0.03)
        }
        guard mirror.age >= 0.1 else { return }
        let progress = (mirror.age - 0.1) / 0.34
        let travel = 1 - (1 - progress) * (1 - progress)
        let fade = min(1, (1 - progress) / 0.3)
        let head = CGPoint(x: mirror.from.x + dx * travel, y: mirror.from.y + dy * travel)
        let tail = min(distance * travel, size * 1.15)
        let shaft = Path { path in
            path.move(to: CGPoint(x: head.x - ux * tail, y: head.y - uy * tail))
            path.addLine(to: head)
        }
        context.stroke(shaft, with: .color(glass.opacity(0.32 * fade)), style: StrokeStyle(lineWidth: size * 0.14, lineCap: .round))
        context.stroke(shaft, with: .color(BattlePalette.color(0xd6f4ff).opacity(0.95 * fade)),
                       style: StrokeStyle(lineWidth: size * 0.05, lineCap: .round))
        let radius = size * 0.09 * (0.7 + 0.3 * fade)
        context.fill(Path(ellipseIn: CGRect(x: head.x - radius, y: head.y - radius, width: radius * 2, height: radius * 2)),
                     with: .color(rim.opacity(0.9 * fade)))
    }

    private func drawTexture(_ key: Int, frame: Int, color: UInt32, rect: CGRect, in context: GraphicsContext) {
        if let atlas = atlases[key] {
            if let image = BattlefieldAtlas.frame(atlas.resource, columns: atlas.cols, rows: atlas.rows, index: frame,
                                                  inBackground: true, combat: true) {
                context.draw(Image(decorative: image, scale: 1), in: rect)
            }
            return
        }
        guard let material = materials[key] else { return }
        let image = color == 0xffffff || material.isWhite ? material.image : tintedImage(material, key: key, color: color)
        var resolved = context.resolve(Image(decorative: image, scale: 1))
        if material.isWhite && color != 0xffffff { resolved.shading = .color(BattlePalette.color(color)) }
        context.draw(resolved, in: rect)
    }

    private func tintedImage(_ material: Material, key: Int, color: UInt32) -> CGImage {
        let cacheKey = UInt64(key) << 24 | UInt64(color)
        if let image = tinted[cacheKey] { return image }
        let red = Int((color >> 16) & 255), green = Int((color >> 8) & 255), blue = Int(color & 255)
        var data = material.bytes
        data.withUnsafeMutableBytes { buffer in
            let pixels = buffer.bindMemory(to: UInt8.self)
            for i in stride(from: 0, to: pixels.count, by: 4) {
                pixels[i] = UInt8(Int(pixels[i]) * red / 255)
                pixels[i + 1] = UInt8(Int(pixels[i + 1]) * green / 255)
                pixels[i + 2] = UInt8(Int(pixels[i + 2]) * blue / 255)
            }
        }
        guard let image = Self.materialImage(data) else { return material.image }
        if tinted.count >= 512 { tinted.removeAll(keepingCapacity: true) }
        tinted[cacheKey] = image
        return image
    }

    private static func materialImage(_ data: Data) -> CGImage? {
        let size = 64
        guard data.count == size * size * 4, let provider = CGDataProvider(data: data as CFData),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                       space: space, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
