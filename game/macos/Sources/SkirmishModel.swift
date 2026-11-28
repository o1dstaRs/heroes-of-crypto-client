import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class SkirmishModel {
    private(set) var battle: BattleView?
    private(set) var problem: String?
    private(set) var spellbookOpen = false
    var effectsEnabled: Bool { audio.level(for: .effects).audible }
    private(set) var log: [String] = []
    private(set) var inspected: Int?
    private(set) var playback = BattlePlayback()
    private(set) var isAnimating = false
    private(set) var sidebarPlayback: SidebarPlayback?
    private(set) var fightSummary: BattleFightSummary?
    private(set) var isReplaying = false
    private var resultsPresented = false
    private(set) var map: BattlefieldMap = .normal
    private(set) var automatedTeams: Set<Team> = []
    private(set) var autoplay = false
    private(set) var turnWindow: SandboxTurnClock.Window?
    private(set) var rosterOpen = true
    private(set) var pendingCreature: SandboxCreature?
    private(set) var placingBarrel: SandboxBarrelSlot?
    private var hoveredRosterCreature: SandboxCreature?
    private(set) var catalogue: [SandboxCreature] = []
    private(set) var loadouts: [Team: SandboxLoadout] = [:]
    private(set) var teamPreview: [Team: SandboxTeamPreview] = [:]
    private(set) var loadoutOptions: SandboxLoadoutOptions?
    private(set) var selectionRequested = 0
    @ObservationIgnored private var setup: SandboxSetup?
    @ObservationIgnored private var rosterPreviews: [Int: Stack] = [:]
    @ObservationIgnored private var loadoutEngine: SandboxLoadoutEngine?
    @ObservationIgnored private var opening: [SandboxStack] = []
    @ObservationIgnored private var engine: NativeBattle?
    @ObservationIgnored private var opponentTask: Task<Void, Never>?
    @ObservationIgnored private var appliedAutoplay = false
    @ObservationIgnored private var barrelSeed: UInt32?
    @ObservationIgnored private var animationTask: Task<Void, Never>?
    @ObservationIgnored private var recordedFight: [BattleView] = []
    @ObservationIgnored private var replayTask: Task<Void, Never>?
    @ObservationIgnored private var finalLog: [String] = []
    @ObservationIgnored private var recordedLog: [Int: [String]] = [:]
    @ObservationIgnored private var turnTimeoutTask: Task<Void, Never>?
    @ObservationIgnored private var turnClock = SandboxTurnClock()
    @ObservationIgnored private var consecutiveTimeouts = 0
    @ObservationIgnored private var graceTurnUsed = false
    @ObservationIgnored private let sound: BattleSound
    private let audio: GameAudioSettings

    init(audio: GameAudioSettings = GameAudioSettings()) {
        self.audio = audio
        sound = BattleSound(audio: audio)
    }

    private enum SoundCue {
        case effect(String)
        case moving(String, until: TimeInterval)
        case arrival
    }

    struct SidebarPlayback {
        let battle: BattleView
        let window: SandboxTurnClock.Window?
        let pausedAt: ContinuousClock.Instant
    }

    private struct OpeningConfiguration {
        let setup: SandboxSetup
        let loadouts: SandboxLoadoutEngine

        init(resources: URL) throws {
            setup = try SandboxSetup(resources: resources)
            loadouts = try SandboxLoadoutEngine(resources: resources)
        }

        static func load(resources: URL) async throws -> sending Self {
            try await withCheckedThrowingContinuation { continuation in
                // The JS context and catalogue have no other owners after this handoff.
                DispatchQueue.global(qos: .userInitiated).async {
                    continuation.resume(with: Result { try Self(resources: resources) })
                }
            }
        }
    }

    func openSandbox() async {
        do {
            if loadoutEngine == nil {
                let configuration = try await OpeningConfiguration.load(resources: sandboxResources())
                try Task.checkCancellation()
                if loadoutEngine == nil { install(configuration) }
            }
            if battle == nil { restart() }
        } catch {
            if !Task.isCancelled && battle == nil { problem = error.localizedDescription }
        }
    }

    func restart() {
        do {
            if loadoutEngine == nil { install(try OpeningConfiguration(resources: sandboxResources())) }
            replaceSandbox(opening)
        } catch {
            problem = error.localizedDescription
        }
    }

    private func sandboxResources() throws -> URL {
        let bundle = Bundle.main
        guard let resources = bundle.resourceURL else { throw EngineError(message: "Missing sandbox resources.") }
        guard bundle.url(forResource: "board-0", withExtension: "webp") != nil, !BattleResources.portraits.isEmpty,
              bundle.url(forResource: "animations", withExtension: "json") != nil,
              bundle.url(forResource: "creature-framing", withExtension: "json") != nil else {
            throw EngineError(message: "This copy of Heroes of Crypto is missing the Sandbox artwork.")
        }
        return resources
    }

    private func install(_ configuration: OpeningConfiguration) {
        setup = configuration.setup
        loadoutEngine = configuration.loadouts
        loadoutOptions = configuration.loadouts.options
        catalogue = configuration.setup.creatures
        for level in 1...3 {
            if let clip = BattleStatusEffects.bundled?.clips["Deep Wounds \(level)"] {
                BattlefieldAtlas.prefetch(clip.resource, maxDimension: clip.pixelLimit, combat: true)
            }
        }
    }

    func closeSandbox() {
        opponentTask?.cancel()
        opponentTask = nil
        animationTask?.cancel()
        sidebarPlayback = nil
        sound.stopMovement()
        clearFightRecording()
        engine = nil
        resetTurnClock()
        autoplay = false
        appliedAutoplay = false
        automatedTeams = []
        opening = []
        battle = nil
        problem = nil
        map = .normal
        barrelSeed = nil
        rosterOpen = true
        pendingCreature = nil
        placingBarrel = nil
        hoveredRosterCreature = nil
        loadouts = [:]
        teamPreview = [:]
    }

    func selectMap(_ map: BattlefieldMap) {
        guard battle?.started == false else { return }
        if map == .barrels && self.map == .barrels {
            replaceSandbox(opening, selection: editingIndex, reroll: UInt32.random(in: 1...UInt32.max))
        } else if self.map != map {
            replaceSandbox(opening, map: map, selection: editingIndex)
        }
    }

    func toggleRoster() {
        rosterOpen.toggle()
        if !rosterOpen { hoveredRosterCreature = nil }
    }

    var rosterInspectionStack: Stack? {
        guard battle?.started == false, let creature = hoveredRosterCreature ?? pendingCreature else { return nil }
        return rosterPreviews[creature.id]
    }

    func hoverRosterCreature(_ creature: SandboxCreature, hovering: Bool) {
        if hovering {
            guard rosterOpen, battle?.started == false, hoveredRosterCreature?.id != creature.id else { return }
            prepareRosterPreview(for: creature)
            hoveredRosterCreature = creature
        } else if hoveredRosterCreature?.id == creature.id {
            hoveredRosterCreature = nil
        }
    }

    private func prepareRosterPreview(for creature: SandboxCreature) {
        guard rosterPreviews[creature.id] == nil, let setup, let resources = Bundle.main.resourceURL else { return }
        rosterPreviews[creature.id] = try? setup.rosterPreview(for: creature, resources: resources)
    }

    func selectRosterCreature(_ creature: SandboxCreature) {
        guard battle?.started == false else { return }
        placingBarrel = nil
        prepareRosterPreview(for: creature)
        pendingCreature = pendingCreature?.id == creature.id ? nil : creature
        if pendingCreature != nil {
            inspected = nil
            CreatureAnimation.prewarm(creature.name, action: .idle)
        }
        problem = nil
    }

    func rosterPlacements(for creature: SandboxCreature) -> SandboxRosterPlacement? {
        guard let setup, let view = battle, !view.started, !isAnimating else { return nil }
        return setup.rosterPlacements(for: creature.footprint, on: view, deployment: teamPreview)
    }

    var canStart: Bool {
        guard let battle, !battle.started else { return false }
        return Set(battle.stacks.map(\.team)).count == 2
    }

    var selectedDeploymentStack: Stack? {
        guard let battle, !battle.started else { return nil }
        return battle.stacks.first { $0.id == battle.deploying }
    }

    func toggleAutomation(_ team: Team) {
        guard battle?.started == false, let engine else { return }
        var teams = automatedTeams
        if teams.remove(team) == nil { teams.insert(team) }
        guard engine.setAutomation(teams) else { return }
        automatedTeams = teams
        refresh()
    }

    func toggleAutoplay() {
        guard let engine, let battle, battle.started, battle.winner == nil, !battle.stalled, !isReplaying else { return }
        autoplay.toggle()
        // A detached AI decision owns the engine until it commits. Apply a changed preference before
        // the next activation, so switching back to manual remains responsive.
        if opponentTask == nil {
            applyAutoplay(to: engine)
            queueOpponent()
        }
    }

    private func applyAutoplay(to engine: NativeBattle) {
        guard autoplay != appliedAutoplay, engine.setAutomation(autoplay ? [.player, .opponent] : automatedTeams) else {
            return
        }
        appliedAutoplay = autoplay
        refresh()
    }

    func loadSampleArmies() {
        guard let battle, !battle.started, let setup else { return }
        do {
            replaceSandbox(try setup.arrangeSampleArmies(on: battle, deployment: teamPreview))
        } catch {
            problem = error.localizedDescription
        }
    }

    func editLoadout(for team: Team, _ change: (inout SandboxLoadout) -> Void) {
        guard battle?.started == false else { return }
        var next = loadouts
        let priorArtifact = next[team]?.tier1
        change(&next[team, default: SandboxLoadout()])
        if next[team]?.tier1 != priorArtifact { next[team]?.barrels = nil }
        replaceSandbox(opening, selection: editingIndex, loadouts: next)
    }

    var deployedBarrels: [Cell: SandboxBarrelSlot] {
        guard battle?.started == false else { return [:] }
        return Dictionary(uniqueKeysWithValues: teamPreview.values.flatMap { preview in
            preview.barrels.map { ($0.cell, SandboxBarrelSlot(team: preview.team, index: $0.index)) }
        })
    }

    var barrelTargets: Set<Cell> {
        guard let placingBarrel, let battle, !battle.started, let preview = teamPreview[placingBarrel.team] else { return [] }
        var occupied = Set(battle.stacks.flatMap(\.cells) + battle.stones)
        if let current = preview.barrels.first(where: { $0.index == placingBarrel.index }) { occupied.remove(current.cell) }
        return Set(preview.cells).subtracting(occupied)
    }

    func beginBarrelPlacement(_ slot: SandboxBarrelSlot) {
        guard battle?.started == false, (0..<2).contains(slot.index),
              let barricade = loadoutOptions?.barrelBarricade, loadouts[slot.team]?.tier1 == barricade else { return }
        placingBarrel = slot
        pendingCreature = nil
        hoveredRosterCreature = nil
        problem = nil
    }

    func removeBarrel(_ slot: SandboxBarrelSlot) {
        guard let barrels = teamPreview[slot.team]?.barrels, barrels.contains(where: { $0.index == slot.index }) else { return }
        editLoadout(for: slot.team) { $0.barrels = barrels.filter { $0.index != slot.index } }
    }

    func cancelBarrelPlacement() { placingBarrel = nil }

    private func placeBarrel(at cell: Cell) {
        guard let slot = placingBarrel, barrelTargets.contains(cell) else { return }
        let others = teamPreview[slot.team]?.barrels.filter { $0.index != slot.index } ?? []
        editLoadout(for: slot.team) { $0.barrels = others + [SandboxPlacedBarrel(index: slot.index, cell: cell)] }
    }

    func clearArmies() {
        guard battle?.started == false else { return }
        replaceSandbox([])
        rosterOpen = true
    }

    var showsFightResults: Bool { resultsPresented && fightSummary != nil && !isAnimating && !isReplaying }
    var canReplay: Bool { recordedFight.count > 1 }

    func setFightResultsVisible(_ visible: Bool) {
        resultsPresented = visible
    }

    func startRematch() {
        let automatedRematch = autoplay
        guard fightSummary != nil, replaceSandbox(opening) else { return }
        ready()
        if automatedRematch { toggleAutoplay() }
    }

    func newBattle() {
        if replaceSandbox([], map: .normal, loadouts: [:]) {
            rosterOpen = true
            barrelSeed = nil
        }
    }

    func playReplay() {
        guard showsFightResults, canReplay, let first = recordedFight.first else { return }
        let frames = recordedFight.dropFirst()
        resultsPresented = false
        isReplaying = true
        finalLog = log
        log = recordedLog[first.revision] ?? []
        inspected = nil
        battle = first
        playback = BattlePlayback()
        replayTask = Task { [weak self] in
            for frame in frames {
                do { try await Task.sleep(for: .milliseconds(90)) }
                catch { return }
                guard let self, let previous = self.battle else { return }
                self.battle = frame
                self.report(frame, previous: previous)
                await self.animationTask?.value
            }
            self?.finishReplay()
        }
    }

    func finishReplay() {
        guard isReplaying, let last = recordedFight.last else { return }
        replayTask?.cancel()
        replayTask = nil
        animationTask?.cancel()
        sound.stopMovement()
        animationTask = nil
        battle = last
        playback = BattlePlayback()
        sidebarPlayback = nil
        log = finalLog
        finalLog = []
        isAnimating = false
        isReplaying = false
        resultsPresented = true
    }

    private func clearFightRecording() {
        replayTask?.cancel()
        replayTask = nil
        recordedFight = []
        recordedLog = [:]
        finalLog = []
        fightSummary = nil
        isReplaying = false
        resultsPresented = false
    }

    @discardableResult
    func placeRosterCreature(_ creatureId: Int, covering cell: Cell) -> Bool {
        guard let creature = catalogue.first(where: { $0.id == creatureId }),
              let placements = rosterPlacements(for: creature)?.anchors else { return false }
        if placements.isEmpty {
            if pendingCreature?.id != creatureId { selectRosterCreature(creature) }
            return false
        }
        let landings = FootprintLandings(footprint: creature.footprint, anchors: Set(placements.keys))
        guard let anchor = landings.anchor(covering: cell), let team = placements[anchor] else { return false }
        let stack = SandboxStack(creature: creature.id, team: team, amount: creature.amount, x: anchor.x, y: anchor.y)
        return replaceSandbox(opening + [stack])
    }

    func changeAmount(_ amount: Int) {
        guard let index = editingIndex, (1...9999).contains(amount), opening[index].amount != amount else { return }
        var next = opening
        next[index].amount = amount
        replaceSandbox(next, selection: index)
    }

    func removeSelectedStack() {
        guard let index = editingIndex else { return }
        var next = opening
        next.remove(at: index)
        replaceSandbox(next)
    }

    func changeFootprint(_ shape: Footprint) {
        guard let battle, let setup, let stack = selectedDeploymentStack, let index = editingIndex,
              stack.footprint != shape else { return }
        let places = setup.availableAnchors(for: shape, team: stack.team, on: battle, ignoring: stack.id,
                                            zone: teamPreview[stack.team]?.cells)
        guard let current = stack.anchor, let anchor = places.min(by: {
            abs($0.x - current.x) + abs($0.y - current.y) < abs($1.x - current.x) + abs($1.y - current.y)
        }) else {
            problem = "There’s no room for a \(shape.label) footprint in \(stack.team.title)’s deployment zone."
            return
        }
        var next = opening
        next[index].footprint = shape
        next[index].x = anchor.x
        next[index].y = anchor.y
        replaceSandbox(next, selection: index)
    }

    func duplicateSelectedStack(split: Int? = nil) {
        guard let battle, let index = editingIndex, let definition = catalogue.first(where: { $0.id == opening[index].creature }) else { return }
        var next = opening
        var copy = next[index]
        if let split {
            guard split > 0, split < copy.amount else { return }
            next[index].amount -= split
            copy.amount = split
        }
        guard let anchor = setup?.availableAnchors(for: copy.footprint ?? definition.footprint,
                                                   team: copy.team, on: battle, zone: teamPreview[copy.team]?.cells).first else {
            problem = "There’s no room for another stack in \(copy.team.title)’s deployment zone."
            return
        }
        copy.x = anchor.x
        copy.y = anchor.y
        next.append(copy)
        replaceSandbox(next, selection: split == nil ? next.count - 1 : index)
    }

    private var editingIndex: Int? {
        guard let battle, !battle.started, let selected = battle.deploying else { return nil }
        return battle.stacks.firstIndex { $0.id == selected }
    }

    @discardableResult
    private func replaceSandbox(_ stacks: [SandboxStack], map: BattlefieldMap? = nil,
                                selection: Int? = nil, loadouts: [Team: SandboxLoadout]? = nil, reroll: UInt32? = nil) -> Bool {
        guard let loadoutEngine else { return false }
        guard stacks.count <= SandboxSetup.maximumStacks else {
            problem = "The battlefield supports up to \(SandboxSetup.maximumStacks) stacks."
            return false
        }
        let chosenMap = map ?? self.map
        var choices = loadouts ?? self.loadouts
        let boardSeed = chosenMap == .barrels ? reroll ?? barrelSeed : nil
        do {
            let (next, preview) = try loadoutEngine.prepare(map: chosenMap, stacks: stacks, catalogue: catalogue,
                                                            loadouts: choices, automated: automatedTeams, boardSeed: boardSeed)
            var view = try next.view()
            if let selection, view.stacks.indices.contains(selection), next.select(view.stacks[selection].id) {
                view = try next.view()
            }
            opponentTask?.cancel()
            opponentTask = nil
            animationTask?.cancel()
            sound.stopMovement()
            clearFightRecording()
            resetTurnClock()
            spellbookOpen = false
            placingBarrel = nil
            pendingCreature = nil
            hoveredRosterCreature = nil
            log = []
            playback = BattlePlayback()
            sidebarPlayback = nil
            isAnimating = false
            battle = view
            inspected = view.deploying
            opening = stacks
            if let barricade = loadoutOptions?.barrelBarricade {
                for (team, deployment) in preview where choices[team]?.tier1 == barricade {
                    choices[team]?.barrels = deployment.barrels
                }
            }
            self.loadouts = choices
            teamPreview = preview
            autoplay = false
            appliedAutoplay = false
            self.map = chosenMap
            if let reroll { barrelSeed = reroll }
            engine = next
            problem = nil
            return true
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    func choose(_ cell: Cell) {
        guard let engine, let battle, !isAnimating, !isReplaying, !battle.started || battle.playerTurn else { return }
        if placingBarrel != nil {
            placeBarrel(at: cell)
            return
        }
        if let creature = pendingCreature {
            placeRosterCreature(creature.id, covering: cell)
            return
        }
        let destination: Cell
        if battle.preparedSpell != nil || battle.obstacleTargets.contains(cell) || battle.areaAims.contains(where: { $0.aim == cell }) ||
            battle.stacks.contains(where: {
            battle.attacks.contains($0.id) && $0.cells.contains(cell)
        }) {
            destination = cell
        } else {
            guard let anchor = battle.movementLandings.anchor(covering: cell), anchor != battle.movingStack?.anchor else { return }
            destination = anchor
        }
        let placementIndex = editingIndex
        let accepted = engine.choose(destination)
        if accepted, let index = placementIndex {
            opening[index].x = destination.x
            opening[index].y = destination.y
            inspected = nil
        }
        update(accepted, manualAction: battle.started)
    }

    func attack(_ target: Int, from angle: BattleAttackAngle) {
        guard let engine, !isAnimating, !isReplaying, battle?.playerTurn == true else { return }
        update(engine.attack(target, from: angle), manualAction: true)
    }

    func previewThrough(_ point: CGPoint) -> BattleThroughAim? {
        guard !isAnimating, !isReplaying, battle?.canAimThrough == true else { return nil }
        return engine?.previewThrough(point)
    }

    func fireThrough(_ point: CGPoint) {
        guard let engine, !isAnimating, !isReplaying, battle?.canAimThrough == true,
              engine.previewThrough(point)?.valid == true else { return }
        update(engine.fireThrough(point), manualAction: true)
    }

    func select(_ stack: Stack) {
        guard let engine, let battle else { return }
        if !battle.started {
            let accepted = engine.select(stack.id)
            if accepted {
                pendingCreature = nil
                placingBarrel = nil
                hoveredRosterCreature = nil
                inspected = stack.id
                selectionRequested += 1
            }
            update(accepted)
        } else {
            inspected = inspected == stack.id ? nil : stack.id
        }
    }

    func ready() {
        guard let engine, canStart else { return }
        pendingCreature = nil
        placingBarrel = nil
        hoveredRosterCreature = nil
        inspected = nil
        loadoutEngine?.beginBattleLog(stacks: battle?.stacks ?? [])
        update(engine.ready())
    }

    func perform(_ command: TurnCommand) {
        guard let engine, !isAnimating, !isReplaying, battle?.playerTurn == true else { return }
        update(engine.perform(command), manualAction: command != .cycleAttack)
    }

    func toggleSpellbook() {
        if spellbookOpen {
            closeSpellbook()
            return
        }
        guard engine != nil, let battle, !isAnimating, !isReplaying, battle.playerTurn, !battle.spells.isEmpty else { return }
        spellbookOpen = true
        if effectsEnabled { sound.play("spellbook_open") }
    }

    func closeSpellbook() {
        guard spellbookOpen else { return }
        spellbookOpen = false
        if effectsEnabled { sound.play("spellbook_close") }
        if let engine, battle?.preparedSpell != nil { update(engine.chooseSpell(nil)) }
    }

    func chooseSpell(_ spell: BattleSpell) {
        guard let engine, battle?.playerTurn == true, spellbookOpen, !isAnimating, !isReplaying else { return }
        let accepted = engine.chooseSpell(spell.id)
        if accepted {
            spellbookOpen = false
            if spell.aim != .army, let caster = battle?.activeStack {
                append("\(caster.name) prepares \(spell.name) - pick a target", team: caster.team)
                if spell.name == "Fire Wall" { append("Hold Shift to rotate the wall") }
            }
        }
        update(accepted, manualAction: spell.aim == .army)
    }

    func cancelSpell() {
        if spellbookOpen { closeSpellbook() }
        else if let engine, battle?.preparedSpell != nil {
            let accepted = engine.chooseSpell(nil)
            if accepted { append("Spell cancelled") }
            update(accepted)
        }
    }

    func rotateFireWall() {
        guard let engine, let battle, battle.playerTurn, battle.fireWallAims != nil, !isAnimating, !isReplaying else { return }
        update(engine.rotateFireWall())
    }

    func cancelSelection() {
        hoveredRosterCreature = nil
        if placingBarrel != nil { cancelBarrelPlacement() }
        else if pendingCreature != nil { pendingCreature = nil }
        else { cancelSpell() }
    }

    func toggleEffects() {
        audio.setMuted(effectsEnabled, for: .effects)
        sound.refreshMix()
    }

    func refreshAudioMix() { sound.refreshMix() }

    func suggestedTurn(revision: Int) async -> BattleSuggestion? {
        guard let engine, battle?.revision == revision, battle?.playerTurn == true,
              battle?.started == true, !isAnimating, !isReplaying, !spellbookOpen else { return nil }
        let suggestion = await Task.detached(priority: .utility) { engine.suggestion() }.value
        guard !Task.isCancelled, self.engine === engine, battle?.revision == revision,
              !isAnimating, !isReplaying, !spellbookOpen else { return nil }
        return suggestion
    }

    private func update(_ accepted: Bool, manualAction: Bool = false) {
        guard accepted else {
            problem = "That action is unavailable."
            return
        }
        if manualAction { consecutiveTimeouts = 0 }
        refresh()
        queueOpponent()
    }

    private func refresh() {
        do {
            present(try engine?.view())
        } catch {
            battle = nil
            problem = error.localizedDescription
        }
    }

    private func present(_ next: BattleView?) {
        let previous = battle
        battle = next
        if let next, let previous, previous.revision != next.revision {
            report(next, previous: previous)
            if previous.active != next.active { inspected = nil }
            if let active = next.activeStack { CreatureAnimation.prewarmCombatTurn(active) }
        }
        if let next, next.started, recordedFight.last?.revision != next.revision {
            recordedFight.append(next)
            if fightSummary == nil, next.winner != nil || next.stalled {
                fightSummary = BattleFightSummary(frames: recordedFight)
                resultsPresented = true
            }
        }
        if next?.playerTurn != true { spellbookOpen = false }
        synchronizeTurnClock(previous: previous)
        problem = nil
    }

    var canRequestTime: Bool {
        guard let battle, let active = battle.activeStack, let window = turnWindow,
              battle.playerTurn, !isAnimating, !isReplaying,
              window.key == .init(unit: active.id, team: active.team, lap: battle.lap) else { return false }
        return turnClock.extensionTime(for: window.key.team, remainingStacks: battle.activeTeamStacksToAct) > 0
    }

    func requestTime(for expectedTurn: SandboxTurnClock.Key? = nil) {
        guard canRequestTime, let battle, var window = turnWindow,
              expectedTurn == nil || expectedTurn == window.key,
              turnClock.extend(&window, remainingStacks: battle.activeTeamStacksToAct) else { return }
        turnWindow = window
        append(battle.activeStack?.name ?? window.key.team.title, "requested additional time.", team: window.key.team)
        scheduleTurnTimeout()
    }

    private func resetTurnClock() {
        turnTimeoutTask?.cancel()
        turnTimeoutTask = nil
        turnWindow = nil
        turnClock = SandboxTurnClock()
        consecutiveTimeouts = 0
        graceTurnUsed = false
    }

    private func synchronizeTurnClock(previous: BattleView?) {
        guard let battle, battle.started, battle.winner == nil, !battle.stalled, let unit = battle.activeStack else {
            turnTimeoutTask?.cancel()
            turnWindow = nil
            return
        }
        let key = SandboxTurnClock.Key(unit: unit.id, team: unit.team, lap: battle.lap)
        let ended = previous?.revision != battle.revision && battle.moments.contains {
            $0.actor == unit.id && [.endTurn, .wait, .defend].contains($0.kind)
        }
        if turnWindow?.key != key || ended {
            let now = ContinuousClock.now
            if let turnWindow { turnClock.finish(turnWindow, at: now) }
            let start = isAnimating ? now + .seconds(playback.duration) : now
            turnWindow = turnClock.begin(key, remainingStacks: battle.activeTeamStacksToAct, at: start)
        }
        scheduleTurnTimeout()
    }

    private func scheduleTurnTimeout() {
        turnTimeoutTask?.cancel()
        guard battle?.playerTurn == true, let turnWindow else { return }
        turnTimeoutTask = Task { [weak self] in
            do { try await ContinuousClock().sleep(until: turnWindow.deadline) }
            catch { return }
            await self?.animationTask?.value
            guard !Task.isCancelled, let self, self.turnWindow?.key == turnWindow.key,
                  self.turnWindow?.deadline == turnWindow.deadline else { return }
            expireTurn()
        }
    }

    private func expireTurn() {
        guard let engine, battle?.playerTurn == true else { return }
        if canRequestTime {
            requestTime()
            return
        }
        consecutiveTimeouts += 1
        if consecutiveTimeouts >= 2 {
            if !autoplay { toggleAutoplay() }
            return
        }
        if !graceTurnUsed {
            graceTurnUsed = true
            if engine.perform(.wait) || engine.perform(.defend) {
                update(true)
                return
            }
        }
        queueOpponent(forced: true)
    }

    private func report(_ next: BattleView, previous: BattleView) {
        if next.started {
            if isReplaying {
                appendLog(recordedLog[next.revision] ?? [])
            } else if let engine {
                let steps = engine.logSteps()
                let entries = loadoutEngine?.battleLog(for: engine, steps: steps) ?? BattleLog.fallback(
                    previous: previous, next: next,
                    journal: steps.flatMap { try? JSONDecoder().decode(BattleLog.Journal.self, from: Data($0.utf8)) }
                )
                recordedLog[next.revision] = entries
                appendLog(entries)
            }
        }
        playback = BattlePlayback(moments: next.moments, previous: previous, next: next,
                                  idleResumes: playback.idleResumes, priorResponseFeedback: playback.responseFeedback,
                                  priorFireTransitions: playback.fireTransitions, priorCombatCues: playback.combatCues,
                                  priorCovenantBreaks: playback.covenantBreaks, priorCovenantAbsorbs: playback.covenantAbsorbs,
                                  replay: isReplaying)
        for cue in playback.combatCues where cue.endsAt > playback.started {
            if let clip = cue.statusClip {
                BattlefieldAtlas.prefetch(clip.resource, maxDimension: clip.pixelLimit, combat: true)
            }
        }
        let animated = playback.duration > 0 && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        if animated, previous.started, previous.activeStack != nil {
            sidebarPlayback = SidebarPlayback(battle: previous, window: turnWindow, pausedAt: .now)
        } else {
            sidebarPlayback = nil
        }
        var cues: [(TimeInterval, SoundCue)] = []
        for action in playback.actions {
            let moment = action.moment
            guard let actor = previous.stacks.first(where: { $0.id == moment.actor }) else { continue }
            action.projectile?.prewarm()
            if let pose = action.pose { CreatureAnimation.prewarm(actor.name, action: pose, direction: action.direction) }
            let soundKey = actor.name.lowercased().replacingOccurrences(of: " ", with: "-")
            if action.moveEnd > action.start {
                cues.append((action.start, .moving("\(soundKey)_move", until: action.moveEnd)))
                cues.append((action.moveEnd, .arrival))
            }
            switch moment.kind {
            case .place:
                cues.append((action.start, .effect("place_unit")))
            case .melee, .shot:
                if action.counterattack == nil {
                    cues.append((action.release ?? action.moveEnd, .effect("\(soundKey)_attack")))
                }
            case .obstacle:
                cues.append((action.release ?? action.moveEnd, .effect("\(soundKey)_attack")))
            case .spell:
                if let spell = moment.spell {
                    if let key = BattleSound.castKey(for: spell, caster: actor.name) {
                        cues.append((action.start, .effect(key)))
                    }
                    if spell == "Heal" || spell == "Mass Heal" { cues.append((action.impact, .effect("heal"))) }
                    if spell == "Summon Wolves" { cues.append((action.impact, .effect("summon"))) }
                }
            case .move, .wait, .defend, .endTurn: break
            }
        }
        for stack in previous.stacks {
            for action in Set((playback.reactions[stack.id] ?? []).map(\.action)) {
                CreatureAnimation.prewarm(stack.name, action: action)
            }
        }
        for cue in playback.combatCues where cue.started >= playback.started && !cue.silentHurt {
            guard case let .health(delta, _) = cue.kind, delta < -0.001 else { continue }
            let key = cue.stack.name.lowercased().replacingOccurrences(of: " ", with: "-")
            cues.append((cue.started.timeIntervalSince(playback.started), .effect("\(key)_hurt")))
        }
        for shield in playback.waterShieldBreaks {
            cues.append((shield.started.timeIntervalSince(playback.started), .effect("water_shield_dissolve")))
        }
        animationTask?.cancel()
        sound.stopMovement()
        animationTask = nil
        isAnimating = animated
        if animated {
            let clock = ContinuousClock()
            let start = clock.now - .seconds(max(0, Date().timeIntervalSince(playback.started)))
            let duration = playback.duration
            animationTask = Task { [weak self] in
                do {
                    for (time, cue) in cues.sorted(by: { $0.0 < $1.0 }) {
                        try await clock.sleep(until: start + .seconds(time))
                        guard let self, !Task.isCancelled else { return }
                        switch cue {
                        case .effect(let key):
                            if effectsEnabled { sound.play(key) }
                        case let .moving(key, until):
                            if effectsEnabled, clock.now < start + .seconds(until) { sound.startMovement(key) }
                        case .arrival:
                            sound.stopMovement()
                        }
                    }
                    try await clock.sleep(until: start + .seconds(duration))
                    guard !Task.isCancelled else { return }
                    self?.sidebarPlayback = nil
                    self?.isAnimating = false
                } catch {}
            }
        } else if effectsEnabled {
            for (_, cue) in cues {
                if case .effect(let key) = cue { sound.play(key) }
            }
        }
    }

    private func append(_ title: String, _ detail: String = "", team: Team? = nil) {
        appendLog([BattleLog.line(detail.isEmpty ? title : "\(title) \(detail)", team: team)])
    }

    private func appendLog(_ lines: [String]) {
        guard !lines.isEmpty else { return }
        log.append(contentsOf: lines)
        if log.count > BattleLog.limit { log.removeFirst(log.count - BattleLog.limit) }
    }

    private func queueOpponent(forced: Bool = false) {
        guard opponentTask == nil, (forced || battle?.opponentTurn == true), let engine else { return }
        if forced { isAnimating = true }
        opponentTask = Task { [weak self] in
            var firstForcedTurn = forced
            defer {
                if self?.engine === engine { self?.opponentTask = nil }
            }
            while !Task.isCancelled {
                await self?.animationTask?.value
                do { try await Task.sleep(for: .milliseconds(80)) }
                catch { return }
                guard !Task.isCancelled, let self, self.engine === engine else { return }
                applyAutoplay(to: engine)
                guard firstForcedTurn || battle?.opponentTurn == true else { return }
                do {
                    let next = try await engine.opponentTurnView(forced: firstForcedTurn)
                    guard !Task.isCancelled, self.engine === engine else { return }
                    guard let next else {
                        if firstForcedTurn {
                            isAnimating = false
                            update(engine.perform(.endTurn))
                            return
                        }
                        problem = "The opponent could not take its turn. Restart to try again."
                        return
                    }
                    firstForcedTurn = false
                    present(next)
                } catch {
                    if !Task.isCancelled, self.engine === engine {
                        if firstForcedTurn { isAnimating = false }
                        problem = error.localizedDescription
                    }
                    return
                }
                applyAutoplay(to: engine)
                guard battle?.opponentTurn == true else { return }
            }
        }
    }
}
