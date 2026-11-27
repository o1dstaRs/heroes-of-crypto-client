import SwiftUI

struct BattleCombatOverlay: View {
    let playback: BattlePlayback
    let projection: BattlefieldProjection
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appearsActive) private var appearsActive
    @State private var entries: [BattleCombatCue] = []

    var body: some View {
        let expires = entries.map(\.endsAt).max()
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: entries.isEmpty || !appearsActive)) { timeline in
            Canvas { context, size in
                draw(at: timeline.date, size: size, in: context)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: playback.started, initial: true) {
            if playback.resetsCombatCues { entries = [] }
            entries.removeAll { $0.endsAt <= Date() }
            entries += playback.combatCues
        }
        .task(id: expires) {
            guard let expires else { return }
            do {
                try await Task.sleep(for: .seconds(max(0, expires.timeIntervalSinceNow)))
                entries.removeAll { $0.endsAt <= Date() }
            } catch {}
        }
    }

    private func draw(at now: Date, size: CGSize, in canvas: GraphicsContext) {
        var healthLanes = [Int: Int]()
        var statusLanes = [Int: Int]()
        let cell = projection.spriteCellSize
        for cue in entries {
            let age = now.timeIntervalSince(cue.started)
            guard age >= 0, age < cue.duration else { continue }
            let progress = age / cue.duration
            let facing: CGFloat = cue.stack.team == .player ? 1 : -1
            let figure = CreatureAnimation.boardPresentation(cue.stack, position: cue.position,
                                                              projection: projection, facing: facing)
            let height = max(9, cell * 0.20)
            let flag = CreatureAnimation.flagPosition(for: cue.stack.name, presentation: figure,
                                                       projection: projection, facing: facing, height: height)
            let edge = flag.y - height / 2
            var context = canvas
            switch cue.kind {
            case let .health(delta, casualties):
                let lane = healthLanes[cue.stack.id, default: 0]
                healthLanes[cue.stack.id, default: 0] += 1
                let rise = reduceMotion ? 0 : cell * 0.22 * progress
                let fontSize = max(15, cell * 0.43)
                let rows: CGFloat = casualties > 0 ? 1.62 : 0.79
                let center = CGPoint(x: min(max(39, flag.x), size.width - 39),
                                     y: max(fontSize, edge - fontSize * (rows + CGFloat(lane) * 1.45) - rise))
                animate(&context, at: center, progress: progress, pop: 0.20, startScale: 0.55, fadeIn: 0.125, fadeOut: 0.62)
                drawHealth(delta, casualties: casualties, fontSize: fontSize, in: context)
            case let .status(name, kind):
                let lane = statusLanes[cue.stack.id, default: 0]
                statusLanes[cue.stack.id, default: 0] += 1
                let rise = reduceMotion ? 0 : cell * 0.24 * progress
                let fontSize = max(11, cell * 0.27)
                let font = Font.system(size: fontSize, weight: .bold)
                let halfWidth = min(size.width / 2, context.resolve(Text(name).font(font)).measure(in: size).width / 2 + 6)
                let center = CGPoint(x: min(max(halfWidth, flag.x), size.width - halfWidth),
                                     y: max(fontSize, edge - cell * (1.17 + CGFloat(lane) * 0.91) - rise))
                animate(&context, at: center, progress: progress, pop: 0.14, startScale: 0.25, fadeIn: 0.07, fadeOut: 0.70)
                drawStatus(name, kind: kind, font: font, iconSize: max(18, cell * 0.56), in: context)
            }
        }
    }

    private func animate(_ context: inout GraphicsContext, at position: CGPoint, progress: Double,
                         pop: Double, startScale: Double, fadeIn: Double, fadeOut: Double) {
        let growth = min(1, progress / pop)
        let scale = reduceMotion ? 1 : startScale + (1 - startScale) * (1 - (1 - growth) * (1 - growth))
        if !reduceMotion {
            context.opacity *= min(1, progress / fadeIn, (1 - progress) / (1 - fadeOut))
        }
        context.translateBy(x: position.x, y: position.y)
        context.scaleBy(x: scale, y: scale)
    }

    private func drawHealth(_ delta: Double, casualties: Int, fontSize: CGFloat, in context: GraphicsContext) {
        let healing = delta > 0
        let fill = BattlePalette.color(healing ? 0x66ff99 : 0xff3333)
        let outline = BattlePalette.color(healing ? 0x0b3d1e : 0x4a0000)
        let font = Font.system(size: fontSize, weight: .black).monospacedDigit()
        outlined((healing ? "+" : "−") + hudNumber(abs(delta)), at: .zero, font: font,
                 fill: fill, outline: outline, in: context)
        guard casualties > 0 else { return }
        let icon = CGRect(x: -fontSize * 0.99, y: fontSize * 0.56, width: fontSize * 0.83, height: fontSize * 0.83)
        if let art = BattleResources.cgImage("combat_kills_skull_icon_v1") {
            context.draw(Image(decorative: art, scale: 1), in: icon)
        } else {
            context.draw(Image(systemName: "skull"), in: icon)
        }
        outlined(casualties.formatted(), at: CGPoint(x: fontSize * 0.41, y: fontSize * 0.99),
                 font: .system(size: fontSize * 0.73, weight: .black), fill: BattlePalette.parchment,
                 outline: .black, in: context)
    }

    private func drawStatus(_ name: String, kind: StackStatus.Kind, font: Font,
                            iconSize: CGFloat, in context: GraphicsContext) {
        let helpful = kind == .buff
        let fill = helpful ? BattlePalette.color(0xffdb83) : BattlePalette.color(0xffa5a1)
        outlined(name, at: .zero, font: font, fill: fill, outline: .black, in: context)
        let key = BattleResources.creature(name)
        let rect = CGRect(x: -iconSize / 2, y: iconSize * 0.32, width: iconSize, height: iconSize)
        if let art = BattleResources.cgImage("spell-\(key)") ?? BattleResources.cgImage("ability-\(key)") {
            context.draw(Image(decorative: art, scale: 1), in: rect)
        } else {
            var icon = context.resolve(Image(systemName: helpful ? "arrow.up.circle.fill" : "arrow.down.circle.fill"))
            icon.shading = .color(fill)
            context.draw(icon, in: rect)
        }
    }

    private func outlined(_ text: String, at center: CGPoint, font: Font, fill: Color, outline: Color,
                          in context: GraphicsContext) {
        let edge = context.resolve(Text(text).font(font).foregroundStyle(outline))
        for offset in [CGPoint(x: -1, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 0, y: -1), CGPoint(x: 0, y: 1)] {
            context.draw(edge, at: CGPoint(x: center.x + offset.x, y: center.y + offset.y))
        }
        context.draw(Text(text).font(font).foregroundStyle(fill), at: center)
    }
}
