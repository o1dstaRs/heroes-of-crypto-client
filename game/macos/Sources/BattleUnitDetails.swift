import SwiftUI

struct BattleUnitDetails: View {
    let stack: Stack
    let width: CGFloat
    var compact = false
    @Environment(\.locale) private var locale

    var body: some View {
        let abilitySize = compact ? 32 : min(56, max(44, (width - 26) / 4))
        let spellSize: CGFloat = compact ? 32 : 42
        VStack(alignment: .leading, spacing: 6) {
            if !compact || !stack.abilities.isEmpty {
                section("ABILITIES")
                tiles(height: abilitySize + 8) {
                    ForEach(Array(stack.abilities.enumerated()), id: \.offset) { _, name in
                        tile(UnitInspectionDescriptions.ability(name, locale: locale), size: abilitySize, symbol: "sparkles")
                    }
                }
            }
            if !stack.book.isEmpty {
                section("MAGIC")
                tiles(height: spellSize + (compact ? 8 : 34)) {
                    ForEach(stack.book, id: \.name) { spell in
                        let detail = UnitInspectionDescriptions.spell(spell, locale: locale)
                        VStack(alignment: .center, spacing: 3) {
                            art(detail.title, size: spellSize, symbol: "scroll", prefersSpell: true)
                                .overlay(alignment: .bottomTrailing) {
                                    Text(spell.charges, format: .number)
                                        .font(.system(size: 9).monospacedDigit())
                                        .padding(2)
                                        .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 2))
                                        .padding(2)
                                }
                            if !compact {
                                Text(LocalizedStringKey(spell.name)).font(BattleResources.display(8)).multilineTextAlignment(.center)
                                    .lineLimit(2).frame(width: 44)
                            }
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(Text(LocalizedStringKey(spell.name)))
                        .unitInspectionHover(detail, magnifies: true)
                    }
                }
            }
            statusSection("BUFFS", stack.statuses.filter { $0.kind == .buff })
            statusSection("DEBUFFS", stack.statuses.filter { $0.kind != .buff })
        }
        .padding(.horizontal, 3)
    }

    private func section(_ title: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(BattlePalette.bronze.opacity(0.55)).frame(height: 1)
            Text(LocalizedStringKey(title))
                .font(BattleResources.display(10)).tracking(1)
                .foregroundStyle(BattlePalette.sidebarTitle)
                .frame(width: 95, height: 17)
                .background {
                    Capsule().fill(LinearGradient(colors: [BattlePalette.bronze.opacity(0.47), BattlePalette.backdrop],
                                                  startPoint: .top, endPoint: .bottom))
                }
                .accessibilityAddTraits(.isHeader)
            Rectangle().fill(BattlePalette.bronze.opacity(0.55)).frame(height: 1)
        }
    }

    private func tiles<Content: View>(height: CGFloat, @ViewBuilder content: () -> Content) -> some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 6, content: content)
                .padding(.leading, 1)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .frame(height: height, alignment: .top)
    }

    @ViewBuilder
    private func statusSection(_ title: String, _ statuses: [StackStatus]) -> some View {
        if !compact || !statuses.isEmpty {
            let iconSize = compact ? 32 : min(46, max(38, (width - 26) / 5))
            section(title)
            tiles(height: iconSize + 8) {
                ForEach(Array(statuses.enumerated()), id: \.offset) { _, status in
                    tile(UnitInspectionDescriptions.status(status, locale: locale), size: iconSize,
                         symbol: status.kind == .buff ? "arrow.up" : "arrow.down", prefersSpell: status.kind != .effect)
                }
            }
        }
    }

    private func tile(_ detail: UnitInspectionDescription, size: CGFloat, symbol: String, prefersSpell: Bool = false) -> some View {
        art(detail.title, size: size, symbol: symbol, prefersSpell: prefersSpell)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(LocalizedStringKey(detail.title)))
            .unitInspectionHover(detail, magnifies: true)
    }

    private func art(_ name: String, size: CGFloat, symbol: String, prefersSpell: Bool) -> some View {
        let slug = BattleResources.creature(name)
        let ability = "ability-\(slug)"
        let spell = "spell-\(slug)"
        let preferred = prefersSpell ? spell : ability
        let alternate = prefersSpell ? ability : spell
        return SidebarIcon(asset: BattleResources.image(preferred) != nil ? preferred : alternate, symbol: symbol)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}
