import SwiftUI

/// Updates battlefield art with one display-paced draw. Hit testing stays in the SwiftUI controls.
struct BattlefieldSprites: View {
    let battle: BattleView
    let playback: BattlePlayback
    let projection: BattlefieldProjection
    let animating: Bool
    let dragged: Int?
    let dragPoint: CGPoint?
    let ghost: BattlefieldGhost?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appearsActive) private var appearsActive
    @Environment(\.displayScale) private var displayScale
    @State private var idleStarted = Date()
    @State private var lastFrames = FrameHistory()

    @MainActor
    private final class FrameHistory {
        var frames: [Int: (creature: String, frame: CreatureAnimation.Frame)] = [:]
        var idleStarts: [Int: (creature: String, started: Date, phase: TimeInterval)] = [:]
        private var shieldPlayback: Date?
        private var dissolves: [Int: BattleWaterShieldBreak] = [:]

        func shieldBreaks(for playback: BattlePlayback, at now: Date) -> [Int: BattleWaterShieldBreak] {
            if playback.started != shieldPlayback {
                shieldPlayback = playback.started
                if playback.resetsCombatCues { dissolves.removeAll() }
                for burst in playback.waterShieldBreaks { dissolves[burst.stack.id] = burst }
            }
            dissolves = dissolves.filter { now.timeIntervalSince($0.value.started) < $0.value.duration }
            return dissolves
        }

        func idleTime(for stack: Stack, at time: Date, resumed: Date?) -> TimeInterval {
            if idleStarts[stack.id]?.creature != stack.name {
                let ordinal = idleStarts.values.filter { $0.creature == stack.name }.count
                idleStarts[stack.id] = (stack.name, time, Double(ordinal) * CreatureAnimation.duplicateIdleSpacing)
            }
            guard let idle = idleStarts[stack.id] else { return 0 }
            return max(0, time.timeIntervalSince(resumed ?? idle.started)) + idle.phase
        }
    }

    var body: some View {
        let interval = 1.0 / (animating ? 60 : 30)
        let paused = reduceMotion || !appearsActive || battle.stacks.isEmpty && playback.fallen.isEmpty
        return TimelineView(.animation(minimumInterval: interval, paused: paused)) { timeline in
            // A completed asynchronous atlas load must also repaint a paused view.
            let _ = paused || ghost != nil ? BattlefieldAtlas.availability.revision : 0
            let elapsed = max(0, timeline.date.timeIntervalSince(playback.started))
            let idle = reduceMotion ? 0 : max(0, timeline.date.timeIntervalSince(idleStarted))
            Canvas { context, _ in
                draw(context, at: timeline.date, elapsed: elapsed, idle: idle)
            }
        }
        .overlay { BattleCombatOverlay(playback: playback, projection: projection) }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: battle.stacks.map(\.id)) {
            let retained = Set(battle.stacks.map(\.id) + playback.fallen.map(\.id))
            lastFrames.frames = lastFrames.frames.filter { retained.contains($0.key) }
            lastFrames.idleStarts = lastFrames.idleStarts.filter { retained.contains($0.key) }
        }
    }

    private struct Item {
        let depth: CGFloat
        let draw: (GraphicsContext) -> Void
    }

    private func draw(_ context: GraphicsContext, at now: Date, elapsed: TimeInterval, idle: TimeInterval) {
        if animating && !reduceMotion { drawActionGuides(elapsed: elapsed, in: context) }
        let shieldBreaks = reduceMotion ? [:] : lastFrames.shieldBreaks(for: playback, at: now)
        let figures = (battle.stacks + (reduceMotion ? [] : playback.fallen)).compactMap { stack -> Item? in
            let fallen = playback.fallen.contains { $0.id == stack.id }
            if fallen, let reaction = playback.reactions[stack.id], elapsed >= reaction.start + reaction.duration { return nil }
            if fallen && playback.reactions[stack.id] == nil { return nil }
            let center = BattlefieldProjection.logicalCenter(stack.cells)
            let origin = dragged == stack.id ? dragPoint ?? center :
                reduceMotion ? center : playback.logicalPosition(stack, at: elapsed)
            let idleTime = reduceMotion ? 0 : lastFrames.idleTime(for: stack, at: now, resumed: playback.idleResumes[stack.id])
            let shielded = (!fallen && stack.hasWaterShield) || (shieldBreaks[stack.id]?.started ?? .distantPast) > now
            return Item(depth: projection.point(x: origin.x, y: origin.y).y) { context in
                draw(stack, at: origin, in: context, elapsed: elapsed, idleTime: idleTime, flagTime: idle, fallen: fallen,
                     shielded: shielded)
            }
        }
        let stones = battle.stones.map { cell in
            let rect = projection.barrelFrame(for: cell)
            return Item(depth: rect.maxY) { context in
                if let art = BattleResources.stone(cell, fighting: battle.started) {
                    context.draw(Image(decorative: art, scale: 1), in: rect)
                } else {
                    context.draw(Image(systemName: "mountain.2.fill"), in: rect)
                }
            }
        }
        let dissolves = shieldBreaks.values.compactMap { burst -> Item? in
            let age = now.timeIntervalSince(burst.started)
            guard age >= 0 else { return nil }
            let depth = projection.point(x: burst.position.x, y: burst.position.y).y
            return Item(depth: depth + 0.1) { context in
                BattleWaterShield.dissolve(burst, age: age, time: idle, projection: projection, in: context)
            }
        }
        for item in (stones + figures + dissolves).sorted(by: { $0.depth < $1.depth }) { item.draw(context) }
        if let ghost { drawGhost(ghost, in: context) }
        if !reduceMotion { drawActionEffects(elapsed: elapsed, in: context) }
    }

    private func drawGhost(_ preview: BattlefieldGhost, in canvas: GraphicsContext) {
        guard let frame = CreatureAnimation.frame(preview.name, pose: CreaturePose(action: .idle, time: 0),
                                                  inBackground: true) else { return }
        let position = BattlefieldProjection.logicalCenter(preview.footprint.cells(at: preview.anchor))
        let facing: CGFloat = preview.team == .player ? 1 : -1
        let presentation = CreatureAnimation.boardPresentation(preview.name, footprint: preview.footprint,
                                                               position: position, projection: projection, facing: facing)
        var context = canvas
        context.opacity *= 0.62
        drawSprite(frame, art: frame.image, presentation: presentation, facing: facing, in: context)
    }

    private func draw(_ stack: Stack, at position: CGPoint, in canvas: GraphicsContext, elapsed: TimeInterval,
                      idleTime: TimeInterval, flagTime: TimeInterval, fallen: Bool, shielded: Bool) {
        let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
        let presentation = CreatureAnimation.boardPresentation(stack, position: position, projection: projection,
                                                               facing: facing)
        let ground = presentation.ground
        let size = presentation.height
        let resting = CreaturePose(action: .idle, time: idleTime)
        let pose = reduceMotion ? resting : playback.pose(for: stack, elapsed: elapsed, idleTime: idleTime, fallen: fallen)
        let sprite: CreatureAnimation.Frame?
        if let frame = CreatureAnimation.frame(stack.name, pose: pose, inBackground: true) {
            lastFrames.frames[stack.id] = (stack.name, frame)
            sprite = frame
        } else if let last = lastFrames.frames[stack.id], last.creature == stack.name {
            sprite = last.frame
        } else {
            sprite = pose.action == .idle ? nil : CreatureAnimation.frame(stack.name, pose: resting, inBackground: true)
        }
        var context = canvas
        if !reduceMotion { context.opacity *= playback.spawnOpacity(for: stack, elapsed: elapsed) }

        let shadow = CGRect(x: ground.x - size * 0.24, y: ground.y - size * 0.044,
                            width: size * 0.48, height: size * 0.17)
        context.fill(Path(ellipseIn: shadow), with: .radialGradient(Gradient(colors: [.black.opacity(0.72), .clear]),
                         center: CGPoint(x: shadow.midX, y: shadow.midY), startRadius: 0, endRadius: shadow.width / 2))
        var figure = context
        if stack.statuses.contains(where: { $0.kind == .buff && $0.name == "Hidden" }) { figure.opacity *= 0.4 }
        if shielded {
            BattleWaterShield.draw(stack, at: position, presentation: presentation, facing: facing,
                                  projection: projection, time: flagTime, front: false, in: figure)
        }
        if let sprite {
            let art = if pose.action == .idle && sprite.action == .idle && stack.name == "Battle Mage",
                         let standing = BattleResources.cgImage("battle_mage") {
                reduceMotion ? standing : BattleMageIdleAppearance.image(standing, elapsed: idleTime)
            } else if sprite.action == .idle && stack.name == "Fairy" {
                FairyIdleAppearance.image(sprite.image, frame: sprite.index, elapsed: idleTime)
            } else if sprite.action == .idle && stack.name == "Nightmare" && !reduceMotion {
                NightmareIdleAppearance.image(sprite.image, elapsed: idleTime)
            } else {
                sprite.image
            }
            drawSprite(sprite, art: art, presentation: presentation, facing: facing, in: figure)
        } else if let portrait = BattleResources.cgImage(BattleResources.creature(stack.name)) {
            let width = size * CGFloat(portrait.width) / CGFloat(portrait.height) * presentation.widthScale
            drawImage(portrait, at: ground, width: width, height: size, anchorX: 0.5, foot: 0.93,
                      facing: facing, in: figure)
        } else {
            context.draw(Text(String(stack.name.prefix(1))).font(BattleResources.display(size * 0.34))
                .foregroundStyle(BattlePalette.team(stack.team)), at: ground)
        }
        if shielded {
            BattleWaterShield.draw(stack, at: position, presentation: presentation, facing: facing,
                                  projection: projection, time: flagTime, front: true, in: figure)
        }
        let impactTime = playback.impactTime(for: stack)
        if !fallen || elapsed < impactTime {
            let amount = !reduceMotion && elapsed < impactTime
                ? playback.previousAmounts[stack.id] ?? stack.amount : stack.amount
            let height = max(9, projection.spriteCellSize * 0.20)
            let center = CreatureAnimation.flagPosition(for: stack.name, presentation: presentation,
                                                        projection: projection, facing: facing, height: height)
            let status = playback.flagStatus(for: stack, elapsed: elapsed, now: Date(), reducedMotion: reduceMotion)
            BattleStackFlag.draw(amount: amount, team: stack.team, id: stack.id, active: !animating && stack.id == battle.active,
                                 status: status, time: flagTime, animateCloth: !reduceMotion, cellSize: projection.spriteCellSize,
                                 pixelWidth: 1 / displayScale,
                                 at: center, in: context)
        }
    }

    private func drawSprite(_ sprite: CreatureAnimation.Frame, art: CGImage, presentation: CreatureBoardPresentation,
                            facing: CGFloat, in context: GraphicsContext) {
        let height = presentation.height * sprite.heightScale
        let width = height * CGFloat(sprite.image.width) / CGFloat(sprite.image.height) * presentation.widthScale * sprite.widthRatio
        drawImage(art, at: presentation.ground, width: width, height: height, anchorX: sprite.anchorX,
                  foot: sprite.foot, facing: facing, trim: sprite.trim, in: context)
    }

    private func drawActionEffects(elapsed: TimeInterval, in context: GraphicsContext) {
        for action in playback.actions {
            if let from = action.attackPosition, let target = action.target, let through = action.skewerContact {
                drawSkewerLight(from: from, target: target, through: through, age: elapsed - action.impact, in: context)
            }
            if let splash = action.moment.splash, let impact = action.projectile?.impact,
               let image = impact.image(at: elapsed - action.impact, inBackground: true) {
                let ground = projection.center([splash.center])
                let rowWidth = projection.tile(splash.center).bounds.width
                let width = rowWidth * (splash.single ? 1 : impact.footprint) / impact.paintedFraction
                let rect = CGRect(x: ground.x - width / 2, y: ground.y - width / 2, width: width, height: width)
                context.draw(Image(decorative: image, scale: 1).interpolation(.high), in: rect)
            }
            guard let release = action.release, (release..<action.impact).contains(elapsed),
                  let from = action.attackPosition, let to = action.target else { continue }
            let fromPoint = projection.point(x: from.x, y: from.y)
            let toPoint = projection.point(x: to.x, y: to.y)
            let dx = toPoint.x - fromPoint.x
            let dy = toPoint.y - fromPoint.y
            let flightTime = elapsed - release
            let phase = CGFloat(flightTime / (action.impact - release))
            let cellSize = projection.spriteCellSize
            let arc = (action.projectile?.arcCells ?? 0) * 4 * phase * (1 - phase)
            let height = action.moment.splash == nil ? 0.48 : 0.48 * (1 - phase)
            let point = CGPoint(x: fromPoint.x + dx * phase, y: fromPoint.y + dy * phase - cellSize * (height + arc))
            if let projectile = action.projectile, let image = projectile.image(at: flightTime, inBackground: true) {
                let width = cellSize * projectile.widthCells
                let height = width * CGFloat(image.height) / CGFloat(image.width)
                let heading = projectile.directional == true ? Double(atan2(dy, dx)) : 0
                let spin = (projectile.spin ?? 0) * flightTime * (dx < 0 ? -1 : 1)
                var sprite = context
                sprite.translateBy(x: point.x, y: point.y)
                sprite.rotate(by: .radians(heading + spin))
                let rect = CGRect(x: -width * (projectile.anchor?.x ?? 0.5), y: -height * (projectile.anchor?.y ?? 0.5),
                                  width: width, height: height)
                sprite.draw(Image(decorative: image, scale: 1).interpolation(.high), in: rect)
            } else {
                let length = max(1, hypot(dx, dy))
                let shaft = min(cellSize * 0.37, phase * length)
                let trail = Path { path in
                    path.move(to: CGPoint(x: point.x - shaft * dx / length, y: point.y - shaft * dy / length))
                    path.addLine(to: point)
                }
                context.stroke(trail, with: .color(.black.opacity(0.70)), lineWidth: 3)
                context.stroke(trail, with: .color(BattlePalette.parchment), lineWidth: 1.4)
            }
        }
    }

    private func drawActionGuides(elapsed: TimeInterval, in context: GraphicsContext) {
        let holes = Set(battle.holes)
        for action in playback.actions {
            if (action.start..<action.moveEnd).contains(elapsed), let anchor = action.route.last,
               let stack = battle.stacks.first(where: { $0.id == action.moment.actor }),
               stack.footprint != .single {
                BattlefieldGuides.landing(stack.footprint.cells(at: anchor), projection: projection, in: context)
            }
            if let splash = action.moment.splash {
                let time = elapsed - action.impact
                let hold = action.projectile?.impact?.duration ?? 0.20
                if (0..<hold).contains(time) {
                    BattlefieldGuides.splash(splash.cells(size: battle.size, excluding: holes), center: splash.center,
                                             opacity: 1 - time / hold, projection: projection, in: context)
                }
            }
        }
    }

    private func drawSkewerLight(from: CGPoint, target: CGPoint, through: CGPoint, age: TimeInterval,
                                 in canvas: GraphicsContext) {
        let travel = 0.19
        let fade = 0.15
        guard age >= 0, age < travel + fade else { return }
        let cell = projection.spriteCellSize
        let waypoints = [from, target, through].map { logical in
            let ground = projection.point(x: logical.x, y: logical.y)
            return CGPoint(x: ground.x, y: ground.y - cell * 0.48)
        }
        let first = hypot(waypoints[1].x - waypoints[0].x, waypoints[1].y - waypoints[0].y)
        let second = hypot(waypoints[2].x - waypoints[1].x, waypoints[2].y - waypoints[1].y)
        guard first > 0, second > 0 else { return }
        let progress = min(1, age / travel)
        let lead = (1 - pow(1 - progress, 3)) * (first + second)
        let opacity = min(1, (travel + fade - age) / fade)
        var context = canvas
        context.blendMode = .plusLighter
        for index in (0...7).reversed() {
            let distance = lead - cell * 0.32 * CGFloat(index)
            guard distance >= 0 else { continue }
            let start = distance < first ? waypoints[0] : waypoints[1]
            let end = distance < first ? waypoints[1] : waypoints[2]
            let ratio = distance < first ? distance / first : (distance - first) / second
            let point = CGPoint(x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio)
            let strength = 1 - Double(index) / 8
            let alpha = opacity * (index == 0 ? 1 : 0.55 * strength)
            let radius = cell * 0.475 * (index == 0 ? 1 : 0.45 + 0.5 * strength)
            let disc = CGRect(x: point.x - radius, y: point.y - radius, width: 2 * radius, height: 2 * radius)
            let gradient = Gradient(stops: [
                .init(color: .white.opacity(alpha), location: 0),
                .init(color: Color(red: 0.87, green: 0.96, blue: 1).opacity(alpha * 0.85), location: 0.35),
                .init(color: .cyan.opacity(alpha * 0.32), location: 0.7),
                .init(color: .clear, location: 1),
            ])
            context.fill(Path(ellipseIn: disc), with: .radialGradient(gradient, center: point, startRadius: 0, endRadius: radius))
        }
    }

    private func drawImage(_ image: CGImage, at ground: CGPoint, width: CGFloat, height: CGFloat, anchorX: CGFloat,
                           foot: CGFloat, facing: CGFloat, trim: CGRect? = nil, in canvas: GraphicsContext) {
        var context = canvas
        context.translateBy(x: ground.x, y: ground.y)
        context.scaleBy(x: facing, y: 1)
        let crop = trim ?? CGRect(x: 0, y: 0, width: 1, height: 1)
        let rect = CGRect(x: width * (crop.minX - anchorX), y: height * (crop.minY - foot),
                          width: width * crop.width, height: height * crop.height)
        context.draw(Image(decorative: image, scale: 1).interpolation(.high), in: rect)
    }

}
