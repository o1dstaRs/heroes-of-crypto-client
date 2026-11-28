import SwiftUI

struct RosterCreatureDrag {
    let creature: SandboxCreature
    let location: CGPoint
}

struct BattlefieldRoster: View {
    let model: SkirmishModel
    let boardWidth: CGFloat
    let viewportHeight: CGFloat
    let drag: GestureState<RosterCreatureDrag?>
    let drop: (SandboxCreature, CGPoint) -> Void
    @State private var level = 1

    var body: some View {
        let creatures = model.catalogue.filter { $0.level == level }.sorted { $0.rosterOrder < $1.rosterOrder }
        let columns = max(1, (creatures.count + 1) / 2)
        let rail = min(74, max(36, boardWidth * 0.081))
        let gap = max(3, rail * 0.055)
        let width = min(96, (boardWidth * 0.90 - rail - 16 - CGFloat(columns) * gap) / CGFloat(columns),
                        viewportHeight * 0.116)
        let height = width * 256 / 190
        let railHeight = height * 2 + gap
        return HStack(alignment: .top, spacing: gap * 2) {
            VStack(spacing: gap) {
                Button(action: model.toggleRoster) {
                    Image(systemName: model.rosterOpen ? "chevron.left" : "chevron.right")
                        .font(.system(size: rail * 0.37, weight: .medium))
                        .foregroundStyle(BattlePalette.sidebarTitle)
                        .frame(width: rail * 0.80, height: rail * 0.74)
                        .background { RosterPlate(active: false, green: true) }
                }
                .buttonStyle(BattleButtonStyle())
                .accessibilityLabel(model.rosterOpen ? "Hide creature roster" : "Show creature roster")
                .keyboardShortcut("u", modifiers: [])

                if model.rosterOpen {
                    ForEach(1...4, id: \.self) { rank in
                        Button {
                            level = rank
                            model.cancelSelection()
                        } label: {
                            Text("L\(rank)")
                                .font(BattleResources.display(min(25, rail * 0.37)))
                                .foregroundStyle(rank == level ? BattlePalette.parchment : BattlePalette.sidebarTitle)
                                .frame(width: rail, height: max(16, (railHeight - rail * 0.74 - gap * 4) / 4))
                                .background { RosterPlate(active: rank == level) }
                        }
                        .buttonStyle(BattleButtonStyle())
                        .accessibilityLabel("Level \(rank)")
                        .accessibilityAddTraits(rank == level ? .isSelected : [])
                    }
                }
            }
            .frame(width: rail)
            if model.rosterOpen {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(width), spacing: gap), count: columns), spacing: gap) {
                    ForEach(creatures) { creature in
                        let selected = (drag.wrappedValue?.creature.id ?? model.pendingCreature?.id) == creature.id
                        Button { model.selectRosterCreature(creature) } label: {
                            CreaturePortrait(name: creature.name)
                                .frame(width: width, height: height)
                                .clipShape(.rect(cornerRadius: 5))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 5)
                                        .strokeBorder(selected ? BattlePalette.gold : BattlePalette.sidebarTitle.opacity(0.64),
                                                      lineWidth: selected ? 2 : 1)
                                }
                                .contentShape(RoundedRectangle(cornerRadius: 5))
                        }
                        .buttonStyle(BattleButtonStyle())
                        .onHover { model.hoverRosterCreature(creature, hovering: $0) }
                        .simultaneousGesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("battlefield"))
                            .updating(drag) { value, state, _ in
                                state = RosterCreatureDrag(creature: creature, location: value.location)
                            }
                            .onEnded { value in drop(creature, value.location) })
                        .accessibilityLabel("Place \(creature.name)")
                        .accessibilityHint("Choose an open tile in a deployment zone")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .help("\(creature.name) · \(creature.faction.title) · \(creature.footprint.label)")
                    }
                }
            }
        }
        .padding(5)
        .background {
            RoundedRectangle(cornerRadius: 7).fill(.black.opacity(0.66))
                .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(BattlePalette.bronze.opacity(0.8)) }
        }
        .fixedSize()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Creature roster")
    }
}

private struct RosterPlate: View {
    let active: Bool
    var green = false

    var body: some View {
        let shape = BeveledPlate()
        let border = active ? BattlePalette.color(0xf5ad62) : BattlePalette.bronze
        let fill = green ? BattlePalette.color(0x142416) : active ? BattlePalette.color(0x2b190b) : BattlePalette.backdrop
        return shape.fill(fill)
            .overlay { shape.strokeBorder(border.opacity(0.90), lineWidth: active ? 2 : 1.5) }
            .overlay { shape.inset(by: 4).strokeBorder(border.opacity(0.55)) }
            .shadow(color: active ? border.opacity(0.52) : .clear, radius: 3)
    }
}

private struct BeveledPlate: InsettableShape {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let outline = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let corner = min(outline.width, outline.height) * 0.15
        return Path { path in
            path.move(to: CGPoint(x: outline.minX + corner, y: outline.minY))
            path.addLine(to: CGPoint(x: outline.maxX - corner, y: outline.minY))
            path.addLine(to: CGPoint(x: outline.maxX, y: outline.minY + corner))
            path.addLine(to: CGPoint(x: outline.maxX, y: outline.maxY - corner))
            path.addLine(to: CGPoint(x: outline.maxX - corner, y: outline.maxY))
            path.addLine(to: CGPoint(x: outline.minX + corner, y: outline.maxY))
            path.addLine(to: CGPoint(x: outline.minX, y: outline.maxY - corner))
            path.addLine(to: CGPoint(x: outline.minX, y: outline.minY + corner))
            path.closeSubpath()
        }
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        BeveledPlate(insetAmount: insetAmount + amount)
    }
}

struct SandboxStackEditor: View {
    let model: SkirmishModel
    let stack: Stack
    @State private var draftAmount: String
    @Binding private var splitAmount: Int

    init(model: SkirmishModel, stack: Stack, splitAmount: Binding<Int>) {
        self.model = model
        self.stack = stack
        _draftAmount = State(initialValue: String(stack.amount))
        _splitAmount = splitAmount
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(LocalizedStringKey(stack.name))
                .font(BattleResources.display(13))
                .foregroundStyle(BattlePalette.gold)
            HStack(spacing: 5) {
                TextField("Stack size", text: $draftAmount)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .onSubmit(applyAmount)
                amountStep("minus", delta: -1)
                amountStep("plus", delta: 1)
            }
            .padding(4)
            .background(.black.opacity(0.48))
            .overlay { Rectangle().strokeBorder(BattlePalette.bronze.opacity(0.7)).allowsHitTesting(false) }
            HStack(spacing: 6) {
                BattlePlate("CLONE", height: 28, tint: nil) { model.duplicateSelectedStack() }
                    .help("Clone the selected stack (C)")
                BattlePlate("ACCEPT", height: 28, tint: BattlePalette.color(0x693012), action: applyAmount)
                    .disabled(validAmount == nil || validAmount == stack.amount)
                    .opacity(validAmount == nil || validAmount == stack.amount ? 0.58 : 1)
            }
            footprintMenu
            if stack.amount > 1 { splitSlider }
            HStack(spacing: 6) {
                BattlePlate("SPLIT", height: 28, tint: nil) { model.duplicateSelectedStack(split: splitAmount) }
                    .help("Split the selected stack (S)")
                    .disabled(stack.amount < 2)
                    .opacity(stack.amount < 2 ? 0.58 : 1)
                BattlePlate("DELETE", height: 28, tint: BattlePalette.color(0x5c0a0a), action: model.removeSelectedStack)
                    .keyboardShortcut(.delete, modifiers: [])
                    .help("Delete the selected stack (D)")
            }
        }
        .font(.caption)
        .controlSize(.small)
        .onChange(of: stack.amount) { draftAmount = String(stack.amount) }
    }

    private var validAmount: Int? {
        guard let amount = Int(draftAmount), (1...9999).contains(amount) else { return nil }
        return amount
    }

    private func applyAmount() {
        if let validAmount { model.changeAmount(validAmount) }
    }

    private func amountStep(_ symbol: String, delta: Int) -> some View {
        Button {
            draftAmount = String(min(9999, max(1, (validAmount ?? stack.amount) + delta)))
        } label: {
            Image(systemName: symbol).font(.system(size: 9, weight: .semibold))
                .foregroundStyle(BattlePalette.gold)
                .frame(width: 22, height: 20)
                .background(BattlePalette.color(0x34170c))
                .overlay { Rectangle().strokeBorder(BattlePalette.bronze.opacity(0.8)) }
                .contentShape(Rectangle())
        }
        .buttonStyle(BattleButtonStyle())
        .accessibilityLabel(delta > 0 ? "Increase stack size" : "Decrease stack size")
    }

    private var footprintMenu: some View {
        HStack {
            Text("Footprint").font(BattleResources.display(12))
            Spacer(minLength: 0)
            Menu {
                ForEach(Footprint.allCases, id: \.self) { shape in
                    Button { model.changeFootprint(shape) } label: {
                        if shape == stack.footprint { Label(shape.label, systemImage: "checkmark") }
                        else { Text(shape.label) }
                    }
                }
            } label: {
                HStack(spacing: 7) {
                    Text(stack.footprint.label).font(BattleResources.display(12))
                    Image(systemName: "chevron.down").font(.system(size: 8))
                }
                .foregroundStyle(BattlePalette.sidebarTitle)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(.black.opacity(0.40))
                .overlay { Rectangle().strokeBorder(BattlePalette.bronze.opacity(0.65)).allowsHitTesting(false) }
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .accessibilityLabel("Footprint")
            .accessibilityValue(stack.footprint.label)
        }
    }

    private var splitSlider: some View {
        VStack(spacing: 3) {
            HStack {
                TextField("Split amount", value: $splitAmount, format: .number.grouping(.never))
                    .multilineTextAlignment(.center)
                    .frame(width: 50)
                Spacer(minLength: 0)
                Text(String(stack.amount - splitAmount))
                    .accessibilityLabel("Remaining stack size \(stack.amount - splitAmount)")
            }
            .font(BattleResources.display(12))
            Slider(value: Binding(get: { Double(splitAmount) }, set: { splitAmount = Int($0.rounded()) }),
                   in: 1...Double(max(2, stack.amount - 1))) { Text("Split amount") }
                .labelsHidden()
                .tint(BattlePalette.color(0xb66b42))
                .disabled(stack.amount <= 2)
        }
        .padding(.horizontal, 3)
    }
}
