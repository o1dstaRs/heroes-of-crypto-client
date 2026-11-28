import Foundation
import JavaScriptCore

extension SkirmishSmoke {
    @MainActor
    static func checkStatusEffects(_ setup: SandboxSetup, resources: URL) throws {
        let art = try BattleStatusEffects.load(resources.appendingPathComponent("status-effects.json"))
        try require(art.duration == 1.30 && art.appearanceSpeed == 1.25 && !art.passive.contains("Stun") &&
                    art.passive.contains("Pegasus Light"), "status timing or passive filtering drifted from web")
        for level in 1...3 {
            let cut = try art.clips["Deep Wounds \(level)"].unwrap("missing the Deep Wounds atlas")
            try require(cut.style == .cut && cut.restarts == true && cut.fades != true &&
                        cut.sample(at: 0, appearanceSpeed: art.appearanceSpeed, reducedMotion: false)?.frame == 0,
                        "Deep Wounds must restart on contact and use the atlas fade")
        }
        let result = try art.floatingResult.unwrap("missing the browser's combat result presentation")
        let worldScale = CGSize(width: 1, height: 1)
        try require(result.duration == 0.65 && result.opacity(at: 0) == 0 && result.opacity(at: 0.08125) == 1 &&
                    result.opacity(at: 0.403) == 1 && abs(result.opacity(at: 0.5265) - 0.5) < 0.0001 &&
                    result.opacity(at: 0.65) == 0, "damage and kill counts lost the web fade")
        try require(result.offset(for: 0, casualties: 0, flagX: 512, boardWidth: 1024, scale: worldScale) ==
                    CGPoint(x: 0, y: -42) &&
                    result.offset(for: 1, casualties: 10, flagX: 512, boardWidth: 1024, scale: worldScale) ==
                    CGPoint(x: -160, y: -86) &&
                    result.offset(for: 1, casualties: 10, flagX: 40, boardWidth: 1024, scale: worldScale) ==
                    CGPoint(x: 160, y: -86), "damage results lost the web flag gaps or inward columns")
        try require(art.clips["Mass Riot"]?.resource == art.clips["Riot"]?.resource &&
                    art.clips["Mass Magic Mirror"]?.resource == art.clips["Magic Mirror"]?.resource,
                    "mass casts lost the single-target art they share on web")
        let blessing = try art.clips["Blessing"].unwrap("missing the web Blessing atlas")
        let spiritualArmor = try art.clips["Spiritual Armor"].unwrap("missing the web Spiritual Armor atlas")
        let speed = art.appearanceSpeed
        try require(blessing.resource != spiritualArmor.resource && blessing.restarts == true && spiritualArmor.fades == true &&
                    blessing.sample(at: 0.10, appearanceSpeed: speed, reducedMotion: false)?.frame !=
                    blessing.sample(at: 0.55, appearanceSpeed: speed, reducedMotion: false)?.frame &&
                    blessing.sample(at: 1, appearanceSpeed: speed, reducedMotion: false) == nil,
                    "authored buffs did not advance their own cels and expire")
        try require(spiritualArmor.sample(at: 0.10, appearanceSpeed: speed, reducedMotion: true)?.frame ==
                    spiritualArmor.sample(at: 0.75, appearanceSpeed: speed, reducedMotion: true)?.frame &&
                    art.clips["Quagmire"]?.registration?.count == 16 && art.icons["Morale"] == "morale_256",
                    "reduced-motion, Beholder registration, or morale art is missing")
        if Bundle.main.url(forResource: "animations", withExtension: "json") != nil {
            for clip in art.clips.values {
                let frame = try clip.sample(at: 0.49, appearanceSpeed: speed, reducedMotion: false).unwrap("missing a status cel")
                try require(BattlefieldAtlas.frame(clip.resource, columns: clip.cols, rows: clip.rows, index: frame.frame,
                                                   maxDimension: clip.pixelLimit) != nil,
                            "the status atlas \(clip.resource) could not be drawn offline")
            }
        }

        func encounter(_ name: String, enemy: String = "Squire", enemyAmount: Int? = nil) throws -> (NativeBattle, BattleView) {
            let actor = try setup.creatures.first { $0.name == name }.unwrap("missing \(name)")
            let squire = try setup.creatures.first { $0.name == "Squire" }.unwrap("missing allied target")
            let hostile = try setup.creatures.first { $0.name == enemy }.unwrap("missing \(enemy)")
            let battle = try setup.makeBattle(map: .normal, stacks: [
                SandboxStack(creature: actor.id, team: .player, amount: actor.amount, x: 3, y: 7),
                SandboxStack(creature: squire.id, team: .player, amount: squire.amount, x: 3, y: 9),
                SandboxStack(creature: hostile.id, team: .opponent, amount: enemyAmount ?? hostile.amount, x: 13, y: 7),
            ], automated: [], resources: resources)
            try require(battle.ready(), "could not start the \(name) status fixture")
            var view = try battle.view()
            for _ in 0..<10 where view.activeStack?.name != name {
                try require(battle.perform(.endTurn), "could not reach \(name)'s turn")
                view = try battle.view()
            }
            try require(view.activeStack?.name == name, "wrong stack active in the \(name) fixture")
            return (battle, view)
        }

        for (caster, name, cell, expectedKind) in [
            ("Healer", "Spiritual Armor", Cell(x: 3, y: 9), StackStatus.Kind.buff),
            ("Wandering Mage", "Fireforged Sword", Cell(x: 3, y: 9), .buff),
            ("Wandering Mage", "Misfortune", Cell(x: 13, y: 7), .debuff),
        ] {
            let (battle, before) = try encounter(caster)
            let spell = try before.spells.first { $0.name == name && $0.available }.unwrap("missing \(name)")
            try require(battle.chooseSpell(spell.id), "could not arm \(name)")
            let armed = try battle.view()
            let recipient = try armed.stacks.first { $0.anchor == cell }.unwrap("missing the \(name) recipient")
            try require(battle.choose(cell), "the engine refused the \(name) cast")
            let cast = try battle.view()
            let timeline = BattlePlayback(moments: cast.moments, previous: armed, next: cast, replay: true)
            let cue = try timeline.combatCues.first { $0.statusName == name }.unwrap("no \(name) cue for the landed cast")
            guard case .status(name, expectedKind) = cue.kind else { throw EngineError(message: "wrong \(name) cue") }
            let action = try timeline.actions.first.unwrap("missing \(name) cast")
            try require(cue.stack.id == recipient.id && cue.started == timeline.started.addingTimeInterval(action.impact) &&
                        cue.statusClip?.resource == art.clips[name]?.resource &&
                        timeline.statusTints(at: cue.started.addingTimeInterval(-0.005))[recipient.id] == nil &&
                        timeline.statusTints(at: cue.started.addingTimeInterval(0.25))[recipient.id] ==
                            BattleStatusEffects.washTint(kind: expectedKind, age: 0.25),
                        "\(name) was out of sync with the recipient, sprite flash, or action")
            let next = BattlePlayback(previous: cast, next: cast, priorCombatCues: timeline.combatCues)
            try require(next.combatCues.contains { $0.statusName == name && $0.started == cue.started } &&
                        BattlePlayback(priorCombatCues: next.combatCues).combatCues.isEmpty,
                        "\(name) was dropped during turn handoff or survived a reset")
        }

        let (beholder, targetTime) = try encounter("Beholder", enemy: "Squire", enemyAmount: 225)
        let defender = try targetTime.stacks.first { $0.team == .opponent }.unwrap("no damage result target")
        let hitTime = Date()
        let firstHit = BattleCombatCue(stack: defender, position: BattlefieldProjection.logicalCenter(defender.cells),
                                       kind: .health(delta: -140, casualties: 15), started: hitTime)
        let secondHit = BattleCombatCue(stack: defender, position: firstHit.position,
                                        kind: .health(delta: -23.25, casualties: 0), started: hitTime.addingTimeInterval(0.3))
        let fight = BattlePlayback(previous: targetTime, next: targetTime, priorCombatCues: [firstHit, secondHit])
        let handoff = BattlePlayback(previous: targetTime, next: targetTime, priorCombatCues: [fight.combatCues[1]])
        try require(fight.combatCues.map(\.resultLane) == [0, 1] && handoff.combatCues.first?.resultLane == 1 &&
                    abs(fight.combatCues[0].endsAt.timeIntervalSince(hitTime) - result.duration) < 0.0001,
                    "a later hit skipped a column or moved during turn handoff")
        let target = Cell(x: 13, y: 7)
        var shot = targetTime
        var sawSpit = false
        for _ in 0..<5 {
            for _ in 0..<8 where shot.activeStack?.name != "Beholder" {
                try require(beholder.perform(.endTurn), "could not continue the Beholder fixture")
                shot = try beholder.view()
            }
            try require(beholder.choose(target), "Beholder could not hit the test target")
            let result = try beholder.view()
            let playback = BattlePlayback(moments: result.moments, previous: shot, next: result)
            let debuffs = playback.combatCues.filter { $0.statusClip?.style == .beholder }
            if !debuffs.isEmpty {
                let victim = try result.stacks.first { $0.anchor == target }.unwrap("the Spit Ball fixture's target died")
                let contact = playback.started.addingTimeInterval(playback.impactTime(for: victim))
                try require(debuffs.allSatisfy { $0.stack.id == victim.id && $0.started == contact } &&
                            Set(debuffs.compactMap(\.statusName)).count == debuffs.count,
                            "Spit Ball split or duplicated its recipient's impact row")
                sawSpit = true
                break
            }
            shot = result
        }
        try require(sawSpit, "the Beholder fixture never applied an authored debuff")

        let (fireMage, caster) = try encounter("Battle Mage", enemy: "Hydra")
        let fire = try caster.spells.first { $0.name == "Fire Strike" && $0.available }.unwrap("missing Fire Strike")
        try require(fireMage.chooseSpell(fire.id), "could not arm Fire Strike against Ember Covenant")
        let armedFire = try fireMage.view()
        let hydra = try armedFire.stacks.first { $0.name == "Hydra" }.unwrap("missing the Ember Covenant holder")
        try require(hydra.hasEmberCovenant && fireMage.choose(target), "the initial protection was missing")
        let absorbed = try fireMage.view()
        let flare = BattlePlayback(moments: absorbed.moments, previous: armedFire, next: absorbed)
        try require(absorbed.stacks.first { $0.id == hydra.id }?.hasEmberCovenant == true &&
                    absorbed.moments.first?.covenantAbsorbs == [hydra.id] &&
                    flare.covenantAbsorbs[hydra.id] == flare.started.addingTimeInterval(flare.impactTime(for: hydra)) &&
                    flare.covenantBreaks.isEmpty, "Fire Strike did not flash the intact Covenant at contact")
        let (archer, ranged) = try encounter("Arbalester", enemy: "Hydra")
        let shielded = try ranged.stacks.first { $0.name == "Hydra" }.unwrap("missing the physical Covenant target")
        try require(archer.choose(target), "Arbalester could not strike the Covenant target")
        let spent = try archer.view()
        let shatter = BattlePlayback(moments: spent.moments, previous: ranged, next: spent)
        try require(spent.stacks.first { $0.id == shielded.id }?.hasEmberCovenant == false &&
                    shatter.covenantBreaks[shielded.id] == shatter.started.addingTimeInterval(shatter.impactTime(for: shielded)),
                    "a blocked physical shot did not break the Covenant at impact")

        let js = try JSContext().unwrap("the status renderer had no JavaScript context")
        js.evaluateScript(try String(contentsOf: resources.appendingPathComponent("damage-spells.js"), encoding: .utf8))
        let starResult = js.evaluateScript("""
            const stars = hocSpellEffects.drawStunStars;
            const stack = [{id: 1, x: 81, y: 109}];
            stars(0, 50, stack).length === 0 && stars(180, 50, stack).length > 0 &&
              String(stars(320, 50, stack)) !== String(stars(480, 50, stack)) && stars(500, 50, []).length === 0;
            """)?.toBool()
        try require(starResult == true, "the shared Stun orbit did not animate or clear")
    }
}
