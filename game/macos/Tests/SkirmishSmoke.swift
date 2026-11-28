import AppKit
import Carbon.HIToolbox
import CoreGraphics
import Foundation
import ImageIO
import Metal

@main
struct SkirmishSmoke {
    @MainActor
    static func main() async throws {
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        let resources = url.deletingLastPathComponent()
        let data = try Data(contentsOf: url)
        let opening = try NativeBattle(snapshot: data).view()
        let setup = try SandboxSetup(resources: resources)
        let fixtureStacks = try opening.stacks.map { stack in
            let creature = try setup.creatures.first { $0.name == stack.name }.unwrap("missing fixture creature \(stack.name)")
            let anchor = try stack.anchor.unwrap("missing fixture anchor for \(stack.name)")
            return SandboxStack(creature: creature.id, team: stack.team, amount: stack.amount, x: anchor.x, y: anchor.y)
        }
        try require(!opening.started && opening.stacks.count == 6 && opening.size == 16, "expected the pre-fight board")
        try require(opening.damage.isEmpty && opening.stacks.allSatisfy { $0.losses == 0 }, "opening reported old damage")
        try require(opening.stacks.first { $0.name == "Healer" }?.book.contains { $0.name == "Blessing" && $0.charges > 0 } == true,
                    "the inspector lost the Healer’s spells")
        try require(opening.stacks.first { $0.name == "Wolf" }?.cells.count == 2, "lost the Wolf’s footprint")
        try require(try NativeBattle(snapshot: data).view() == opening, "restart must reproduce the opening state")

        do {
            _ = try NativeBattle(snapshot: Data("{".utf8))
            throw EngineError(message: "Accepted malformed JSON")
        } catch let error as EngineError {
            try require(error.message.hasPrefix("malformed state"), "expected the Zig loader’s error")
        }

        let artwork = try BattlefieldArtwork.load(url.deletingLastPathComponent().appendingPathComponent("battlefield.json"))
        try checkBarrelFrames(artwork)
        try checkWindAuras(artwork)
        try checkGriffinAura(artwork)
        try checkWyvernAura(artwork)
        try checkArachnaAura(artwork)
        try checkAbominationAura(artwork)
        try checkSmokeVolume(artwork)
        for (width, height, scale) in [(932.0, 900.0, 900.0), (465.0, 700.0, 700.0)] {
            let projection = BattlefieldProjection(data: artwork, width: width, height: height, legacySize: scale)
            for x in 0..<opening.size {
                for y in 0..<opening.size {
                    let cell = Cell(x: Int32(x), y: Int32(y))
                    try require(projection.cell(at: projection.center([cell])) == cell, "painted tile and hit target diverged")
                    let tile = projection.tile(cell)
                    for (offsetX, offsetY) in [(0.2, 0.2), (0.8, 0.2), (0.2, 0.8), (0.8, 0.8)] {
                        let interior = projection.point(x: CGFloat(x) + offsetX, y: CGFloat(y) + offsetY)
                        try require(tile.outline.contains(interior), "the hit shape lost part of its painted tile")
                    }
                }
            }
            try require(projection.cell(at: CGPoint(x: width / 2, y: 4)) == nil, "the artwork wall accepted a cell hit")
            try checkInspectionTargets(opening.stacks, projection: projection)
            try checkFootprintHighlights(projection)
        }
        try checkTerrain(url.deletingLastPathComponent())
        try checkSandbox(setup, stacks: fixtureStacks, resources: resources)
        try checkAuraFields(setup, resources: resources)
        try checkLoadouts(setup, stacks: fixtureStacks, resources: resources)
        try checkRosterPlacementHint(setup, resources: resources)
        try checkPointerHints(data, opening: opening)
        try checkBattleLog(setup, resources: resources)
        try checkShotRange(setup, resources: resources)
        try checkInspectionDescriptions(opening.stacks)
        try checkCounterattacks(setup, resources: resources)
        try checkRepeatedStrikes(setup, resources: resources)
        try checkGargantuanSplash(setup, resources: resources)
        try checkHydraForecast(setup, resources: resources)
        try checkBattlefieldOptics()
        try checkBreathForecast(setup, resources: resources)
        try checkFleshShieldForecast(setup, resources: resources)
        try checkFireforgedForecast(setup, resources: resources)
        try checkLocalLanguage()
        try checkPetrifyingGaze(setup, resources: resources)
        try checkTurnClock()
        try checkSandboxShortcuts()
        try checkChakram(setup, resources: resources)
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            try checkBattleMageIdle(resources)
            try checkAnimationFrames(opening.stacks)
            try checkIdleRoster(setup.creatures)
            try checkBoardFraming(opening.stacks, artwork: artwork)
            try checkProjectileAssets(url.deletingLastPathComponent())
            try checkBowReleases(setup, resources: resources, artwork: artwork)
            try require(BattlefieldAtlas.frame("vfx_pegasus_feather_atlas_v7.webp", columns: 2, rows: 2, index: 3) != nil &&
                        BattlefieldAtlas.frame("vfx_griffin_tornado_silver_v2.webp", columns: 3, rows: 1, index: 2) != nil,
                        "missing the Pegasus feather or Griffin debris atlas")
            try await checkColdDirectionalAttack()
            if Bundle.main.url(forResource: "fire_pit_dark_bowl_v1_512", withExtension: "webp") != nil {
                try checkFireFrames()
            }
        }

        let battle = try NativeBattle(snapshot: data)
        let squire = try opening.stacks.first { $0.name == "Squire" }.unwrap("missing Squire")
        let wolf = try opening.stacks.first { $0.name == "Wolf" }.unwrap("missing Wolf")
        try require(!battle.select(wolf.id), "could move an opponent during deployment")
        try require(!battle.choose(Cell(x: 5, y: 8)), "could deploy outside the left zone")
        try require(try battle.view() == opening, "refused placement mutated the board")
        try require(battle.select(squire.id), "could not select the Squire")
        let destination = Cell(x: 3, y: 7)
        try require(battle.choose(destination), "engine refused a legal deployment")
        let deployed = try battle.view()
        try require(deployed.stacks.first { $0.id == squire.id }?.cells == [destination], "deployment did not move the stack")
        try require(deployed.deploying == nil && deployed.movementLandings.coveredCells.isEmpty,
                    "a dropped stack still showed a placement preview")
        try require(deployed.moments.last?.kind == .place, "placement did not produce a presentation event")
        try require(battle.ready(), "could not start combat after deployment")
        try require(!battle.ready() && !battle.select(squire.id), "deployment command accepted during combat")

        var view = try advanceToPlayer(battle)
        try require(view.playerTurn && view.canWait, "expected a player turn with Wait available")
        try require(!battle.playOpponent(), "opponent command ran during the player’s turn")
        try require(!battle.choose(Cell(x: -1, y: 16)), "accepted an out-of-bounds move")
        try require(try battle.view() == view, "refused move mutated the board")
        try require(battle.perform(.wait), "Wait was rejected")
        try require(try battle.view().active != view.active, "Wait left the same stack active")
        view = try advanceToPlayer(battle)
        try require(view.playerTurn && battle.perform(.endTurn), "End turn was rejected")
        try require(try battle.view().active != view.active, "End turn left the same stack active")
        try checkSpell(data)
        try checkBattleRoar(setup, resources: resources)
        try checkFireWall(setup, resources: resources)
        try checkDamageSpells(setup, resources: resources)
        try checkStatusEffects(setup, resources: resources)
        try checkWaterShield(setup, resources: resources)
        try checkRangedMovement(data)
        try checkAttackAngles(data, artwork: artwork, resources: url.deletingLastPathComponent())
        try checkProjectileTargeting(setup, resources: resources)
        try checkOrcProjectile(url.deletingLastPathComponent())
        try checkPikemanSkewer(url.deletingLastPathComponent())

        let fight = try NativeBattle(snapshot: data)
        try require(fight.ready(), "could not start the full battle")
        view = try fight.view()
        var recordedFight = [view]
        var moved = false
        var melee = false
        var ranged = false
        var defended = false
        var presentedDamage = false
        for _ in 0..<250 {
            if view.winner != nil || view.stalled { break }
            if view.opponentTurn {
                try require(fight.playOpponent(), "opponent stalled")
            } else if let active = view.activeStack, view.playerTurn {
                let enemies = view.stacks.filter { $0.team == .opponent }
                let opposingCells = enemies.flatMap(\.cells)
                if !defended {
                    try require(fight.perform(.defend), "Defend was rejected")
                    defended = true
                } else if let target = enemies.first(where: { view.attacks.contains($0.id) }), let cell = target.cells.first {
                    try require(fight.choose(cell), "highlighted attack was rejected")
                    let result = try fight.view()
                    let moments = result.moments
                    let playback = BattlePlayback(moments: moments)
                    let movement = playback.movementTime(playback.route(for: active))
                    let strike = moments.first { $0.actor == active.id && ($0.kind == .melee || $0.kind == .shot) }
                    if let strike {
                        let action = playback.pose(for: active, elapsed: movement + 0.1, idleTime: 0, fallen: false).action
                        try require(action == (strike.kind == .melee ? .meleeAttack : .attack),
                                    "a real hit did not play its attack after movement")
                        try require(playback.pose(for: active, elapsed: playback.duration + 0.1, idleTime: 0, fallen: false).action == .idle,
                                    "the attacker did not return to idle")
                        if !presentedDamage, let hit = strike.healthChanges?.first(where: { $0.delta < 0 && $0.target == strike.target }) {
                            let timeline = BattlePlayback(moments: moments, previous: view, next: result)
                            let impact = try timeline.actions.first { $0.moment == strike }.unwrap("the strike lost its impact").impact
                            try require(timeline.combatCues.contains {
                                guard case let .health(delta, casualties) = $0.kind else { return false }
                                return $0.stack.id == hit.target && delta == hit.delta && casualties == hit.casualties &&
                                    abs($0.started.timeIntervalSince(timeline.started) - impact) < 0.001
                            }, "the damage number did not use the actual hit and its impact time")
                            presentedDamage = true
                        }
                    }
                    melee = melee || moments.contains { $0.kind == .melee && $0.actor == active.id }
                    ranged = ranged || moments.contains { $0.kind == .shot && $0.actor == active.id }
                } else if let destination = view.moves.min(by: {
                    distance(from: [$0], to: opposingCells) < distance(from: [$1], to: opposingCells)
                }) {
                    try require(fight.choose(destination), "highlighted move was rejected")
                    let after = try fight.view()
                    let movedStack = try after.stacks.first { $0.id == active.id }.unwrap("the moving stack disappeared")
                    try require(movedStack.cells.contains(destination), "movement did not place the stack on its destination")
                    try require(after.moments.contains { $0.kind == .move && $0.route.last == destination } &&
                                after.moments.contains { $0.kind == .endTurn && $0.actor == active.id },
                                "movement did not emit both the route and the browser's turn handoff")
                    let playback = BattlePlayback(moments: after.moments, previous: view, next: after)
                    let pose = playback.pose(for: active, elapsed: 0.1, idleTime: 0, fallen: false)
                    try require(pose.action == .walk, "a real move did not play the walk")
                    let route = playback.route(for: active)
                    let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
                    try require(route.first == Cell(x: active.cells.map(\.x).max()!, y: active.cells.map(\.y).max()!),
                                "the walk route lost its starting cell")
                    let start = projection.center(active.cells)
                    let end = projection.center(movedStack.cells)
                    let halfway = playback.position(movedStack, at: playback.duration / 2, projection: projection)
                    try require(halfway != start && halfway != end &&
                                playback.position(movedStack, at: 0, projection: projection) == start &&
                                playback.position(movedStack, at: playback.duration, projection: projection) == end,
                                "the rendered movement must pass between its actual start and end")
                    moved = true
                } else {
                    try require(fight.perform(.endTurn), "End turn was rejected")
                }
            } else {
                throw EngineError(message: "Battle had no active stack or result")
            }
            view = try fight.view()
            recordedFight.append(view)
        }
        try require(moved && melee && ranged && defended, "missed movement, melee, ranged or defend")
        try require(presentedDamage, "no accepted attack produced a damage number")
        try require(!view.stalled && view.winner != nil && view.active == nil, "battle failed to reach a result")
        try require(view.damage.contains { $0.team == .player && $0.amount > 0 } &&
                    view.damage.contains { $0.team == .opponent && $0.amount > 0 }, "damage panel lost one side’s damage")
        try checkFightSummary(recordedFight)
        try require(!fight.perform(.endTurn) && !fight.playOpponent(), "finished battle accepted a turn")
        print("Native sandbox passed the roster, deployment, hotseat controls, terrain, spellbook and actual movement, melee and ranged combat.")
    }

    private static func checkBarrelFrames(_ artwork: BattlefieldArtwork) throws {
        let viewportHeight: CGFloat = 900
        let floorHeight = viewportHeight * artwork.heightRatio
        let square = BattlefieldProjection(data: artwork, width: floorHeight, height: viewportHeight, legacySize: viewportHeight)
        let wide = BattlefieldProjection(data: artwork, width: floorHeight * 1.6, height: viewportHeight, legacySize: viewportHeight)
        for cell in [Cell(x: 0, y: 0), Cell(x: 7, y: 8), Cell(x: 15, y: 15)] {
            let reference = square.barrelFrame(for: cell)
            let resized = wide.barrelFrame(for: cell)
            try require(abs(resized.height - reference.height) < 0.001 &&
                        abs(resized.width - reference.width * 1.6) < 0.001 &&
                        abs(resized.maxY - reference.maxY) < 0.001,
                        "widening the board changed the barrel’s projected height or ground contact at \(cell.label)")
        }
    }

    private static func checkFightSummary(_ frames: [BattleView]) throws {
        let first = try frames.first.unwrap("missing the start of the fight")
        let last = try frames.last.unwrap("missing the end of the fight")
        let summary = try BattleFightSummary(frames: frames).unwrap("the finished fight had no report")
        try require(BattleFightSummary(frames: [first]) == nil, "a live fight showed final results")
        try require(summary.winner == last.winner && summary.laps == last.lap && summary.samples.count > 1,
                    "the report lost the outcome or casualty history")
        for army in summary.armies {
            let starting = first.stacks.filter { $0.team == army.team }
            let survivors = last.stacks.filter { $0.team == army.team }
            let deployed = starting.reduce(0) { $0 + $1.amount }
            let lost = deployed - survivors.reduce(0) { $0 + $1.amount }
            let damage = last.damage.filter { $0.team == army.team }.reduce(0) { $0 + $1.amount }
            let chart = summary.samples.last?.losses[army.team]
            try require(summary.samples.first?.losses[army.team] == 0 &&
                        chart == BattleFightSummary.percentage(lost, of: deployed) &&
                        army.deployed == deployed && army.lost == lost &&
                        abs(army.creatures.reduce(0) { $0 + $1.damage } - damage) < 0.001,
                        "\(army.team.title) report disagreed with the battle state")
        }
        try require(summary.samples.contains { !$0.eliminated.isEmpty }, "casualty history lost eliminations")
    }

    private static func checkFootprintHighlights(_ projection: BattlefieldProjection) throws {
        for anchor in [Cell(x: 2, y: 15), Cell(x: 14, y: 1)] {
            for footprint in Footprint.allCases {
                let cells = footprint.cells(at: anchor)
                let highlight = projection.footprintHighlight(for: cells)
                let border = highlight.copy(strokingWithWidth: max(1.4, projection.spriteCellSize * 0.035),
                                            lineCap: .butt, lineJoin: .miter, miterLimit: 10)
                for cell in cells {
                    try require(highlight.contains(projection.center([cell])), "a \(footprint.label) highlight missed an occupied tile")
                    for (x, y) in [(0.0, 0.5), (0.5, 0.0), (1.0, 0.5), (0.5, 1.0)] {
                        let seam = projection.point(x: CGFloat(cell.x) + x, y: CGFloat(cell.y) + y)
                        try require(!highlight.contains(seam) && !border.contains(seam),
                                    "the \(footprint.label) highlight closed the gap between tiles")
                    }
                }
            }
        }
    }

    @MainActor
    private static func checkInspectionTargets(_ stacks: [Stack], projection: BattlefieldProjection) throws {
        for stack in stacks {
            let logical = BattlefieldProjection.logicalCenter(stack.cells)
            let facing: CGFloat = stack.team == .player ? 1 : -1
            let body = CreatureAnimation.boardPresentation(stack, position: logical, projection: projection, facing: facing)
            let bodyPoint = CGPoint(x: body.ground.x, y: body.ground.y - body.height * 0.5)
            try require(projection.stackForInspection(at: bodyPoint, among: [stack])?.id == stack.id,
                        "right-click inspection missed the painted \(stack.name)")
            for cell in stack.cells {
                try require(projection.stackForInspection(at: projection.center([cell]), among: [stack])?.id == stack.id,
                            "right-click inspection missed one of \(stack.name)'s occupied tiles")
            }
        }
        let empty = projection.center([Cell(x: 7, y: 1)])
        try require(projection.stackForInspection(at: empty, among: stacks) == nil, "right-clicking open floor inspected a unit")
    }

    private static func checkPointerHints(_ snapshot: Data, opening: BattleView) throws {
        var document = try (JSONSerialization.jsonObject(with: snapshot) as? [String: Any]).unwrap("invalid battle fixture")
        var units = try (document["units"] as? [[String: Any]]).unwrap("missing combat hint units")
        let teams = try units.map { try ($0["team"] as? Int).unwrap("missing fixture team") }
        let effects = ["Aggr", "Terrifying Gaze", "Paralysis"]
        for index in units.indices {
            let enemies = units.indices.filter { teams[$0] != teams[index] }
            var fields = try (units[index]["fields"] as? [String: Any]).unwrap("missing fixture unit fields")
            var properties = try (fields["unitProperties"] as? [String: Any]).unwrap("missing fixture unit properties")
            properties["target"] = units[enemies[0]]["id"]
            properties["forbidden_target"] = units[enemies[1]]["id"]
            properties["applied_effects"] = effects
            properties["applied_effects_laps"] = effects.map { _ in 3 }
            properties["applied_effects_powers"] = effects.map { _ in 20 }
            fields["unitProperties"] = properties
            fields["effects"] = effects.map { name in
                ["effectProperties": ["name": name, "laps": 3, "power": 20, "stacks": 1]]
            }
            units[index]["fields"] = fields
        }
        document["units"] = units
        let battle = try NativeBattle(snapshot: JSONSerialization.data(withJSONObject: document))
        try require(battle.configureSandbox(anchors: opening.stacks.compactMap(\.anchor), automated: []) && battle.ready(),
                    "could not start the combat hint fixture")
        let view = try battle.view()
        let actor = try view.activeStack.unwrap("missing the affected unit")
        let enemies = view.stacks.filter { $0.team != actor.team }
        try require(view.aggrTarget == enemies[0].id && view.terrifyingGazeTarget == enemies[1].id,
                    "the bridge lost the exact provoker or gazer")
        let destination = Cell(x: 8, y: 7)
        try require(view.actionHint(at: destination, target: enemies[2], canAttackHere: false) ==
                    "Aggr — must attack \(enemies[0].name)", "Aggr did not name the required target")
        try require(view.actionHint(at: destination, target: enemies[1], canAttackHere: false) ==
                    "Terrifying Gaze — can't attack \(enemies[1].name)", "Terrifying Gaze did not name its forbidden target")
        try require(view.actionHint(at: destination, target: nil, canAttackHere: false) == "Paralyzed — can't move" &&
                    view.actionHint(at: destination, target: enemies[0], canAttackHere: true) == nil,
                    "Paralysis did not explain movement or obscured an allowed attack")
        let russian = Locale(identifier: "ru-RU")
        let gazer = GameLocalization.text(enemies[1].name, locale: russian)
        try require(view.actionHint(at: destination, target: enemies[1], canAttackHere: false, locale: russian) ==
                    "Устрашающий взгляд — нельзя атаковать отряд «\(gazer)»" &&
                    view.actionHint(at: destination, target: nil, canAttackHere: false, locale: russian) ==
                    "Паралич — отряд не может двигаться",
                    "hover prompts did not follow the game language")
        let hint = pointerHintPosition(anchor: CGPoint(x: 512, y: 395), size: CGSize(width: 210, height: 40),
                                       viewport: CGSize(width: 520, height: 400))
        try require(hint == CGPoint(x: 395, y: 363), "the hint clipped at the bottom or right edge")
    }

    @MainActor
    private static func checkRosterPlacementHint(_ setup: SandboxSetup, resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let angel = try setup.creatures.first { $0.name == "Angel" }.unwrap("missing Angel")
        func options(_ creature: SandboxCreature, stacks: [SandboxStack]) throws -> SandboxRosterPlacement {
            let (engine, deployment) = try configurator.prepare(map: .normal, stacks: stacks, catalogue: setup.creatures,
                                                                loadouts: [:], automated: [])
            return setup.rosterPlacements(for: creature.footprint, on: try engine.view(), deployment: deployment)
        }

        let full = try options(squire, stacks: setup.sampleArmies)
        try require(full.anchors.isEmpty && full.hint(for: squire) == "Stack limit reached. Remove a stack to place Squire.",
                    "a full Sandbox failed to explain the stack limit")
        let greenOnly = try options(squire, stacks: setup.sampleArmies.filter { $0.team == .opponent })
        try require(Set(greenOnly.anchors.values) == [.player] && greenOnly.hint(for: squire) == "Only Green has room for Squire.",
                    "the placement hint did not name the remaining team")
        try require(greenOnly.hint(for: squire, locale: Locale(identifier: "ru-RU")) ==
                    "Место для отряда «Оруженосец» есть только у команды «Зелёный».",
                    "the translated placement hint lost the creature or the eligible side")
        let empty = try options(angel, stacks: [])
        try require(Set(empty.anchors.values) == [.player, .opponent] && empty.hint(for: angel) == nil,
                    "a freely placeable creature showed a placement warning")

        let board = try configurator.prepare(map: .normal, stacks: [], catalogue: setup.creatures,
                                             loadouts: [:], automated: []).0.view()
        let fragmented: [Team: SandboxTeamPreview] = [
            .player: .init(team: .player, cells: [Cell(x: 1, y: 7), Cell(x: 2, y: 8)],
                           levels: [:], capacity: 6, barrels: []),
            .opponent: .init(team: .opponent, cells: [Cell(x: 13, y: 7), Cell(x: 14, y: 8)],
                             levels: [:], capacity: 6, barrels: []),
        ]
        let blocked = setup.rosterPlacements(for: angel.footprint, on: board, deployment: fragmented)
        try require(blocked.anchors.isEmpty &&
                    blocked.hint(for: angel) == "No room for Angel. Clear a 2×2 space in a deployment zone.",
                    "free but disconnected tiles were counted as space for a whole creature")
    }

    @MainActor
    private static func checkLoadouts(_ setup: SandboxSetup, stacks: [SandboxStack], resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        try checkSampleArmies(setup, using: configurator)
        let (base, _) = try configurator.prepare(map: .normal, stacks: stacks,
                                                  catalogue: setup.creatures, loadouts: [:], automated: [])
        let unmodified = try base.view()
        let plan = SandboxLoadout(augments: ["Armor": 2, "Placement": 1],
                                  synergies: ["Life": 2], tier1: 4, tier2: 5)
        let (engine, teams) = try configurator.prepare(map: .normal, stacks: stacks,
                                                       catalogue: setup.creatures, loadouts: [.player: plan],
                                                       automated: [])
        let configured = try engine.view()
        let original = try unmodified.stacks.first { $0.name == "Squire" }.unwrap("missing baseline Squire")
        let improved = try configured.stacks.first { $0.name == "Squire" }.unwrap("missing configured Squire")
        try require(teams[.player]?.levels["Life"] == 1, "Life synergy must count distinct placed creatures")
        try require(teams[.player]?.cells.contains(Cell(x: 4, y: 0)) == true, "Placement augment did not widen the zone")
        try require(teams[.opponent]?.cells.contains(Cell(x: 11, y: 0)) == false, "one army changed the other zone")
        try require(improved.armor > original.armor && improved.movement > original.movement,
                    "canonical augments and artifacts did not reach the native battle")
        try require(configured.stacks.filter { $0.team == .opponent } == unmodified.stacks.filter { $0.team == .opponent },
                    "one army's choices changed the other army's stack stats")
        try require(engine.select(improved.id) && engine.choose(Cell(x: 4, y: 0)) && engine.ready(),
                    "the expanded placement zone was not accepted by the Zig engine")
        let started = try engine.view()
        try require(started.stacks.first { $0.id == improved.id }?.cells == [Cell(x: 4, y: 0)],
                    "the chosen placement did not survive Start")

        let options = configurator.options
        try require(options.augmentLabels["Placement"]?.last == "Height 6 full + edge line" &&
                    options.augmentLabels["Armor"]?[1].contains("%") == true,
                    "the sidebar lost the canonical augment labels")
        var barrels = SandboxLoadout(tier1: options.barrelBarricade)
        let (obstacleBattle, barrelTeams) = try configurator.prepare(map: .normal, stacks: stacks,
                                                                     catalogue: setup.creatures, loadouts: [.player: barrels],
                                                                     automated: [])
        try require(try obstacleBattle.view().stones.count == unmodified.stones.count + 2,
                    "Barrel Barricade did not place its two obstacles")
        let manual = SandboxPlacedBarrel(index: 1, cell: Cell(x: 1, y: 1))
        try require(barrelTeams[.player]?.barrels.count == 2, "the sidebar did not receive both placed barrels")
        barrels.barrels = [manual]
        let (edited, editedTeams) = try configurator.prepare(map: .normal, stacks: stacks,
                                                            catalogue: setup.creatures, loadouts: [.player: barrels],
                                                            automated: [])
        try require(editedTeams[.player]?.barrels.map(\.cell) == [manual.cell] &&
                    editedTeams[.player]?.barrels.map(\.index) == [1] &&
                    (try edited.view()).stones.count == unmodified.stones.count + 1 && edited.ready(),
                    "moving one barrel and removing the other did not survive setup")
        let (barrels1, _) = try configurator.prepare(map: .barrels, stacks: stacks, catalogue: setup.creatures,
                                                    loadouts: [:], automated: [], boardSeed: 142)
        let (barrels2, _) = try configurator.prepare(map: .barrels, stacks: stacks, catalogue: setup.creatures,
                                                    loadouts: [:], automated: [], boardSeed: 9417)
        let firstMap = try barrels1.view()
        let rerolledMap = try barrels2.view()
        try require(firstMap.stones != rerolledMap.stones && firstMap.stacks.map(\.cells) == rerolledMap.stacks.map(\.cells),
                    "rerolling the Barrels map should preserve both armies")
    }

    @MainActor
    private static func checkShotRange(_ setup: SandboxSetup, resources: URL) throws {
        let positions: [(String, Team, Int32, Int32)] = [
            ("Centaur", .player, 3, 6),
            ("Elf", .opponent, 12, 10),
            ("Arbalester", .opponent, 14, 13),
            ("Squire", .player, 2, 9),
        ]
        let stacks = try positions.map { name, team, x, y in
            let creature = try setup.creatures.first { $0.name == name }.unwrap("missing \(name) for the range fixture")
            return SandboxStack(creature: creature.id, team: team, amount: 20, x: x, y: y)
        }
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let (engine, _) = try configurator.prepare(map: .normal, stacks: stacks, catalogue: setup.creatures,
                                                   loadouts: [:], automated: [])
        let opening = try engine.view()
        let centaur = try opening.stacks.first { $0.name == "Centaur" }.unwrap("missing placed Centaur")
        let elf = try opening.stacks.first { $0.name == "Elf" }.unwrap("missing placed Elf")
        let arbalester = try opening.stacks.first { $0.name == "Arbalester" }.unwrap("missing placed Arbalester")
        let squire = try opening.stacks.first { $0.name == "Squire" }.unwrap("missing placed Squire")
        let frames = BattleShotRange.visible(in: opening, selectedID: centaur.id, hoveredID: elf.id)
        try require(frames.map(\.tone) == [.neutral, .enemy] &&
                    frames.map(\.bounds) == [CGRect(x: 0, y: 2, width: 8, height: 9), CGRect(x: 5, y: 3, width: 11, height: 13)],
                    "shot ranges must follow each footprint and floor the Elf’s fractional distance at the cell boundary")
        try require(BattleShotRange.visible(in: opening, selectedID: nil, hoveredID: squire.id).isEmpty,
                    "a melee stack advertised a shooting range")
        let narrowed = BattleShotRange(stack: centaur, size: opening.size, narrowing: 3, tone: .friendly)
        try require(narrowed?.bounds == CGRect(x: 3, y: 3, width: 5, height: 8),
                    "the shot range drew across cells lost to narrowing")
        try require(BattleShotRange(stack: arbalester, size: opening.size, narrowing: 0, tone: .enemy)?.bounds ==
                    CGRect(x: 0, y: 0, width: 16, height: 16), "Sniper did not cover the whole board")

        let quiver = try configurator.options.artifacts.first { $0.name == "Farsight Quiver" }.unwrap("missing Farsight Quiver")
        let (equipped, _) = try configurator.prepare(map: .normal, stacks: stacks, catalogue: setup.creatures,
                                                    loadouts: [.player: SandboxLoadout(tier2: quiver.id)], automated: [])
        let withQuiver = try equipped.view()
        let framesWithQuiver = BattleShotRange.visible(in: withQuiver, selectedID: centaur.id, hoveredID: arbalester.id)
        try require(framesWithQuiver.count == 1 && framesWithQuiver.first?.tone == .enemy &&
                    framesWithQuiver.first?.bounds == CGRect(x: 0, y: 0, width: 16, height: 16),
                    "the hovered Sniper’s range must take precedence over the selected Farsight Quiver’s identical range")

        try require(engine.ready(), "could not start the range fixture")
        var turn = try engine.view()
        for _ in stacks where turn.activeStack?.fullDamageShotCells == nil {
            try require(engine.perform(.endTurn), "could not reach a ranged turn")
            turn = try engine.view()
        }
        let activeFrames = BattleShotRange.visible(in: turn, selectedID: nil, hoveredID: nil)
        try require(activeFrames.map(\.tone) == [.friendly] &&
                    activeFrames == BattleShotRange.visible(in: turn, selectedID: turn.active, hoveredID: turn.active),
                    "the active shooter needs a single friendly frame with or without the pointer over it")
    }

    private static func checkInspectionDescriptions(_ stacks: [Stack]) throws {
        for stack in stacks {
            for ability in stack.abilities {
                let detail = UnitInspectionDescriptions.ability(ability)
                try require(!detail.description.isEmpty && !detail.description.contains("{}"),
                            "\(ability) has no inspection description")
            }
        }
        let blessing = UnitInspectionDescriptions.spell(StackSpell(name: "Blessing", charges: 3))
        try require(blessing.description.contains("maximum possible damage") && blessing.note?.contains("3 scrolls left") == true,
                    "Blessing lost its effect description or remaining scrolls")
        let rune = UnitInspectionDescriptions.status(StackStatus(kind: .buff, name: "Weapon Rune", laps: 15,
                                                                power: 2, first: nil, second: nil))
        try require(rune.description.contains("+2 attack") && rune.note == "Lasts for the battle.",
                    "a permanent buff lost its live power or duration")
        let paralysis = UnitInspectionDescriptions.status(StackStatus(kind: .effect, name: "Paralysis", laps: 1,
                                                                      power: 40, first: nil, second: nil))
        try require(paralysis.description.contains("unable to move") && paralysis.description.contains("40%") &&
                    paralysis.note == "1 lap remaining.", "a debuff lost its effect or remaining laps")
        let sniper = UnitInspectionDescriptions.status(StackStatus(kind: .buff, name: "Sniper Augment", laps: 15,
                                                                   power: 0, first: 27, second: 70))
        try require(sniper.description.contains("by 27%") && sniper.description.contains("by 70%"),
                    "the Sniper Augment did not display both live bonuses")
    }

    private static func checkSandboxShortcuts() throws {
        func shortcut(_ text: String, code: Int, modifiers: NSEvent.ModifierFlags = [], repeats: Bool = false) throws -> SandboxShortcut? {
            let event = try NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers, timestamp: 0,
                                           windowNumber: 0, context: nil, characters: text, charactersIgnoringModifiers: text,
                                           isARepeat: repeats, keyCode: UInt16(code)).unwrap("could not create a shortcut event")
            return SandboxShortcut(event)
        }
        let keys: [(String, String, Int, SandboxShortcut)] = [
            ("d", "в", kVK_ANSI_D, .d), ("s", "ы", kVK_ANSI_S, .s), ("c", "с", kVK_ANSI_C, .c),
        ]
        for (latin, russian, code, expected) in keys {
            try require(try shortcut(latin, code: code) == expected && shortcut(russian, code: code) == expected &&
                        shortcut(russian.uppercased(), code: code, modifiers: .shift) == expected,
                        "\(latin) and \(russian) must share a physical shortcut")
            try require(try shortcut(latin, code: code, repeats: true) == nil, "autorepeat executed a stack shortcut")
            for modifier in [NSEvent.ModifierFlags.command, .control, .option] {
                try require(try shortcut(latin, code: code, modifiers: modifier) == nil, "an app shortcut intercepted a system key combination")
            }
        }
        try require(try shortcut("с", code: kVK_ANSI_A) == nil, "routed a shortcut by its typed character")
    }

    @MainActor
    private static func checkChakram(_ setup: SandboxSetup, resources: URL) throws {
        let zena = try setup.creatures.first { $0.name == "Zena" }.unwrap("missing the chakram thrower")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing the chakram target")
        let thrower = SandboxStack(creature: zena.id, team: .player, amount: 50, x: 3, y: 8)
        let targets = [8, 6, 4].map { SandboxStack(creature: squire.id, team: .opponent, amount: 50, x: 12, y: Int32($0)) }
        let engine = try setup.makeBattle(map: .normal, stacks: [thrower] + targets, automated: [], resources: resources)
        try require(engine.ready(), "could not start the Chakram fixture")
        var turn = try engine.view()
        for _ in targets where turn.activeStack?.name != zena.name {
            try require(engine.perform(.endTurn), "could not reach Zena’s turn")
            turn = try engine.view()
        }
        let shooter = try turn.activeStack.unwrap("missing Zena’s active stack")
        let victims = turn.stacks.filter { $0.team == .opponent }.sorted { ($0.anchor?.y ?? 0) > ($1.anchor?.y ?? 0) }
        let aim = try victims[0].anchor.unwrap("missing the primary target’s anchor")
        let forecast = turn.attackOptions.first { $0.target == victims[0].id }?.angles.first?.range?.hits ?? []
        try require(forecast.map(\.target) == victims.map(\.id) && forecast.allSatisfy { $0.min > 0 && $0.max >= $0.min },
                    "the Chakram preview did not follow the engine's bounce order")
        try require(shooter.name == zena.name && engine.choose(aim), "could not throw the Chakram")
        let struck = try engine.view()
        let shot = try struck.moments.first { $0.kind == .shot }.unwrap("missing Zena’s shot")
        let flight = try (shot.chakramFlights ?? []).first.unwrap("the bridge dropped Zena’s flight")
        try require(flight.actor == shooter.id && flight.contacts.map(\.target) == victims.map(\.id),
                    "the Chakram lost the engine's clockwise order")
        try require(flight.contacts[0].route.isEmpty && flight.contacts[1].route == [aim, Cell(x: 12, y: 7), Cell(x: 12, y: 6)],
                    "the ricochet abandoned the open cell between the two targets")
        try require(flight.contacts.allSatisfy { $0.kind == .hit && $0.delta < 0 }, "the trace lost the actual impact damage")
        let playback = BattlePlayback(moments: struck.moments, previous: turn, next: struck)
        let action = try playback.actions.first { $0.moment.actor == shooter.id }.unwrap("missing the throw animation")
        let disc = try action.chakram.unwrap("the throw reverted to a straight shot")
        try require(disc.legs.first?.from.hand == true && disc.legs.last?.to.hand == true && disc.impacts.count == victims.count,
                    "the disc must leave and return to Zena’s hand on a single flight")
        for (index, hit) in disc.impacts.enumerated() {
            try require(hit.time < disc.catchTime && (index == 0 || hit.time > disc.impacts[index - 1].time),
                        "two Chakram contacts played out of order")
            let numbers = playback.combatCues.filter { cue in
                guard case let .health(delta, _) = cue.kind else { return false }
                return cue.stack.id == hit.contact.target && delta == hit.contact.delta
            }
            try require(numbers.count == 1 && abs(numbers[0].started.timeIntervalSince(playback.started) - hit.time) < 0.000_01,
                        "the damage number didn’t follow the disc's contact")
        }
        try require(action.actionEnd > disc.catchTime && playback.duration >= action.actionEnd,
                    "the turn ended before the catch animation")
    }

    @MainActor
    private static func checkGargantuanSplash(_ setup: SandboxSetup, resources: URL) throws {
        let gargantuan = try setup.creatures.first { $0.name == "Gargantuan" }.unwrap("missing Gargantuan")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let center = Cell(x: 12, y: 8)
        let beside = Cell(x: 12, y: 9)
        let outside = Cell(x: 12, y: 10)
        let targets = [center, beside, outside].map { SandboxStack(creature: squire.id, team: .opponent, amount: 70,
                                                                  x: $0.x, y: $0.y) }
        let shooter = SandboxStack(creature: gargantuan.id, team: .player, amount: 12, x: 3, y: 8)
        let sandbox = try setup.makeBattle(map: .normal, stacks: [shooter] + targets, automated: [], resources: resources)
        try require(sandbox.ready(), "could not start the Gargantuan fight")
        var before = try sandbox.view()
        for _ in targets where before.activeStack?.name != gargantuan.name {
            try require(sandbox.perform(.endTurn), "could not reach the Gargantuan’s turn")
            before = try sandbox.view()
        }
        let attacker = try before.activeStack.unwrap("missing the Gargantuan turn")
        let aim = Cell(x: 14, y: 8)
        let area = try before.areaAims.first(where: { $0.aim == aim }).unwrap("Gargantuan could not aim at a free cell")
        try require(attacker.name == gargantuan.name && before.moves.isEmpty &&
                    SandboxCursorMode.resolve(at: aim, in: before) == .ranged,
                    "the area throw was offered as a move")
        let cells = area.splash.cells(size: before.size, excluding: Set(before.holes))
        try require(area.splash.center == center && cells.count == 9 && cells.contains(beside) && !cells.contains(outside),
                    "the 3 × 3 preview did not land on the first stack in the ray")
        let corner = BattleSplash(center: Cell(x: 0, y: 0), single: false)
        try require(corner.cells(size: before.size, excluding: [Cell(x: 0, y: 1)]).count == 3,
                    "splash geometry painted outside the board or over a missing tile")
        let primary = try before.stacks.first(where: { $0.cells == [center] }).unwrap("missing the prime splash target")
        let aimed = before.attackOptions.first(where: { $0.target == primary.id })?.angles
        try require(aimed?.contains(where: { $0.splash?.center == center }) == true,
                    "aiming at a stack did not predict the same blast")
        try require((area.divisor ?? 0) > 0 && area.hits?.allSatisfy { $0.divisor == area.divisor } == true,
                    "the shared area range badge disagreed with the individual forecasts")
        let empty = before.areaAims.first { $0.aim == Cell(x: 6, y: 7) }
        try require(empty?.hits?.isEmpty == true && (empty?.divisor ?? 0) > 0,
                    "an empty blast needs its range badge too")

        try require(sandbox.choose(aim), "the preview offered a throw the engine rejected")
        let after = try sandbox.view()
        let throwMoment = try after.moments.first(where: { $0.kind == .shot }).unwrap("the throw emitted no projectile")
        try require(throwMoment.actor == attacker.id && throwMoment.aim == aim && throwMoment.splash == area.splash,
                    "the impact disagreed with the area preview")
        let nearbyIDs = Set(before.stacks.filter { $0.team == .opponent && $0.cells.contains(where: cells.contains) }.map(\.id))
        try require(Set((area.hits ?? []).map(\.target)) == nearbyIDs &&
                    aimed?.contains(where: { Set(($0.range?.hits ?? []).map(\.target)) == nearbyIDs }) == true,
                    "the targeted and free-aim area forecasts lost a victim")
        let hurtIDs = Set(throwMoment.healthChanges?.filter { $0.delta < 0 }.map(\.target) ?? [])
        try require(nearbyIDs == hurtIDs, "the 3 × 3 blast missed a nearby stack or hit an outside stack")
        let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
        let volleys = playback.actions.filter { $0.moment.actor == attacker.id }
        let shot = try volleys.first.unwrap("missing the rendered throw")
        try require(volleys.count == 2 && volleys.allSatisfy { action in
            action.target == BattlefieldProjection.logicalCenter([center]) && action.release.map { $0 < action.impact } == true
        }, "Double Throw needed two flights to the actual blast center")
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            let impact = try shot.projectile?.impact.unwrap("missing the stone-impact effect")
            let first = impact?.image(at: 0, inBackground: false).flatMap(framePixels)
            let later = impact?.image(at: 0.12, inBackground: false).flatMap(framePixels)
            try require(first != nil && later != nil && first != later && playback.duration >= shot.impact + 0.25,
                        "the stone impact lost its animation or was cut off early")
        }
    }

    @MainActor
    private static func checkHydraForecast(_ setup: SandboxSetup, resources: URL) throws {
        let hydra = try setup.creatures.first { $0.name == "Hydra" }.unwrap("missing Hydra")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let placement = SandboxAugment.placement.rawValue
        let loadout = SandboxLoadout(augments: [placement: configurator.options.augmentLevels[placement, default: 0]])
        let targets = [8, 9].map { SandboxStack(creature: squire.id, team: .opponent, amount: 100, x: 11, y: Int32($0)) }
        let spinner = SandboxStack(creature: hydra.id, team: .player, amount: 9, x: 5, y: 8)
        let (engine, _) = try configurator.prepare(map: .normal, stacks: [spinner] + targets, catalogue: setup.creatures,
                                                  loadouts: [.player: loadout, .opponent: loadout], automated: [])
        try require(engine.ready(), "could not start the Hydra fight")
        var view = try engine.view()
        for _ in 0..<12 {
            if view.activeStack?.name == hydra.name {
                let victims = view.stacks.filter { $0.team == .opponent }
                if let aim = view.attackOptions.lazy.compactMap({ option in
                    option.angles.first { $0.hits?.count == victims.count }.map { (option.target, $0) }
                }).first {
                    let hits = aim.1.hits ?? []
                    try require(Set(hits.map(\.target)) == Set(victims.map(\.id)) &&
                                hits.allSatisfy { $0.min > 0 && $0.max >= $0.min },
                                "Lightning Spin failed to forecast both adjacent victims")
                    try require(engine.attack(aim.0, from: aim.1), "the engine refused the previewed Lightning Spin")
                    let result = try engine.view()
                    let struck = result.moments.first { $0.kind == .melee }?.hurt ?? []
                    try require(victims.allSatisfy { struck.contains($0.id) }, "Lightning Spin hit a different ring")
                    return
                }
                let cells = victims.flatMap(\.cells)
                let closer = try view.moves.min { distance(from: [$0], to: cells) < distance(from: [$1], to: cells) }
                    .unwrap("Hydra could not approach")
                try require(engine.choose(closer), "Hydra's approach was refused")
            } else {
                try require(engine.perform(.endTurn), "could not reach Hydra's activation")
            }
            view = try engine.view()
        }
        throw EngineError(message: "no reachable Lightning Spin hit both stacks")
    }

    @MainActor
    private static func checkPetrifyingGaze(_ setup: SandboxSetup, resources: URL) throws {
        let medusa = try setup.creatures.first { $0.name == "Medusa" }.unwrap("missing Medusa")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let attacker = SandboxStack(creature: medusa.id, team: .player, amount: 65, x: 3, y: 8)
        let target = SandboxStack(creature: peasant.id, team: .opponent, amount: 250, x: 12, y: 8)
        let engine = try setup.makeBattle(map: .normal, stacks: [attacker, target], automated: [], resources: resources)
        try require(engine.ready(), "could not start Petrifying Gaze fixture")
        var before = try engine.view()
        if before.activeStack?.name != medusa.name {
            try require(engine.perform(.endTurn), "could not reach Medusa")
            before = try engine.view()
        }
        let source = try before.activeStack.unwrap("missing the active Medusa")
        let victim = try before.stacks.first(where: { $0.team == .opponent }).unwrap("missing the gaze target")
        try require(source.name == medusa.name && engine.choose(target.anchor), "Medusa could not attack the fixture")
        let after = try engine.view()
        let shot = try after.moments.first(where: { $0.kind == .shot }).unwrap("missing the original shot")
        let gaze = try (shot.gazeImpacts ?? []).first.unwrap("the engine omitted a landed gaze")
        try require(gaze.actor == source.id && gaze.target == victim.id && gaze.damage > 0 && gaze.casualties > 0,
                    "the gaze trace lost its source, victim, or casualties")
        let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
        let stare = try playback.combatCues.first { $0.statusName == "Petrifying Gaze" }.unwrap("missing the stone effect")
        let ordinaryHit = try playback.actions.first { $0.moment.actor == source.id }.unwrap("missing the shot timing")
        let popup = try playback.combatCues.first { $0.damageTone == .petrifyingGaze }.unwrap("missing the separate gaze number")
        try require(stare.started.timeIntervalSince(playback.started) > ordinaryHit.impact &&
                    abs(popup.started.timeIntervalSince(stare.started) - BattleStatusEffects.overheadDuration / 2) < 0.00001,
                    "Petrifying Gaze landed before the shot's reaction or missed the effect midpoint")
        let numbers = playback.combatCues.compactMap { cue -> Double? in
            guard cue.stack.id == victim.id, case let .health(delta, _) = cue.kind else { return nil }
            return delta
        }
        let total = try (shot.healthChanges?.first { $0.target == victim.id }?.delta).unwrap("missing the recorded exchange")
        try require(numbers.count == 2 && abs(numbers.reduce(0, +) - total) < 0.00001 &&
                    playback.reactions[victim.id]?.count == 2, "the gaze repeated or replaced the shot's damage and reaction")
    }

    @MainActor
    private static func checkRepeatedStrikes(_ setup: SandboxSetup, resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let quiver = try configurator.options.artifacts.first { $0.name == "Quiver of Echoes" }.unwrap("missing Quiver of Echoes")
        let elf = try setup.creatures.first { $0.name == "Elf" }.unwrap("missing Elf")
        let wolf = try setup.creatures.first { $0.name == "Wolf" }.unwrap("missing Wolf")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let placement = SandboxAugment.placement.rawValue
        let extended = SandboxLoadout(augments: [placement: configurator.options.augmentLevels[placement, default: 0]])
        let quiverLoadout = SandboxLoadout(tier2: quiver.id)

        func turn(_ name: String, in battle: NativeBattle) throws -> BattleView {
            var view = try battle.view()
            for _ in view.stacks where view.activeStack?.name != name {
                try require(battle.perform(.endTurn), "could not reach \(name)'s turn")
                view = try battle.view()
            }
            try require(view.activeStack?.name == name, "missing \(name)'s turn")
            return view
        }

        func attack(_ battle: NativeBattle, from before: BattleView) throws -> (BattleView, Stack) {
            let target = try before.stacks.first { $0.team == .opponent }.unwrap("missing repeat-strike target")
            let angle = try before.attackOptions.first { $0.target == target.id }?.angles.first
                .unwrap("no repeat-strike angle")
            try require(angle.map { battle.attack(target.id, from: $0) } == true,
                        "\(before.activeStack?.name ?? "Unknown")'s repeat-strike attack was refused")
            return (try battle.view(), target)
        }

        func checkWaves(_ count: Int, kind: MomentKind, before: BattleView, after: BattleView, target: Stack) throws -> BattlePlayback {
            let moment = try after.moments.first.unwrap("missing the action's combat moment")
            let timeline = BattlePlayback(moments: after.moments, previous: before, next: after)
            let swings = timeline.actions.filter { $0.counterattack == nil && $0.moment.actor == moment.actor }
            let hits = moment.playbackMoments.compactMap { $0.healthChanges?.first { $0.target == target.id } }
            try require(swings.count == count && swings.allSatisfy { $0.moment.kind == kind } && hits.count == count,
                        "\(count) real strikes need \(count) attack poses and distinct damage results")
            let total = hits.reduce(0) { $0 + $1.delta }
            try require(abs(total - (moment.healthChanges?.first { $0.target == target.id }?.delta ?? 0)) < 0.001,
                        "per-strike damage must add up to the engine's total")
            for (index, swing) in swings.enumerated() {
                if kind == .shot {
                    try require(swing.projectile != nil && swing.release.map { $0 < swing.impact } == true,
                                "a committed shot had no flight")
                }
                if index > 0 {
                    try require(swing.moveEnd == swing.start && swing.impact > swings[index - 1].impact,
                                "a follow-up repeated the movement or landed with the preceding strike")
                }
                try require(timeline.combatCues.contains {
                    guard case let .health(delta, casualties) = $0.kind else { return false }
                    return $0.stack.id == target.id && delta == hits[index].delta && casualties == hits[index].casualties &&
                        abs($0.started.timeIntervalSince(timeline.started) - swing.impact) < 0.001
                }, "damage arrived away from its own impact")
            }
            return timeline
        }

        let wolves = [SandboxStack(creature: wolf.id, team: .player, amount: 75, x: 5, y: 8),
                      SandboxStack(creature: squire.id, team: .opponent, amount: 130, x: 10, y: 8)]
        let (brawl, _) = try configurator.prepare(map: .normal, stacks: wolves, catalogue: setup.creatures,
                                                  loadouts: [.player: extended, .opponent: extended], automated: [])
        try require(brawl.ready(), "could not start the Double Punch fixture")
        var melee = try turn(wolf.name, in: brawl)
        if melee.attacks.isEmpty {
            let target = try melee.stacks.first { $0.team == .opponent }.unwrap("missing the Double Punch defender")
            let approach = try melee.moves.min { distance(from: [$0], to: target.cells) < distance(from: [$1], to: target.cells) }
                .unwrap("no approach for the Double Punch fixture")
            try require(brawl.choose(approach), "the Wolf could not approach the repeat-strike target")
            melee = try turn(wolf.name, in: brawl)
        }
        let (punched, defender) = try attack(brawl, from: melee)
        let punches = try checkWaves(2, kind: .melee, before: melee, after: punched, target: defender)
        let swings = punches.actions.filter { $0.counterattack == nil }
        let response = try punches.actions.first { $0.counterattack?.actor == defender.id }.unwrap("missing opening response")
        try require(response.start == swings[0].moveEnd && punches.actions.filter { $0.counterattack != nil }.count == 1,
                    "the response should start alongside the first punch and spend only one reply")
        let wounds = punches.combatCues.filter { $0.stack.id == defender.id && $0.isDeepWoundsImpact }
        try require(wounds.count == 2 && zip(wounds, swings).allSatisfy {
            abs($0.0.started.timeIntervalSince(punches.started) - $0.1.impact) < 0.001
        }, "Deep Wounds should land at the contact of each successful punch")

        let archers = [SandboxStack(creature: elf.id, team: .player, amount: 30, x: 3, y: 8),
                       SandboxStack(creature: squire.id, team: .opponent, amount: 160, x: 12, y: 8)]
        var triple = false
        var withoutProc = false
        for seed in UInt32(142)...154 {
            let (battle, _) = try configurator.prepare(map: .normal, stacks: archers, catalogue: setup.creatures,
                                                       loadouts: [.player: quiverLoadout], automated: [], boardSeed: seed)
            try require(battle.ready(), "could not start the Quiver of Echoes fixture")
            let before = try turn(elf.name, in: battle)
            let (after, target) = try attack(battle, from: before)
            let count = after.moments.first?.playbackMoments.count ?? 0
            try require((2...3).contains(count), "Double Shot with Quiver of Echoes launched the wrong number of arrows")
            _ = try checkWaves(count, kind: .shot, before: before, after: after, target: target)
            triple = triple || count == 3
            withoutProc = withoutProc || count == 2
            if triple && withoutProc { break }
        }
        try require(triple && withoutProc, "the fixture must exercise an actual echo and a failed echo roll")

        var fragile = archers
        fragile[1].amount = 1
        let (lethal, _) = try configurator.prepare(map: .normal, stacks: fragile, catalogue: setup.creatures,
                                                   loadouts: [.player: quiverLoadout], automated: [])
        try require(lethal.ready(), "could not start the lethal opening-shot fixture")
        let before = try turn(elf.name, in: lethal)
        let (after, target) = try attack(lethal, from: before)
        try require(after.stacks.allSatisfy { $0.id != target.id }, "the first shot must be lethal in this fixture")
        _ = try checkWaves(1, kind: .shot, before: before, after: after, target: target)

        let smith = try setup.creatures.first { $0.name == "Blacksmith" }.unwrap("missing Blacksmith")
        for name in ["Tsar Cannon", "Zena"] {
            let shooter = try setup.creatures.first { $0.name == name }.unwrap("missing \(name)")
            let first = SandboxStack(creature: shooter.id, team: .player, amount: 3, x: 3, y: 8)
            let blacksmith = SandboxStack(creature: smith.id, team: .player, amount: smith.amount, x: 1, y: 8)
            let rear = SandboxStack(creature: squire.id, team: .opponent, amount: 160,
                                    x: name == "Tsar Cannon" ? 14 : 12, y: name == "Tsar Cannon" ? 8 : 6)
            var repeated = false
            for seed in UInt32(142)...160 {
                let stacks = [first, blacksmith, archers[1], rear]
                let (battle, _) = try configurator.prepare(map: .normal, stacks: stacks, catalogue: setup.creatures,
                                                           loadouts: [.player: quiverLoadout], automated: [], boardSeed: seed)
                try require(battle.ready(), "could not start the Crafted Double Shot fixture")
                let crafting = try turn(smith.name, in: battle)
                let craft = try crafting.spells.first { $0.name == "Craft" && $0.available }.unwrap("Craft was unavailable")
                try require(battle.chooseSpell(craft.id) && battle.choose(first.anchor), "could not Craft on \(name)")
                guard try battle.view().stacks.first(where: { $0.name == name })?.abilities.contains("Crafted Double Shot") == true
                else { continue }
                let before = try turn(name, in: battle)
                let after: BattleView
                if name == "Tsar Cannon" {
                    let end = CGPoint(x: 15.5, y: 8.5)
                    try require(battle.fireThrough(end), "could not fire the crafted piercing shot")
                    after = try battle.view()
                } else {
                    (after, _) = try attack(battle, from: before)
                }
                let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
                let projectiles = playback.actions.filter { $0.counterattack == nil }
                try require((2...3).contains(projectiles.count), "Crafted Double Shot lost a \(name) projectile")
                if name == "Tsar Cannon" {
                    try require(projectiles.allSatisfy { action in
                        let contacts = action.moment.rayContacts ?? []
                        return contacts.count == 2 && contacts[0].progress < contacts[1].progress
                    }, "each piercing volley should preserve both contacts in ray order")
                } else {
                    try require(projectiles.allSatisfy { $0.chakram?.impacts.count == 2 },
                                "each Crafted Double Shot disc should follow its own bounce path")
                }
                repeated = true
                break
            }
            try require(repeated, "the fixture never granted Crafted Double Shot to \(name)")
        }

        let nearStone = Cell(x: 8, y: 8)
        let farStone = Cell(x: 9, y: 8)
        let (blocked, _) = try configurator.prepare(map: .barrels, stacks: archers, catalogue: setup.creatures,
                                                    loadouts: [.player: quiverLoadout], automated: [], boardSeed: 147)
        try require(blocked.ready(), "could not start the two-obstacle shot fixture")
        let beforeObstacles = try turn(elf.name, in: blocked)
        try require(beforeObstacles.obstacleTargets.contains(farStone) && blocked.choose(farStone),
                    "could not shoot at the two obstacles")
        let afterObstacles = try blocked.view()
        let byStone = BattlePlayback(moments: afterObstacles.moments, previous: beforeObstacles, next: afterObstacles)
        try require(byStone.actions.map(\.moment.aim) == [nearStone, farStone] &&
                    byStone.actions.allSatisfy { $0.moment.kind == .obstacle && $0.release != nil } &&
                    !afterObstacles.stones.contains(nearStone) && !afterObstacles.stones.contains(farStone),
                    "the obstacle projectiles must each fly to the stone they actually hit")
    }

    @MainActor
    private static func checkCounterattacks(_ setup: SandboxSetup, resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let artwork = try BattlefieldArtwork.load(resources.appendingPathComponent("battlefield.json"))
        let placement = SandboxAugment.placement.rawValue
        let loadout = SandboxLoadout(augments: [placement: configurator.options.augmentLevels[placement, default: 0]])
        for (creature, ranged) in [("Squire", false), ("Griffin", false), ("Arbalester", true)] {
            let species = try setup.creatures.first { $0.name == creature }.unwrap("missing \(creature)")
            let stacks = [SandboxStack(creature: species.id, team: .player, amount: 70, x: 5, y: 8),
                          SandboxStack(creature: species.id, team: .opponent, amount: 70, x: creature == "Griffin" ? 11 : 10, y: 8)]
            let (duel, _) = try configurator.prepare(map: .normal, stacks: stacks, catalogue: setup.creatures,
                                                     loadouts: [.player: loadout, .opponent: loadout], automated: [])
            try require(duel.ready(), "could not start the \(creature) exchange")
            var previous = try duel.view()
            for _ in 0..<4 {
                let target = try previous.stacks.first { $0.team != previous.activeStack?.team }
                    .unwrap("missing the counterattack target")
                if previous.attacks.contains(target.id) { break }
                let cell = try previous.moves.min { distance(from: [$0], to: target.cells) < distance(from: [$1], to: target.cells) }
                    .unwrap("could not approach for the \(creature) exchange")
                try require(duel.choose(cell), "refused the approach for the \(creature) exchange")
                previous = try duel.view()
            }
            let attacker = try previous.activeStack.unwrap("missing the counterattack attacker")
            let target = try previous.stacks.first { $0.team != attacker.team }.unwrap("missing the defender")
            let cell = try target.anchor.unwrap("missing the defender’s cell")
            try require(duel.choose(cell), "the \(creature) exchange was rejected")
            let next = try duel.view()
            let hit = try next.moments.first { $0.actor == attacker.id && ($0.kind == .melee || $0.kind == .shot) }
                .unwrap("missing the \(creature) exchange")
            try require(hit.counterattack?.actor == target.id && hit.counterattack?.target == attacker.id &&
                        hit.counterattack?.spent == true, "the engine lost the \(creature) response")
            let playback = BattlePlayback(moments: next.moments, previous: previous, next: next)
            let attack = try playback.actions.first { $0.counterattack == nil && $0.moment == hit }
                .unwrap("missing the opening attack animation")
            let reply = try playback.actions.first { $0.counterattack?.actor == target.id }
                .unwrap("missing the responding animation")
            let pose: CreatureAction = ranged ? .attack : .meleeAttack
            try require(abs(reply.start - attack.moveEnd) < 0.001 && reply.pose == pose && attack.pose == pose &&
                        playback.pose(for: target, elapsed: reply.start + 0.01, idleTime: 0, fallen: false).action == pose,
                        "the \(creature) response did not start with the attack")
            if ranged {
                try require(attack.projectile != nil && reply.projectile != nil &&
                            reply.release.map { $0 < reply.impact } == true, "the response lost its projectile")
                for strike in [attack, reply] {
                    let origin = try strike.attackPosition.unwrap("missing the shot's origin")
                    let destination = try strike.target.unwrap("missing the shot's destination")
                    let release = try strike.release.unwrap("missing the shot's release")
                    let flight = hypot(destination.x - origin.x, destination.y - origin.y) / 19.2
                    try require(abs(strike.impact - release - flight) < 0.001, "Arbalester used the generic bolt speed")
                }
            } else {
                try require(attack.impact == attack.moveEnd && reply.impact == attack.moveEnd,
                            "\(creature) melee results arrived after the web's opening exchange")
            }
            for (strike, victim) in [(attack, target), (reply, attacker)] {
                let contact = playback.started.addingTimeInterval(strike.impact)
                let results = playback.combatCues.filter { cue in
                    if case .health = cue.kind { return cue.stack.id == victim.id }
                    return false
                }
                try require(results.contains { $0.started == contact && $0.silentHurt == (strike.counterattack != nil) },
                            "\(creature) damage or its sound was out of sync with the exchange")
                let survivor = try next.stacks.first { $0.id == victim.id }.unwrap("the exchange fixture ended prematurely")
                try require(playback.amount(for: survivor, elapsed: strike.impact - 0.001, reducedMotion: false) == victim.amount &&
                            playback.amount(for: survivor, elapsed: strike.impact, reducedMotion: false) == survivor.amount,
                            "\(creature) stack numbers changed outside the damage cue")
                if creature == "Griffin" {
                    let damage = try results.first { $0.started == contact }.unwrap("missing the Griffin's damage cue")
                    let wound = try playback.combatCues.first {
                        $0.stack.id == victim.id && $0.isDeepWoundsImpact
                    }.unwrap("missing the Griffin's cut")
                    try require(wound.started == damage.started && wound.endsAt == damage.endsAt,
                                "Griffin's cut did not share the damage clock")
                    let projection = BattlefieldProjection(data: artwork, width: 800, height: 650, legacySize: 650)
                    let facing = playback.facing(for: victim, elapsed: strike.impact, reducedMotion: false)
                    let body = CreatureAnimation.boardPresentation(victim, position: wound.position, projection: projection, facing: facing)
                    let pose = playback.pose(for: victim, elapsed: strike.impact, idleTime: 0, fallen: false)
                    let frame = CreatureAnimation.frame(victim.name, pose: pose)
                    let cut = body.deepWoundsBounds(frame: frame, facing: facing, cellWidth: projection.screenCellWidth)
                    let flag = CreatureAnimation.flagPosition(for: victim.name, presentation: body, projection: projection,
                                                              facing: facing, height: 12)
                    try require(cut.midY > flag.y && cut.midY < body.ground.y && cut.width == cut.height,
                                "Deep Wounds was positioned off the Griffin's body")
                    try require(!playback.statusStack(for: survivor, elapsed: strike.impact - 0.001, reducedMotion: false)
                        .statuses.contains { $0.name == "Deep Wounds" } &&
                        playback.statusStack(for: survivor, elapsed: strike.impact, reducedMotion: false)
                            .statuses.contains { $0.name == "Deep Wounds" },
                        "Griffin's status appeared separately from the damage")
                }
            }
            let defender = try next.stacks.first { $0.id == target.id }.unwrap("the responder did not survive the test")
            let flag = playback.flagStatus(for: defender, elapsed: reply.start + 0.01,
                                           now: playback.started.addingTimeInterval(reply.start + 0.01), reducedMotion: false)
            try require(flag.responded && !flag.immobilized, "the responder’s stack flag was missing its swords")
        }
    }

    @MainActor
    private static func checkSampleArmies(_ setup: SandboxSetup, using configurator: SandboxLoadoutEngine) throws {
        let full = SandboxLoadout(augments: ["Armor": 3, "Might": 3, "Empower": 1], synergies: ["Life": 2],
                                  tier1: configurator.options.barrelBarricade)
        let barricade = SandboxLoadout(augments: ["Placement": 1, "Armor": 2], tier1: configurator.options.barrelBarricade,
                                       barrels: [SandboxPlacedBarrel(index: 0, cell: Cell(x: 13, y: 10))])

        let catalogue = Dictionary(uniqueKeysWithValues: setup.creatures.map { ($0.name, $0) })
        let fixtures: [(BattlefieldMap, UInt32, [Team: SandboxLoadout])] = [
            (.normal, 142, [:]), (.firePit, 142, [.player: full]),
            (.barrels, 142, [.opponent: barricade]), (.barrels, 9417, [.player: full, .opponent: barricade]),
        ]
        for (map, seed, loadouts) in fixtures {
            let (empty, originalDeployment) = try configurator.prepare(map: map, stacks: [], catalogue: setup.creatures,
                                                                          loadouts: loadouts, automated: [], boardSeed: seed)
            let planned = try setup.arrangeSampleArmies(on: empty.view(), deployment: originalDeployment)
            // The model keeps the deployed barricade cells after the initial board is created.
            var existing = loadouts
            for (team, preview) in originalDeployment where existing[team]?.tier1 == configurator.options.barrelBarricade {
                existing[team]?.barrels = preview.barrels
            }
            let (battle, previews) = try configurator.prepare(map: map, stacks: planned, catalogue: setup.creatures,
                                                               loadouts: existing, automated: [], boardSeed: seed)
            let view = try battle.view()
            let occupied = view.stacks.flatMap(\.cells)
            try require(Set(occupied).count == occupied.count && Set(occupied).isDisjoint(with: view.stones),
                        "sample armies overlap each other or an obstacle on \(map.title)")
            for team in [Team.player, .opponent] {
                let preview = try previews[team].unwrap("missing sample deployment zone")
                let original = try originalDeployment[team].unwrap("missing original deployment zone")
                let army = view.stacks.filter { $0.team == team }
                let creatures = try army.map { try catalogue[$0.name].unwrap("unknown sample creature \($0.name)") }
                try require(army.count == 6 && Set(creatures.map(\.id)).count == 6,
                            "\(team.title) needs six distinct sample stacks on \(map.title)")
                try require(preview.cells == original.cells && preview.capacity == original.capacity &&
                            preview.barrels.map(\.cell) == original.barrels.map(\.cell) &&
                            Set(army.flatMap(\.cells)).isSubset(of: Set(original.cells)),
                            "\(team.title) changed its existing deployment while loading samples")
                try require(zip(army, creatures).allSatisfy { $0.amount == $1.amount && $0.footprint == $1.footprint },
                            "\(team.title) sample army lost canonical stack amounts or footprints")
            }
            let reloaded = try setup.arrangeSampleArmies(on: view, deployment: previews)
            try require(reloaded.map(\.anchor) == planned.map(\.anchor), "reloading samples treated the old army as a blocker")
            try require(battle.ready() && (try battle.view()).stacks.count == 12,
                        "the sample matchup could not start on \(map.title)")
        }
    }

    private static func checkTurnClock() throws {
        let now = ContinuousClock.now
        var clock = SandboxTurnClock()
        let green = SandboxTurnClock.Key(unit: 1, team: .player, lap: 1)
        var opening = clock.begin(green, remainingStacks: 6, at: now)
        try require(opening.limit == 40 && opening.remaining(at: now + .seconds(17)) == 23,
                    "the Sandbox clock did not divide the browser's lap budget")
        try require(!opening.hasReachedHalfway(at: now + .milliseconds(19_999)) &&
                    opening.hasReachedHalfway(at: now + .seconds(20)),
                    "the extra-time control did not unlock at the halfway mark")
        try require(clock.extend(&opening, remainingStacks: 6) && opening.limit == 80 &&
                    !clock.extend(&opening, remainingStacks: 6), "the clock did not limit extra time to once per lap")
        try require(opening.remaining(at: now + .seconds(17)) == 63,
                    "requesting time restarted the clock instead of adding to the running turn")
        clock.finish(opening, at: now + .seconds(65))
        let next = clock.begin(.init(unit: 2, team: .player, lap: 1), remainingStacks: 5, at: now + .seconds(65))
        try require(next.limit == 35, "the prior turn was not charged against the team")
        let other = clock.begin(.init(unit: 3, team: .opponent, lap: 1), remainingStacks: 2, at: now)
        try require(other.limit == 60, "the other team should have its own clock budget")
        var newLap = clock.begin(.init(unit: 1, team: .player, lap: 2), remainingStacks: 6, at: now)
        try require(newLap.limit == 40 && clock.extend(&newLap, remainingStacks: 6), "the new lap did not reset its budget")
    }

    @MainActor
    private static func checkAuraFields(_ setup: SandboxSetup, resources: URL) throws {
        let fixtures: [(String, Team, Int32, Int32)] = [
            ("Wyvern", .player, 3, 8), ("Wolf Rider", .player, 3, 6),
            ("White Tiger", .opponent, 13, 8), ("Arachna Queen", .opponent, 13, 11),
        ]
        let army = try fixtures.map { name, team, x, y in
            let creature = try setup.creatures.first { $0.name == name }.unwrap("missing \(name) for the aura fixture")
            return SandboxStack(creature: creature.id, team: team, amount: creature.amount, x: x, y: y)
        }
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let loadout = SandboxLoadout(synergies: ["Might": 1])
        let (engine, _) = try configurator.prepare(map: .normal, stacks: army, catalogue: setup.creatures,
                                                   loadouts: [.player: loadout], automated: [])
        let opening = try engine.view()
        let wyvern = try opening.stacks.first { $0.name == "Wyvern" }.unwrap("missing placed Wyvern")
        let rider = try opening.stacks.first { $0.name == "Wolf Rider" }.unwrap("missing placed Wolf Rider")
        let tiger = try opening.stacks.first { $0.name == "White Tiger" }.unwrap("missing placed White Tiger")
        let queen = try opening.stacks.first { $0.name == "Arachna Queen" }.unwrap("missing placed Arachna Queen")
        let fields = BattlefieldAura.visible(in: opening, selectedID: wyvern.id, hoveredID: wyvern.id, draggedID: nil)
        let field = try fields.first.unwrap("hovering the Wyvern lost its aura")
        try require(fields.count == 1 && field.opacity == 0.7 && field.effect.range == 3,
                    "Might's aura bonus or the duplicate focus guard was lost")
        try require(field.bounds(center: BattlefieldProjection.logicalCenter(wyvern.cells)) == CGRect(x: -1, y: 5, width: 8, height: 7),
                    "the aura was centered on the anchor instead of the full 2 × 1 footprint")
        let square = try BattlefieldAura.visible(in: opening, selectedID: queen.id, hoveredID: nil, draggedID: nil)
            .first.unwrap("inspecting the Arachna Queen lost its aura")
        try require(square.bounds(center: BattlefieldProjection.logicalCenter(queen.cells)) == CGRect(x: 10, y: 8, width: 6, height: 6),
                    "the aura lost the Arachna Queen's 2 × 2 footprint")
        try require(BattlefieldAura.visible(in: opening, selectedID: wyvern.id, hoveredID: rider.id, draggedID: wyvern.id).isEmpty,
                    "dragging showed a stationary aura or Might gave an aura to a blessing carrier")
        try require(BattlefieldAura.visible(in: opening, selectedID: nil, hoveredID: tiger.id, draggedID: nil).first?.revealed == false,
                    "the distant army revealed the White Tiger")

        try require(engine.ready(), "could not start the aura fixture")
        var turn = try engine.view()
        for _ in army where turn.active != wyvern.id {
            try require(engine.perform(.endTurn), "could not reach the Wyvern's turn")
            turn = try engine.view()
        }
        let active = BattlefieldAura.visible(in: turn, selectedID: nil, hoveredID: nil, draggedID: nil)
        try require(active.count == 1 && active.first?.owner.id == wyvern.id && active.first?.opacity == 0.5,
                    "the active unit lost its aura without pointer focus")
        try require(engine.choose(Cell(x: 9, y: 8)), "could not fly the Wyvern into the White Tiger's aura")
        let moved = try engine.view()
        let playback = BattlePlayback(moments: moved.moments, previous: turn, next: moved)
        let flight = try playback.actions.first { $0.moment.actor == wyvern.id }.unwrap("missing the Wyvern's flight")
        try require(playback.isMoving(wyvern, at: flight.start) && !playback.isMoving(wyvern, at: flight.moveEnd),
                    "the floor aura should clear during movement and return at the landing")
        try require(BattlefieldAura.visible(in: moved, selectedID: nil, hoveredID: tiger.id, draggedID: nil)
            .contains { $0.owner.id == tiger.id && $0.revealed }, "the White Tiger stayed disguised with an enemy in range")
    }

    static func checkSandbox(_ setup: SandboxSetup, stacks: [SandboxStack], resources: URL) throws {
        try require(setup.creatures.count >= 56, "the browser’s playable catalogue was truncated")
        let empty = try setup.makeBattle(map: .normal, stacks: [], automated: [], resources: resources)
        let emptyView = try empty.view()
        try require(emptyView.stacks.isEmpty && !empty.ready(), "empty sandbox did not open cleanly")
        let dropCell = Cell(x: 2, y: 8)
        try require(SandboxCursorMode.resolve(at: dropCell, in: emptyView) == .standard &&
                    SandboxCursorMode.resolve(at: dropCell, in: emptyView, placing: true) == .standard &&
                    SandboxCursorMode.resolve(at: dropCell, in: emptyView, placing: true, canPlace: true) == .interactive,
                    "the placement pointer did not follow the legal footprint")
        let expectedAuras: [String: BattleAura] = [
            "White Tiger": BattleAura(name: "Disguise Aura", range: 3, positive: true),
            "Pegasus": BattleAura(name: "Pegasus Might Aura", range: 2, positive: true),
            "Peasant": BattleAura(name: "Absorb Penalties Aura", range: 2, positive: true),
            "Valkyrie": BattleAura(name: "War Anger Aura", range: 2, positive: false),
            "Griffin": BattleAura(name: "Range Null Field Aura", range: 2, positive: false),
            "Abomination": BattleAura(name: "Flesh Shield Aura", range: 2, positive: true),
            "Arachna Queen": BattleAura(name: "Web Aura", range: 2, positive: false),
            "Dryad": BattleAura(name: "Guiding Winds Aura", range: 2, positive: true),
            "Wyvern": BattleAura(name: "Venom Cloud Aura", range: 2, positive: true),
        ]
        for creature in setup.creatures {
            let row = SandboxStack(creature: creature.id, team: .opponent, amount: creature.amount, x: 13, y: 8)
            do {
                let sandbox = try setup.makeBattle(map: .normal, stacks: [row], automated: [], resources: resources)
                let view = try sandbox.view()
                let stack = try view.stacks.first.unwrap("missing catalogue stack")
                try require(stack.name == creature.name && stack.team == .opponent && stack.amount == creature.amount &&
                            stack.cells.count == Int(creature.width * creature.height), "lost creature stats")
                if let expected = expectedAuras[creature.name] {
                    try require(stack.auras?.contains(expected) == true, "lost the emitted aura's name, range or target side")
                }
                let preview = try setup.rosterPreview(for: creature, resources: resources)
                try require(preview.name == stack.name && preview.faction == stack.faction &&
                            preview.amount == stack.amount && preview.maxHP == stack.maxHP &&
                            preview.attack == stack.attack && preview.abilities == stack.abilities &&
                            preview.book == stack.book, "the roster inspector lost canonical stats")
                try require(sandbox.select(stack.id), "cannot edit the red army")
            } catch {
                throw EngineError(message: "\(creature.name): \(error.localizedDescription)")
            }
        }
        var seed = stacks
        seed[0].amount = 51
        let hotseat = try setup.makeBattle(map: .firePit, stacks: seed, automated: [], resources: resources)
        let setupView = try hotseat.view()
        try require(setupView.stacks.first?.amount == 51 && !setupView.lava.isEmpty, "changing map lost the edited army")
        try require(hotseat.ready(), "hotseat failed to start")
        var active = try hotseat.view()
        for _ in seed where active.activeStack?.team != .opponent {
            try require(active.playerTurn && hotseat.perform(.endTurn), "could not reach a manual red turn")
            active = try hotseat.view()
        }
        try require(active.playerTurn && active.activeStack?.team == .opponent && !hotseat.playOpponent(),
                    "the red player lost manual control")
        try require(hotseat.setAutomation([.opponent]) && (try hotseat.view()).opponentTurn &&
                    !hotseat.perform(.endTurn), "turning on Red AI did not hand it the active turn")
        try require(hotseat.setAutomation([]) && (try hotseat.view()).playerTurn &&
                    (try hotseat.view()).active == active.active, "turning off Red AI did not restore that turn")
        try require(hotseat.perform(.endTurn), "red player could not finish a turn")
        let automated = try setup.makeBattle(map: .barrels, stacks: seed, automated: [.player, .opponent], resources: resources)
        try require(automated.ready(), "AI versus AI failed to start")
        var simulation = try automated.view()
        var played: Set<Team> = []
        for _ in 0..<512 {
            if simulation.winner != nil || simulation.stalled { break }
            let team = try simulation.activeStack.unwrap("AI match lost the active stack").team
            try require(simulation.opponentTurn && !automated.perform(.endTurn) && automated.playOpponent(),
                        "AI versus AI accepted human input or failed to act")
            played.insert(team)
            simulation = try automated.view()
        }
        try require(played == [.player, .opponent] && simulation.winner != nil && !simulation.stalled,
                    "AI versus AI did not reach a result")
        let berserker = try setup.creatures.first { $0.name == "Berserker" }.unwrap("missing Berserker")
        var mindless = seed
        let replaced = mindless[0]
        mindless[0] = SandboxStack(creature: berserker.id, team: replaced.team, amount: replaced.amount,
                                   x: replaced.x, y: replaced.y)
        let minds = try setup.makeBattle(map: .normal, stacks: mindless, automated: [], resources: resources)
        try require(minds.ready(), "mindless unit test failed to start")
        var mindTurn = try minds.view()
        for _ in mindless where mindTurn.activeStack?.name != berserker.name {
            try require(minds.perform(.endTurn), "could not advance to the Berserker")
            mindTurn = try minds.view()
        }
        try require(mindTurn.activeStack?.name == berserker.name && mindTurn.opponentTurn && minds.playOpponent(),
                    "the Berserker did not play its own turn with both team AI switches off")
        try checkTallFootprint(setup, stacks: stacks, resources: resources)
        try checkSquareFootprint(setup, resources: resources)
    }

    static func checkTallFootprint(_ setup: SandboxSetup, stacks: [SandboxStack], resources: URL) throws {
        var opening = stacks
        let creature = try setup.creatures.first { $0.name == "Wolf" }.unwrap("missing the Wolf")
        let index = try opening.firstIndex { $0.creature == creature.id }.unwrap("missing the opening Wolf")
        let shape = Footprint.tall
        opening[index].footprint = shape
        let sandbox = try setup.makeBattle(map: .normal, stacks: opening, automated: [], resources: resources)
        var battle = try sandbox.view()
        let stack = try battle.stacks.first { $0.name == "Wolf" }.unwrap("missing the vertical Wolf")
        let initial = opening[index].anchor
        try require(stack.footprint == .tall && Set(stack.cells) == Set(shape.cells(at: initial)),
                    "the Wolf did not occupy one column and two rows")
        let drop = Cell(x: initial.x, y: initial.y + 1)
        try require(sandbox.select(stack.id), "could not select the vertical Wolf")
        battle = try sandbox.view()
        try require(stack.cells.allSatisfy { battle.movementLandings.anchor(covering: $0) == initial },
                    "picking up the Wolf shifted its footprint under a stationary pointer")
        let anchor = try battle.movementLandings.anchor(covering: drop).unwrap("missing the Wolf's hovered drop")
        try require(anchor == Cell(x: drop.x, y: drop.y + 1), "the lower tile did not win when both vertical placements fit")
        try require(!sandbox.choose(Cell(x: initial.x, y: 1)), "a tall stack could deploy outside the zone")
        try require(try sandbox.view() == battle, "an invalid drop changed the board or cleared the selection")
        try require(sandbox.choose(anchor), "tall stack could not be placed by its lower cell")
        battle = try sandbox.view()
        try require(battle.stacks.first { $0.id == stack.id }?.cells == shape.cells(at: anchor),
                    "deployment changed the tall footprint")
        try require(battle.deploying == nil, "vertical deployment retained selection")
        try require(sandbox.ready(), "battle rejected a valid tall footprint")
        battle = try sandbox.view()
        for _ in opening where battle.active != stack.id {
            try require(sandbox.perform(.endTurn), "could not reach the vertical Wolf’s turn")
            battle = try sandbox.view()
        }
        try require(battle.active == stack.id && !battle.moves.isEmpty, "the vertical Wolf could not move")
        let landings = battle.movementLandings
        let pointer = try landings.coveredCells.subtracting(landings.anchors).sorted { ($0.x, $0.y) < ($1.x, $1.y) }.first
            .unwrap("no vertical move could be selected by its non-anchor tile")
        let move = try landings.anchor(covering: pointer).unwrap("missing a legal vertical move")
        try require(move != pointer && shape.cells(at: move).contains(pointer), "the vertical movement preview missed the pointer")
        try require(sandbox.choose(move), "Zig refused a legal move with a 1 × 2 footprint")
        battle = try sandbox.view()
        try require(battle.stacks.first { $0.id == stack.id }?.cells == shape.cells(at: move) &&
                    battle.moments.contains { $0.kind == .move && $0.route.last == move },
                    "walking changed the tall stack’s cells or route")
    }

    static func checkSquareFootprint(_ setup: SandboxSetup, resources: URL) throws {
        let dragon = try setup.creatures.first { $0.name == "Black Dragon" }.unwrap("missing Black Dragon")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let sandbox = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: dragon.id, team: .player, amount: dragon.amount, x: 3, y: 7),
            SandboxStack(creature: peasant.id, team: .opponent, amount: peasant.amount, x: 13, y: 7),
        ], automated: [], resources: resources)
        var battle = try sandbox.view()
        let unit = try battle.stacks.first { $0.name == dragon.name }.unwrap("missing the deployed Dragon")
        try require(unit.footprint == .square && sandbox.select(unit.id), "could not pick up the Dragon")
        battle = try sandbox.view()
        let landings = battle.movementLandings
        try require(unit.cells.allSatisfy { landings.anchor(covering: $0) == unit.anchor }, "picking up a 2 × 2 changed its landing")
        // At the inner boundary the first two browser candidates extend out of the green zone.
        let cursor = Cell(x: 3, y: 10)
        let anchor = try landings.anchor(covering: cursor).unwrap("the 2 × 2 could not slide back into the deployment zone")
        try require(anchor == Cell(x: 3, y: 11) && sandbox.choose(anchor), "the deployed square disagreed with the hover")
        try require(sandbox.ready(), "could not start the square-footprint fight")
        battle = try sandbox.view()
        for _ in 0..<4 where battle.active != unit.id {
            try require(sandbox.perform(.endTurn), "could not reach the Dragon's turn")
            battle = try sandbox.view()
        }
        let moves = battle.movementLandings
        let edges = moves.coveredCells.subtracting(moves.anchors).filter { cell in
            // Ending the lap can collapse the outer ring. Test a landing the next lap can retain.
            moves.anchor(covering: cell).map { anchor in
                Footprint.square.cells(at: anchor).allSatisfy { (1...14).contains($0.x) && (1...14).contains($0.y) }
            } ?? false
        }
        let edge = try edges.sorted { ($0.x, $0.y) < ($1.x, $1.y) }.first
            .unwrap("the Dragon had no non-anchor tile in its range")
        let move = try moves.anchor(covering: edge).unwrap("the Dragon could not move by the edge of its footprint")
        try require(battle.active == unit.id && move != edge && sandbox.choose(move), "Zig rejected the 2 × 2 previewed move")
        let moved = try sandbox.view()
        try require(Set(moved.stacks.first { $0.id == unit.id }?.cells ?? []) == Set(Footprint.square.cells(at: move)) &&
                    moved.moments.contains { $0.kind == .move && $0.route.last == move }, "the square moved away from its preview")
    }

    @MainActor
    private static func checkBattleMageIdle(_ resources: URL) throws {
        let url = resources.appendingPathComponent("battle_mage.webp")
        let source = try CGImageSourceCreateWithURL(url as CFURL, nil).unwrap("missing the Battle Mage's standing art")
        let body = try CGImageSourceCreateImageAtIndex(source, 0, nil).unwrap("invalid Battle Mage artwork")
        let opening = BattleMageIdleAppearance.image(body, elapsed: 0)
        let later = BattleMageIdleAppearance.image(body, elapsed: 0.82)
        let firstPixels = try framePixels(opening).unwrap("could not read the Battle Mage's first idle frame")
        let laterPixels = try framePixels(later).unwrap("could not read the Battle Mage's next idle frame")
        try require(opening.width == later.width && opening.height == later.height && firstPixels != laterPixels,
                    "the Battle Mage stayed on the same idle image")
    }

    @MainActor
    private static func checkIdleRoster(_ creatures: [SandboxCreature]) throws {
        for creature in creatures {
            let idle = CreatureAnimation.timing(for: creature.name, action: .idle, direction: nil)
            try require(idle?.duration.isFinite == true && (idle?.duration ?? 0) > 0, "missing the idle timeline for \(creature.name)")
        }
        for name in ["Elf", "Troll"] {
            let timing = try CreatureAnimation.timing(for: name, action: .idle, direction: nil)
                .unwrap("missing the \(name) idle loop")
            for (time, isNeutral) in [(timing.duration - 1.01, false), (timing.duration - 0.99, true),
                                      (timing.duration - 0.01, true), (timing.duration + 0.001, true)] {
                let pose = CreaturePose(action: .idle, time: time)
                let frame = try CreatureAnimation.frame(name, pose: pose).unwrap("missing the \(name) idle cel")
                try require((frame.index == 0) == isNeutral, "\(name) did not hold its standing pose for the final second")
            }
        }
        let first = try CreatureAnimation.frame("Nightmare", pose: CreaturePose(action: .idle, time: 0)).unwrap("missing Nightmare's idle body")
        let later = try CreatureAnimation.frame("Nightmare", pose: CreaturePose(action: .idle, time: 0.4)).unwrap("lost Nightmare's idle body")
        try require(first.index == 0 && later.index == 0 && framePixels(first.image) == framePixels(later.image),
                    "Nightmare must animate its flames over the registered standing body")
        let elf = try CreatureAnimation.frame("Elf", pose: CreaturePose(action: .idle, time: 0)).unwrap("missing Elf's neutral cel")
        let clothA = ElfIdleAppearance.image(elf.image, time: 0.6, idleAge: 4)
        let clothB = ElfIdleAppearance.image(elf.image, time: 1.8, idleAge: 4)
        try require(clothA !== elf.image && framePixels(clothA) != framePixels(clothB),
                    "Elf's cape stopped moving with the held body cel")
        let planted = CGRect(x: clothA.width / 2, y: 0, width: clothA.width / 2, height: clothA.height)
        let firstBody = try clothA.cropping(to: planted).flatMap(framePixels).unwrap("missing Elf's bow and boots")
        try require(firstBody == clothB.cropping(to: planted).flatMap(framePixels), "cape wind moved the Elf's bow or boots")
        let efreet = try CreatureAnimation.frame("Efreet", pose: CreaturePose(action: .idle, time: 0)).unwrap("missing Efreet's lab idle")
        try require(abs(efreet.heightScale - (0.9 * 703 / 416)) < 0.001 &&
                    abs(efreet.widthRatio * efreet.heightScale - (0.9 * 529 / 386)) < 0.001,
                    "Efreet lost the browser's independent width and height scales")
        let zenaWind = try CreatureAnimation.frame("Zena", pose: CreaturePose(action: .idle, time: 4.99)).unwrap("missing Zena's wind pose")
        let zenaSharpen = try CreatureAnimation.frame("Zena", pose: CreaturePose(action: .idle, time: 5)).unwrap("missing Zena's gesture")
        try require(zenaWind.index < 24 && zenaSharpen.index == 24, "Zena sharpened before the browser's idle cue")
    }

    @MainActor
    static func checkAnimationFrames(_ stacks: [Stack]) throws {
        for stack in stacks {
            for action in [CreatureAction.idle, .walk, .attack] {
                let times: [TimeInterval] = switch action {
                case .attack: [0, 0.08, 0.16, 0.21]
                case .idle: [0, 0.16, 0.37, 0.51, 1.33, 1.58, 1.79]
                default: [0, 0.16, 0.37, 0.51]
                }
                var rendered = Set<Data>()
                for time in times {
                    let pose = CreaturePose(action: action, time: time)
                    let frame = try CreatureAnimation.frame(stack.name, pose: pose)
                        .unwrap("missing \(stack.name) \(action.rawValue) frame at \(time)")
                    if let pixels = framePixels(frame.image) { rendered.insert(pixels) }
                }
                try require(rendered.count > 1, "\(stack.name) \(action.rawValue) did not show distinct visible frames")
            }
        }
        let idle = try CreatureAnimation.frame("Wolf", pose: CreaturePose(action: .idle, time: 0)).unwrap("missing Wolf rest")
        let walk = try CreatureAnimation.frame("Wolf", pose: CreaturePose(action: .walk, time: 0.12)).unwrap("missing Wolf walk")
        let attack = try CreatureAnimation.frame("Wolf", pose: CreaturePose(action: .attack, time: 0)).unwrap("missing Wolf attack")
        let footOffsets = zip([idle, walk, attack], [CGFloat(0.909), 0.957, 0.808]).map { frame, sole in
            frame.heightScale * (frame.foot - sole)
        }
        try require(footOffsets.max()! - footOffsets.min()! < 0.015, "Wolf switched to a different floor anchor")
        try require(attack.heightScale > 1.30, "Wolf shrank to fit the wider attack canvas")
        for (creature, expectedScale) in [("Battle Mage", CGFloat(1152.0 / 768)), ("Griffin", 1024.0 / 768)] {
            let standing = try CreatureAnimation.frame(creature, pose: CreaturePose(action: .idle, time: 0))
                .unwrap("missing \(creature)'s standing frame")
            let directions: [String?] = [nil, "up", "down"]
            var poses = directions.map { CreaturePose(action: .meleeAttack, time: 0, verticalAttack: $0) }
            if creature == "Battle Mage" { poses.append(CreaturePose(action: .cast, time: 0)) }
            for pose in poses {
                let frame = try CreatureAnimation.frame(creature, pose: pose)
                    .unwrap("missing \(creature)'s \(pose.action.rawValue) frame")
                let widthScale = frame.heightScale * frame.widthRatio * (frame.trim.map { $0.width / $0.height } ?? 1)
                let standingWidth = standing.heightScale * standing.widthRatio *
                    (standing.trim.map { $0.width / $0.height } ?? 1)
                try require(abs(frame.heightScale / standing.heightScale - expectedScale) < 0.001 &&
                            abs(widthScale / standingWidth - expectedScale) < 0.001,
                            "\(creature) shrank to fit its padded \(pose.action.rawValue) canvas")
            }
        }
        let pegasusIdle = try CreatureAnimation.frame("Pegasus", pose: CreaturePose(action: .idle, time: 0))
            .unwrap("missing Pegasus's standing pose")
        let pegasusFlight = try CreatureAnimation.frame("Pegasus", pose: CreaturePose(action: .walk, time: 0))
            .unwrap("missing Pegasus's takeoff pose")
        // The flight cel embeds the standing pose at 538 × 538 within a 1024 × 1024 canvas.
        let flightFigure = pegasusFlight.heightScale * 538 / 1024
        try require(abs(flightFigure - pegasusIdle.heightScale) < 0.001 &&
                    abs(flightFigure * pegasusFlight.widthRatio - pegasusIdle.heightScale * pegasusIdle.widthRatio) < 0.001,
                    "Pegasus changed size between standing and flying")
        try require(abs(pegasusFlight.anchorX - 579.0 / 1024) < 0.001 &&
                    abs(pegasusFlight.foot - (390 + 538 * pegasusIdle.foot) / 1024) < 0.001,
                    "Pegasus shifted inside its flight canvas")
        for time in [0.0, 1.32, 26.94] {
            try require(CreatureAnimation.frame("Arbalester", pose: CreaturePose(action: .idle, time: time))?.image.width == 384,
                        "Arbalester idle used the reduced sheet or lost a page")
        }
        for creature in ["Mermaid", "Troglodyte", "Ogre Mage"] {
            for time in [0.0, 1.32, 4.42, 6.75, 9.88] {
                try require(CreatureAnimation.frame(creature, pose: CreaturePose(action: .idle, time: time)) != nil,
                            "\(creature) idle referenced a missing atlas cell at \(time)")
            }
        }
        for (action, direction, minimumWidth) in [(CreatureAction.idle, nil, 192), (.attack, nil, 320),
                                                  (.attack, "up", 320), (.attack, "down", 320)] {
            let pose = CreaturePose(action: action, time: 0, verticalAttack: direction)
            let image = try CreatureAnimation.frame("Troglodyte", pose: pose).unwrap("missing Troglodyte frame").image
            try require(image.width == image.height && image.width >= minimumWidth && framePixels(image) != nil,
                        "Troglodyte used a cropped sheet for \(action.rawValue) \(direction ?? "")")
        }
        var troglodyteWalkIndices = Set<Int>()
        for step in 0..<120 {
            let time = Double(step) / 60
            let pose = CreaturePose(action: .walk, time: time, walkDistance: time * 3, walkLength: 6)
            let frame = try CreatureAnimation.frame("Troglodyte", pose: pose)
                .unwrap("missing Troglodyte walk frame")
            if troglodyteWalkIndices.insert(frame.index).inserted {
                try require(framePixels(frame.image) != nil, "Troglodyte walk sampled transparent padding")
            }
        }
        try require(troglodyteWalkIndices == Set(0..<7), "Troglodyte did not play all seven walk frames")
        let catalogue = try SandboxSetup(resources: Bundle.main.resourceURL!)
        for creature in catalogue.creatures {
            for action in [CreatureAction.idle, .walk, .attack, .hit, .death] {
                try require(CreatureAnimation.frame(creature.name, pose: CreaturePose(action: action, time: 0)) != nil,
                            "\(creature.name) is missing the \(action.rawValue) animation")
            }
        }
        let directionFrames = ["up", "down"].compactMap { direction in
            CreatureAnimation.frame("Squire", pose: CreaturePose(action: .attack, time: 0.16, verticalAttack: direction))
                .flatMap { framePixels($0.image) }
        }
        try require(directionFrames.count == 2 && Set(directionFrames).count == 2, "directional attacks played the same sheet")

        let fairyIdle = [(0.25, 0), (1.49, 0), (1.51, 1), (2.15, 4), (2.40, 3), (2.82, 0), (4.97, 0), (5.01, 1)]
        for (time, index) in fairyIdle {
            let frame = CreatureAnimation.frame("Fairy", pose: CreaturePose(action: .idle, time: time))
            try require(frame?.index == index, "Fairy idle did not match the browser at \(time) seconds")
        }
        let fairyNeutral = try CreatureAnimation.frame("Fairy", pose: CreaturePose(action: .idle, time: 0))
            .unwrap("missing Fairy's resting pose")
        let breath = FairyIdleAppearance.image(fairyNeutral.image, frame: 0, elapsed: 0.6)
        try require(breath !== fairyNeutral.image, "Fairy's neutral breathing shader failed to render")
        let fairyAttack = CreatureAnimation.timing(for: "Fairy", action: .meleeAttack, direction: nil)
        let fairyDeath = CreatureAnimation.timing(for: "Fairy", action: .death, direction: nil)
        try require(abs((fairyAttack?.duration ?? 0) - 0.9) < 0.0001, "Fairy attack lost its authored holds")
        try require(abs((fairyDeath?.duration ?? 0) - 1.1) < 0.0001, "Fairy death stopped before the final hold")
        try checkLeprechaunIdle()
        for (action, time, size) in [(CreatureAction.idle, 0.0, 192), (.idle, 1.32, 192), (.idle, 4.42, 192),
                                     (.idle, 9.88, 192), (.walk, 0.0, 192), (.cast, 0.0, 256)] {
            let mage = try CreatureAnimation.frame("Wandering Mage", pose: CreaturePose(action: action, time: time))
                .unwrap("Wandering Mage lost its \(action.rawValue) frame")
            try require(mage.image.width == size && mage.image.height == size && framePixels(mage.image) != nil,
                        "Wandering Mage rendered a piece of an atlas instead of a full frame")
        }
        let cast = try CreatureAnimation.timing(for: "Wandering Mage", action: .cast, direction: nil)
            .unwrap("Wandering Mage did not have a cast clip")
        let castFrames = [0, cast.duration * 0.5, cast.duration * 0.95].compactMap { time in
            CreatureAnimation.frame("Wandering Mage", pose: CreaturePose(action: .cast, time: time))?.index
        }
        try require(Set(castFrames).count == 3, "Wandering Mage did not play through the cast frames")
        let goblinDeath = try CreatureAnimation.timing(for: "Goblin Knight", action: .death, direction: nil)
            .unwrap("Goblin Knight did not have a death clip")
        let corpseFrames = [0.7, goblinDeath.duration - 0.02].compactMap { time in
            CreatureAnimation.frame("Goblin Knight", pose: CreaturePose(action: .death, time: time))
                .flatMap { framePixels($0.image) }
        }
        try require(corpseFrames.count == 2 && Set(corpseFrames).count == 1, "Goblin Knight drifted during the browser's grounded death hold")
    }

    @MainActor
    private static func checkLeprechaunIdle() throws {
        for (time, index) in [(0.0, 0), (3.10, 0), (3.23, 6), (4.32, 3), (5.00, 8), (5.40, 0)] {
            let frame = CreatureAnimation.frame("Leprechaun", pose: CreaturePose(action: .idle, time: time))
            try require(frame?.index == index, "Leprechaun idle did not match the browser at \(time) seconds")
        }
        let url = try Bundle.main.url(forResource: "leprechaun_lab_idle_atlas", withExtension: "webp", subdirectory: "Atlases")
            .unwrap("missing the canonical Leprechaun sheet")
        let source = try CGImageSourceCreateWithURL(url as CFURL, nil).unwrap("could not read the Leprechaun sheet")
        let sheet = try CGImageSourceCreateImageAtIndex(source, 0, nil).unwrap("could not decode the Leprechaun sheet")
        let raw = try sheet.cropping(to: CGRect(x: 0, y: 0, width: 1024, height: 1024))
            .flatMap(framePixels).unwrap("missing original Leprechaun pixels")
        let resting = try CreatureAnimation.frame("Leprechaun", pose: CreaturePose(action: .idle, time: 0))
            .unwrap("missing the Leprechaun’s standing pose")
        try require(abs(resting.heightScale - 1024.0 / 768) < 0.0001 && abs(resting.widthRatio - 1) < 0.0001 &&
                    abs(resting.foot - 872.0 / 1024) < 0.0001,
                    "the padded Leprechaun idle canvas lost the browser’s scale or sole anchor")
        let corrected = try framePixels(resting.image).unwrap("missing corrected Leprechaun pixels")
        let cloth = stride(from: 0, to: raw.count, by: 4).filter { i in
            raw[i + 3] >= 220 && raw[i + 1] > raw[i] && Int(raw[i + 1]) > Int(raw[i + 2]) + 12
        }
        let gain = cloth.reduce(0) { $0 + Int(corrected[$1 + 1]) - Int(raw[$1 + 1]) }
        try require(cloth.count > 12 && gain / cloth.count > 10, "Leprechaun’s cloth stayed as dark as the ungraded sheet")
    }

    @MainActor
    private static func checkWindAuras(_ artwork: BattlefieldArtwork) throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let area = CGRect(x: 0, y: 6, width: 5, height: 5)
        let board = CGRect(x: 0, y: 0, width: 16, height: 16)
        let narrowed = board.insetBy(dx: 2, dy: 2)
        var previousFrame: Data?
        for (name, inward) in [("Dryad", false), ("Peasant", true)] {
            let first = try BattlefieldWindAura.image(area: area, board: board, projection: projection, time: 1.23,
                                                      opacity: 0.7, scale: 2, inward: inward).unwrap("\(name)'s aura did not render")
            let next = try BattlefieldWindAura.image(area: area, board: board, projection: projection, time: 2.17,
                                                     opacity: 0.7, scale: 2, inward: inward).unwrap("missing \(name)'s next aura frame")
            let clipped = try BattlefieldWindAura.image(area: area, board: narrowed, projection: projection, time: 1.23,
                                                        opacity: 0.7, scale: 2, inward: inward).unwrap("missing \(name)'s narrowed aura")
            let frame = try framePixels(first.image).unwrap("\(name)'s aura rendered transparent")
            let nextFrame = try framePixels(next.image).unwrap("\(name)'s next aura frame rendered transparent")
            try require(first.bounds == next.bounds && frame != nextFrame,
                        "\(name)'s waves stopped moving or shifted their range")
            try require(clipped.bounds.width < first.bounds.width && clipped.bounds.maxX == first.bounds.maxX,
                        "narrowing shifted the far edge of \(name)'s aura")
            try require(frame != previousFrame, "the inward and outward wind auras look the same")
            previousFrame = frame
        }
    }

    @MainActor
    private static func checkGriffinAura(_ artwork: BattlefieldArtwork) throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let board = CGRect(x: 0, y: 0, width: 16, height: 16)
        let center = CGPoint(x: 8, y: 8.5)
        func storm(_ age: TimeInterval, range: CGFloat = 2, facing: CGFloat = 1, center location: CGPoint? = nil,
                   board limits: CGRect? = nil) throws -> BattlefieldGriffinAura.Frame {
            try BattlefieldGriffinAura.frame(center: location ?? center, footprint: .wide, range: range, facing: facing,
                                             board: limits ?? board,
                                             projection: projection, age: age, opacity: 0.7, scale: 2)
                .unwrap("Griffin's tornado shader did not render")
        }
        let first = try storm(1.23)
        let next = try storm(2.17)
        let mirrored = try storm(1.23, facing: -1)
        let narrowed = try storm(1.23, center: CGPoint(x: 2.5, y: 8.5), board: board.insetBy(dx: 2, dy: 2))
        let still = try storm(0)
        let raw = try (still.back.image.dataProvider?.data).unwrap("missing Griffin's fade-in frame") as Data
        try require(raw.allSatisfy { $0 == 0 }, "Griffin's aura did not fade in from transparent")
        try require(first.back.bounds.midY < first.front.bounds.midY &&
                    framePixels(first.front.image) != framePixels(next.front.image) &&
                    framePixels(first.back.image) != framePixels(next.back.image),
                    "Griffin's front and rear tornado layers stopped animating")
        try require(mirrored.eye.boundingBox.midX > first.eye.boundingBox.midX &&
                    first.eye.contains(projection.point(x: center.x, y: center.y)),
                    "Griffin's clear center did not follow its facing")
        for range in [CGFloat(2), 3] {
            let frame = try storm(1.23, range: range)
            let depth = range + 0.5
            let farEdge = projection.point(x: center.x, y: center.y + depth).y
            let nearEdge = projection.point(x: center.x, y: center.y - depth).y
            try require(abs(frame.back.bounds.minY - farEdge) <= 1 && abs(frame.front.bounds.maxY - nearEdge) <= 1,
                        "Griffin's tornado extended past its aura rows")
            for offset in [-depth, depth] {
                try require(!frame.clip.contains(projection.point(x: center.x, y: center.y + offset * 1.01)),
                            "Griffin's clip included a row outside the aura")
            }
        }
        try require(!narrowed.clip.contains(projection.point(x: 1.9, y: 8.5)) &&
                    narrowed.clip.contains(projection.point(x: 2.1, y: 8.5)),
                    "Griffin's tornado did not clip to the narrowed board")
    }

    @MainActor
    private static func checkWyvernAura(_ artwork: BattlefieldArtwork) throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let board = CGRect(x: 0, y: 0, width: 16, height: 16)
        let area = CGRect(x: 5, y: 5.5, width: 6, height: 5)
        let start = Date(timeIntervalSinceReferenceDate: 1)
        let motion = BattlefieldWyvernAura.Motion(center: CGPoint(x: area.midX, y: area.midY), at: start)
        func cloud(_ seconds: TimeInterval, area: CGRect, facing: CGFloat = 1,
                   clip: CGRect? = nil) throws -> BattlefieldWyvernAura.Frame {
            try BattlefieldWyvernAura.frame(area: area, board: clip ?? board, facing: facing, projection: projection,
                                            now: start.addingTimeInterval(seconds), motion: motion, opacity: 0.7, scale: 2)
                .unwrap("Wyvern's poison shaders did not render")
        }
        let first = try cloud(0, area: area)
        let next = try cloud(0.14, area: area.offsetBy(dx: 0.25, dy: 0))
        let wake = try cloud(0.28, area: area.offsetBy(dx: 0.25, dy: 0))
        let pixels = try (wake.floor.last?.image.dataProvider?.data).unwrap("missing Wyvern's wake pixels") as Data
        try require(first.floor.count == 1 && next.floor.count == 2 && wake.floor.count == 2 && pixels.contains { $0 > 0 },
                    "Wyvern's moving mist did not leave a visible wake")
        try require(framePixels(first.floor[0].image) != framePixels(wake.floor[0].image) &&
                    framePixels(first.front.image) != framePixels(wake.front.image),
                    "Wyvern's floor and body mist stopped animating")
        let edge = try cloud(0.32, area: area.offsetBy(dx: -5.5, dy: 0), facing: -1, clip: board.insetBy(dx: 2, dy: 2))
        try require(edge.floor.count == 1 && !edge.clip.contains(projection.point(x: 1.9, y: 8)),
                    "Wyvern carried a wake across a teleport or beyond the narrowed board")
    }

    @MainActor
    private static func checkArachnaAura(_ artwork: BattlefieldArtwork) throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let board = CGRect(x: 0, y: 0, width: 16, height: 16)
        let area = CGRect(x: 5, y: 5, width: 6, height: 6)
        func web(_ age: TimeInterval, area: CGRect, board: CGRect) throws -> (image: CGImage, bounds: CGRect) {
            try BattlefieldArachnaAura.image(area: area, board: board, projection: projection,
                                             age: age, opacity: 0.7, scale: 1).unwrap("Arachna's silk and spiders did not render")
        }
        func coverage(_ image: CGImage) throws -> Int {
            let pixels = try (image.dataProvider?.data).unwrap("missing Arachna's pixels") as Data
            return stride(from: 3, to: pixels.count, by: 4).reduce(0) { $0 + Int(pixels[$1]) }
        }
        let hidden = try web(0, area: area, board: board)
        let revealed = try web(0.47, area: area, board: board)
        let first = try web(1.23, area: area, board: board)
        let next = try web(2.17, area: area, board: board)
        let hiddenAlpha = try coverage(hidden.image)
        let revealAlpha = try coverage(revealed.image)
        let fullAlpha = try coverage(first.image)
        try require(hiddenAlpha == 0 && revealAlpha > 0 && fullAlpha > revealAlpha,
                    "Arachna's web did not reveal from its center")
        try require(first.bounds == next.bounds && framePixels(first.image) != framePixels(next.image),
                    "Arachna's silk and spiders stopped animating")
        let nearEdge = area.offsetBy(dx: -5, dy: 0.5)
        let full = try web(1.23, area: nearEdge, board: board)
        let clipped = try web(1.23, area: nearEdge, board: board.insetBy(dx: 2, dy: 2))
        let edgeAlpha = try coverage(full.image)
        let clipAlpha = try coverage(clipped.image)
        try require(clipped.bounds.width < full.bounds.width && clipAlpha < edgeAlpha,
                    "Arachna's web did not clip to the narrowed board")
    }

    @MainActor
    static func checkBoardFraming(_ stacks: [Stack], artwork: BattlefieldArtwork) throws {
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        for stack in stacks {
            let halfHeight = CGFloat(stack.footprint.height) / 2
            let lower = CreatureAnimation.boardPresentation(stack, position: CGPoint(x: 4, y: 1 + halfHeight),
                                                           projection: projection, facing: 1)
            let upper = CreatureAnimation.boardPresentation(stack, position: CGPoint(x: 4, y: 15 - halfHeight),
                                                           projection: projection, facing: 1)
            try require(abs(upper.height / lower.height - 0.85) < 0.0001, "\(stack.name) lost the browser's row scaling")
            if stack.name == "Wolf" {
                let height = 1.05 * 0.99 * 1.76 * projection.spriteCellSize
                try require(abs(lower.height - height) < 0.0001, "the Wolf lost the browser's per-creature scale")
            }
        }
        let champion = try CreatureAnimation.frame("Champion", pose: CreaturePose(action: .idle, time: 0))
            .unwrap("missing Champion's standing pose")
        let presentation = CreatureAnimation.boardPresentation("Champion", footprint: .square, position: CGPoint(x: 5, y: 8),
                                                               projection: projection, facing: 1)
        let flagHeight: CGFloat = 14
        let flag = CreatureAnimation.flagPosition(for: "Champion", presentation: presentation, projection: projection,
                                                  facing: 1, height: flagHeight)
        let helmetY = presentation.ground.y - presentation.height * champion.heightScale * (champion.foot - 248.0 / 1024)
        let gap = helmetY - (flag.y + flagHeight / 2)
        try require(abs(gap - max(2, projection.spriteCellSize * 0.04)) < 0.001,
                    "Champion's stack-count flag did not sit above the helmet")
    }

    @MainActor
    static func checkFireFrames() throws {
        for key in ["under_v2", "over_v2", "actual_extent_v4"] {
            let resource = "fire_pit_grok_video_fire_\(key)_64_atlas.webp"
            let frames = [0, 17, 33].compactMap {
                BattlefieldAtlas.frame(resource, columns: 8, rows: 8, index: $0, maxDimension: 2048)
                    .flatMap(framePixels)
            }
            try require(Set(frames).count > 1, "Fire Pit lost the \(key) flame animation")
        }
        let under = try Bundle.main.url(forResource: "fire_pit_grok_video_fire_under_v2_64_atlas",
                                        withExtension: "webp", subdirectory: "Atlases").unwrap("missing the Fire Pit source sheet")
        let offsets = FirePitRegistration.load(from: under)
        try require(offsets.count == 64 && offsets.allSatisfy { abs($0) <= FirePitRegistration.maximumOffset },
                    "the Fire Pit did not register every flame frame")
        try require((offsets.max() ?? 0) - (offsets.min() ?? 0) > 0.03 &&
                    abs((offsets.first ?? 0) - (offsets.last ?? 0)) < 0.10,
                    "the Fire Pit failed to correct sideways drift across the loop")
    }

    private static func framePixels(_ image: CGImage) -> Data? {
        let width = 32
        let bytesPerRow = 4 * width
        guard let context = CGContext(data: nil, width: width, height: width, bitsPerComponent: 8,
                                      bytesPerRow: bytesPerRow, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = context.data else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: width))
        let rgba = data.assumingMemoryBound(to: UInt8.self)
        guard (0..<(width * width)).contains(where: { rgba[$0 * 4 + 3] > 0 }) else { return nil }
        return Data(bytes: data, count: bytesPerRow * width)
    }

    static func advanceToPlayer(_ battle: NativeBattle) throws -> BattleView {
        var view = try battle.view()
        for _ in 0..<12 {
            if !view.opponentTurn { break }
            try require(!battle.perform(.endTurn), "player acted on the opponent’s turn")
            try require(try battle.view() == view, "refused turn command mutated the board")
            try require(battle.playOpponent(), "opponent could not take its turn")
            view = try battle.view()
        }
        return view
    }

    static func checkTerrain(_ directory: URL) throws {
        let lava = try NativeBattle(snapshot: Data(contentsOf: directory.appendingPathComponent("skirmish-lava.json")))
        let pit = try lava.view()
        try require(pit.map == .firePit && !pit.lava.isEmpty && pit.stones.isEmpty, "Fire Pit lost its lava tiles")
        try require(lava.ready(), "could not start combat on Fire Pit")
        let walker = try advanceToPlayer(lava)
        try require(walker.moves.allSatisfy { !walker.lava.contains($0) }, "a ground stack can land on lava")

        let barrels = try NativeBattle(snapshot: Data(contentsOf: directory.appendingPathComponent("skirmish-barrels.json")))
        let setup = try barrels.view()
        try require(setup.map == .barrels && !setup.stones.isEmpty && setup.lava.isEmpty, "Barrels lost its obstacles")
        try require(barrels.ready(), "could not start combat on Barrels")
        var view = try advanceToPlayer(barrels)
        for _ in 0..<12 where view.obstacleTargets.isEmpty && view.playerTurn {
            try require(barrels.perform(.endTurn), "could not advance to an obstacle attack")
            view = try advanceToPlayer(barrels)
        }
        let obstacle = try view.obstacleTargets.first.unwrap("could not target a standing obstacle")
        let obstacleCursor = SandboxCursorMode.resolve(at: obstacle, in: view)
        try require(obstacleCursor != .standard && obstacleCursor != .interactive, "the obstacle did not show an attack cursor")
        try require(barrels.choose(obstacle), "Zig refused a highlighted obstacle attack")
        let after = try barrels.view()
        try require(after.stones.count < view.stones.count && after.moments.contains { $0.kind == .obstacle },
                    "obstacle attack did not clear a stone")
    }

    @MainActor
    static func checkSpell(_ data: Data) throws {
        let battle = try NativeBattle(snapshot: data)
        try require(battle.ready(), "could not start the spell battle")
        var view = try advanceToPlayer(battle)
        for _ in 0..<9 where view.activeStack?.name != "Healer" {
            try require(battle.perform(.endTurn), "could not advance to the caster")
            view = try advanceToPlayer(battle)
        }
        try require(view.activeStack?.name == "Healer", "the Healer did not take a turn")
        let blessing = try view.spells.first { $0.name == "Blessing" }.unwrap("the Healer’s book lost Blessing")
        try require(blessing.available && blessing.aim == .unit, "wrong availability or aim for Blessing")
        try require(battle.chooseSpell(blessing.id), "could not arm Blessing")
        view = try battle.view()
        try require(view.preparedSpell == blessing.id && view.moves.isEmpty && view.attacks.isEmpty, "spell left standard moves active")
        let enemy = try view.stacks.first { $0.team == .opponent }?.cells.first.unwrap("missing enemy aim point")
        if let enemy {
            try require(SandboxCursorMode.resolve(at: enemy, in: view) == .standard, "an invalid target showed the spell cursor")
            try require(!battle.choose(enemy), "Blessing accepted an enemy")
        }
        try require(try battle.view() == view, "refused spell target mutated the board")
        let target = try view.spellCells.first.unwrap("Blessing had no legal target")
        try require(SandboxCursorMode.resolve(at: target, in: view) == .magic, "a legal spell target missed the magic cursor")
        let targetID = try view.stacks.first { $0.cells.contains(target) }.unwrap("spell target has no stack").id
        let armed = view
        try require(battle.choose(target), "Zig rejected the highlighted Blessing target")
        view = try battle.view()
        try require(view.preparedSpell == nil && view.moments.last?.spell == "Blessing", "Blessing did not emit a cast event")
        try require(view.stacks.first { $0.id == targetID }?.statuses.contains { $0.name == "Blessing" } == true,
                    "Blessing did not apply a buff through Zig")
        let cast = try view.moments.last.unwrap("missing spell action")
        try require(cast.statusApplications?.contains {
            $0.target == targetID && $0.kind == .buff && $0.name == "Blessing"
        } == true, "the spell did not report the buff at its application")
        let playback = BattlePlayback(moments: view.moments, previous: armed, next: view)
        let blessingPops = playback.combatCues.filter {
            if case .status("Blessing", .buff) = $0.kind { return $0.stack.id == targetID }
            return false
        }
        try require(blessingPops.count == 1, "the cast should show one Blessing popup over its target")
    }

    @MainActor
    private static func checkBattleRoar(_ setup: SandboxSetup, resources: URL) throws {
        let behemoth = try setup.creatures.first { $0.name == "Behemoth" }.unwrap("missing Behemoth")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let battle = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: behemoth.id, team: .player, amount: behemoth.amount, x: 3, y: 7),
            SandboxStack(creature: squire.id, team: .player, amount: squire.amount, x: 3, y: 9),
            SandboxStack(creature: squire.id, team: .opponent, amount: squire.amount, x: 13, y: 9),
        ], automated: [], resources: resources)
        try require(battle.ready(), "could not start the Battle Roar test")
        var before = try battle.view()
        for _ in 0..<2 where before.activeStack?.name != behemoth.name {
            try require(battle.perform(.endTurn), "could not reach Behemoth's turn")
            before = try battle.view()
        }
        let roar = try before.spells.first { $0.name == "Battle Roar" }.unwrap("Behemoth lost Battle Roar")
        let ordered = before.turnOrder.map(\.id)
        try require(ordered.first == before.active && ordered.count == Set(ordered).count,
                    "the active creature was missing from the first queue slot or appeared twice")
        try require(roar.available && roar.aim == .army && battle.chooseSpell(roar.id), "the card did not cast Battle Roar")
        let cast = try battle.view()
        try require(cast.preparedSpell == nil && cast.active != before.active &&
                    cast.revision == before.revision + 1 && cast.moments.first?.spell == "Battle Roar",
                    "Battle Roar should consume a single turn immediately")
        let buffed = Set(cast.stacks.filter { $0.statuses.contains { $0.name == "Battle Roar" && $0.kind == .buff } }.map(\.id))
        try require(buffed == Set(cast.stacks.filter { $0.team == .player }.map(\.id)), "Battle Roar buffed the wrong army")
    }

    @MainActor
    private static func checkFireWall(_ setup: SandboxSetup, resources: URL) throws {
        let caster = try setup.creatures.first { $0.name == "Nightmare" }.unwrap("missing Nightmare")
        let defender = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let center = Cell(x: 3, y: 8)
        let army = [SandboxStack(creature: caster.id, team: .player, amount: caster.amount, x: center.x, y: center.y),
                    SandboxStack(creature: defender.id, team: .opponent, amount: defender.amount, x: 13, y: 9)]
        for (turns, step) in [(Int32(1), Int32(0)), (1, -1), (0, 1), (1, 1)].enumerated() {
            let battle = try setup.makeBattle(map: .normal, stacks: army, automated: [], resources: resources)
            try require(battle.ready(), "could not start the Fire Wall duel")
            var view = try battle.view()
            if view.activeStack?.name != caster.name {
                try require(battle.perform(.endTurn), "could not advance to Nightmare's turn")
                view = try battle.view()
            }
            let spell = try view.spells.first { $0.name == "Fire Wall" }.unwrap("Nightmare lost Fire Wall")
            try require(!battle.rotateFireWall() && battle.chooseSpell(spell.id), "could not arm Fire Wall")
            for _ in 0..<turns { try require(battle.rotateFireWall(), "could not rotate Fire Wall") }
            let armed = try battle.view()
            let preview = try (armed.fireWallAims ?? []).first { $0.anchor == center }
                .unwrap("the occupied anchor should still aim Fire Wall")
            let footprint = (Int32(-2)..<Int32(2)).map { Cell(x: center.x + $0 * step.0, y: center.y + $0 * step.1) }
            let blocked = Set(armed.stacks.flatMap(\.cells) + armed.stones + armed.holes)
            try require(preview.footprint == footprint && !preview.lit.isEmpty && preview.lit == footprint.filter { !blocked.contains($0) } &&
                        !preview.lit.contains(center), "the aiming preview drew the wrong orientation or lit an occupied tile")
            try require(battle.choose(center), "Zig refused the previewed Fire Wall")
            let cast = try battle.view()
            try require(cast.fireWallAims == nil && cast.preparedSpell == nil && cast.fireCells == preview.lit,
                        "the wall did not light the previewed cells")
            let playback = BattlePlayback(moments: cast.moments, previous: armed, next: cast)
            let impact = playback.started.addingTimeInterval(playback.impactTime)
            let flame = try playback.fireTransitions[preview.lit[0]].unwrap("the cast had no ignition cue")
            try require(flame.ignites && flame.started == impact && flame.opacity(at: impact) == 0 &&
                        flame.opacity(at: impact.addingTimeInterval(0.33)) == 1, "Fire Wall did not ignite at the cast contact")
            try require(!battle.rotateFireWall() && battle.perform(.endTurn), "the wall blocked the next turn")
            let following = try battle.view()
            try require(following.fireCells == cast.fireCells, "the flames disappeared on the next turn")
            if turns == 0 {
                var previous = following
                for _ in 0..<8 where previous.fireCells?.isEmpty == false {
                    try require(battle.perform(.endTurn), "could not reach the lap that extinguishes the wall")
                    let next = try battle.view()
                    if next.fireCells?.isEmpty == true {
                        let ending = BattlePlayback(moments: next.moments, previous: previous, next: next)
                        let burnout = try ending.fireTransitions[preview.lit[0]].unwrap("missing Fire Wall burnout")
                        try require(!burnout.ignites && burnout.opacity(at: burnout.started) == 1 &&
                                    burnout.opacity(at: burnout.endsAt) == 0, "Fire Wall did not fade on expiration")
                    }
                    previous = next
                }
                try require(previous.fireCells?.isEmpty == true, "the wall outlasted its engine spell duration")
            }
        }
    }

    @MainActor
    static func checkWaterShield(_ setup: SandboxSetup, resources: URL) throws {
        let shooter = try setup.creatures.first { $0.name == "Arbalester" }.unwrap("missing Arbalester")
        let mermaid = try setup.creatures.first { $0.name == "Mermaid" }.unwrap("missing Mermaid")
        let duel = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: shooter.id, team: .player, amount: shooter.amount, x: 2, y: 8),
            SandboxStack(creature: mermaid.id, team: .opponent, amount: mermaid.amount, x: 13, y: 8),
        ], automated: [], resources: resources)
        try require(duel.ready(), "could not start the Water Shield duel")
        var before = try duel.view()
        if before.activeStack?.name == "Mermaid" {
            try require(duel.perform(.endTurn), "could not advance to the shield test shot")
            before = try duel.view()
        }
        let shielded = try before.stacks.first { $0.name == "Mermaid" }.unwrap("missing shielded stack")
        let cell = try shielded.cells.first.unwrap("missing shielded cell")
        try require(shielded.hasWaterShield && before.attacks.contains(shielded.id), "Water Shield was not shown on a legal shot")
        try require(duel.choose(cell), "the Water Shield test shot was rejected")
        let after = try duel.view()
        let protected = try after.stacks.first { $0.id == shielded.id }.unwrap("Water Shield did not protect the target")
        try require(!protected.hasWaterShield && protected.cumulativeHealth == shielded.cumulativeHealth,
                    "the absorbed shot changed health or left Water Shield active")
        try require(after.moments.contains { $0.waterShieldBreaks?.contains(shielded.id) == true },
                    "the engine did not identify which shield dissolved at the shot")
        let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
        let burst = try playback.waterShieldBreaks.first.unwrap("the absorbed hit did not produce a shield dissolve")
        let age = burst.started.timeIntervalSince(playback.started)
        try require(burst.stack.id == shielded.id && abs(age - playback.impactTime(for: shielded)) < 0.001 &&
                    burst.position == BattlefieldProjection.logicalCenter(shielded.cells),
                    "the water must burst at projectile contact and stay at the impact cell")
    }

    static func checkRangedMovement(_ data: Data) throws {
        let battle = try NativeBattle(snapshot: data)
        try require(battle.ready(), "could not start the ranged battle")
        var view = try advanceToPlayer(battle)
        for _ in 0..<9 where view.activeStack?.name != "Arbalester" {
            try require(battle.perform(.endTurn), "could not advance to the shooter")
            view = try advanceToPlayer(battle)
        }
        try require(view.mode == .ranged && !view.attacks.isEmpty, "shooter did not have a legal shot")
        try require(view.attackModes == [.melee, .ranged] || view.attackModes == [.ranged, .melee],
                    "the arbalester’s attack selector lost a mode")
        let move = try view.moves.first.unwrap("shooter did not have a legal move")
        try require(SandboxCursorMode.resolve(at: move, in: view) == .interactive, "a legal move missed the interactive cursor")
        try require(battle.choose(move), "shooter could not move")
        let next = try battle.view()
        try require(next.active != view.active && next.moments.contains { $0.kind == .endTurn && $0.actor == view.active },
                    "the shooter kept its turn after moving")
    }

    @MainActor
    private static func checkProjectileAssets(_ resources: URL) throws {
        let catalogue = try SandboxSetup(resources: resources).creatures
        let names = ["Arbalester", "Beholder", "Centaur", "Cyclops", "Dryad", "Elf", "Gargantuan", "Medusa",
                     "Monk", "Orc", "Tsar Cannon", "Zena"]
        for name in names {
            try require(catalogue.contains { $0.name == name }, "missing ranged creature \(name)")
            let projectile = try BattleProjectile.forShooter(name).unwrap("missing projectile for \(name)")
            try require(projectile.resource != BattleProjectile.forShooter(nil)?.resource, "\(name) fell back to a generic bolt")
            let first = try projectile.image(at: 0, inBackground: false).unwrap("could not decode \(projectile.resource)")
            if let atlas = projectile.atlas {
                let second = try projectile.image(at: atlas.secondsPerFrame * 1.01, inBackground: false)
                    .unwrap("could not read the next frame of \(projectile.resource)")
                try require(framePixels(first) != framePixels(second), "\(name) lost its animated projectile")
            }
        }
    }

    @MainActor
    private static func checkBowReleases(_ setup: SandboxSetup, resources: URL, artwork: BattlefieldArtwork) throws {
        let fixtures: [(String, Int, CGSize, [(String?, CGPoint, CGFloat)])] = [
            ("Dryad", 3, CGSize(width: 768, height: 768), [
                (nil, CGPoint(x: 465.63, y: 224.16), 297.46),
                ("up", CGPoint(x: 505.585, y: 183.47), 339.825625),
                ("down", CGPoint(x: 491.6, y: 253.09), 317.797342),
            ]),
            ("Elf", 10, CGSize(width: 1664, height: 1152), [
                (nil, CGPoint(x: 1005.845922, y: 418.197796), 350),
                ("up", CGPoint(x: 953.212798, y: 399.118784), 350),
                ("down", CGPoint(x: 1021.896009, y: 531.968296), 350),
            ]),
        ]
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        for (name, index, canvas, aim) in fixtures {
            let creature = try setup.creatures.first { $0.name == name }.unwrap("missing \(name)")
            let stack = try setup.rosterPreview(for: creature, resources: resources)
            for (direction, pin, length) in aim {
                let release = try (CreatureAnimation.timing(for: name, action: .attack, direction: direction)?.release)
                    .unwrap("missing \(name)'s release timing")
                let pose = CreaturePose(action: .attack, time: release + 0.000_001, verticalAttack: direction)
                let frame = try CreatureAnimation.frame(name, pose: pose).unwrap("missing \(name)'s release cel")
                try require(frame.index == index, "\(name) released before the bowstring moved")
                for (position, facing) in [(CGPoint(x: 3.5, y: 6.5), 1.0), (CGPoint(x: 12.5, y: 10.5), -1.0)] {
                    let flight = try CreatureAnimation.bowRelease(for: stack, at: position, direction: direction,
                        facing: facing, projection: projection).unwrap("missing \(name)'s authored bow anchor")
                    let body = CreatureAnimation.boardPresentation(stack, position: position, projection: projection, facing: facing)
                    let height = body.height * frame.heightScale
                    let width = height * CGFloat(frame.image.width) / CGFloat(frame.image.height) * body.widthScale * frame.widthRatio
                    let x = body.ground.x + facing * width * (pin.x / canvas.width - frame.anchorX)
                    let y = body.ground.y + height * (pin.y / canvas.height - frame.foot)
                    try require(hypot(flight.point.x - x, flight.point.y - y) < 0.25 &&
                                abs(flight.length - length * width / canvas.width) < 0.25,
                                "\(name)'s arrow failed to line up with its \(direction ?? "straight") release cel")
                }
            }
        }
    }

    @MainActor
    private static func checkColdDirectionalAttack() async throws {
        let flat = CreaturePose(action: .attack, time: 0)
        let deadline = ContinuousClock.now + .seconds(5)
        CreatureAnimation.prewarm("Orc", action: .attack, firstPageOnly: true)
        while CreatureAnimation.frame("Orc", pose: flat, inBackground: true) == nil {
            try require(ContinuousClock.now < deadline, "could not warm the straight attack")
            await Task.yield()
        }
        // The background loader cannot publish an angled frame until this main-actor check returns.
        let pose = CreaturePose(action: .attack, time: 0, verticalAttack: "up")
        try require(CreatureAnimation.frame("Orc", pose: pose, inBackground: true)?.action == .attack,
                    "a cold angled shot held the idle frame instead of starting the windup")
    }

    @MainActor
    private static func checkOrcProjectile(_ resources: URL) throws {
        let setup = try SandboxSetup(resources: resources)
        let orc = try setup.creatures.first { $0.name == "Orc" }.unwrap("missing Orc")
        let target = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let battle = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: orc.id, team: .player, amount: 14, x: 3, y: 6),
            SandboxStack(creature: target.id, team: .opponent, amount: 24, x: 12, y: 10),
        ], automated: [], resources: resources)
        try require(battle.ready(), "could not start the Orc fixture")
        var before = try battle.view()
        for _ in 0..<4 where before.activeStack?.name != orc.name {
            try require(battle.perform(.endTurn), "could not advance to Orc")
            before = try battle.view()
        }
        try require(before.activeStack?.name == orc.name, "Orc did not take a turn")
        let option = try before.attackOptions.first.unwrap("Orc could not aim his axe")
        let angle = try option.angles.first.unwrap("Orc had no legal angle")
        try require(battle.attack(option.target, from: angle), "Orc's valid shot failed")
        let after = try battle.view()
        let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
        let shot = try playback.actions.first { $0.moment.kind == .shot }.unwrap("no Orc shot in the timeline")
        let release = try shot.release.unwrap("Orc's axe was never released")
        try require(shot.projectile?.resource == "orc_throwing_axe.webp" && shot.projectile?.releaseFrame == 4 &&
                    shot.direction == "up" && release < shot.impact, "Orc did not throw his authored axe")
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            let timing = try CreatureAnimation.timing(for: "Orc", action: .attack, direction: shot.direction,
                                                      releaseFrame: 4).unwrap("missing Orc attack timing")
            let releaseFrameTime = try timing.release.unwrap("missing Orc release frame")
            try require(abs(releaseFrameTime - (release - shot.moveEnd)) < 0.0001,
                        "Orc's projectile did not leave at the release frame")
        }
    }

    @MainActor
    private static func checkPikemanSkewer(_ resources: URL) throws {
        let setup = try SandboxSetup(resources: resources)
        let pikeman = try setup.creatures.first { $0.name == "Pikeman" }.unwrap("missing Pikeman")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let from = Cell(x: 11, y: 8)
        for rearRow: Int32 in [8, 9] {
            let battle = try setup.makeBattle(map: .normal, stacks: [
                SandboxStack(creature: pikeman.id, team: .player, amount: 36, x: 3, y: 8),
                SandboxStack(creature: peasant.id, team: .opponent, amount: 45, x: 12, y: 8),
                SandboxStack(creature: peasant.id, team: .opponent, amount: 45, x: 13, y: rearRow),
            ], automated: [], resources: resources)
            try require(battle.ready(), "could not start Pikeman's Skewer Strike fixture")
            var before = try battle.view()
            let target = try before.stacks.first { $0.anchor == Cell(x: 12, y: 8) }.unwrap("missing front stack")
            let rear = try before.stacks.first { $0.anchor == Cell(x: 13, y: rearRow) }.unwrap("missing rear stack")
            for _ in 0..<12 {
                if before.activeStack?.name == "Pikeman" {
                    if let option = before.attackOptions.first(where: { $0.target == target.id }),
                       let angle = option.angles.first(where: { $0.cell == from }) {
                        let preview = (angle.hits ?? []).first { $0.target == rear.id }
                        try require((preview.map { $0.min > 0 && $0.max >= $0.min } == true) == (rearRow == 8),
                                    "the forecast marked the wrong rear stack for Skewer Strike")
                        try require(battle.attack(option.target, from: angle), "Pikeman's straight thrust failed")
                        break
                    }
                    let step = try before.moves.filter { $0.y == 8 && $0.x < from.x }
                        .max { $0.x < $1.x }.unwrap("Pikeman could not approach the target")
                    try require(battle.choose(step), "Pikeman could not walk into skewer range")
                } else {
                    try require(battle.perform(.endTurn), "could not get to Pikeman's turn")
                }
                before = try battle.view()
            }
            let after = try battle.view()
            let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
            let strike = try playback.actions.first { $0.moment.kind == .melee }.unwrap("no Pikeman thrust in the timeline")
            let pierced = rearRow == 8
            try require((strike.moment.hurt?.contains(rear.id) == true) == pierced, "Skewer fixture hit the wrong stack")
            try require(strike.skewerContact == (pierced ? CGPoint(x: 13.5, y: 8.5) : nil),
                        "Skewer light should reach the recorded rear contact only")
        }
    }

    private static func checkLocalLanguage() throws {
        let folder = try Bundle.main.url(forResource: "ru", withExtension: "lproj").unwrap("Russian strings are missing")
        let russian = try Bundle(url: folder).unwrap("could not load Russian strings")
        try require(russian.localizedString(forKey: "Local Sandbox", value: nil, table: nil) == "Локальная песочница" &&
                    russian.localizedString(forKey: "FIGHT RESULTS", value: nil, table: nil) == "ИТОГИ БОЯ" &&
                    russian.localizedString(forKey: "Petrifying Gaze", value: nil, table: nil) != "Petrifying Gaze",
                    "the Mac strings lost its menu, battle UI, or shared ability names")
    }

    @MainActor
    private static func checkBreathForecast(_ setup: SandboxSetup, resources: URL) throws {
        let dragon = try setup.creatures.first { $0.name == "Black Dragon" }.unwrap("missing Black Dragon")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let front = Cell(x: 12, y: 8)
        let rear = Cell(x: 13, y: 8)
        let approach = Cell(x: 11, y: 8)
        let battle = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: dragon.id, team: .player, amount: 8, x: 3, y: 8),
            SandboxStack(creature: peasant.id, team: .opponent, amount: 100, x: front.x, y: front.y),
            SandboxStack(creature: peasant.id, team: .opponent, amount: 100, x: rear.x, y: rear.y),
        ], automated: [], resources: resources)
        try require(battle.ready(), "could not start the Fire Breath fixture")
        var view = try battle.view()
        for _ in 0..<12 {
            if view.activeStack?.name != dragon.name {
                try require(battle.perform(.endTurn), "could not advance to the dragon")
            } else if let target = view.stacks.first(where: { $0.anchor == front }),
                      let option = view.attackOptions.first(where: { $0.target == target.id }),
                      let angle = option.angles.first(where: { $0.cell == approach }) {
                let second = try view.stacks.first { $0.anchor == rear }.unwrap("missing the rear Fire Breath target")
                let preview = (angle.hits ?? []).first { $0.target == second.id }
                let forecast = try preview.unwrap("missing secondary Fire Breath forecast")
                try require(forecast.min > 0, "the rear stack's Fire Breath preview was empty")
                try require(battle.attack(target.id, from: angle), "the dragon could not use the displayed approach")
                let hit = try battle.view().moments.flatMap { $0.healthChanges ?? [] }.first { $0.target == second.id }
                try require(hit?.delta ?? 0 < 0, "the predicted second stack never took Fire Breath damage")
                return
            } else {
                let move = try view.moves.filter { $0.y == approach.y && $0.x < approach.x }
                    .max { $0.x < $1.x }.unwrap("the dragon could not reach the Fire Breath lane")
                try require(battle.choose(move), "the dragon could not move towards the test stack")
            }
            view = try battle.view()
        }
        throw EngineError(message: "the dragon never reached the Fire Breath fixture's landing")
    }

    @MainActor
    private static func checkFleshShieldForecast(_ setup: SandboxSetup, resources: URL) throws {
        let archer = try setup.creatures.first { $0.name == "Arbalester" }.unwrap("missing Arbalester")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let protector = try setup.creatures.first { $0.name == "Abomination" }.unwrap("missing Abomination")
        let front = Cell(x: 12, y: 7)
        let battle = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: archer.id, team: .player, amount: 42, x: 3, y: 7),
            SandboxStack(creature: squire.id, team: .opponent, amount: 90, x: front.x, y: front.y),
            SandboxStack(creature: protector.id, team: .opponent, amount: 30, x: 14, y: 9),
        ], automated: [], resources: resources)
        try require(battle.ready(), "could not start the Flesh Shield fixture")
        var view = try battle.view()
        for _ in 0..<5 where view.activeStack?.name != archer.name {
            try require(battle.perform(.endTurn), "could not advance to the Flesh Shield shot")
            view = try battle.view()
        }
        let guarded = try view.stacks.first { $0.anchor == front }.unwrap("missing the guarded stack")
        let guardStack = try view.stacks.first { $0.name == protector.name }.unwrap("missing the guardian")
        let option = try view.attackOptions.first { $0.target == guarded.id }.unwrap("no clear aim at the guarded stack")
        let angle = try option.angles.first.unwrap("no range angle at the guarded stack")
        let forecast = try (angle.range?.hit).unwrap("no forecast for the guarded stack")
        let share = try forecast.redirect.unwrap("no projected Flesh Shield damage")
        try require(share.target == guardStack.id && share.max > 0, "the aura chose the wrong protector")
        try require(battle.attack(guarded.id, from: angle), "the guarded shot failed")
        let result = try battle.view()
        let losses = guardStack.cumulativeHealth - (result.stacks.first { $0.id == guardStack.id }?.cumulativeHealth ?? 0)
        try require(losses >= share.min && losses <= share.max && losses > 0,
                    "the guardian's actual loss fell outside the forecast")
    }

    @MainActor
    private static func checkFireforgedForecast(_ setup: SandboxSetup, resources: URL) throws {
        let mage = try setup.creatures.first { $0.name == "Wandering Mage" }.unwrap("missing Wandering Mage")
        let archer = try setup.creatures.first { $0.name == "Arbalester" }.unwrap("missing Arbalester")
        let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing Squire")
        let archerCell = Cell(x: 3, y: 9)
        let front = Cell(x: 12, y: 9)
        var bands: [BattleShotHit] = []
        for applySword in [false, true] {
            let battle = try setup.makeBattle(map: .normal, stacks: [
                SandboxStack(creature: mage.id, team: .player, amount: 10, x: 3, y: 7),
                SandboxStack(creature: archer.id, team: .player, amount: 24, x: archerCell.x, y: archerCell.y),
                SandboxStack(creature: squire.id, team: .opponent, amount: 95, x: front.x, y: front.y),
            ], automated: [], resources: resources)
            try require(battle.ready(), "could not start the Fireforged fixture")
            var view = try battle.view()
            for _ in 0..<10 where view.activeStack?.name != mage.name {
                try require(battle.perform(.endTurn), "could not advance to the Wandering Mage")
                view = try battle.view()
            }
            if applySword {
                let spell = try view.spells.first { $0.name == "Fireforged Sword" && $0.available }
                    .unwrap("missing Fireforged Sword")
                try require(battle.chooseSpell(spell.id) && battle.choose(archerCell), "Fireforged Sword could not reach the archer")
                view = try battle.view()
            } else {
                try require(battle.perform(.endTurn), "could not skip the control's cast")
                view = try battle.view()
            }
            for _ in 0..<10 where view.activeStack?.name != archer.name {
                try require(battle.perform(.endTurn), "could not advance to the Fireforged shot")
                view = try battle.view()
            }
            let target = try view.stacks.first { $0.anchor == front }.unwrap("missing the Fireforged victim")
            let choices = try view.attackOptions.first { $0.target == target.id }.unwrap("no aim at the Fireforged victim")
            let angle = try choices.angles.first.unwrap("missing the Fireforged shot")
            bands.append(try (angle.range?.hit).unwrap("missing the Fireforged preview"))
            let before = try battle.view()
            let steps = battle.logSteps()
            let hint = try battle.suggestion().unwrap("the Zig policy offered no playable manual turn")
            try require(hint.actor == view.active && battle.view() == before && battle.logSteps() == steps,
                        "reading a suggestion changed the live fight")
        }
        try require(bands[1].min > bands[0].min && bands[1].max > bands[0].max && bands[0].min > 0,
                    "an active Fireforged Sword did not raise the landed shot band")
    }

    @MainActor
    static func checkAttackAngles(_ data: Data, artwork: BattlefieldArtwork, resources: URL) throws {
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let setup = try SandboxSetup(resources: resources)
        let fairy = try setup.creatures.first { $0.name == "Fairy" }.unwrap("missing Fairy")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let melee = try setup.makeBattle(map: .normal, stacks: [
            SandboxStack(creature: fairy.id, team: .player, amount: 35, x: 3, y: 8),
            SandboxStack(creature: peasant.id, team: .opponent, amount: 40, x: 12, y: 8),
        ], automated: [], resources: resources)
        try require(melee.ready(), "could not start melee aim fixture")
        var view = try melee.view()
        for _ in 0..<4 where view.activeStack?.name != "Fairy" {
            try require(view.playerTurn && melee.perform(.endTurn), "expected both teams to be manual")
            view = try melee.view()
        }
        let destination = Cell(x: 8, y: 8)
        let beforeWalk = view
        try require(view.activeStack?.name == "Fairy" && melee.choose(destination), "could not move Fairy into strike range")
        view = try melee.view()
        let motion = BattlePlayback(moments: view.moments, previous: beforeWalk, next: view)
        let flyerTime = try motion.actions.first { $0.moment.kind == .move }.unwrap("missing Fairy's walk").moveEnd
        try require(abs(flyerTime - 5 / 4.8) < 0.0001, "fliers did not travel at the browser's pace")
        try require(BattlePlayback().movementTime([Cell(x: 1, y: 1), Cell(x: 2, y: 1)]) == 0.25,
                    "walk time did not use the browser's real-time movement clock")
        for _ in 0..<4 where view.activeStack?.name != "Fairy" {
            try require(melee.perform(.endTurn), "could not return to Fairy's turn")
            view = try melee.view()
        }

        func aim(x: CGFloat, y: CGFloat, in battle: BattleView) throws -> BattleAttackPreview {
            let hit = try projection.hit(at: projection.point(x: x, y: y)).unwrap("attack pointer fell outside the board")
            return try BattleAttackPreview.resolve(hit, in: battle).unwrap("pointer did not resolve an attack angle")
        }
        func bodyAim(at target: Int, in battle: BattleView) throws -> BattleAttackPreview {
            let stack = try battle.stacks.first { $0.id == target }.unwrap("missing aim target")
            let center = BattlefieldProjection.logicalCenter(stack.cells)
            let body = CreatureAnimation.boardPresentation(stack, position: center, projection: projection,
                                                           facing: stack.team == .player ? 1 : -1)
            let point = CGPoint(x: body.ground.x, y: body.ground.y - body.height * 0.75)
            let floor = projection.hit(at: point)
            try require(floor.map { !stack.cells.contains($0.cell) } ?? true, "body aim must be outside the unit's base tiles")
            let sprite = projection.stackForInspection(at: point, among: battle.stacks)
            return try BattleAttackPreview.resolve(at: point, floor: floor, over: sprite, projection: projection, in: battle)
                .unwrap("hovering the visible creature above its tiles missed the attack")
        }
        let above = try aim(x: 12.15, y: 8.85, in: view)
        let below = try aim(x: 12.15, y: 8.15, in: view)
        try require(above.target == below.target && above.angle.cell == Cell(x: 11, y: 9) && below.angle.cell == Cell(x: 11, y: 7),
                    "two corners on the same enemy did not choose their corresponding diagonal landings")
        try require(above.angle.hit?.target == above.target && (above.angle.hit?.max ?? 0) > 0,
                    "the melee landing omitted the target's damage forecast")
        try require(SandboxCursorMode.resolve(at: above.targetCell, aim: above, in: view) == .melee(.downRight) &&
                    SandboxCursorMode.resolve(at: below.targetCell, aim: below, in: view) == .melee(.upRight),
                    "the sword cursor did not follow the chosen approaches")
        try require(SandboxCursorMode.resolve(at: above.targetCell, aim: above, in: view, animating: true) == .standard,
                    "the attack cursor persisted during playback")
        let bodyMelee = try bodyAim(at: above.target, in: view)
        if case .melee = SandboxCursorMode.resolve(at: nil, aim: bodyMelee, in: view) {
            try require(bodyMelee.target == above.target, "the sword pointed at a different creature than the one hovered")
        } else {
            throw EngineError(message: "hovering the creature's body missed the sword cursor")
        }
        try require(!melee.attack(above.target, from: BattleAttackAngle(cell: Cell(x: 0, y: 0), side: nil)) &&
                    (try melee.view()) == view, "a refused attack angle changed the battle")
        try require(melee.attack(above.target, from: above.angle), "engine refused the previewed attack angle")
        try require(try melee.view().moments.contains { $0.kind == .melee && $0.target == above.target && $0.route.last == above.angle.cell },
                    "the melee strike took a different route from its preview")

        let ranged = try NativeBattle(snapshot: data)
        try require(ranged.ready(), "could not start ranged aim fixture")
        var shooter = try advanceToPlayer(ranged)
        for _ in 0..<9 where shooter.activeStack?.name != "Arbalester" {
            try require(ranged.perform(.endTurn), "could not reach the shooter")
            shooter = try advanceToPlayer(ranged)
        }
        let target = try shooter.attackOptions.first { $0.angles.count > 1 && $0.angles[0].range?.clean == true }
            .unwrap("ranged target did not offer distinct edges")
        let edge = target.angles[0]
        let side = try edge.side.unwrap("ranged option had no edge")
        let end = side.point(on: edge.cell)
        let alternate = target.angles[1]
        let otherEnd = try alternate.side.unwrap("alternate shot had no edge").point(on: alternate.cell)
        let center = BattlefieldProjection.logicalCenter([alternate.cell])
        let preview = try aim(x: otherEnd.x * 0.9 + center.x * 0.1, y: otherEnd.y * 0.9 + center.y * 0.1, in: shooter)
        try require(SandboxCursorMode.resolve(at: edge.cell, aim: preview, in: shooter) == .ranged,
                    "a legal shot missed the ranged cursor")
        let bodyShot = try bodyAim(at: target.target, in: shooter)
        try require(bodyShot.target == target.target && bodyShot.angle == edge &&
                    SandboxCursorMode.resolve(at: nil, aim: bodyShot, in: shooter) == .ranged,
                    "hovering the creature's body did not show the bow for the shot that will fire")
        try require(SandboxCursorMode.resolve(at: shooter.activeStack?.cells.first, in: shooter) == .interactive,
                    "inspecting a friendly stack showed an attack cursor")
        try require(preview.target == target.target && preview.angle == edge && ranged.attack(preview.target, from: preview.angle),
                    "the selected ranged edge was lost between hover and shooting")
        let afterShot = try ranged.view()
        let shot = try afterShot.moments.first { $0.kind == .shot }.unwrap("the engine did not report the shot")
        try require(shot.aim == edge.cell && shot.aimSide == side, "the engine used a different edge")
        let playback = BattlePlayback(moments: afterShot.moments, previous: shooter, next: afterShot)
        try require(playback.actions.first { $0.moment.kind == .shot }?.target == end,
                    "the projectile did not follow the previewed angle")
    }

    @MainActor
    private static func checkProjectileTargeting(_ setup: SandboxSetup, resources: URL) throws {
        let cannon = try setup.creatures.first { $0.name == "Tsar Cannon" }.unwrap("missing Tsar Cannon")
        let elf = try setup.creatures.first { $0.name == "Elf" }.unwrap("missing Elf")
        let medusa = try setup.creatures.first { $0.name == "Medusa" }.unwrap("missing Medusa")
        let mage = try setup.creatures.first { $0.name == "Battle Mage" }.unwrap("missing Battle Mage")
        let fireballMage = try setup.creatures.first { $0.name == "Wandering Mage" }.unwrap("missing Wandering Mage")
        let peasant = try setup.creatures.first { $0.name == "Peasant" }.unwrap("missing Peasant")
        let screen = SandboxStack(creature: peasant.id, team: .opponent, amount: peasant.amount, x: 12, y: 8)
        let rear = SandboxStack(creature: peasant.id, team: .opponent, amount: peasant.amount, x: 14, y: 8)

        func start(_ creature: SandboxCreature, extra: [SandboxStack] = []) throws -> (NativeBattle, BattleView) {
            let shooter = SandboxStack(creature: creature.id, team: .player, amount: creature.amount, x: 3, y: 8)
            let engine = try setup.makeBattle(map: .normal, stacks: [shooter, screen, rear] + extra, automated: [], resources: resources)
            try require(engine.ready(), "could not start the projectile fixture")
            var view = try engine.view()
            for _ in 0..<6 where view.activeStack?.name != creature.name {
                try require(engine.perform(.endTurn), "could not reach the projectile unit")
                view = try engine.view()
            }
            try require(view.activeStack?.name == creature.name, "the projectile unit did not become active")
            return (engine, view)
        }

        let (ranged, before) = try start(cannon)
        let enemyIDs = try [screen.anchor, rear.anchor].map { anchor in
            try before.stacks.first { $0.anchor == anchor }.unwrap("missing target along the line").id
        }
        let aim = CGPoint(x: 10.9, y: 8.55)
        let ray = try ranged.previewThrough(aim).unwrap("Through Shot did not offer an empty-tile ray")
        try require(before.canAimThrough == true && before.moves.isEmpty && ray.valid && ray.hits.map(\.target) == enemyIDs &&
                    abs(ray.end.x - 16) < 0.01, "the free ray missed a screened stack or stopped before the board edge")
        try require(ranged.previewThrough(CGPoint(x: -1, y: 0)) == nil && !ranged.fireThrough(CGPoint(x: -1, y: 0)),
                    "Through Shot accepted a pointer outside the grid")
        try require(ranged.fireThrough(aim), "the previewed Through Shot was refused")
        let shot = try ranged.view().moments.first { $0.kind == .shot }.unwrap("the free shot was not recorded")
        try require(shot.projectileEnd == ray.end && shot.target == enemyIDs[0], "the free shot changed its previewed ray")

        let (doubleShot, screened) = try start(elf)
        let rearID = try screened.stacks.first { $0.anchor == rear.anchor }.unwrap("missing the screened shot target").id
        let frontID = try screened.stacks.first { $0.anchor == screen.anchor }.unwrap("missing the intercepting stack").id
        let edge = try screened.attackOptions.first { $0.target == rearID }?.angles.first
            .unwrap("Double Shot could not aim past the screen")
        try require(edge?.range?.primary == frontID && edge?.range?.clean == false, "the shot preview missed the intercepting stack")
        try require(edge.map { doubleShot.attack(rearID, from: $0) } == true, "the previewed screened shot was refused")
        let interception = try doubleShot.view().moments.first { $0.kind == .shot }.unwrap("the screened shot was not recorded")
        try require(interception.target == frontID && interception.projectileEnd?.x == CGFloat(screen.x),
                    "the first volley flew past its previewed interceptor")

        let (_, gazeTurn) = try start(medusa)
        let gazeHit = try gazeTurn.attackOptions.flatMap(\.angles).compactMap { $0.range?.hit }.first
            .unwrap("Medusa did not project her shot")
        let gaze = try gazeHit.gaze.unwrap("Medusa's shot omitted the Petrifying Gaze forecast")
        try require(gaze.min == gazeHit.min && gaze.max == gazeHit.max && gaze.procChance > 0 &&
                    gaze.percentageMax > 0 && !gaze.multipleHits && !gaze.immune,
                    "Petrifying Gaze did not use the first shot's damage and the target's resistance")

        let (magic, casting) = try start(mage)
        let fire = try casting.spells.first { $0.name == "Fire Strike" && $0.available }.unwrap("missing an available Fire Strike")
        try require(magic.chooseSpell(fire.id), "Fire Strike could not be armed")
        let armed = try magic.view()
        let aimed = try armed.stacks.first { $0.anchor == rear.anchor }.unwrap("missing aimed caster victim")
        let blocker = try armed.stacks.first { $0.anchor == screen.anchor }.unwrap("missing screening victim")
        let spell = try armed.spellTargets?.first { $0.target == aimed.id }.unwrap("the screened spell was not aimable")
        try require(spell?.end != nil && spell?.primary == blocker.id && spell?.damage ?? 0 > 0,
                    "the spell preview missed the intercepting stack")
        try require(magic.choose(rear.anchor), "the previewed intercepted spell was refused")
        let landed = try magic.view()
        let cast = try landed.moments.first { $0.kind == .spell }.unwrap("the spell was not recorded")
        try require(cast.target == blocker.id && cast.projectileEnd == spell?.end && cast.hurt?.contains(blocker.id) == true,
                    "spell release and hover identified different victims")
        let timing = BattlePlayback(moments: landed.moments, previous: armed, next: landed)
        let delivery = try (timing.actions.first?.damageCast).unwrap("Fire Strike lost its cast sequence")
        try require(delivery.release.map { $0 > delivery.start && $0 < delivery.impact } == true &&
                    timing.reactions[blocker.id]?.first?.start == delivery.impact, "Fire Strike damaged the target before its projectile arrived")

        let neighbor = SandboxStack(creature: peasant.id, team: .opponent, amount: peasant.amount, x: 12, y: 9)
        let (blast, beforeBlast) = try start(fireballMage, extra: [neighbor])
        let fireball = try beforeBlast.spells.first { $0.name == "Fireball" && $0.available }.unwrap("missing an available Fireball")
        try require(blast.chooseSpell(fireball.id), "Fireball could not be armed")
        let armedBlast = try blast.view()
        let blastTarget = try armedBlast.stacks.first { $0.anchor == rear.anchor }.unwrap("missing Fireball's aim target")
        let splashTarget = try armedBlast.stacks.first { $0.anchor == neighbor.anchor }.unwrap("missing Fireball's splash target")
        let blastAim = armedBlast.spellTargets?.first { $0.target == blastTarget.id }
        try require(blastAim?.splash == screen.anchor && blastAim?.secondary.contains { $0.target == splashTarget.id && $0.damage > 0 } == true,
                    "the Fireball preview missed a stack next to the intercepted impact")
        try require(blast.choose(rear.anchor) && (try blast.view()).moments.contains { $0.hurt?.contains(splashTarget.id) == true },
                    "the Fireball blast failed to hit its previewed splash target")
    }

    static func distance(from: [Cell], to: [Cell]) -> Int {
        from.flatMap { origin in
            to.map { target in Int(max(abs(origin.x - target.x), abs(origin.y - target.y))) }
        }.min() ?? .max
    }

    static func require(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        if try !condition() { throw EngineError(message: message) }
    }
}

extension Optional {
    func unwrap(_ message: String) throws -> Wrapped {
        guard let self else { throw EngineError(message: message) }
        return self
    }
}
