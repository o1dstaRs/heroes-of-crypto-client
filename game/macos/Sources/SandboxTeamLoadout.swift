import SwiftUI

struct SandboxTeamLoadout: View {
    let model: SkirmishModel
    let options: SandboxLoadoutOptions
    let preview: SandboxTeamPreview
    @State private var augmentsOpen = true
    @State private var openAugment: SandboxAugment? = .placement
    private var loadout: SandboxLoadout { model.loadouts[preview.team] ?? SandboxLoadout() }
    private var remaining: Int { options.maximumPoints - loadout.spent }
    private let accent = BattlePalette.color(0xff8f00)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            synergyRow
            Divider()
            Button {
                augmentsOpen.toggle()
            } label: {
                HStack {
                    Text("Augments").font(BattleResources.display(14))
                    Spacer(minLength: 0)
                    SidebarIcon(asset: "tr_up", symbol: "chevron.up")
                        .rotationEffect(.degrees(augmentsOpen ? 0 : 180)).frame(width: 10, height: 10)
                }
                .foregroundStyle(augmentsOpen ? accent : BattlePalette.sidebarTitle)
                .contentShape(Rectangle())
            }
            .buttonStyle(BattleButtonStyle())
            .accessibilityValue(augmentsOpen ? "Expanded" : "Collapsed")
            if augmentsOpen {
                augmentIcons
                Text("Remaining Points: \(remaining)")
                    .font(BattleResources.display(12))
                    .foregroundStyle(accent)
                if let openAugment { augmentChoices(openAugment) }
            }
            Divider()
            Text("Artifacts").font(BattleResources.display(14)).foregroundStyle(accent)
                .accessibilityAddTraits(.isHeader)
            artifactGrid(tier: 1, selected: loadout.tier1)
            if loadout.tier1 == options.barrelBarricade { barrelControls }
            artifactGrid(tier: 2, selected: loadout.tier2)
        }
        .font(.caption)
        .foregroundStyle(BattlePalette.parchment)
        .onDisappear {
            if model.placingBarrel?.team == preview.team { model.cancelBarrelPlacement() }
        }
    }

    private var synergyRow: some View {
        HStack(spacing: 2) {
            ForEach(["Life", "Chaos", "Might", "Nature"], id: \.self) { faction in
                ForEach(options.synergyVariants[faction] ?? [], id: \.self) { variant in
                    synergy(faction: faction, variant: variant)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(preview.team.title) faction synergies")
    }

    private func synergy(faction: String, variant: Int) -> some View {
        let level = preview.levels[faction, default: 0]
        let selected = level > 0 && (loadout.synergies[faction] ?? options.synergyDefaults[faction]) == variant
        let key = "\(faction):\(variant)"
        let artKey = "\(key):\(max(1, level))"
        let art = BattleResources.synergies[artKey]
        let name = "\(faction) \(Self.synergyNames[key] ?? "Synergy")"
        let unlock = level == 0 ? "Deploy two distinct \(faction) creatures to unlock." : "Level \(level)"
        return Button {
            if level > 0 && !selected { model.editLoadout(for: preview.team) { $0.synergies[faction] = variant } }
        } label: {
            VStack(spacing: 3) {
                SidebarIcon(asset: art?.icon ?? "", symbol: "sparkles")
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1, contentMode: .fit)
                    .saturation(selected ? 1 : 0)
                    .opacity(selected ? 1 : level > 0 ? 0.72 : 0.34)
                HStack(spacing: 2) {
                    ForEach(1...3, id: \.self) { dot in
                        Circle().fill(dot <= level ? accent.opacity(selected ? 1 : 0.5) : .white.opacity(0.16))
                            .frame(width: 3, height: 3)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(BattleButtonStyle())
        .disabled(level == 0)
        .help(art.map { "\(name) · \(unlock)\n\($0.description)" } ?? "\(name) · \(unlock)")
        .accessibilityLabel(name)
        .accessibilityValue(level == 0 ? "Locked" : "Level \(level)\(selected ? ", active" : "")")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var augmentIcons: some View {
        HStack(spacing: 4) {
            ForEach(SandboxAugment.allCases) { augment in
                let selected = openAugment == augment
                Button {
                    openAugment = selected ? nil : augment
                } label: {
                    SidebarIcon(asset: augment.icon, symbol: "shield")
                        .aspectRatio(1, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .padding(2)
                        .opacity(selected ? 1 : 0.65)
                        .background(accent.opacity(selected ? 0.13 : 0), in: RoundedRectangle(cornerRadius: 4))
                        .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(BattlePalette.gold.opacity(selected ? 0.92 : 0)) }
                        .contentShape(Rectangle())
                }
                .buttonStyle(BattleButtonStyle())
                .help(augment.title)
                .accessibilityLabel(augment.title)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func augmentChoices(_ augment: SandboxAugment) -> some View {
        let current = loadout.augments[augment.rawValue, default: 0]
        let labels = options.augmentLabels[augment.rawValue] ?? []
        return VStack(alignment: .leading, spacing: 2) {
            Text(augment.title).font(BattleResources.display(12)).foregroundStyle(BattlePalette.sidebarTitle)
            ForEach(labels.indices, id: \.self) { level in
                let selected = level == current
                let allowed = level <= remaining + current
                Button {
                    model.editLoadout(for: preview.team) { $0.augments[augment.rawValue] = level }
                } label: {
                    HStack(spacing: 5) {
                        SidebarRadio(selected: selected)
                            .frame(width: 17, height: 17)
                        Text(labels[level]).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 22)
                    .foregroundStyle(selected ? BattlePalette.gold : BattlePalette.parchment)
                    .opacity(allowed ? 1 : 0.4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(BattleButtonStyle())
                .disabled(!allowed)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BattlePalette.backdrop.opacity(0.78), in: RoundedRectangle(cornerRadius: 4))
        .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(BattlePalette.bronze.opacity(0.6)) }
    }

    private func artifactGrid(tier: Int, selected: Int) -> some View {
        let equipped = options.artifacts.first { $0.tier == tier && $0.id == selected }
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text("Tier \(tier)").font(BattleResources.display(12))
                if let equipped {
                    Spacer(minLength: 4)
                    Text(equipped.name).lineLimit(1).foregroundStyle(BattlePalette.gold)
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 4), spacing: 4) {
                ForEach(options.artifacts.filter { $0.tier == tier }) { artifact in
                    let chosen = artifact.id == selected
                    Button {
                        model.editLoadout(for: preview.team) { loadout in
                            let value = chosen ? 0 : artifact.id
                            if tier == 1 { loadout.tier1 = value }
                            else { loadout.tier2 = value }
                        }
                    } label: {
                        SidebarIcon(asset: artifact.imageKey, symbol: "seal")
                            .aspectRatio(1, contentMode: .fit)
                            .frame(maxWidth: 51)
                            .padding(2)
                            .opacity(chosen ? 1 : 0.77)
                            .background(BattlePalette.backdrop.opacity(0.56), in: RoundedRectangle(cornerRadius: 4))
                            .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(BattlePalette.gold.opacity(chosen ? 1 : 0.24)) }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(BattleButtonStyle())
                    .help("\(artifact.name)\n\(artifact.description)")
                    .accessibilityLabel(artifact.name)
                    .accessibilityHint(artifact.description)
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
            }
        }
    }

    private var barrelControls: some View {
        let placing = model.placingBarrel?.team == preview.team
        return VStack(alignment: .leading, spacing: 5) {
            Text("Barrel Barricade · \(preview.barrels.count)/2 placed").font(BattleResources.display(11))
            ForEach(0..<2, id: \.self) { index in
                let slot = SandboxBarrelSlot(team: preview.team, index: index)
                let barrel = preview.barrels.first { $0.index == index }
                HStack(spacing: 5) {
                    Text("Barrel \(index + 1) · \(barrel?.cell.label ?? "unplaced")")
                    Spacer(minLength: 0)
                    Button(barrel == nil ? "Place" : "Move") { model.beginBarrelPlacement(slot) }
                        .tint(model.placingBarrel == slot ? accent : BattlePalette.gold)
                    if barrel != nil { Button("Remove") { model.removeBarrel(slot) } }
                }
            }
            if placing {
                Text("Click an empty cell in this deployment zone.").foregroundStyle(BattlePalette.sidebarTitle)
                Button("Cancel", action: model.cancelBarrelPlacement)
            } else {
                Text("Drag a white-outlined barrel or click it to move it.").foregroundStyle(BattlePalette.sidebarTitle)
            }
        }
        .buttonStyle(.borderless)
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BattlePalette.backdrop.opacity(0.72), in: RoundedRectangle(cornerRadius: 4))
    }

    static let synergyNames = [
        "Life:1": "Supply", "Life:2": "Morale & Luck",
        "Nature:1": "Army Slots", "Nature:2": "Flying Armor",
        "Chaos:1": "Movement", "Chaos:2": "Break",
        "Might:1": "Aura Range", "Might:2": "Ability Power",
    ]
}

private extension SandboxAugment {
    var icon: String { "\(self == .placement ? "board" : rawValue.lowercased())_augment_256" }
}
