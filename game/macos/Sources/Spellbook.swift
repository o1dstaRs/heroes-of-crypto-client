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
        let closeSide = min(52, max(44, 38 * scale))
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
                    let x: CGFloat = index < 3 ? -234.5 : 234.5
                    let y = -263 + CGFloat(index % 3) * 249
                    // Use the same enlarged card scale and slight page tilt as the browser book.
                    SpellCard(spell: spell, caster: caster, scale: 1.148 * scale, select: pick)
                        .rotationEffect(.degrees(index < 3 ? 0.25 : -0.25))
                        .position(x: width / 2 + x * scale, y: height / 2 + y * scale)
                }
                if !spells.isEmpty, spells.allSatisfy({ !$0.available }), let reason = spells.first?.unavailableReason {
                    Text(reason)
                        .font(BattleResources.display(19 * scale))
                        .foregroundStyle(BattlePalette.color(0x4a3410))
                        .position(x: width / 2, y: height / 2 + 374 * scale)
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
                    .position(x: width / 2, y: height / 2 + 374 * scale)
                }
            }
            .frame(width: width, height: height)
            .overlay(alignment: .topTrailing) {
                // The book's binding starts inside the artwork's transparent margins.
                BattleCloseButton(label: "Close Spellbook", side: closeSide, shortcut: .cancelAction, action: close)
                    .padding(.top, 61 * scale + 4)
                    .padding(.trailing, 210 * scale + 4)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Spellbook")
            .accessibilityAction(.escape, close)
        }
    }
}

private struct SpellCard: View {
    let spell: BattleSpell
    let caster: Stack?
    let scale: CGFloat
    let select: (BattleSpell) -> Void
    @State private var hovered = false

    var body: some View {
        let iconSide = 127.2 * scale
        Button { select(spell) } label: {
            ZStack {
                if let bezel = BattleResources.image("spell_inner_frame_linework_v2") {
                    Image(nsImage: bezel).resizable()
                        .colorMultiply(BattlePalette.color(0xa1713b))
                        .opacity(spell.available ? 0.67 : 0.28)
                        .frame(width: 244 * scale, height: 160 * scale)
                        .offset(x: 4.5 * scale, y: -13 * scale)
                }
                if let icon = BattleResources.image("spell-\(BattleResources.creature(spell.name))") {
                    Image(nsImage: icon).resizable().interpolation(.high)
                        .frame(width: iconSide, height: iconSide)
                        .colorMultiply(BattlePalette.color(hovered && spell.available ? 0xfff7cc : 0xf4ead6))
                        .saturation(spell.available ? 1 : 0.50)
                        .overlay {
                            if !spell.available {
                                Rectangle().fill(.black.opacity(0.22))
                                Path { line in
                                    line.move(to: CGPoint(x: 12 * scale, y: 12 * scale))
                                    line.addLine(to: CGPoint(x: 115.2 * scale, y: 115.2 * scale))
                                }
                                .stroke(.black.opacity(0.63), lineWidth: max(1, 5 * scale))
                            }
                        }
                        .offset(x: 13.5 * scale, y: -13 * scale)
                } else {
                    Image(systemName: "scroll.fill")
                        .font(.system(size: iconSide * 0.45)).foregroundStyle(BattlePalette.color(0x6d4d18))
                        .offset(x: 13.5 * scale, y: -13 * scale)
                }
                if let caster, spell.requiredPower > 0 {
                    powerRail(caster: caster)
                        .offset(x: -68 * scale, y: -13 * scale)
                }
                Text(spell.name)
                    .font(.custom("Georgia-Bold", size: 26 * scale))
                    .foregroundStyle(BattlePalette.color(spell.available ? 0x4a3410 : 0x635139))
                    .lineLimit(1).minimumScaleFactor(0.63)
                    .frame(maxWidth: 231 * scale)
                    .offset(y: 79 * scale)
                ZStack {
                    if let seal = BattleResources.image("spell_cast_wax_seal_blank_v1") {
                        Image(nsImage: seal).resizable()
                    } else {
                        Circle().fill(BattlePalette.cloth(.opponent))
                    }
                    Text(String(spell.charges)).font(.custom("Georgia-Bold", size: 20 * scale))
                        .foregroundStyle(BattlePalette.color(0xf1dfb5))
                }
                .frame(width: 44.8 * scale, height: 44.8 * scale)
                .offset(x: 114.5 * scale, y: -77.8 * scale)
            }
            .frame(width: 275 * scale, height: 204 * scale)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpellCardStyle())
        .scaleEffect(hovered && spell.available ? 1.02 : 1)
        .disabled(!spell.available)
        .accessibilityLabel(spell.name)
        .accessibilityValue("\(spell.charges) scrolls")
        .help(spell.unavailableReason ?? spell.name)
        .onHover { hovered = $0 }
        .modifier(SandboxCursorTarget(hovering: hovered && spell.available))
    }

    private func powerRail(caster: Stack) -> some View {
        let height = 124 * scale
        let width = height * 75 / 490
        let art = BattleResources.image(caster.stackPower >= spell.requiredPower ?
                                        "spell_stack_fill_green_variant2" : "spell_stack_fill_red_variant2")
        return ZStack {
            if let rail = BattleResources.image("spell_stack_rail_variant2") {
                Image(nsImage: rail).resizable()
            }
            VStack(spacing: 0) {
                ForEach(Array((0..<5).reversed()), id: \.self) { index in
                    Group {
                        if Double(index) < spell.requiredPower, let art {
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
