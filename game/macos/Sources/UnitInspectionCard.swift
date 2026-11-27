import SwiftUI

struct UnitInspectionCard: View {
    let stack: Stack
    let level: Int?
    let close: () -> Void
    @State private var artwork: CGImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(stack.name)
                        .font(BattleResources.display(24))
                        .foregroundStyle(BattlePalette.parchment)
                        .accessibilityAddTraits(.isHeader)
                    HStack(spacing: 7) {
                        Text(stack.team.title).foregroundStyle(BattlePalette.team(stack.team))
                        if stack.faction != .none { Text(stack.faction.title) }
                        if let level { Text("Level \(level)") }
                        Text(stack.amount == 1 ? "1 creature" : "\(stack.amount.formatted()) creatures")
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(BattlePalette.sidebarTitle)
                }
                Spacer(minLength: 0)
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .frame(width: 26, height: 26)
                        .background(BattlePalette.bronze.opacity(0.28), in: Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(BattlePalette.parchment)
                .keyboardShortcut(.cancelAction)
                .accessibilityLabel("Close unit inspection")
            }
            HStack(alignment: .top, spacing: 12) {
                CreaturePortrait(name: stack.name, team: stack.team, inspector: true,
                                 inspectionArt: artwork ?? BattleResources.inspectorPortrait(for: stack.name))
                    .frame(width: 150, height: 228)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                    .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(BattlePalette.gold.opacity(0.45)) }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible())], spacing: 6) {
                    ForEach(BattleUnitStat.rows(for: stack).flatMap { $0 }) { stat in
                        statTile(stat)
                    }
                }
                .frame(width: 252)
            }
            BattleUnitDetails(stack: stack, width: 414, compact: true)
        }
        .padding(14)
        .frame(width: 442)
        .background {
            LinearGradient(colors: [BattlePalette.color(0x21190f), BattlePalette.backdrop],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        .modifier(UnitInspectionHoverHost())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Unit inspection")
        .task(id: stack.name) {
            artwork = BattleResources.inspectorPortrait(for: stack.name)
            let loaded = await BattleResources.loadInspectorPortrait(for: stack.name)
            if !Task.isCancelled { artwork = loaded }
        }
    }

    private func statTile(_ stat: BattleUnitStat) -> some View {
        HStack(spacing: 6) {
            SidebarIcon(asset: "stat_\(stat.icon)", symbol: stat.symbol)
                .frame(width: 16, height: 16)
            VStack(alignment: .leading, spacing: 1) {
                Text(stat.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(BattlePalette.sidebarTitle)
                Text(stat.value)
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(BattlePalette.statText)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 6)
        .frame(minHeight: 33)
        .background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 5))
        .overlay {
            RoundedRectangle(cornerRadius: 5).strokeBorder(BattlePalette.bronze.opacity(0.48)).allowsHitTesting(false)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stat.label)
        .accessibilityValue(stat.value)
        .unitInspectionHover(stat.detail)
    }
}

struct BattleUnitStat: Identifiable {
    let icon: String
    let symbol: String
    let value: String
    let label: String
    let description: String
    var id: String { icon }
    var detail: UnitInspectionDescription {
        UnitInspectionDescription(title: "\(label) · \(value)", description: description)
    }

    private init(_ icon: String, _ symbol: String, _ value: String, _ label: String, _ description: String) {
        self.icon = icon
        self.symbol = symbol
        self.value = value
        self.label = label
        self.description = description
    }

    static func rows(for stack: Stack) -> [[BattleUnitStat]] {
        let ranged = stack.selectedAttack == .ranged
        var rows: [[BattleUnitStat]] = [
            [BattleUnitStat("health_gold_v2", "heart.fill", "\(hudNumber(stack.hp))/\(hudNumber(stack.maxHP))", "Health",
                            "Current and maximum health of the top creature in this stack.")],
            [BattleUnitStat("damage_gold_v2", "hand.raised.fill", "\(hudNumber(stack.damageMin)) – \(hudNumber(stack.damageMax))",
                            "Damage", "Minimum and maximum damage per creature before attack modifiers.")],
            [BattleUnitStat(ranged ? "ranged_attack_gold_v2" : "melee_attack_gold_v2", ranged ? "scope" : "bolt.fill",
                            hudNumber(stack.attack), stack.selectedAttack.title, "Current attack type and strength.")],
            [BattleUnitStat("armor_gold_v2", "shield.fill", hudNumber(stack.armor), "Armor",
                            "Reduces damage from physical attacks. Ranged armor is shown separately when it differs.")],
            [BattleUnitStat("magic_resist_gold_v2", "sparkles", "\(hudNumber(stack.magicResist))%", "Magic resistance",
                            "The percentage of incoming magic damage this stack resists.")],
            [BattleUnitStat(stack.flies ? "fly_gold_v2" : "walk_gold_v2", "figure.walk", hudNumber(stack.movement), "Movement",
                            "Movement budget in cells. Straight steps cost 1 and diagonal steps cost about 1.41."),
             BattleUnitStat("initiative_gold_v2", "arrow.up", hudNumber(stack.initiative), "Initiative",
                            "Stacks with higher initiative act first.")],
            [BattleUnitStat("morale_gold_v2", "flame", hudNumber(stack.morale), "Morale",
                            "Can grant extra actions and adds movement once the battlefield starts narrowing."),
             BattleUnitStat("luck_gold_v2", "suit.club.fill", hudNumber(stack.luck), "Luck",
                            "Raises damage rolls and the power of some abilities.")],
        ]
        if abs(stack.rangeArmor - stack.armor) > 0.005 {
            rows[3].append(BattleUnitStat("ranged_armor_gold_v2", "shield.lefthalf.filled", hudNumber(stack.rangeArmor),
                                         "Ranged armor", "Armor against ranged attacks."))
        }
        if !stack.book.isEmpty {
            rows.append([BattleUnitStat("scroll_gold_v2", "scroll", String(stack.book.reduce(0) { $0 + $1.charges }),
                                        "Spell scrolls", "Magic scrolls left to cast.")])
        }
        if let shots = stack.shots {
            rows.append([BattleUnitStat("shot_range_gold_v2_arc", "scope", hudNumber(stack.shotDistance), "Range",
                                        "Ranged shot distance in cells."),
                         BattleUnitStat("ammo_gold_v2", "arrow.up", hudNumber(shots), "Shots",
                                        "Number of ranged shots left.")])
        }
        return rows
    }
}
