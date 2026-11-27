import SwiftUI

struct Spellbook: View {
    let spells: [BattleSpell]
    let caster: Stack?
    let viewport: CGSize
    let pick: (BattleSpell) -> Void
    let close: () -> Void
    @State private var page = 0

    var body: some View {
        let scale = min(viewport.width / 1680, viewport.height / 980) * 0.88
        let width = 1536 * scale
        let height = 1024 * scale
        let spreads = max(1, (spells.count + 5) / 6)
        ZStack {
            Color.black.opacity(0.65).contentShape(Rectangle()).onTapGesture(perform: close)
                .accessibilityHidden(true)
            ZStack(alignment: .topLeading) {
                if let art = BattleResources.image("spellbook") {
                    Image(nsImage: art).resizable().frame(width: width, height: height)
                } else {
                    HStack(spacing: 3) {
                        ForEach(0..<2) { _ in Rectangle().fill(BattlePalette.color(0xc7ab75)) }
                    }
                    .padding(.horizontal, width * 0.19).padding(.vertical, height * 0.11)
                }
                ForEach(Array(spells.dropFirst(page * 6).prefix(6).enumerated()), id: \.element.id) { index, spell in
                    let x: CGFloat = index < 3 ? -236 : 233
                    let y = -260 + CGFloat(index % 3) * 249
                    SpellCard(spell: spell, caster: caster, side: 220 * scale, select: pick)
                        .position(x: width / 2 + x * scale, y: height / 2 + y * scale)
                }
                if !spells.isEmpty, spells.allSatisfy({ !$0.available }), let reason = spells.first?.unavailableReason {
                    Text(reason)
                        .font(BattleResources.display(19 * scale))
                        .foregroundStyle(BattlePalette.color(0x4a3410))
                        .position(x: width * 0.65, y: height * 0.79)
                }
                if spreads > 1 {
                    HStack {
                        Button("Previous page", systemImage: "chevron.left") { page -= 1 }
                            .disabled(page == 0)
                        Spacer()
                        Button("Next page", systemImage: "chevron.right") { page += 1 }
                            .disabled(page + 1 == spreads)
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(BattleButtonStyle())
                    .font(BattleResources.display(21 * scale))
                    .foregroundStyle(BattlePalette.color(0x4a3410))
                    .frame(width: width * 0.55)
                    .position(x: width / 2, y: height * 0.84)
                }
            }
            .frame(width: width, height: height)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Spellbook")
        }
    }
}

private struct SpellCard: View {
    let spell: BattleSpell
    let caster: Stack?
    let side: CGFloat
    let select: (BattleSpell) -> Void
    @State private var hovered = false

    var body: some View {
        Button { select(spell) } label: {
            ZStack {
                if let bezel = BattleResources.image("spell_inner_frame_linework_v2") {
                    Image(nsImage: bezel).resizable()
                        .colorMultiply(BattlePalette.color(0xa1713b))
                        .opacity(spell.available ? 0.67 : 0.42)
                        .frame(width: side * 1.11, height: side * 160 / 220)
                        .offset(x: side * 0.076, y: -side * 0.073)
                }
                if let icon = BattleResources.image("spell-\(BattleResources.creature(spell.name))") {
                    Image(nsImage: icon).resizable().interpolation(.high)
                        .frame(width: side * 0.58, height: side * 0.58)
                        .colorMultiply(BattlePalette.color(hovered && spell.available ? 0xfff7cc : 0xf4ead6))
                        .saturation(spell.available ? 1 : 0.50)
                        .overlay {
                            if !spell.available {
                                Rectangle().fill(.black.opacity(0.22))
                                Path { line in
                                    line.move(to: CGPoint(x: side * 0.055, y: side * 0.055))
                                    line.addLine(to: CGPoint(x: side * 0.525, y: side * 0.525))
                                }
                                .stroke(.black.opacity(0.63), lineWidth: max(1, side / 58))
                            }
                        }
                        .offset(x: side * 0.113, y: -side * 0.073)
                } else {
                    Image(systemName: "scroll.fill")
                        .font(.system(size: side * 0.26)).foregroundStyle(BattlePalette.color(0x6d4d18))
                        .offset(x: side * 0.113, y: -side * 0.073)
                }
                if let caster, spell.requiredPower > 0 {
                    powerRail(caster: caster)
                        .offset(x: -side * 0.261, y: -side * 0.073)
                }
                Text(spell.name)
                    .font(BattleResources.display(side * 0.13))
                    .foregroundStyle(BattlePalette.color(spell.available ? 0x4a3410 : 0x635139))
                    .lineLimit(1).minimumScaleFactor(0.63)
                    .frame(maxWidth: side)
                    .offset(x: side * 0.05, y: side * 0.35)
                ZStack {
                    if let seal = BattleResources.image("spell_cast_wax_seal_blank_v1") {
                        Image(nsImage: seal).resizable()
                    } else {
                        Circle().fill(BattlePalette.cloth(.opponent))
                    }
                    Text(String(spell.charges)).font(BattleResources.display(side * 0.105))
                        .foregroundStyle(BattlePalette.color(0xf1dfb5))
                }
                .frame(width: side * 0.204, height: side * 0.204)
                .offset(x: side * 0.49, y: side * 0.205)
            }
            .frame(width: side, height: side)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpellCardStyle())
        .disabled(!spell.available)
        .accessibilityLabel(spell.name)
        .accessibilityValue("\(spell.charges) scrolls")
        .help(spell.unavailableReason ?? spell.name)
        .onHover { hovered = $0 }
        .modifier(SandboxCursorTarget(hovering: hovered && spell.available))
    }

    private func powerRail(caster: Stack) -> some View {
        let height = side * 124 / 220
        let width = height * 75 / 490
        let art = BattleResources.image(caster.team == .player ? "spell_stack_fill_green_variant2" : "spell_stack_fill_red_variant2")
        return ZStack {
            if let rail = BattleResources.image("spell_stack_rail_variant2") {
                Image(nsImage: rail).resizable()
            }
            VStack(spacing: 0) {
                ForEach(Array((0..<5).reversed()), id: \.self) { index in
                    Group {
                        if Double(index) < caster.stackPower, let art {
                            Image(nsImage: art).resizable()
                                .frame(width: width * 0.68, height: height * 0.148)
                        } else {
                            Color.clear.frame(width: width * 0.68, height: height * 0.148)
                        }
                    }
                    .frame(height: height / 5)
                }
            }
        }
        .frame(width: width, height: height)
        .opacity(spell.available ? 1 : 0.72)
        .accessibilityHidden(true)
    }
}

private struct SpellCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
