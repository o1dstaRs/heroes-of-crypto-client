import SwiftUI

struct SandboxTeamLoadout: View {
    let model: SkirmishModel
    let options: SandboxLoadoutOptions
    let preview: SandboxTeamPreview
    let compact: Bool
    @Environment(\.locale) private var locale
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
            .accessibilityValue(Text(LocalizedStringKey(augmentsOpen ? "Expanded" : "Collapsed")))
            if augmentsOpen {
                augmentIcons
                Text("Remaining Points: \(remaining)")
                    .font(BattleResources.display(12))
                    .foregroundStyle(accent)
                if let openAugment { augmentChoices(openAugment) }
            }
            artifactPicker
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
        .accessibilityLabel("\(Text(LocalizedStringKey(preview.team.title))) faction synergies")
    }

    private func synergy(faction: String, variant: Int) -> some View {
        let level = preview.levels[faction, default: 0]
        let selected = level > 0 && (loadout.synergies[faction] ?? options.synergyDefaults[faction]) == variant
        let key = "\(faction):\(variant)"
        let artKey = "\(key):\(max(1, level))"
        let art = BattleResources.synergies[artKey]
        let factionName = GameLocalization.text(faction, locale: locale)
        let synergyName = GameLocalization.text(Self.synergyNames[key] ?? "Synergy", locale: locale)
        let name = "\(factionName) · \(synergyName)"
        let unlock = level == 0 ? GameLocalization.format("Deploy two distinct %@ creatures to unlock.", locale: locale, factionName) :
            GameLocalization.format("Level %lld", locale: locale, level)
        let description = art.map { locale.language.languageCode?.identifier == "ru" ? $0.descriptionRu ?? $0.description : $0.description }
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
        .help(description.map { "\(name) · \(unlock)\n\($0)" } ?? "\(name) · \(unlock)")
        .accessibilityLabel(name)
        .accessibilityValue(level == 0 ? GameLocalization.text("Locked", locale: locale) : unlock)
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
                .help(Text(LocalizedStringKey(augment.title)))
                .accessibilityLabel(Text(LocalizedStringKey(augment.title)))
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func augmentChoices(_ augment: SandboxAugment) -> some View {
        let current = loadout.augments[augment.rawValue, default: 0]
        let labels = options.augmentLabels[augment.rawValue] ?? []
        return VStack(alignment: .leading, spacing: 2) {
            Text(LocalizedStringKey(augment.title)).font(BattleResources.display(12)).foregroundStyle(BattlePalette.sidebarTitle)
            ForEach(labels.indices, id: \.self) { level in
                let selected = level == current
                let allowed = level <= remaining + current
                Button {
                    model.editLoadout(for: preview.team) { $0.augments[augment.rawValue] = level }
                } label: {
                    HStack(spacing: 5) {
                        SidebarRadio(selected: selected)
                            .frame(width: 17, height: 17)
                        Text(LocalizedStringKey(labels[level])).fixedSize(horizontal: false, vertical: true)
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

    private var artifactPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(BattlePalette.bronze.opacity(0.55)).frame(height: 1)
            Text("Artifacts").font(BattleResources.display(17)).tracking(1)
                .foregroundStyle(accent)
                .padding(.horizontal, 4).padding(.vertical, 2)
                .accessibilityAddTraits(.isHeader)
            artifactGrid(tier: 1, selected: loadout.tier1)
            if loadout.tier1 == options.barrelBarricade { barrelControls.padding(.vertical, 4) }
            artifactGrid(tier: 2, selected: loadout.tier2)
            Divider().opacity(0.45).padding(.top, 2)
        }
    }

    private func artifactGrid(tier: Int, selected: Int) -> some View {
        let columnCount = 4
        let tileSide: CGFloat = compact ? 35 : 52
        let spacing: CGFloat = compact ? 2 : 4
        let artworkInset: CGFloat = compact ? 1 : 2
        let columns = Array(repeating: GridItem(.flexible(minimum: 0, maximum: tileSide), spacing: spacing), count: columnCount)
        let gridWidth = tileSide * CGFloat(columnCount) + spacing * CGFloat(columnCount - 1)
        return VStack(spacing: 0) {
            Text("Tier \(tier)").font(BattleResources.display(13))
                .foregroundStyle(BattlePalette.sidebarTitle)
                .frame(height: 22)
                .accessibilityAddTraits(.isHeader)
            LazyVGrid(columns: columns, spacing: spacing) {
                ForEach(options.artifacts.filter { $0.tier == tier }) { artifact in
                    let chosen = artifact.id == selected
                    Button {
                        model.editLoadout(for: preview.team) { loadout in
                            let value = chosen ? 0 : artifact.id
                            if tier == 1 { loadout.tier1 = value }
                            else { loadout.tier2 = value }
                        }
                    } label: {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .overlay { SidebarIcon(asset: artifact.imageKey, symbol: "seal").padding(artworkInset) }
                            .overlay {
                                if chosen {
                                    RoundedRectangle(cornerRadius: 4).strokeBorder(BattlePalette.gold, lineWidth: 2)
                                        .shadow(color: BattlePalette.gold.opacity(0.7), radius: 3)
                                        .padding(1)
                                        .allowsHitTesting(false)
                                }
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(BattleButtonStyle(magnifies: true))
                    .help("\(artifact.name)\n\(artifact.description)")
                    .accessibilityLabel(Text(LocalizedStringKey(artifact.name)))
                    .accessibilityHint(artifact.description)
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
            }
            .frame(maxWidth: gridWidth)
        }
        .frame(maxWidth: .infinity)
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
