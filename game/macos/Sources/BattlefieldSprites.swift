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
    let targetTints: [Int: UInt32]
    let auras: [BattlefieldAura]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appearsActive) private var appearsActive
    @Environment(\.displayScale) private var displayScale
    @State private var idleStarted = Date()
    @State private var lastFrames = FrameHistory()
    @State private var spellRenderer = BattleSpellRenderer()
    @State private var smokeClouds = BattleSmokeClouds()

    @MainActor
    private final class FrameHistory {
        private struct AuraKey: Hashable {
            let owner: Int
            let range: CGFloat
        }

        var frames: [Int: (creature: String, frame: CreatureAnimation.Frame)] = [:]
        var idleStarts: [Int: (creature: String, started: Date, phase: TimeInterval)] = [:]
        var covenantStarts: [Int: Date] = [:]
        let abominationAura = BattlefieldAbominationAura()
        private var griffinAuras: [AuraKey: (started: Date, seen: Date)] = [:]
        private var wyvernAuras: [AuraKey: BattlefieldWyvernAura.Motion] = [:]
        private var arachnaAuras: [Int: (started: Date, seen: Date, frame: Int)] = [:]
        private var auraFrame = 0
        private var shieldPlayback: Date?
        private var dissolves: [Int: BattleWaterShieldBreak] = [:]

        func griffinAuraAge(_ aura: BattlefieldAura, at now: Date) -> TimeInterval {
            griffinAuras = griffinAuras.filter { now.timeIntervalSince($0.value.seen) <= BattlefieldGriffinAura.retention }
            let key = AuraKey(owner: aura.owner.id, range: aura.effect.range)
            let start = griffinAuras[key]?.started ?? now
            griffinAuras[key] = (start, now)
            return max(0, now.timeIntervalSince(start))
        }

        func wyvernAura(_ aura: BattlefieldAura, center: CGPoint, at now: Date) -> BattlefieldWyvernAura.Motion {
            wyvernAuras = wyvernAuras.filter { now.timeIntervalSince($0.value.seen) <= BattlefieldWyvernAura.retention }
            let key = AuraKey(owner: aura.owner.id, range: aura.effect.range)
            let motion = wyvernAuras[key] ?? BattlefieldWyvernAura.Motion(center: center, at: now)
            wyvernAuras[key] = motion
            return motion
        }

        func beginAuras() { auraFrame += 1 }

        func arachnaAuraAge(_ id: Int, at now: Date) -> TimeInterval {
            arachnaAuras = arachnaAuras.filter { now.timeIntervalSince($0.value.seen) <= 5 }
            var start = now
            if let previous = arachnaAuras[id], previous.frame >= auraFrame - 1 || now.timeIntervalSince(previous.seen) <= 0.18 {
                start = previous.started
            }
            arachnaAuras[id] = (start, now, auraFrame)
            return max(0, now.timeIntervalSince(start))
        }

        func shieldBreaks(for playback: BattlePlayback, at now: Date) -> [Int: BattleWaterShieldBreak] {
            if playback.started != shieldPlayback {
                shieldPlayback = playback.started
                if playback.resetsCombatCues { dissolves.removeAll() }
                for burst in playback.waterShieldBreaks { dissolves[burst.stack.id] = burst }
            }
            dissolves = dissolves.filter { now.timeIntervalSince($0.value.started) < $0.value.duration }
            return dissolves
        }

        func idleTiming(for stack: Stack, at time: Date, resumed: Date?) -> (time: TimeInterval, age: TimeInterval) {
            if idleStarts[stack.id]?.creature != stack.name {
                let ordinal = idleStarts.values.filter { $0.creature == stack.name }.count
                idleStarts[stack.id] = (stack.name, time, Double(ordinal) * CreatureAnimation.duplicateIdleSpacing)
            }
            guard let idle = idleStarts[stack.id] else { return (0, 0) }
            let age = max(0, time.timeIntervalSince(resumed ?? idle.started))
            return (age + idle.phase, age)
        }
    }

    @State private var expiredCombatCuesThrough = Date.distantPast

    var body: some View {
        let interval = 1.0 / (animating ? 60 : 30)
        let hasTerrainEffects = battle.fireCells?.isEmpty == false || !playback.fireTransitions.isEmpty ||
            battle.smokeTiles?.isEmpty == false || smokeClouds.isVisible
        let cueExpiry = playback.combatCues.map(\.endsAt).max() ?? .distantPast
        let quietBoard = battle.stacks.isEmpty && playback.fallen.isEmpty && !hasTerrainEffects
        let paused = !appearsActive || (reduceMotion || quietBoard) && cueExpiry <= expiredCombatCuesThrough
        return TimelineView(.animation(minimumInterval: interval, paused: paused)) { timeline in
            // A completed asynchronous atlas load must also repaint a paused view.
            let _ = paused || reduceMotion || ghost != nil ? BattlefieldAtlas.availability.revision : 0
            let elapsed = max(0, timeline.date.timeIntervalSince(playback.started))
            let idle = reduceMotion ? 0 : max(0, timeline.date.timeIntervalSince(idleStarted))
            Canvas { context, size in
                draw(context, at: timeline.date, elapsed: elapsed, idle: idle)
                BattleCombatOverlay(playback: playback, projection: projection, battle: battle, reduceMotion: reduceMotion)
                    .draw(at: timeline.date, size: size, in: context)
            }
        }
        .task(id: cueExpiry) {
            guard cueExpiry > expiredCombatCuesThrough else { return }
            do {
                try await Task.sleep(for: .seconds(max(0, cueExpiry.timeIntervalSinceNow)))
                expiredCombatCuesThrough = cueExpiry
            } catch {}
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task { if !reduceMotion { spellRenderer.prewarm() } }
        .onChange(of: battle.stacks.map(\.id)) {
            let retained = Set(battle.stacks.map(\.id) + playback.fallen.map(\.id))
            lastFrames.frames = lastFrames.frames.filter { retained.contains($0.key) }
            lastFrames.idleStarts = lastFrames.idleStarts.filter { retained.contains($0.key) }
            lastFrames.covenantStarts = lastFrames.covenantStarts.filter { retained.contains($0.key) }
        }
    }

    private struct Item {
        let depth: CGFloat
        let draw: (GraphicsContext) -> Void
    }

    private typealias TargetHighlight = (GraphicsContext) -> Void

    private func draw(_ context: GraphicsContext, at now: Date, elapsed: TimeInterval, idle: TimeInterval) {
        let pendingSmoke = reduceMotion ? [] : playback.smokeDepartures.filter { now < $0.at }.map(\.tile)
        if let smoke = smokeClouds.frame(tiles: (battle.smokeTiles ?? []) + pendingSmoke, projection: projection,
                                         now: now, scale: displayScale,
                                         reset: playback.resetsCombatCues ? playback.started : nil,
                                         reduceMotion: reduceMotion) {
            context.draw(Image(decorative: smoke.image, scale: displayScale), in: smoke.bounds)
        }
        let foregroundAuras = drawAuras(in: context, at: now, elapsed: elapsed, time: idle)
        if animating && !reduceMotion { drawActionGuides(elapsed: elapsed, in: context) }
        let shieldBreaks = reduceMotion ? [:] : lastFrames.shieldBreaks(for: playback, at: now)
        let washes = reduceMotion ? [:] : playback.statusTints(at: now)
        var stunFlags: [Int: CGPoint] = [:]
        var highlights: [TargetHighlight] = []
        let figures = (battle.stacks + (reduceMotion ? [] : playback.fallen)).compactMap { stack -> Item? in
            let fallen = playback.fallen.contains { $0.id == stack.id }
            if fallen {
                guard let reaction = playback.reactions[stack.id]?.last, elapsed < reaction.end else { return nil }
            }
            let center = BattlefieldProjection.logicalCenter(stack.cells)
            let origin = dragged == stack.id ? dragPoint ?? center :
                reduceMotion ? center : playback.logicalPosition(stack, at: elapsed)
            let timing = reduceMotion ? (0, 0) : lastFrames.idleTiming(for: stack, at: now, resumed: playback.idleResumes[stack.id])
            let shielded = (!fallen && stack.hasWaterShield) || (shieldBreaks[stack.id]?.started ?? .distantPast) > now
            let status = playback.flagStatus(for: stack, elapsed: elapsed, now: now, reducedMotion: reduceMotion)
            let presented = playback.statusStack(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
            let frozen = presented.statuses.contains { $0.kind != .buff && $0.name == "Freeze" }
            let wash: UInt32? = frozen ? 0x8ec6ff : washes[stack.id]
            return Item(depth: projection.point(x: origin.x, y: origin.y).y) { context in
                if let flag = draw(stack, at: origin, in: context, elapsed: elapsed, idleTiming: timing, flagTime: idle,
                                   fallen: fallen, shielded: shielded, status: status, statusTint: wash,
                                   now: now, highlights: &highlights),
                   !fallen, status.stunned { stunFlags[stack.id] = flag }
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
        let effects = reduceMotion ? nil : spellRenderer.frame(playback: playback, battle: battle, projection: projection, now: now)
        let flames: [Item]
        if let effects {
            for layer in effects.layers where !layer.wall && layer.depth < 4000 { spellRenderer.draw(layer, in: context) }
            flames = effects.layers.filter { $0.wall || (4000..<5000).contains($0.depth) }.map { layer in
                Item(depth: layer.depth - 4000) { spellRenderer.draw(layer, in: $0) }
            }
        } else {
            var cells = Set(battle.fireCells ?? [])
            if !reduceMotion {
                cells.formUnion(playback.fireTransitions.compactMap { cell, transition in
                    !transition.ignites && now < transition.endsAt ? cell : nil
                })
            }
            flames = cells.compactMap { cell -> Item? in
                let life = reduceMotion ? 1 : playback.fireTransitions[cell]?.opacity(at: now) ?? 1
                guard life > 0 else { return nil }
                let fire = BattleFireWall.Tile(cell, projection: projection)
                fire.drawGround(life: life, in: context)
                return Item(depth: fire.depth + 0.1) { context in fire.drawFlame(time: idle, life: life, in: context) }
            }
        }
        for item in (stones + figures + dissolves + flames + foregroundAuras).sorted(by: { $0.depth < $1.depth }) {
            item.draw(context)
        }
        if let effects {
            spellRenderer.drawLights(effects.lights, in: context)
            for layer in effects.layers where !layer.wall && layer.depth >= 5000 { spellRenderer.draw(layer, in: context) }
            for reflection in effects.mirrors { spellRenderer.drawMirror(reflection, size: projection.spriteCellSize, in: context) }
        }
        if let ghost { drawGhost(ghost, in: context) }
        if !reduceMotion { drawActionEffects(elapsed: elapsed, in: context) }
        spellRenderer.drawStunStars(reduceMotion ? [:] : stunFlags, cell: projection.spriteCellSize, seconds: idle, in: context)
        for highlight in highlights { highlight(context) }
    }

    private func drawAuras(in context: GraphicsContext, at now: Date, elapsed: TimeInterval, time: TimeInterval) -> [Item] {
        lastFrames.beginAuras()
        lastFrames.abominationAura.beginFrame(at: time, reset: playback.resetsCombatCues ? playback.started : nil)
        guard !auras.isEmpty else { return [] }
        let inset = CGFloat(battle.narrowing)
        let span = CGFloat(battle.size) - 2 * inset
        let board = CGRect(x: inset, y: inset, width: span, height: span)
        var foreground: [Item] = []
        for aura in auras {
            let stack = aura.owner
            guard reduceMotion || !playback.isMoving(stack, at: elapsed) && playback.spawnOpacity(for: stack, elapsed: elapsed) > 0 else { continue }
            let center = reduceMotion ? BattlefieldProjection.logicalCenter(stack.cells) : playback.logicalPosition(stack, at: elapsed)
            if stack.name == "Abomination" && aura.effect.name == "Flesh Shield Aura" {
                // Match the web's motion guard, including attacks and hit reactions.
                guard reduceMotion || playback.pose(for: stack, elapsed: elapsed, idleTime: 0, fallen: false).action == .idle
                else { continue }
                if let sand = lastFrames.abominationAura.frame(owner: stack.id, range: aura.effect.range,
                                                              area: aura.bounds(center: center), board: board,
                                                              projection: projection, time: time, opacity: aura.opacity,
                                                              scale: displayScale, reduceMotion: reduceMotion) {
                    context.draw(Image(decorative: sand.floor.image, scale: displayScale), in: sand.floor.bounds)
                    let depth = projection.point(x: center.x, y: center.y).y + 0.25
                    foreground.append(Item(depth: depth) { context in
                        context.draw(Image(decorative: sand.veil.image, scale: displayScale), in: sand.veil.bounds)
                    })
                    continue
                }
            }
            let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
            let griffin = stack.name == "Griffin" && aura.effect.name == "Range Null Field Aura"
            let wyvern = stack.name == "Wyvern" && aura.effect.name == "Venom Cloud Aura"
            let arachna = stack.name == "Arachna Queen" && aura.effect.name == "Web Aura"
            if (griffin || wyvern || arachna) && !reduceMotion &&
                playback.pose(for: stack, elapsed: elapsed, idleTime: 0, fallen: false).action != .idle { continue }
            if arachna {
                let age = reduceMotion ? 1 : lastFrames.arachnaAuraAge(stack.id, at: now)
                if let web = BattlefieldArachnaAura.image(area: aura.bounds(center: center), board: board, projection: projection,
                                                          age: age, opacity: aura.opacity, scale: displayScale) {
                    context.draw(Image(decorative: web.image, scale: displayScale), in: web.bounds)
                    continue
                }
            }
            if griffin {
                let age = reduceMotion ? 1 : lastFrames.griffinAuraAge(aura, at: now)
                if let storm = BattlefieldGriffinAura.frame(center: center, footprint: stack.footprint,
                                                            range: aura.effect.range, facing: facing, board: board,
                                                            projection: projection, age: age, opacity: aura.opacity,
                                                            scale: displayScale) {
                    BattlefieldAuraArt.drawLayer(storm.back.image, bounds: storm.back.bounds, clip: storm.clip,
                                                 eye: storm.eye, scale: displayScale, in: context)
                    let depth = projection.point(x: center.x, y: center.y).y + 0.25
                    foreground.append(Item(depth: depth) { context in
                        BattlefieldAuraArt.drawLayer(storm.front.image, bounds: storm.front.bounds, clip: storm.clip,
                                                     eye: storm.eye, scale: displayScale, in: context)
                    })
                    continue
                }
            }
            if wyvern {
                let motion = reduceMotion ? nil : lastFrames.wyvernAura(aura, center: center, at: now)
                if let cloud = BattlefieldWyvernAura.frame(area: aura.bounds(center: center), board: board, facing: facing,
                                                           projection: projection, now: now, motion: motion,
                                                           opacity: aura.opacity, scale: displayScale) {
                    for layer in cloud.floor {
                        BattlefieldAuraArt.drawLayer(layer.image, bounds: layer.bounds, clip: cloud.clip,
                                                     scale: displayScale, in: context)
                    }
                    let depth = projection.point(x: center.x, y: center.y).y + 0.25
                    for (offset, layer) in [(-1.25, cloud.back), (0.0, cloud.front)] {
                        foreground.append(Item(depth: depth + offset) { context in
                            BattlefieldAuraArt.drawLayer(layer.image, bounds: layer.bounds, clip: cloud.clip,
                                                         scale: displayScale, in: context)
                        })
                    }
                    continue
                }
            }
            BattlefieldAuraArt.draw(aura, center: center, facing: facing, board: board, projection: projection,
                                    time: time, scale: displayScale, in: context)
        }
        return foreground
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
                      idleTiming: (time: TimeInterval, age: TimeInterval), flagTime: TimeInterval, fallen: Bool,
                      shielded: Bool, status: BattleFlagStatus, statusTint: UInt32?, now: Date,
                      highlights: inout [TargetHighlight]) -> CGPoint? {
        let aimTint = targetTints[stack.id]
        let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
        let presentation = CreatureAnimation.boardPresentation(stack, position: position, projection: projection,
                                                               facing: facing)
        let ground = presentation.ground
        let size = presentation.height
        let idleTime = idleTiming.time
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
        var body = figure
        if status.stunned && !reduceMotion {
            let phase = Double(stack.id % 11) / 11
            let sway = sin((flagTime / 1.8 + phase) * .pi * 2) * projection.spriteCellSize * 0.022
            body.translateBy(x: sway, y: 0)
        }
        let highlight: TargetHighlight?
        if let sprite {
            let art = if pose.action == .idle && sprite.action == .idle && stack.name == "Battle Mage",
                         let standing = BattleResources.cgImage("battle_mage") {
                reduceMotion ? standing : BattleMageIdleAppearance.image(standing, elapsed: idleTime)
            } else if sprite.action == .idle && stack.name == "Fairy" {
                FairyIdleAppearance.image(sprite.image, frame: sprite.index, elapsed: idleTime)
            } else if sprite.action == .idle && stack.name == "Nightmare" && !reduceMotion {
                NightmareIdleAppearance.image(sprite.image, elapsed: idleTime)
            } else if pose.action == .idle && sprite.action == .idle && stack.name == "Elf" && !reduceMotion {
                ElfIdleAppearance.image(sprite.image, time: flagTime, idleAge: idleTiming.age)
            } else {
                sprite.image
            }
            highlight = drawSprite(sprite, art: art, presentation: presentation, facing: facing, tint: aimTint, statusTint: statusTint, in: body)
        } else if let portrait = BattleResources.cgImage(BattleResources.creature(stack.name)) {
            let width = size * CGFloat(portrait.width) / CGFloat(portrait.height) * presentation.widthScale
            highlight = drawImage(portrait, at: ground, width: width, height: size, anchorX: 0.5, foot: 0.93,
                                  facing: facing, tint: aimTint, statusTint: statusTint, in: body)
        } else {
            highlight = nil
            context.draw(Text(String(stack.name.prefix(1))).font(BattleResources.display(size * 0.34))
                .foregroundStyle(BattlePalette.team(stack.team)), at: ground)
        }
        if let highlight { highlights.append(highlight) }
        if shielded {
            BattleWaterShield.draw(stack, at: position, presentation: presentation, facing: facing,
                                  projection: projection, time: flagTime, front: true, in: figure)
        }
        let impactTime = playback.impactTime(for: stack)
        if aimTint == nil && (!fallen || elapsed < impactTime) {
            let amount = playback.amount(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
            let height = BattleStackFlag.height(for: projection.spriteCellSize)
            let center = CreatureAnimation.flagPosition(for: stack.name, presentation: presentation,
                                                        projection: projection, facing: facing, height: height)
            let breakAge = playback.covenantBreaks[stack.id].map { now.timeIntervalSince($0) }
            let wearsCovenant = stack.hasEmberCovenant || (breakAge ?? 1) < 0.85 && !reduceMotion
            if wearsCovenant {
                let began = lastFrames.covenantStarts[stack.id] ?? now
                lastFrames.covenantStarts[stack.id] = began
                BattleCovenantHalo.draw(at: center, cell: projection.spriteCellSize, id: stack.id, time: flagTime,
                                        age: reduceMotion ? 1 : now.timeIntervalSince(began), breakAge: breakAge,
                                        absorbAge: playback.covenantAbsorbs[stack.id].map { now.timeIntervalSince($0) }, in: context)
            } else {
                lastFrames.covenantStarts[stack.id] = nil
            }
            BattleStackFlag.draw(amount: amount, team: stack.team, id: stack.id, active: !animating && stack.id == battle.active,
                                 status: status, time: flagTime, animateCloth: !reduceMotion, cellSize: projection.spriteCellSize,
                                 pixelWidth: 1 / displayScale,
                                 at: center, in: context)
            return center
        }
        return nil
    }

    @discardableResult
    private func drawSprite(_ sprite: CreatureAnimation.Frame, art: CGImage, presentation: CreatureBoardPresentation,
                            facing: CGFloat, tint: UInt32? = nil, statusTint: UInt32? = nil,
                            in context: GraphicsContext) -> TargetHighlight? {
        let size = presentation.canvasSize(aspect: CGFloat(sprite.image.width) / CGFloat(sprite.image.height),
                                           heightScale: sprite.heightScale, widthRatio: sprite.widthRatio)
        return drawImage(art, at: presentation.ground, width: size.width, height: size.height, anchorX: sprite.anchorX,
                         foot: sprite.foot, facing: facing, trim: sprite.trim, tint: tint, statusTint: statusTint, in: context)
    }

    private func drawActionEffects(elapsed: TimeInterval, in context: GraphicsContext) {
        for action in playback.actions {
            if let chakram = action.chakram {
                drawChakram(chakram, action: action, elapsed: elapsed, in: context)
                continue
            }
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
            let flightTime = elapsed - release
            let phase = CGFloat(flightTime / (action.impact - release))
            let cellSize = projection.spriteCellSize
            let floorOrigin = projection.point(x: from.x, y: from.y)
            let floorTarget = projection.point(x: to.x, y: to.y)
            let lift = cellSize * 0.48
            let shooter: Stack? = if action.pose == .attack {
                battle.stacks.first { $0.id == action.moment.actor } ?? playback.fallen.first { $0.id == action.moment.actor }
            } else {
                nil
            }
            let bow = shooter.flatMap { stack in
                CreatureAnimation.bowRelease(for: stack, at: from, direction: action.direction,
                    facing: playback.facing(for: stack, elapsed: release, reducedMotion: false), projection: projection)
            }
            let origin = bow?.point ?? CGPoint(x: floorOrigin.x, y: floorOrigin.y - lift)
            let destination = CGPoint(x: floorTarget.x, y: floorTarget.y - (action.moment.splash == nil ? lift : 0))
            let dx = destination.x - origin.x
            let dy = destination.y - origin.y
            let arc = (action.projectile?.arcCells ?? 0) * 4 * phase * (1 - phase)
            let point = CGPoint(x: origin.x + dx * phase, y: origin.y + dy * phase - cellSize * arc)
            let headingY = bow != nil ? dy : floorTarget.y - floorOrigin.y
            if let projectile = action.projectile, let image = projectile.image(at: flightTime, inBackground: true) {
                let width = bow?.length ?? cellSize * projectile.widthCells
                let height = width * CGFloat(image.height) / CGFloat(image.width)
                let heading = projectile.directional == true ? Double(atan2(headingY, dx)) : 0
                let spin = (projectile.spin ?? 0) * flightTime * (dx < 0 ? -1 : 1)
                var sprite = context
                sprite.translateBy(x: point.x, y: point.y)
                sprite.rotate(by: .radians(heading + spin))
                let rect = CGRect(x: -width * (projectile.anchor?.x ?? 0.5), y: -height * (projectile.anchor?.y ?? 0.5),
                                  width: width, height: height)
                sprite.draw(Image(decorative: image, scale: 1).interpolation(.high), in: rect)
            } else {
                let length = max(1, hypot(dx, headingY))
                let shaft = min(cellSize * 0.37, phase * length)
                let trail = Path { path in
                    path.move(to: CGPoint(x: point.x - shaft * dx / length, y: point.y - shaft * headingY / length))
                    path.addLine(to: point)
                }
                context.stroke(trail, with: .color(.black.opacity(0.70)), lineWidth: 3)
                context.stroke(trail, with: .color(BattlePalette.parchment), lineWidth: 1.4)
            }
        }
    }

    private func drawChakram(_ chakram: BattleChakram, action: BattlePlayback.Action, elapsed: TimeInterval,
                             in context: GraphicsContext) {
        let cellSize = projection.spriteCellSize
        let projectile = action.projectile
        func field(_ point: CGPoint) -> CGPoint {
            let ground = projection.point(x: point.x, y: point.y)
            return CGPoint(x: ground.x, y: ground.y - cellSize * 0.48)
        }
        for hit in chakram.impacts where hit.contact.kind == .shield || (hit.ricochets && hit.contact.delta < -0.001) {
            let age = elapsed - hit.time
            guard let burst = projectile?.impact, let frame = burst.image(at: age, inBackground: true) else { continue }
            let phase = age / burst.duration
            let width = cellSize * (projectile?.widthCells ?? 0.68) * (3.2 + 1.2 * phase)
            let origin = field(hit.point.logical)
            var sparks = context
            sparks.translateBy(x: origin.x, y: origin.y)
            sparks.rotate(by: .radians(6.25 * age))
            sparks.blendMode = .plusLighter
            sparks.opacity *= pow(1 - phase, 0.55)
            sparks.draw(Image(decorative: frame, scale: 1), in: CGRect(x: -width / 2, y: -width / 2, width: width, height: width))
        }
        guard let leg = chakram.leg(at: elapsed) else { return }
        var width = cellSize * (projectile?.widthCells ?? 0.68)
        var hand = field((leg.from.hand ? leg.from : leg.to).logical)
        if let stack = (battle.stacks + playback.fallen).first(where: { $0.id == action.moment.actor }), stack.name == "Zena",
           let point = action.attackPosition,
           let pin = projectile?.chakramOrigins?[action.direction.map { "attack_\($0)" } ?? "attack"],
           let frame = CreatureAnimation.frame("Zena", pose: CreaturePose(action: .attack,
               time: chakram.release - action.moveEnd + 0.000_001, verticalAttack: action.direction), inBackground: true) {
            let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: false)
            let body = CreatureAnimation.boardPresentation(stack, position: point, projection: projection, facing: facing)
            let h = body.height * frame.heightScale
            let w = h * CGFloat(frame.image.width) / CGFloat(frame.image.height) * body.widthScale * frame.widthRatio
            hand = CGPoint(x: body.ground.x + facing * w * (pin.x - frame.anchorX), y: body.ground.y + h * (pin.y - frame.foot))
            width = w * pin.diameter
        }
        let from = leg.from.hand ? hand : field(leg.from.logical)
        let to = leg.to.hand ? hand : field(leg.to.logical)
        let t = (elapsed - leg.start) / (leg.end - leg.start)
        let center = CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t)
        let age = elapsed - chakram.release
        var disc = context
        disc.translateBy(x: center.x, y: center.y)
        disc.rotate(by: .radians(-(projectile?.spin ?? 22.5) * age))
        let bounds = CGRect(x: -width / 2, y: -width / 2, width: width, height: width)
        if let image = projectile?.image(at: age, inBackground: true) {
            disc.draw(Image(decorative: image, scale: 1).interpolation(.high), in: bounds)
        } else {
            disc.stroke(Path(ellipseIn: bounds), with: .color(BattlePalette.gold), lineWidth: max(1, width * 0.08))
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

    @discardableResult
    private func drawImage(_ image: CGImage, at ground: CGPoint, width: CGFloat, height: CGFloat, anchorX: CGFloat,
                           foot: CGFloat, facing: CGFloat, trim: CGRect? = nil, tint: UInt32? = nil,
                           statusTint: UInt32? = nil, in canvas: GraphicsContext) -> TargetHighlight? {
        var context = canvas
        context.translateBy(x: ground.x, y: ground.y)
        context.scaleBy(x: facing, y: 1)
        let crop = trim ?? CGRect(x: 0, y: 0, width: 1, height: 1)
        let rect = CGRect(x: width * (crop.minX - anchorX), y: height * (crop.minY - foot),
                          width: width * crop.width, height: height * crop.height)
        let art = Image(decorative: image, scale: 1).interpolation(.high)
        var body = context
        if let statusTint { body.addFilter(.colorMultiply(BattlePalette.color(statusTint))) }
        body.draw(art, in: rect)
        guard let tint else { return nil }
        let transform = context.transform
        return { canvas in
            var overlay = canvas
            overlay.transform = transform
            overlay.opacity *= 0.72
            overlay.addFilter(.colorMultiply(BattlePalette.color(tint)))
            overlay.draw(art, in: rect)
        }
    }

}
