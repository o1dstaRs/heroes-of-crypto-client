import SwiftUI

struct BattlefieldSuggestion: View {
    let advice: BattleSuggestion
    let battle: BattleView
    let projection: BattlefieldProjection

    var body: some View {
        if let actor = battle.stacks.first(where: { $0.id == advice.actor }) {
            let target = battle.stacks.first { $0.id == advice.target }
            ZStack(alignment: .top) {
                Canvas { context, _ in
                    let start = projection.center(actor.cells)
                    let path = advice.path.map { projection.center(actor.footprint.cells(at: $0)) }
                    let destination = advice.aim.map { projection.point(x: $0.x, y: $0.y) } ?? target.map { projection.center($0.cells) }
                       ?? advice.landing.map { projection.center([$0]) }
                    let route = [start] + path + (destination.map { [$0] } ?? [])
                    let line = Path { stroke in stroke.addLines(route) }
                    let width = max(1.4, projection.spriteCellSize * 0.034)
                    context.stroke(line, with: .color(.black.opacity(0.82)),
                                   style: StrokeStyle(lineWidth: width + 2, lineCap: .round))
                    context.stroke(line, with: .color(BattlePalette.gold),
                                   style: StrokeStyle(lineWidth: width, lineCap: .round, dash: [4, 4]))
                    if let landing = advice.landing {
                        let cells = (advice.kind == .move || advice.kind == .melee) ? actor.footprint.cells(at: landing) : [landing]
                        BattlefieldGuides.landing(cells, projection: projection, in: context)
                    }
                    if let target {
                        let path = Path(projection.footprintHighlight(for: target.cells))
                        context.stroke(path, with: .color(BattlePalette.gold), lineWidth: width)
                    }
                }
                VStack(spacing: 3) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                        title(target)
                    }
                    .font(BattleResources.display(15))
                    if let mode = advice.mode {
                        Text("Switch to \(Text(LocalizedStringKey(mode.title)))").font(.caption)
                    }
                    if advice.rotation > 0 {
                        Text("Rotate Fire Wall \(advice.rotation) times").font(.caption)
                    }
                }
                .foregroundStyle(BattlePalette.gold)
                .padding(.vertical, 6)
                .padding(.horizontal, 12)
                .background(BattlePalette.backdrop.opacity(0.92), in: .rect(cornerRadius: 6))
                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(BattlePalette.bronze) }
                .padding(.top, 8)
            }
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
        }
    }

    private func title(_ target: Stack?) -> Text {
        switch advice.kind {
        case .move: Text("Suggested move")
        case .melee, .shot:
            if let target { Text("Attack \(Text(LocalizedStringKey(target.name)))") }
            else { Text("Suggested attack") }
        case .spell:
            if let spell = battle.spells.first(where: { $0.id == advice.spell }) {
                Text("Cast \(Text(LocalizedStringKey(spell.name)))")
            }
            else { Text("Suggested spell") }
        case .obstacle: Text("Attack the obstacle")
        case .wait: Text("Wait this turn")
        case .defend: Text("Defend this turn")
        case .endTurn: Text("End this turn")
        }
    }
}
