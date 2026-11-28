import SwiftUI

@main
struct HeroesOfCrypto: App {
    private enum Screen: Equatable {
        case home, skirmish, statistics, online(RankedDestination), premium

        var destination: RankedDestination? {
            if case let .online(destination) = self { return destination }
            return nil
        }
    }

    @NSApplicationDelegateAdaptor(GameAppDelegate.self) private var appDelegate
    @State private var model = SkirmishModel()
    @State private var account = NativeAccountController()
    @State private var startupMusic = StartupMusic()
    @State private var ranked = RankedWebSession()
    @State private var premium = PremiumWebSession()
    @State private var screen = Screen.home
    @State private var beforeOnline = Screen.home
    @State private var beforeStatistics = Screen.home
    @State private var beforePremium = Screen.home
    @State private var premiumSignIn = false
    @State private var sandboxArtwork: SandboxLoadingScreen.Artwork?
    private let statisticsAPI = RankedStatisticsAPI()

    var body: some Scene {
        Window(GameWindow.title, id: "home") {
            content
                .navigationTitle(screen == .skirmish ? GameWindow.sandboxTitle : GameWindow.title)
                .frame(minWidth: 570, minHeight: 560)
                .preferredColorScheme(.dark)
                .task { sandboxArtwork = await SandboxLoadingScreen.preloadArtwork() }
                .onChange(of: account.account) { _, profile in
                    if profile?.verified != true { ranked.reset() }
                }
                .onChange(of: account.verifiedSession?.token) { _, token in
                    premium.updateAccount(account.verifiedSession)
                    if token != nil { premiumSignIn = false }
                }
                .onChange(of: appDelegate.notifications.permitted) { _, permitted in
                    ranked.syncNotificationPermission(permitted)
                }
                .onChange(of: appDelegate.notifications.openedAlert, initial: true) { _, openedAlert in
                    if openedAlert > 0 { showRanked() }
                }
                .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
                    if screen.destination != nil { appDelegate.notifications.clear() }
                }
                .toolbar {
                    ToolbarItem(placement: .navigation) {
                        Button(action: goBack) {
                            Label("Back", systemImage: "chevron.left")
                        }
                        .help(screen.destination != nil && beforeOnline == .skirmish ? "Back to Sandbox" : "Back to Home")
                        .opacity(screen == .home ? 0 : 1)
                        .disabled(screen == .home)
                        .accessibilityHidden(screen == .home)
                    }
                }
        }
        .defaultSize(width: 1120, height: 720)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Home", action: showHome)
                    .keyboardShortcut("0", modifiers: .command)
                Button("Ranked Arena", action: showRanked)
                    .keyboardShortcut("1", modifiers: .command)
                Button("Local Sandbox") { screen = .skirmish }
                    .keyboardShortcut("2", modifiers: .command)
                Button("Lobby", action: showLobby)
                    .keyboardShortcut("3", modifiers: .command)
                Button("Premium", action: showPremium)
                    .keyboardShortcut("4", modifiers: .command)
                Button("Statistics", action: showStatistics)
                    .keyboardShortcut("5", modifiers: .command)
                if screen == .premium {
                    Button("Reload Premium") { premium.reload() }
                        .keyboardShortcut("r", modifiers: .command)
                        .disabled(premium.view == nil || premium.loading || premiumSignIn)
                } else if let destination = screen.destination {
                    Button("Reload \(destination.title)", action: ranked.retry)
                        .keyboardShortcut("r", modifiers: .command)
                        .disabled(ranked.view == nil || ranked.loading)
                } else if screen != .statistics {
                    Button("Restart Sandbox") {
                        if screen == .skirmish || model.battle != nil { model.restart() }
                        screen = .skirmish
                    }
                    .keyboardShortcut("r", modifiers: .command)
                }
            }
        }

        Settings {
            GameSettings(notifications: appDelegate.notifications, music: startupMusic, account: account)
        }
    }

    @ViewBuilder
    private var content: some View {
        if screen == .skirmish {
            SkirmishWindow(model: model, loadingArtwork: sandboxArtwork, openRanked: showRanked, closeSandbox: showHome)
        } else if screen == .statistics {
            RankedStatisticsView(api: statisticsAPI)
                .onExitCommand(perform: goBack)
        } else if let destination = screen.destination, account.verifiedSession != nil {
            InAppRanked(session: ranked, account: account, notifications: appDelegate.notifications, destination: destination)
        } else if screen == .premium && !premiumSignIn {
            InAppPremium(session: premium, account: account, handle: handlePremium)
        } else {
            let signInTitle = screen == .premium ? "Premium" : screen.destination?.title
            GameHome(account: account, music: startupMusic, signInTitle: signInTitle,
                     openArena: showRanked, openLobby: showLobby, openSkirmish: { screen = .skirmish },
                     openStatistics: showStatistics, openPremium: showPremium, closeSignIn: goBack)
        }
    }

    private func showRanked() {
        showOnline(.arena)
    }

    private func showLobby() {
        showOnline(.lobby)
    }

    private func showStatistics() {
        guard screen != .statistics else { return }
        beforeStatistics = screen
        screen = .statistics
    }

    private func showOnline(_ destination: RankedDestination) {
        guard screen.destination != destination else { return }
        if screen == .premium && beforePremium.destination != nil { beforePremium = beforeOnline }
        if screen.destination == nil { beforeOnline = screen }
        screen = .online(destination)
        Task { await account.restore() }
    }

    private func showPremium() {
        guard screen != .premium else { return }
        if screen.destination == nil || beforeOnline != .premium { beforePremium = screen }
        premiumSignIn = false
        screen = .premium
    }

    private func handlePremium(_ action: PremiumWebSession.Action) {
        guard screen == .premium else { return }
        switch action {
        case .arena: showRanked()
        case .lobby: showLobby()
        case .sandbox: screen = .skirmish
        case .signOut: Task { await account.signOut() }
        case .signIn:
            if account.verifiedSession == nil {
                premiumSignIn = true
            } else {
                premium.reload(offerSignIn: true)
            }
        }
    }

    private func goBack() {
        if screen == .premium {
            if premiumSignIn { premiumSignIn = false }
            else if !premium.goBack() { screen = beforePremium }
        } else if screen == .statistics {
            screen = beforeStatistics
        } else if screen.destination != nil && (beforeOnline == .skirmish || beforeOnline == .premium) {
            screen = beforeOnline
        } else {
            showHome()
        }
    }

    private func showHome() {
        model.closeSandbox()
        beforePremium = .home
        premiumSignIn = false
        screen = .home
    }
}

private struct SkirmishWindow: View {
    let model: SkirmishModel
    let loadingArtwork: SandboxLoadingScreen.Artwork?
    let openRanked: () -> Void
    let closeSandbox: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var cursor = SandboxCursorController()
    @State private var showsLoading: Bool
    @State private var loadingStartedAt = Date()
    @State private var battlefieldReadyAt: Date?
    @State private var optionHeld = false
    @GestureState private var rosterDrag: RosterCreatureDrag?

    init(model: SkirmishModel, loadingArtwork: SandboxLoadingScreen.Artwork?,
         openRanked: @escaping () -> Void, closeSandbox: @escaping () -> Void) {
        self.model = model
        self.loadingArtwork = loadingArtwork
        self.openRanked = openRanked
        self.closeSandbox = closeSandbox
        _showsLoading = State(initialValue: model.battle == nil && model.problem == nil)
    }

    var body: some View {
        ZStack {
            battlefield
                .allowsHitTesting(!showsLoading && !model.showsFightResults && !model.isReplaying)
                .accessibilityHidden(showsLoading || model.showsFightResults || model.isReplaying)
            if showsLoading {
                SandboxLoadingScreen(startedAt: loadingStartedAt, battlefieldReadyAt: battlefieldReadyAt, artwork: loadingArtwork,
                                     effectsEnabled: model.effectsEnabled, toggleEffects: model.toggleEffects, close: closeSandbox)
                    .transition(.opacity)
                    .zIndex(1)
            } else if model.showsFightResults, let summary = model.fightSummary {
                BattleResultsOverlay(summary: summary, model: model)
                    .zIndex(2)
            } else if model.isReplaying {
                HStack(spacing: 12) {
                    Text("REPLAY").font(BattleResources.display(13)).foregroundStyle(BattlePalette.gold)
                    BattlePlate("RETURN TO RESULTS", height: 28, tint: nil, action: model.finishReplay)
                        .frame(width: 154)
                }
                .padding(8)
                .background(BattlePalette.backdrop.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
                .padding(.top, 12)
                .frame(maxHeight: .infinity, alignment: .top)
                .zIndex(1)
            }
        }
        .background(BattlePalette.backdrop)
        .background { SandboxCursorHost(controller: cursor).accessibilityHidden(true) }
        .background { SandboxOptionMonitor(isHeld: $optionHeld).accessibilityHidden(true) }
        .environment(\.sandboxCursor, cursor)
        .task { await prepareBattlefield() }
        .onExitCommand {
            if showsLoading { closeSandbox() }
            else if model.isReplaying { model.finishReplay() }
            else if model.showsFightResults { model.setFightResultsVisible(false) }
            else if model.spellbookOpen { model.closeSpellbook() }
            else { model.cancelSelection() }
        }
    }

    private func prepareBattlefield() async {
        guard showsLoading else { return }
        await model.openSandbox()
        guard !Task.isCancelled else { return }
        if model.battle != nil {
            let readyAt = Date()
            battlefieldReadyAt = readyAt
            let finishAt = SandboxLoadingScreen.finishDate(startedAt: loadingStartedAt, readyAt: readyAt)
            do { try await Task.sleep(for: .seconds(max(0, finishAt.timeIntervalSinceNow))) }
            catch { return }
        }
        guard !Task.isCancelled else { return }
        withAnimation(reduceMotion ? nil : .linear(duration: SandboxLoadingScreen.fadeDuration)) {
            showsLoading = false
        }
    }

    private var battlefield: some View {
        GeometryReader { geometry in
            if let battle = model.battle {
                let layout = SidebarLayout(viewport: geometry.size)
                let boardWidth = geometry.size.width - 2 * layout.width
                let viewport = CGSize(width: boardWidth, height: geometry.size.height)
                let projection = BattleResources.projection.map {
                    BattlefieldProjection(data: $0, width: viewport.width, height: viewport.height,
                                          legacySize: min(geometry.size.width, geometry.size.height))
                }
                let creature = rosterDrag?.creature ?? model.pendingCreature
                let placementOptions = creature.flatMap { model.rosterPlacements(for: $0) }
                let placements = placementOptions?.anchors ?? [:]
                let placementHint = creature.flatMap { placementOptions?.hint(for: $0) }
                let showsTurnOrder = optionHeld && battle.started && battle.winner == nil && !showsLoading &&
                    !model.showsFightResults && !model.spellbookOpen
                HStack(spacing: 0) {
                    LeftBattleSidebar(model: model, battle: battle, layout: layout)
                        .frame(width: layout.width)
                        .background { SidebarStone(side: "left") }
                    Battlefield(battle: battle, playback: model.playback, animating: model.isAnimating,
                                inspectionEnabled: !showsLoading && !model.spellbookOpen && !model.isReplaying,
                                showStackFootprints: showsTurnOrder,
                                projection: projection, placement: creature, placements: placements,
                                placementHint: placementHint,
                                rosterDragLocation: rosterDrag?.location,
                                placingBarrel: model.placingBarrel, barrelTargets: model.barrelTargets,
                                deployedBarrels: model.deployedBarrels,
                                deploymentZones: model.teamPreview,
                                inspectedStackID: model.inspected,
                                creatureLevel: { stack in model.catalogue.first { $0.name == stack.name }?.level },
                                beginBarrelPlacement: model.beginBarrelPlacement,
                                choose: model.choose, attack: model.attack, select: model.select,
                                previewThrough: model.previewThrough, fireThrough: model.fireThrough,
                                rotateFireWall: model.rotateFireWall)
                        .frame(width: boardWidth, height: geometry.size.height)
                        .allowsHitTesting(!model.isAnimating)
                        .blur(radius: model.spellbookOpen ? 4 : 0)
                        .overlay(alignment: .topLeading) {
                            if !battle.started {
                                BattlefieldRoster(model: model, boardWidth: boardWidth, viewportHeight: geometry.size.height,
                                                  drag: $rosterDrag) { creature, location in
                                    guard CGRect(origin: .zero, size: viewport).contains(location),
                                          let cell = projection?.cell(at: location) else { return }
                                    model.placeRosterCreature(creature.id, covering: cell)
                                }
                                    .padding(7)
                            } else if showsTurnOrder, let projection {
                                BattleUpNextOverlay(battle: model.sidebarPlayback?.battle ?? battle,
                                                    projection: projection, inspect: model.select)
                                    .allowsHitTesting(!model.isReplaying)
                            }
                        }
                        .coordinateSpace(name: "battlefield")
                        .clipped()
                    RightBattleSidebar(model: model, battle: battle, layout: layout,
                                       canPlaceRosterCreature: !placements.isEmpty,
                                       shortcutsEnabled: !showsLoading && !model.showsFightResults && !model.isReplaying
                                           && !model.spellbookOpen && rosterDrag == nil,
                                       openRanked: openRanked, closeSandbox: closeSandbox)
                        .frame(width: layout.width)
                        .background { SidebarStone(side: "right") }
                }
                .allowsHitTesting(!model.spellbookOpen)
                .accessibilityHidden(model.spellbookOpen)
                .overlay {
                    if model.spellbookOpen {
                        Spellbook(spells: battle.spells, caster: battle.activeStack, viewport: geometry.size,
                                  pick: model.chooseSpell, close: model.closeSpellbook)
                    }
                }
                .modifier(UnitInspectionHoverHost(enabled: !showsLoading && !model.spellbookOpen && !model.showsFightResults))
            } else if let problem = model.problem {
                ContentUnavailableView(
                    "Sandbox unavailable", systemImage: "exclamationmark.triangle",
                    description: Text(problem)
                )
            }
        }
    }

}

private struct SidebarStone: View {
    let side: String

    var body: some View {
        GeometryReader { geometry in
            let leading = side == "left"
            let corner = min(150, max(40, (geometry.size.width * 0.272).rounded()))
            let rail = max(4, min(13, (geometry.size.width * 0.021).rounded()))
            let overscan = geometry.size.height * 1.03
            ZStack {
                Color.black
                piece("center_v11").frame(height: overscan)
                piece("outer_rail_v12").frame(width: rail, height: overscan)
                    .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
                piece("inner_v11").frame(width: rail, height: overscan)
                    .frame(maxWidth: .infinity, alignment: leading ? .trailing : .leading)
                cornerPiece("outer_top_v12", width: corner)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: leading ? .topLeading : .topTrailing)
                cornerPiece("outer_bottom_v12", width: corner)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: leading ? .bottomLeading : .bottomTrailing)
                LinearGradient(colors: [.black.opacity(0.04), .black.opacity(0.10)], startPoint: .top, endPoint: .bottom)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }

    private func piece(_ name: String) -> some View {
        Group {
            if let art = BattleResources.image("\(side)-\(name)") {
                Image(nsImage: art).resizable()
            }
        }
    }

    private func cornerPiece(_ name: String, width: CGFloat) -> some View {
        Group {
            if let art = BattleResources.image("\(side)-\(name)") {
                Image(nsImage: art).resizable().scaledToFit().frame(width: width)
            }
        }
    }
}

enum BattlePalette {
    static let backdrop = color(0x070504)
    static let parchment = color(0xefe4cc)
    static let sidebarTitle = color(0xd8c29c)
    static let statText = color(0xf5fefd)
    static let bronze = color(0x704b2a)
    static let gold = color(0xdcb158)
    static let player = color(0x46d160)
    static let opponent = color(0xff5a3f)
    static let spell = color(0xbf92ff)

    static func team(_ team: Team) -> Color {
        switch team {
        case .player: player
        case .opponent: opponent
        case .draw: sidebarTitle
        }
    }

    static func cloth(_ team: Team) -> Color {
        color(clothColors(team).edge)
    }

    static func clothCenter(_ team: Team) -> Color {
        color(clothColors(team).center)
    }

    static func clothColors(_ team: Team) -> (edge: UInt32, center: UInt32) {
        switch team {
        case .player: (0x176238, 0x0b3d20)
        case .opponent: (0x7b1928, 0x510c16)
        case .draw: (0x6a6260, 0x302b29)
        }
    }

    static func color(_ rgb: UInt32) -> Color {
        Color(.sRGB, red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255,
              blue: Double(rgb & 255) / 255, opacity: 1)
    }
}
