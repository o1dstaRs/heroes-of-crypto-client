import SwiftUI

struct SandboxPlacementSidebar: View {
    let model: SkirmishModel
    let battle: BattleView
    let compact: Bool
    let canPlaceRosterCreature: Bool
    let splitAmount: Binding<Int>

    private enum Section: Hashable { case army, board, team(Team) }
    @State private var expanded: Set<Section> = [.army]

    var body: some View {
        ScrollView {
            VStack(spacing: compact ? 5 : 12) {
                section(.army, title: "Army", icon: "army_icon", symbol: "shield") {
                    VStack(spacing: 10) {
                        if let creature = model.pendingCreature {
                            if canPlaceRosterCreature {
                                Text("Place \(creature.name) on an open tile.")
                                    .font(BattleResources.display(12))
                                    .foregroundStyle(BattlePalette.gold)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        } else if let stack = model.selectedDeploymentStack {
                            SandboxStackEditor(model: model, stack: stack, splitAmount: splitAmount).id(stack.id)
                        } else {
                            Text(battle.stacks.isEmpty ? "Choose a creature from the roster." : "Select a stack to edit it.")
                                .font(BattleResources.display(12))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        BattlePlate("LOAD SAMPLE ARMIES", height: 29, tint: nil, action: model.loadSampleArmies)
                            .help("Deploy six stacks per side using the current augments.")
                    }
                }
                section(.board, title: "Board", icon: "board_icon", symbol: "square.grid.4x3.fill") {
                    boardChoices
                }
                section(.team(.player), title: "Green", icon: "flag_green_icon", symbol: "flag.fill",
                        accent: BattlePalette.color(0x9fc487)) {
                    teamLoadout(.player)
                }
                section(.team(.opponent), title: "Red", icon: "flag_red_icon", symbol: "flag.fill",
                        accent: BattlePalette.color(0xdc9a78)) {
                    teamLoadout(.opponent)
                }
                if let problem = model.problem {
                    Text(problem).foregroundStyle(BattlePalette.opponent).font(.caption)
                }
            }
            .padding(.vertical, 1)
        }
        .scrollBounceBehavior(.basedOnSize)
        .onChange(of: battle.deploying, initial: true) { openSelectedTeam() }
        .onChange(of: model.selectionRequested) { openSelectedTeam() }
    }

    private func openSelectedTeam() {
        guard let stack = model.selectedDeploymentStack else { return }
        expanded.remove(.team(stack.team == .player ? .opponent : .player))
        expanded.insert(.team(stack.team))
    }

    private func section<Content: View>(_ section: Section, title: String, icon: String, symbol: String,
                                        accent: Color = BattlePalette.gold, @ViewBuilder content: () -> Content) -> some View {
        let isOpen = expanded.contains(section)
        return VStack(spacing: 0) {
            Button {
                if isOpen { expanded.remove(section) }
                else { expanded = [section] }
            } label: {
                HStack(spacing: 10) {
                    SidebarIcon(asset: icon, symbol: symbol)
                        .frame(width: 46, height: compact ? 39 : 46)
                    Text(title.uppercased()).font(BattleResources.display(14)).tracking(1.4)
                        .foregroundStyle(isOpen ? accent : BattlePalette.sidebarTitle)
                    Spacer(minLength: 0)
                    SidebarIcon(asset: "tr_up", symbol: "chevron.up")
                        .rotationEffect(.degrees(isOpen ? 0 : 180))
                        .frame(width: 12, height: 12)
                }
                .padding(.horizontal, 7)
                .frame(height: compact ? 52 : 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(BattleButtonStyle())
            .accessibilityLabel(title)
            .accessibilityValue(isOpen ? "Expanded" : "Collapsed")
            Rectangle().fill(BattlePalette.bronze.opacity(0.35)).frame(height: 1)
                .accessibilityHidden(true)
            if isOpen {
                content().padding(.horizontal, 8).padding(.vertical, 10)
            }
        }
        .padding(10)
        .background { SidebarFrame(army: section == .army) }
    }

    private var boardChoices: some View {
        VStack(spacing: 0) {
            ForEach(BattlefieldMap.allCases, id: \.self) { map in
                let selected = battle.map == map
                Button { model.selectMap(map) } label: {
                    HStack(spacing: 8) {
                        SidebarRadio(selected: selected)
                            .frame(width: 22, height: 22)
                        Text(map.title.uppercased()).font(BattleResources.display(13)).tracking(0.6)
                            .foregroundStyle(BattlePalette.color(0xff8f00).opacity(selected ? 1 : 0.60))
                        Spacer(minLength: 0)
                    }
                    .frame(height: 34)
                    .contentShape(Rectangle())
                }
                .buttonStyle(BattleButtonStyle())
                .accessibilityLabel(map.title)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .help(selected && map == .barrels ? "Reroll the barrels" : map.title)
            }
        }
        .padding(8)
        .background(.black.opacity(0.28))
        .overlay { Rectangle().strokeBorder(BattlePalette.bronze.opacity(0.52)).allowsHitTesting(false) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Battlefield")
    }

    @ViewBuilder
    private func teamLoadout(_ team: Team) -> some View {
        if let options = model.loadoutOptions, let preview = model.teamPreview[team] {
            SandboxTeamLoadout(model: model, options: options, preview: preview)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct SandboxStartControls: View {
    let model: SkirmishModel

    var body: some View {
        VStack(spacing: 7) {
            LinearGradient(colors: [.clear, BattlePalette.color(0xbd6537), .clear],
                           startPoint: .leading, endPoint: .trailing)
                .frame(height: 2)
                .overlay {
                    Rectangle().fill(BattlePalette.color(0xd06d36))
                        .overlay { Rectangle().strokeBorder(BattlePalette.backdrop, lineWidth: 1) }
                        .frame(width: 7, height: 7).rotationEffect(.degrees(45))
                }
                .accessibilityHidden(true)
            BattlePlate("START", height: 44, tint: nil, action: model.ready)
                .frame(maxWidth: 180)
                .disabled(!model.canStart)
                .opacity(model.canStart ? 1 : 0.56)
            HStack(spacing: 8) {
                aiOrb(.player, asset: "ui_ai_toggle_orb_green_on")
                aiOrb(.opponent, asset: "ui_ai_toggle_orb_red_on")
            }
            .overlay(alignment: .leading) {
                Text("AI").font(BattleResources.display(13))
                    .offset(x: -22)
                    .accessibilityHidden(true)
            }
        }
        .padding(.bottom, 13)
    }

    private func aiOrb(_ team: Team, asset: String) -> some View {
        let active = model.automatedTeams.contains(team)
        let size: CGFloat = 32
        return Button { model.toggleAutomation(team) } label: {
            SidebarIcon(asset: asset, symbol: "circle.fill")
                .frame(width: size, height: size)
                .clipShape(Circle().inset(by: 0.5))
                .overlay {
                    if !active {
                        Circle()
                            .fill(RadialGradient(colors: [BattlePalette.color(0x23221f), BattlePalette.color(0x0b0b09)],
                                                 center: .topLeading, startRadius: 0, endRadius: 16))
                            .frame(width: size * 0.57, height: size * 0.57)
                    }
                }
                .shadow(color: active ? BattlePalette.team(team).opacity(0.40) : .black.opacity(0.55), radius: 4, y: 1)
                .contentShape(Circle())
        }
        .buttonStyle(BattleButtonStyle(magnifies: true))
        .accessibilityLabel("\(team.title) AI")
        .accessibilityValue(active ? "On" : "Off")
        .help("\(team.title) AI")
    }
}
