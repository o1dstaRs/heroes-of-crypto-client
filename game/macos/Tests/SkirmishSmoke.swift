import CoreGraphics
import Foundation
import ImageIO

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
        try checkLoadouts(setup, stacks: fixtureStacks, resources: resources)
        try checkInspectionDescriptions(opening.stacks)
        try checkCounterattacks(setup, resources: resources)
        try checkGargantuanSplash(setup, resources: resources)
        try checkTurnClock()
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            try checkBattleMageIdle(resources)
            try checkAnimationFrames(opening.stacks)
            try checkIdleRoster(setup.creatures)
            try checkBoardFraming(opening.stacks, artwork: artwork)
            try checkProjectileAssets(url.deletingLastPathComponent())
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
        try require(try battle.view().stacks.first { $0.id == squire.id }?.cells == [destination], "deployment did not move the stack")
        try require(try battle.view().moments.last?.kind == .place, "placement did not produce a presentation event")
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
        try checkWaterShield(setup, resources: resources)
        try checkRangedMovement(data)
        try checkAttackAngles(data, artwork: artwork, resources: url.deletingLastPathComponent())
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

        try require(sandbox.choose(aim), "the preview offered a throw the engine rejected")
        let after = try sandbox.view()
        let throwMoment = try after.moments.first(where: { $0.kind == .shot }).unwrap("the throw emitted no projectile")
        try require(throwMoment.actor == attacker.id && throwMoment.aim == aim && throwMoment.splash == area.splash,
                    "the impact disagreed with the area preview")
        let nearbyIDs = Set(before.stacks.filter { $0.team == .opponent && $0.cells.contains(where: cells.contains) }.map(\.id))
        let hurtIDs = Set(throwMoment.healthChanges?.filter { $0.delta < 0 }.map(\.target) ?? [])
        try require(nearbyIDs == hurtIDs, "the 3 × 3 blast missed a nearby stack or hit an outside stack")
        let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
        let shot = try playback.actions.first(where: { $0.moment == throwMoment }).unwrap("missing the rendered throw")
        try require(shot.target == BattlefieldProjection.logicalCenter([center]) && shot.release.map { $0 < shot.impact } == true,
                    "the stone did not fly to the actual blast center")
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            let impact = try shot.projectile?.impact.unwrap("missing the stone-impact effect")
            let first = impact?.image(at: 0, inBackground: false).flatMap(framePixels)
            let later = impact?.image(at: 0.12, inBackground: false).flatMap(framePixels)
            try require(first != nil && later != nil && first != later && playback.duration >= shot.impact + 0.25,
                        "the stone impact lost its animation or was cut off early")
        }
    }

    @MainActor
    private static func checkCounterattacks(_ setup: SandboxSetup, resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        let placement = SandboxAugment.placement.rawValue
        let loadout = SandboxLoadout(augments: [placement: configurator.options.augmentLevels[placement, default: 0]])
        for (creature, ranged) in [("Squire", false), ("Arbalester", true)] {
            let species = try setup.creatures.first { $0.name == creature }.unwrap("missing \(creature)")
            let stacks = [SandboxStack(creature: species.id, team: .player, amount: 70, x: 5, y: 8),
                          SandboxStack(creature: species.id, team: .opponent, amount: 70, x: 10, y: 8)]
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
            }
            let defender = try next.stacks.first { $0.id == target.id }.unwrap("the responder did not survive the test")
            let flag = playback.flagStatus(for: defender, elapsed: reply.start + 0.01,
                                           now: playback.started.addingTimeInterval(reply.start + 0.01), reducedMotion: false)
            try require(flag.responded && !flag.immobilized, "the responder’s stack flag was missing its swords")
        }
    }

    @MainActor
    private static func checkSampleArmies(_ setup: SandboxSetup, using configurator: SandboxLoadoutEngine) throws {
        let full = SandboxLoadout(augments: ["Armor": 3, "Might": 3, "Empower": 1], synergies: ["Life": 2], tier1: 11)
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
            let (battle, previews) = try configurator.prepare(map: map, stacks: planned, catalogue: setup.creatures,
                                                               loadouts: loadouts, automated: [], boardSeed: seed)
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
        try require(clock.extend(&opening, remainingStacks: 6) && opening.limit == 80 &&
                    !clock.extend(&opening, remainingStacks: 6), "the clock did not limit extra time to once per lap")
        clock.finish(opening, at: now + .seconds(65))
        let next = clock.begin(.init(unit: 2, team: .player, lap: 1), remainingStacks: 5, at: now + .seconds(65))
        try require(next.limit == 35, "the prior turn was not charged against the team")
        let other = clock.begin(.init(unit: 3, team: .opponent, lap: 1), remainingStacks: 2, at: now)
        try require(other.limit == 60, "the other team should have its own clock budget")
        var newLap = clock.begin(.init(unit: 1, team: .player, lap: 2), remainingStacks: 6, at: now)
        try require(newLap.limit == 40 && clock.extend(&newLap, remainingStacks: 6), "the new lap did not reset its budget")
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
        for creature in setup.creatures {
            let row = SandboxStack(creature: creature.id, team: .opponent, amount: creature.amount, x: 13, y: 8)
            do {
                let sandbox = try setup.makeBattle(map: .normal, stacks: [row], automated: [], resources: resources)
                let view = try sandbox.view()
                let stack = try view.stacks.first.unwrap("missing catalogue stack")
                try require(stack.name == creature.name && stack.team == .opponent && stack.amount == creature.amount &&
                            stack.cells.count == Int(creature.width * creature.height), "lost creature stats")
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
        try require(battle.stacks.contains(stack) && sandbox.choose(anchor), "tall stack could not be placed by its lower cell")
        battle = try sandbox.view()
        try require(battle.stacks.first { $0.id == stack.id }?.cells == shape.cells(at: anchor),
                    "deployment changed the tall footprint")
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
        let first = try CreatureAnimation.frame("Nightmare", pose: CreaturePose(action: .idle, time: 0)).unwrap("missing Nightmare's idle body")
        let later = try CreatureAnimation.frame("Nightmare", pose: CreaturePose(action: .idle, time: 0.4)).unwrap("lost Nightmare's idle body")
        try require(first.index == 0 && later.index == 0 && framePixels(first.image) == framePixels(later.image),
                    "Nightmare must animate its flames over the registered standing body")
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
        let corrected = try CreatureAnimation.frame("Leprechaun", pose: CreaturePose(action: .idle, time: 0))
            .flatMap { framePixels($0.image) }.unwrap("missing corrected Leprechaun pixels")
        let cloth = stride(from: 0, to: raw.count, by: 4).filter { i in
            raw[i + 3] >= 220 && raw[i + 1] > raw[i] && Int(raw[i + 1]) > Int(raw[i + 2]) + 12
        }
        let gain = cloth.reduce(0) { $0 + Int(corrected[$1 + 1]) - Int(raw[$1 + 1]) }
        try require(cloth.count > 12 && gain / cloth.count > 10, "Leprechaun’s cloth stayed as dark as the ungraded sheet")
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
        try require(battle.prepare(blessing.id), "could not arm Blessing")
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
        let above = try aim(x: 12.15, y: 8.85, in: view)
        let below = try aim(x: 12.15, y: 8.15, in: view)
        try require(above.target == below.target && above.angle.cell == Cell(x: 11, y: 9) && below.angle.cell == Cell(x: 11, y: 7),
                    "two corners on the same enemy did not choose their corresponding diagonal landings")
        try require(SandboxCursorMode.resolve(at: above.targetCell, aim: above, in: view) == .melee(.downRight) &&
                    SandboxCursorMode.resolve(at: below.targetCell, aim: below, in: view) == .melee(.upRight),
                    "the sword cursor did not follow the chosen approaches")
        try require(SandboxCursorMode.resolve(at: above.targetCell, aim: above, in: view, animating: true) == .standard,
                    "the attack cursor persisted during playback")
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
        let target = try shooter.attackOptions.first { $0.angles.count > 1 }.unwrap("ranged target did not offer distinct edges")
        let edge = target.angles[1]
        let side = try edge.side.unwrap("ranged option had no edge")
        let end = side.point(on: edge.cell)
        let center = BattlefieldProjection.logicalCenter([edge.cell])
        let preview = try aim(x: end.x * 0.9 + center.x * 0.1, y: end.y * 0.9 + center.y * 0.1, in: shooter)
        try require(SandboxCursorMode.resolve(at: edge.cell, aim: preview, in: shooter) == .ranged,
                    "a legal shot missed the ranged cursor")
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

    static func distance(from: [Cell], to: [Cell]) -> Int {
        from.flatMap { origin in
            to.map { target in Int(max(abs(origin.x - target.x), abs(origin.y - target.y))) }
        }.min() ?? .max
    }

    static func require(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        if try !condition() { throw EngineError(message: message) }
    }
}

private extension Optional {
    func unwrap(_ message: String) throws -> Wrapped {
        guard let self else { throw EngineError(message: message) }
        return self
    }
}
