import SwiftUI

struct SidebarLayout {
    let width: CGFloat
    let height: CGFloat
    let controlSize: CGFloat

    init(viewport: CGSize) {
        let legacyWidth = ((viewport.width - min(viewport.width, viewport.height)) / 2).rounded()
        width = max((legacyWidth * 0.85).rounded(), min(256, (viewport.width / 4).rounded(.down)))
        height = viewport.height
        controlSize = (57 * min(viewport.width / 1366, viewport.height / 768)).rounded()
    }

    var sideInset: CGFloat { min(20, max(10, (width * 0.045).rounded())) }
    var leftInset: CGFloat { min(13, max(6, (width * 0.0245).rounded())) }
    var combatTop: CGFloat { ((min(24, max(12, (height * 0.022).rounded())) - 4) / 2).rounded() + 4 }
    var combatHeight: CGFloat { controlSize * 6 + 40 }
    var portraitHeight: CGFloat { min(430, (width - 2 * leftInset) * 1.36, height * 0.37) }
    var queueHeight: CGFloat { min(112, height * 0.14) }
}

struct LeftBattleSidebar: View {
    let model: SkirmishModel
    let battle: BattleView
    let layout: SidebarLayout
    @State private var inspection: (name: String, bitmap: CGImage)?

    var body: some View {
        let focus = model.inspected ?? battle.active
        let rosterPreview = model.rosterInspectionStack
        let preloadedNames = Array(Set(battle.stacks.map(\.name)).sorted().prefix(6))
        VStack(spacing: 0) {
            if let stack = rosterPreview ?? battle.stacks.first(where: { $0.id == focus }) {
                portrait(stack, fromRoster: rosterPreview != nil)
                    .frame(height: layout.portraitHeight)
                ScrollView {
                    BattleUnitDetails(stack: stack, width: layout.width)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 1)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                Spacer(minLength: 0)
            }
            if battle.started {
                if battle.active != nil { turnFooter }
            } else {
                SandboxStartControls(model: model)
            }
        }
        .padding(.horizontal, layout.leftInset)
        .frame(maxHeight: .infinity)
        .foregroundStyle(BattlePalette.parchment)
        .task(id: preloadedNames) {
            for name in preloadedNames {
                if Task.isCancelled { break }
                _ = await BattleResources.loadInspectorPortrait(for: name, priority: .utility)
            }
        }
    }

    private func portrait(_ stack: Stack, fromRoster: Bool) -> some View {
        let width = layout.width - 2 * layout.leftInset
        let flagWidth = width * 0.94
        let alive = CGFloat(stack.amount) / CGFloat(max(1, stack.amount + stack.losses))
        let plaqueColor = fromRoster ? BattlePalette.bronze : BattlePalette.cloth(stack.team)
        let bitmap = inspection?.name == stack.name ? inspection?.bitmap : BattleResources.inspectorPortrait(for: stack.name)
        return ZStack(alignment: .bottom) {
            CreaturePortrait(name: stack.name, team: fromRoster ? nil : stack.team, inspector: true, inspectionArt: bitmap)
                .frame(width: width, height: layout.portraitHeight)
            VStack(spacing: 0) {
                Text(stack.name.uppercased())
                    .font(BattleResources.display(13.5)).tracking(0.9)
                    .lineLimit(1).minimumScaleFactor(0.65)
                    .foregroundStyle(BattlePalette.color(0xecd198))
                    .frame(width: flagWidth, height: 20)
                    .background {
                        ZStack {
                            if !fromRoster, let cloth = BattleResources.nameFlag(stack.team, filled: true) {
                                if let empty = BattleResources.nameFlag(stack.team, filled: false) {
                                    Image(decorative: empty, scale: 1).resizable()
                                }
                                Image(decorative: cloth, scale: 1).resizable()
                                    .mask(alignment: .leading) { Rectangle().frame(width: flagWidth * alive) }
                            } else {
                                LinearGradient(colors: [plaqueColor, .black, plaqueColor],
                                               startPoint: .leading, endPoint: .trailing)
                            }
                        }
                        .opacity(0.875)
                    }
                    .shadow(color: .black.opacity(0.85), radius: 1)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                stats(stack)
            }
        }
        .clipped()
        .task(id: stack.name) {
            let image = await BattleResources.loadInspectorPortrait(for: stack.name)
            if !Task.isCancelled { inspection = image.map { (stack.name, $0) } }
        }
    }

    private func stats(_ stack: Stack) -> some View {
        let items = BattleUnitStat.rows(for: stack)
        let rowHeight: CGFloat = layout.height >= 800 ? 30 : 23
        let gap: CGFloat = layout.height >= 800 ? 8 : 4
        let columns = Array(repeating: GridItem(.flexible(minimum: 0), spacing: 8), count: 3)
        return LazyVGrid(columns: columns, spacing: gap) {
            ForEach(0..<items.count, id: \.self) { index in
                let row = items[index]
                HStack(spacing: 3) {
                    ForEach(row, id: \.icon) { stat in
                        HStack(spacing: 3) {
                            SidebarIcon(asset: "stat_\(stat.icon)", symbol: stat.symbol)
                                .frame(width: row.count == 1 ? 17 : 12, height: 17)
                            Text(stat.value)
                                .font(.system(size: 11)).monospacedDigit()
                                .foregroundStyle(BattlePalette.statText)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(stat.label)
                        .accessibilityValue(stat.value)
                        .unitInspectionHover(stat.detail)
                    }
                }
                .frame(maxWidth: .infinity).frame(height: rowHeight)
                .background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 5))
                .overlay {
                    RoundedRectangle(cornerRadius: 5).strokeBorder(BattlePalette.bronze.opacity(0.24))
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(height: 3 * rowHeight + 2 * gap, alignment: .top)
        .padding(.horizontal, 5)
        .padding(.vertical, layout.height >= 800 ? 10 : 7)
        .background(LinearGradient(colors: [.black.opacity(0.63), .black.opacity(0.78), .black.opacity(0.45)],
                                   startPoint: .top, endPoint: .bottom))
    }

    private var turnFooter: some View {
        let order = [battle.active].compactMap { $0 } + battle.queue
        return VStack(spacing: battle.playerTurn ? 24 : 8) {
            VStack(spacing: 9) {
                Text(turnTitle)
                    .font(BattleResources.display(14))
                    .foregroundStyle(battle.playerTurn ? BattlePalette.opponent : BattlePalette.sidebarTitle)
                    .accessibilityIdentifier("TurnStatus")
                HStack(spacing: 6) {
                    VStack(spacing: 0) {
                        Text("LAP").font(BattleResources.display(8)).tracking(0.7)
                            .foregroundStyle(BattlePalette.gold)
                        Text(battle.lap, format: .number).font(BattleResources.display(17))
                    }
                    .frame(width: 40, height: 40)
                    .background(BattlePalette.bronze.opacity(0.25), in: Circle())
                    .overlay { Circle().strokeBorder(BattlePalette.gold, lineWidth: 2) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Lap \(battle.lap)")
                    if let active = battle.activeStack {
                        VStack(spacing: 4) {
                            Text(active.name)
                                .font(BattleResources.display(11)).tracking(0.5)
                                .foregroundStyle(BattlePalette.team(active.team))
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity)
                            if let window = model.turnWindow {
                                clock(window)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 5)
            .padding(.horizontal, 5)
            .frame(height: battle.playerTurn ? 90 : 72, alignment: .top)
            .background(BattlePalette.backdrop.opacity(0.85), in: RoundedRectangle(cornerRadius: 6))
            .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(BattlePalette.bronze.opacity(0.4)) }

            ScrollView(.horizontal) {
                HStack(alignment: .center, spacing: 10) {
                    ForEach(Array(order.enumerated()), id: \.offset) { index, id in
                        if let stack = battle.stacks.first(where: { $0.id == id }) {
                            StackPortraitButton(stack: stack, width: (index == 0 ? 1.09 : 1) * min(74, layout.width / 3.4),
                                                height: min(88, layout.queueHeight - 16), selected: index == 0, showsPower: true) {
                                model.select(stack)
                            }
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
            }
            .defaultScrollAnchor(.leading)
            .id(battle.active)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .frame(height: layout.queueHeight, alignment: .top)
            .background {
                GeometryReader { metrics in
                    if let background = BattleResources.image("ui_up_next_smoky_chains_bg_85pct_v5") {
                        Image(nsImage: background).resizable().scaledToFill()
                            .frame(width: metrics.size.width, height: metrics.size.height).clipped()
                    } else {
                        RoundedRectangle(cornerRadius: 5).fill(.black.opacity(0.31))
                    }
                }
            }
            .accessibilityLabel("Turn queue")
        }
        .padding(.bottom, 8)
    }

    private var turnTitle: String {
        guard let team = battle.activeStack?.team else { return "Battle" }
        if battle.automatedTurn { return "\(team.title) AI" }
        return model.automatedTeams.count == 1 ? "Your turn" : "\(team.title)’s turn"
    }

    private func clock(_ window: SandboxTurnClock.Window) -> some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { _ in
            let seconds = window.remaining(at: ContinuousClock.now)
            let fraction = window.limit > 0 ? seconds / window.limit : 0
            let tone = seconds <= 5 ? BattlePalette.opponent : BattlePalette.gold
            HStack(spacing: 4) {
                GeometryReader { meter in
                    Capsule().fill(.black.opacity(0.58))
                        .overlay(alignment: .leading) {
                            Capsule().fill(tone.gradient).frame(width: meter.size.width * fraction)
                        }
                        .overlay { Capsule().strokeBorder(BattlePalette.bronze) }
                }
                .frame(height: 9)
                .accessibilityHidden(true)
                Text(Int(ceil(seconds)), format: .number)
                    .font(BattleResources.display(11)).monospacedDigit()
                    .accessibilityLabel("\(Int(ceil(seconds))) seconds remaining")
                if model.canRequestTime {
                    Button(action: model.requestTime) {
                        Image(systemName: "plus").font(.system(size: 9, weight: .medium))
                            .foregroundStyle(BattlePalette.gold)
                            .frame(width: 17, height: 17)
                            .background(.black.opacity(0.45), in: Circle())
                            .overlay { Circle().strokeBorder(BattlePalette.bronze) }
                    }
                    .buttonStyle(BattleButtonStyle())
                    .accessibilityLabel("Request additional time")
                    .help("Request additional time")
                }
            }
        }
    }
}

struct RightBattleSidebar: View {
    let model: SkirmishModel
    let battle: BattleView
    let layout: SidebarLayout
    let openRanked: () -> Void
    let closeSandbox: () -> Void

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if battle.started {
                VStack(spacing: 9) {
                    HStack(alignment: .top, spacing: 6) {
                        controls
                        damagePanel
                    }
                    .frame(height: layout.combatHeight, alignment: .top)
                    battleLog
                    if model.fightSummary != nil && !model.showsFightResults && !model.isAnimating && !model.isReplaying {
                        BattlePlate("FIGHT RESULTS", height: 30, tint: nil) { model.setFightResultsVisible(true) }
                    }
                }
                .padding(.leading, layout.sideInset - 6)
                .padding(.trailing, layout.sideInset + 4)
                .padding(.top, layout.combatTop)
                .padding(.bottom, 114)
            } else {
                SandboxPlacementSidebar(model: model, battle: battle, compact: layout.height <= 800)
                    .padding(.horizontal, layout.sideInset)
                    .padding(.top, 24)
                    .padding(.bottom, 116)
                BattlePlate("PLAY RANKED", height: 36, tint: nil, action: openRanked)
                    .frame(maxWidth: 209)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, layout.sideInset + 9)
                    .padding(.bottom, 56)
            }
            BattleSystemControls(effectsEnabled: model.effectsEnabled, toggleEffects: model.toggleEffects)
                .padding(.trailing, layout.sideInset + 4)
                .padding(.bottom, 16)
        }
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 8) {
                if !battle.started {
                    BattlePlate("", icon: "arrow.counterclockwise", height: 32, tint: BattlePalette.color(0x381410)) {
                        model.clearArmies()
                    }
                    .frame(width: 32)
                    .accessibilityLabel("Start over")
                    .help("Clear the board")
                }
                BattleCloseButton(label: "Close Sandbox", action: closeSandbox)
            }
            .padding(.top, 8)
            .padding(.trailing, layout.sideInset + 4)
        }
        .foregroundStyle(BattlePalette.parchment)
        .frame(maxHeight: .infinity)
    }

    private var controls: some View {
        let mode = battle.mode ?? .none
        return VStack(spacing: 8) {
            medallion("hourglass", label: "Wait", symbol: "hourglass", disabled: !battle.canWait) { model.perform(.wait) }
                .keyboardShortcut("w", modifiers: [])
            medallion("luck", label: "Defend", symbol: "shield", disabled: false) { model.perform(.defend) }
                .keyboardShortcut("d", modifiers: [])
            medallion("next", label: "End turn", symbol: "forward.end", disabled: false) { model.perform(.endTurn) }
                .keyboardShortcut("e", modifiers: [])
            medallion("ai", label: "Autoplay AI", symbol: "brain.head.profile", disabled: battle.winner != nil || battle.stalled,
                      duringAutomation: true, active: model.autoplay, action: model.toggleAutoplay)
                .accessibilityValue(model.autoplay ? "On" : "Off")
            medallion(mode.icon, label: "Attack type · \(mode.title)", symbol: "scope", disabled: !battle.canCycle) {
                model.perform(.cycleAttack)
            }
            .keyboardShortcut("a", modifiers: [])
            .overlay(alignment: .bottom) {
                if battle.attackModes.count > 1 {
                    HStack(spacing: 2) {
                        ForEach(Array(battle.attackModes.enumerated()), id: \.offset) { _, choice in
                            SidebarIcon(asset: choice == mode ? "icon_active_option" : "icon_inactive_option",
                                        symbol: choice == mode ? "circle.fill" : "circle")
                                .frame(width: 11, height: 11)
                        }
                    }
                    .padding(.horizontal, 2)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
            }
            medallion("spellbook", label: "Spellbook", symbol: "book", disabled: battle.spells.isEmpty,
                      action: model.toggleSpellbook)
                .keyboardShortcut("b", modifiers: [])
        }
        .accessibilityIdentifier("CombatControls")
    }

    private func medallion(_ icon: String, label: String, symbol: String, disabled: Bool,
                           duringAutomation: Bool = false, active: Bool = false,
                           action: @escaping () -> Void) -> some View {
        let unavailable = disabled || (!duringAutomation && (!battle.playerTurn || model.isAnimating))
        return Button(action: action) {
            SidebarIcon(asset: "combat_toolbar_ember_\(icon)", symbol: symbol)
                .rotationEffect(.degrees(icon == "hourglass" ? 180 : 0))
                .padding(2)
                .frame(width: layout.controlSize, height: layout.controlSize)
                .overlay {
                    if unavailable {
                        Circle().fill(.black.opacity(0.48))
                            .padding(layout.controlSize * 0.13)
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(BattleButtonStyle(magnifies: true))
        .overlay(alignment: .bottomTrailing) {
            if active {
                Text("ON").font(BattleResources.display(8)).tracking(0.8)
                    .foregroundStyle(BattlePalette.gold)
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(BattlePalette.color(0x122c17), in: Capsule())
                    .overlay { Capsule().strokeBorder(BattlePalette.bronze) }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .disabled(unavailable)
        .accessibilityLabel(label)
        .help(label)
    }

    private var damagePanel: some View {
        let maximum = battle.damage.map(\.amount).max() ?? 1
        return VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 7) {
                SidebarIcon(asset: "damage_analytics_icon", symbol: "chart.bar.xaxis")
                    .frame(width: min(39, layout.controlSize), height: min(39, layout.controlSize))
                Text("DAMAGE").font(BattleResources.display(17)).tracking(1.8)
                    .frame(maxWidth: .infinity)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .padding(.bottom, 4)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(height: 47, alignment: .bottom)
            divider
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(battle.damage) { row in
                        let tint = BattlePalette.team(row.team)
                        VStack(spacing: 6) {
                            HStack(spacing: 4) {
                                Text(row.name.uppercased()).lineLimit(1).minimumScaleFactor(0.75)
                                Spacer(minLength: 0)
                                Text(hudNumber(row.amount))
                            }
                            .font(BattleResources.display(10.5))
                            .foregroundStyle(tint)
                            GeometryReader { metric in
                                Rectangle().fill(tint)
                                    .frame(width: metric.size.width * row.amount / maximum)
                            }
                            .padding(2)
                            .frame(height: 10)
                            .background(BattlePalette.backdrop)
                            .overlay { Rectangle().strokeBorder(BattlePalette.bronze, lineWidth: 2) }
                            .padding(.horizontal, 4)
                        }
                        .frame(height: 45, alignment: .top)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.vertical, 10)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .foregroundStyle(BattlePalette.gold)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { SidebarFrame() }
    }

    private var battleLog: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                Text("BATTLE LOG").font(BattleResources.display(14)).tracking(1.5)
                    .accessibilityAddTraits(.isHeader)
                Button {
                    let clipboard = NSPasteboard.general
                    clipboard.clearContents()
                    clipboard.setString(model.log.map(\.text).joined(separator: "\n"), forType: .string)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 9))
                        .frame(width: 17, height: 17)
                        .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(BattlePalette.bronze) }
                }
                .buttonStyle(BattleButtonStyle())
                .disabled(model.log.isEmpty)
                .accessibilityLabel("Copy battle log")
                .help("Copy battle log")
            }
            .frame(maxWidth: .infinity)
            .frame(height: 25)
            divider
            if let active = battle.activeStack {
                (Text(active.name.uppercased()).foregroundStyle(BattlePalette.team(active.team)) +
                 Text(" — LAP \(battle.lap)"))
                    .font(BattleResources.display(10.5))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                divider
            }
            if let spell = battle.spell {
                spellTargeting(spell)
            }
            if let problem = model.problem {
                Text(problem).font(.caption).foregroundStyle(BattlePalette.opponent)
            }
            ScrollViewReader { scroll in
                ScrollView {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(Array(model.log.enumerated()), id: \.offset) { index, event in
                            (Text(event.title.uppercased()).foregroundStyle(event.team.map(BattlePalette.team) ?? BattlePalette.gold) +
                             Text(event.detail.isEmpty ? "" : " " + event.detail.uppercased()))
                                .font(BattleResources.display(9.5))
                                .id(index)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(BattlePalette.bronze.opacity(0.16))
                }
                .scrollBounceBehavior(.basedOnSize)
                .onChange(of: battle.revision) {
                    if !model.log.isEmpty { scroll.scrollTo(model.log.count - 1, anchor: .bottom) }
                }
            }
            .frame(maxHeight: .infinity)
        }
        .foregroundStyle(BattlePalette.gold)
        .padding(10)
        .frame(maxHeight: .infinity, alignment: .top)
        .background { SidebarFrame() }
        .accessibilityIdentifier("BattleLog")
    }

    private var divider: some View {
        Rectangle().fill(BattlePalette.bronze.opacity(0.55)).frame(height: 1)
            .accessibilityHidden(true)
    }

    private func spellTargeting(_ spell: BattleSpell) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(spell.name).font(BattleResources.display(14)).foregroundStyle(BattlePalette.spell)
            if spell.aim == .army {
                Button("Cast \(spell.name)", action: model.cast).disabled(!battle.canCast)
            } else {
                Text(battle.spellCells.isEmpty ? "No legal targets." : "Choose a highlighted target.").font(.caption)
            }
            Button("Cancel", action: model.cancelSpell)
        }
        .foregroundStyle(BattlePalette.parchment)
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.54))
    }

}

struct BattleSystemControls: View {
    let effectsEnabled: Bool
    let toggleEffects: () -> Void
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        HStack(spacing: 8) {
            footerButton(effectsEnabled ? "ui_control_music_on_forged_bronze_v1" : "ui_control_music_muted_forged_bronze_v1",
                         symbol: effectsEnabled ? "speaker.wave.2" : "speaker.slash",
                         label: effectsEnabled ? "Mute sound effects" : "Unmute sound effects", action: toggleEffects)
            footerButton("ui_control_fullscreen_forged_bronze_v1", symbol: "arrow.up.left.and.arrow.down.right", label: "Toggle full screen") {
                GameWindow.toggleFullScreen()
            }
        }
        .accessibilityIdentifier("SystemControls")
    }

    private func footerButton(_ asset: String, symbol: String, label: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let art = BattleResources.scaledIcon(asset, pixelSide: Int((32 * displayScale).rounded())) {
                    Image(decorative: art, scale: displayScale)
                        .resizable()
                        .interpolation(.high)
                } else {
                    SidebarIcon(asset: asset, symbol: symbol)
                }
            }
            .frame(width: 32, height: 32)
            .frame(width: 35, height: 35)
            .contentShape(Circle())
        }
        .buttonStyle(BattleButtonStyle(magnifies: true))
        .accessibilityLabel(label)
        .help(label)
    }
}

struct BattleCloseButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            SidebarIcon(asset: "ui_control_close_oxblood_bronze_v2", symbol: "xmark")
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(BattleButtonStyle())
        .accessibilityLabel(label)
        .help(label)
    }
}

struct BattleButtonStyle: ButtonStyle {
    var magnifies = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.modifier(BattleHoverFeedback(pressed: configuration.isPressed, magnifies: magnifies))
    }
}

struct BattleHoverFeedback: ViewModifier {
    var pressed = false
    var magnifies = false
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        let highlight = enabled && hovered
        let scale = pressed ? 0.96 : highlight ? 1.05 : 1
        content
            .brightness(pressed && enabled ? 0.16 : highlight ? 0.12 : 0)
            .scaleEffect(magnifies && !reduceMotion ? scale : 1)
            .onHover { hovered = $0 }
            .modifier(SandboxCursorTarget(hovering: highlight))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.13), value: highlight)
    }
}

struct BattlePlate: View {
    let title: String
    let icon: String?
    let height: CGFloat
    let tint: Color?
    let action: () -> Void

    init(_ title: String, icon: String? = nil, height: CGFloat = 44,
         tint: Color? = BattlePalette.color(0x185c27), action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.height = height
        self.tint = tint
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon) }
                if !title.isEmpty {
                    Text(title).tracking(1.1).font(BattleResources.display(height < 34 ? 11 : 14))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            }
            .foregroundStyle(BattlePalette.color(0xcda078))
            .frame(maxWidth: .infinity).frame(height: height)
            .background {
                ZStack {
                    if let art = BattleResources.image("ready-plate") {
                        Image(nsImage: art).resizable()
                    } else {
                        Rectangle().strokeBorder(BattlePalette.bronze)
                    }
                    if let tint { Rectangle().fill(tint.opacity(0.46)) }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(BattleButtonStyle())
    }
}

struct SidebarFrame: View {
    var army = false

    var body: some View {
        let insets = EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10)
        let name = army ? "ui_container_frame_1_9slice" : "ui_container_frame_2_9slice"
        ZStack {
            BattlePalette.color(0x050606).opacity(0.66)
            if let art = BattleResources.cgImage(name) {
                Image(decorative: art, scale: army ? 12 : 10.4)
                    .resizable(capInsets: insets, resizingMode: .stretch)
            } else {
                Rectangle().strokeBorder(BattlePalette.bronze.opacity(0.6))
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

struct SidebarIcon: View {
    let asset: String
    let symbol: String

    var body: some View {
        if let art = BattleResources.image(asset) {
            Image(nsImage: art).resizable().scaledToFit().accessibilityHidden(true)
        } else {
            Image(systemName: symbol).foregroundStyle(BattlePalette.gold)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(BattlePalette.bronze.opacity(0.27), in: Circle())
                .accessibilityHidden(true)
        }
    }
}

struct SidebarRadio: View {
    let selected: Bool

    var body: some View {
        Group {
            if let art = BattleResources.image(selected ? "ui_fantasy_radio_on" : "ui_fantasy_radio_off") {
                Image(nsImage: art)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .clipShape(Circle())
            } else {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(BattlePalette.gold)
            }
        }
        .accessibilityHidden(true)
    }
}

struct CreaturePortrait: View {
    let name: String
    var team: Team? = nil
    var inspector = false
    var inspectionArt: CGImage? = nil

    var body: some View {
        let key = BattleResources.creature(name)
        let portrait = BattleResources.portraits[name]
        let card = BattleResources.image("\(key)_portrait")
        let art = inspectionArt.map { Image(decorative: $0, scale: 1) } ?? card.map { Image(nsImage: $0) }
        return GeometryReader { geometry in
            let size = geometry.size
            ZStack {
                BattlePalette.color(0x090806)
                if let portrait, let name = portrait.background, let background = BattleResources.image(name) {
                    let chaos = portrait.backgroundTone == "chaos"
                    Group {
                        if inspector { Image(nsImage: background).resizable().interpolation(.high) }
                        else { Image(nsImage: background).resizable().interpolation(.high).scaledToFill() }
                    }
                        .frame(width: size.width, height: size.height)
                        .contrast(chaos ? 0.76 : 1)
                        .brightness(chaos ? 0.052 : 0)
                        .opacity(portrait.backgroundOpacity)
                    BattlePalette.color(portrait.backgroundShadeColor).opacity(portrait.backgroundShadeAlpha)
                }
                if let card, portrait?.framing.background == "soft" {
                    Image(nsImage: card).resizable().scaledToFill()
                        .frame(width: size.width, height: size.height)
                        .scaleEffect(1.2).blur(radius: 14).brightness(-0.32).saturation(0.78)
                }
                if let art {
                    let standalone = inspectionArt != nil
                    let framing = portrait?.framing
                    let mirror: CGFloat = portrait?.mirrored == true ? -1 : 1
                    let framingScale = standalone ? 1 : framing?.scale ?? 1
                    let facing = team.map { ($0 == .player ? 1 : -1) * (portrait?.authoredFacing ?? 1) } ?? 1
                    let offsetX = standalone ? 0 : (framing?.offsetX ?? 0) * size.width / 100 * mirror * facing
                    let offsetY = standalone ? 0 : (framing?.offsetY ?? 0) * size.height / 100
                    art.resizable().interpolation(.high)
                        .aspectRatio(contentMode: standalone || framing?.fit == "contain" ? .fit : .fill)
                        .frame(width: size.width, height: size.height)
                        .clipped()
                        .scaleEffect(x: framingScale * mirror * facing * (inspector ? 0.96 : 1), y: framingScale)
                        .offset(x: offsetX, y: offsetY)
                } else {
                    Text(String(name.prefix(1))).font(BattleResources.display(size.width * 0.44))
                        .foregroundStyle(BattlePalette.sidebarTitle)
                }
            }
            .frame(width: size.width, height: size.height)
            .clipped()
        }
        .accessibilityHidden(true)
    }
}

struct StackPortraitButton: View {
    let stack: Stack
    let width: CGFloat
    let height: CGFloat
    let selected: Bool
    let showsPower: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: showsPower ? 0 : 5)
        Button(action: action) {
            CreaturePortrait(name: stack.name, team: stack.team)
                .frame(width: width, height: height)
                .overlay(alignment: .topTrailing) {
                    Text(stack.amount, format: .number)
                        .font(.system(size: showsPower ? 10 : 8, weight: .semibold).monospacedDigit())
                        .foregroundStyle(BattlePalette.parchment)
                        .padding(.horizontal, 3).padding(.vertical, 1)
                        .background(BattlePalette.cloth(stack.team))
                }
                .overlay(alignment: .bottom) {
                    if showsPower {
                        HStack(spacing: 2) {
                            ForEach(0..<5) { index in
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(Double(index) < stack.stackPower ? BattlePalette.cloth(stack.team) : .black.opacity(0.62))
                                    .overlay { RoundedRectangle(cornerRadius: 1).strokeBorder(.black.opacity(0.8)) }
                            }
                        }
                        .frame(width: width * 0.85, height: max(5, height * 0.11))
                        .padding(.bottom, 4)
                    }
                }
                .clipShape(shape)
                .overlay { shape.strokeBorder(selected ? BattlePalette.gold : BattlePalette.cloth(stack.team)) }
                .shadow(color: selected ? BattlePalette.gold.opacity(0.27) : .clear, radius: 5)
                .contentShape(shape)
        }
        .buttonStyle(BattleButtonStyle())
        .help("Inspect \(stack.name)")
        .accessibilityLabel("Inspect \(stack.name)")
        .accessibilityValue("\(stack.amount) creatures")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

func hudNumber(_ value: Double) -> String {
    value.formatted(.number.grouping(.never).precision(.fractionLength(0...2)))
}
