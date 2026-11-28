import Foundation

extension SkirmishSmoke {
    @MainActor
    static func checkBattleLog(_ setup: SandboxSetup, resources: URL) throws {
        let configurator = try SandboxLoadoutEngine(resources: resources)
        func stack(_ name: String, _ team: Team, _ amount: Int, _ x: Int32, _ y: Int32) throws -> SandboxStack {
            let creature = try setup.creatures.first { $0.name == name }.unwrap("missing battle log fixture: \(name)")
            return SandboxStack(creature: creature.id, team: team, amount: amount, x: x, y: y)
        }
        func start(_ row: [SandboxStack], automated: Set<Team>) throws -> NativeBattle {
            let (battle, _) = try configurator.prepare(map: .normal, stacks: row, catalogue: setup.creatures,
                                                       loadouts: [:], automated: automated)
            configurator.beginBattleLog(stacks: try battle.view().stacks)
            try require(battle.ready(), "could not start the battle log fixture")
            return battle
        }
        func lines(_ battle: NativeBattle, action: String) throws -> [String] {
            try configurator.battleLog(for: battle, steps: battle.logSteps())
                .unwrap("web narration failed to verify after \(action)")
        }

        let battle = try start([
            stack("Healer", .player, 12, 3, 7), stack("Arbalester", .player, 22, 3, 9),
            stack("Squire", .opponent, 27, 13, 7), stack("Battle Mage", .opponent, 8, 13, 9),
        ], automated: [.opponent])
        var history = try lines(battle, action: "starting the fight")
        try require(history.first == "Fight started!" && history.contains("🟢 Healer spawned at (3, 7)") &&
                    history.contains("⌖ 🟢 Healer — Lap 1"), "the log lost deployment or the opening turn header")

        for _ in 0..<28 {
            let current = try battle.view()
            if current.winner != nil { break }
            if current.opponentTurn {
                try require(battle.playOpponent(), "battle log fixture could not play the AI turn")
            } else if current.activeStack?.name == "Healer",
                      let blessing = current.spells.first(where: { $0.name == "Blessing" && $0.available }) {
                try require(battle.chooseSpell(blessing.id), "could not arm Blessing")
                try require(try lines(battle, action: "arming Blessing").isEmpty, "arming a spell recorded it as cast")
                let target = try battle.view().spellCells.first.unwrap("no target for Blessing")
                try require(battle.choose(target), "could not cast Blessing")
            } else if let target = current.attackOptions.first, let angle = target.angles.first,
                      battle.attack(target.target, from: angle) {
                // The chosen attack was accepted.
            } else {
                try require(battle.perform(.defend), "could not defend in the battle log fixture")
            }
            history += try lines(battle, action: "a mixed manual and AI turn")
        }
        try require(history.count > 32 &&
                    history.contains("🟢 Healer cast Blessing on Arbalester for 3 laps") &&
                    history.contains(where: { $0.hasPrefix("🔴 Squire moved to(") }) &&
                    history.contains(where: { $0.hasPrefix("🔴 Battle Mage 🔥 Arbalester (") }) &&
                    history.contains(where: { $0.hasPrefix("🟢 Healer resp Squire (") && $0.contains("💀") }) &&
                    history.contains("Map narrowed"),
                    "the log lost spell, AI movement, damage, retaliation, casualties, or map entries")

        let smoke = try start([
            stack("Wandering Mage", .player, 120, 3, 7), stack("Squire", .opponent, 25, 13, 7),
        ], automated: [])
        _ = try lines(smoke, action: "starting the Smoke fixture")
        for _ in 0..<4 where try smoke.view().activeStack?.name != "Wandering Mage" {
            try require(smoke.perform(.endTurn), "could not reach the Smoke caster")
            _ = try lines(smoke, action: "passing a turn")
        }
        let card = try smoke.view().spells.first { $0.name == "Smoke" && $0.available }.unwrap("missing Smoke")
        try require(smoke.chooseSpell(card.id), "could not arm Smoke")
        _ = try lines(smoke, action: "arming Smoke")
        let aim = try smoke.view().spellCells.first.unwrap("no legal Smoke cell")
        try require(smoke.choose(aim), "could not cast Smoke")
        let tiles = try smoke.view().smokeTiles ?? []
        let footprint = (-1...1).flatMap { dx in (-1...1).map { dy in Cell(x: aim.x + Int32(dx), y: aim.y + Int32(dy)) } }
        try require(tiles.map(\.cell) == footprint && tiles.allSatisfy { $0.laps > 0 },
                    "the native view lost Smoke's nine authoritative tiles or their lifespan")
        let smokeLog = try lines(smoke, action: "casting Smoke")
        try require(smokeLog.filter { $0 == "🟢 Wandering Mage cast Smoke" }.count == 1,
                    "the accepted Smoke event did not appear exactly once")
    }
}
