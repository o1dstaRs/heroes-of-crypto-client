import Foundation
import JavaScriptCore

extension SkirmishSmoke {
    @MainActor
    static func checkDamageSpells(_ setup: SandboxSetup, resources: URL) throws {
        func required<T>(_ value: T?, _ description: String) throws -> T {
            guard let value else { throw EngineError(message: description) }
            return value
        }
        let centre = Cell(x: 13, y: 8)
        let side = Cell(x: 13, y: 9)
        let squire = try required(setup.creatures.first { $0.name == "Squire" }, "missing the spell target")
        let wolf = try required(setup.creatures.first { $0.name == "Wolf" }, "missing the rectangular spell target")
        let right = [SandboxStack(creature: squire.id, team: .opponent, amount: squire.amount, x: centre.x, y: centre.y),
                     SandboxStack(creature: wolf.id, team: .opponent, amount: wolf.amount, x: side.x, y: side.y)]

        func armed(_ spell: BattleDamageSpell, with name: String, enemies: [SandboxStack]) throws -> (NativeBattle, BattleView) {
            let caster = try required(setup.creatures.first { $0.name == name }, "missing \(name)")
            let stack = SandboxStack(creature: caster.id, team: .player, amount: caster.amount, x: 3, y: 8)
            let battle = try setup.makeBattle(map: .normal, stacks: [stack] + enemies, automated: [], resources: resources)
            try require(battle.ready(), "could not start the \(spell.rawValue) fixture")
            var view = try battle.view()
            for _ in 0..<8 where view.activeStack?.name != name {
                try require(battle.perform(.endTurn), "could not reach the \(spell.rawValue) caster")
                view = try battle.view()
            }
            let card = try required(view.spells.first { $0.name == spell.rawValue && $0.available }, "missing \(spell.rawValue)")
            try require(battle.chooseSpell(card.id), "could not arm \(spell.rawValue)")
            return (battle, try battle.view())
        }

        let (ring, preparedRing) = try armed(.ringOfFire, with: "Magic Dragon", enemies: right)
        let ringCentre = try required(preparedRing.stacks.first { $0.anchor == centre }, "missing the spared Ring of Fire target")
        let ringAim = try required(preparedRing.spellTargets?.first { $0.target == ringCentre.id }, "Ring of Fire had no legal aim")
        let neighbor = try required(preparedRing.stacks.first { $0.anchor == side }, "missing the Ring of Fire neighbor")
        try require(ringAim.spared && ringAim.damage == nil && ringAim.footprint?.count == 8 &&
                    ringAim.footprint?.contains(centre) == false && ringAim.secondary.map(\.target) == [neighbor.id],
                    "Ring of Fire targeted its spared centre or duplicated the Wolf")
        try require(SandboxCursorMode.resolve(at: nil, in: preparedRing, spellTarget: ringAim) == .magic &&
                    ring.choose(centre), "the painted spell target disagreed with the click")
        let afterRing = try ring.view()
        try require(afterRing.moments.first?.hurt == [neighbor.id], "Ring of Fire damaged someone outside its preview")

        let meteors: [(BattleDamageSpell, String, Cell, Int)] = [
            (.meteorShower, "Magic Dragon", centre, 3),
            (.meteorite, "Battle Mage", Cell(x: 12, y: 8), 2),
        ]
        for (spell, mage, anchor, width) in meteors {
            let (battle, before) = try armed(spell, with: mage, enemies: right)
            let aim = try required(before.meteorAims?.first { $0.anchor == anchor }, "missing \(spell.rawValue) footprint")
            let empty = Cell(x: 2, y: 3), edge = Cell(x: 15, y: 8)
            try require(aim.footprint.count == width * width && aim.hits.count == 2 && Set(aim.hits.map(\.target)).count == 2 &&
                        !before.spellCells.contains(empty) && !before.spellCells.contains(edge) && !battle.choose(empty),
                        "\(spell.rawValue) promised a clipped or empty drop, or counted one unit twice")
            try require(try battle.view() == before && battle.choose(anchor), "the legal meteor footprint did not commit")
            let after = try battle.view()
            let moment = try required(after.moments.first { $0.kind == .spell }, "the meteor cast was not recorded")
            try require(moment.spellArea == aim.footprint && Set(moment.hurt ?? []) == Set(aim.hits.map(\.target)),
                        "the meteor affected cells or creatures outside its preview")
            let playback = BattlePlayback(moments: after.moments, previous: before, next: after)
            try require(playback.actions.first?.damageCast?.area == aim.footprint &&
                        playback.actions.first?.damageCast?.spell == spell,
                        "the meteor animation lost its confirmed target geometry")
        }

        let screen = right[0]
        let rear = SandboxStack(creature: squire.id, team: .opponent, amount: squire.amount, x: 14, y: centre.y)
        let (lightning, lit) = try armed(.lightningStrike, with: "Magic Dragon", enemies: [screen, rear])
        let rearStack = try required(lit.stacks.first { $0.anchor == rear.anchor }, "missing screened Lightning Strike target")
        let bolt = try required(lit.spellTargets?.first { $0.target == rearStack.id }, "a creature blocked Lightning Strike")
        try require(bolt.primary == rearStack.id && lightning.choose(rear.anchor), "lightning struck the wrong creature")
        let struck = try lightning.view()
        let sequence = BattlePlayback(moments: struck.moments, previous: lit, next: struck)
        let arc = try required(sequence.actions.first?.damageCast, "Lightning Strike did not schedule its bolt")
        try require(arc.spell == .lightningStrike && arc.target?.id == rearStack.id && arc.impact > arc.start &&
                    sequence.reactions[rearStack.id]?.first?.start == arc.impact, "lightning damage and reaction missed the bolt")

        let dragon = try required(setup.creatures.first { $0.name == "Magic Dragon" }, "missing the mirror holder")
        let mirror = SandboxStack(creature: dragon.id, team: .opponent, amount: dragon.amount, x: centre.x, y: centre.y)
        let (reflect, beforeReflect) = try armed(.fireStrike, with: "Battle Mage", enemies: [mirror])
        let mirrorHolder = try required(beforeReflect.stacks.first { $0.team == .opponent }, "the mirror holder did not deploy")
        try require(reflect.choose(centre), "Fire Strike could not reach Magic Reflection")
        let reflected = try reflect.view()
        let reflection = BattlePlayback(moments: reflected.moments, previous: beforeReflect, next: reflected)
        try require(reflected.moments.first?.mirrorSources == [mirrorHolder.id] &&
                    reflection.combatCues.contains { $0.stack.id == beforeReflect.active && $0.damageTone == .reflection },
                    "Magic Reflection lost the source or the caster's returned damage")
        try checkSharedSpellEffects(resources)
    }

    @MainActor
    private static func checkSharedSpellEffects(_ resources: URL) throws {
        guard let js = JSContext() else { throw EngineError(message: "could not create the native renderer context") }
        js.evaluateScript(try String(contentsOf: resources.appendingPathComponent("damage-spells.js"), encoding: .utf8))
        js.evaluateScript("""
            globalThis.testSpellEffects = async () => {
                const fx = hocSpellEffects;
                const from = {x: 100, y: -310}, to = {x: 480, y: -300};
                const ground = {center: to, width: 44, height: 31};
                const area = {center: to, width: 132, height: 93};
                const casts = [
                    ["Fire Strike", 390], ["Fireball", 400], ["Lightning Strike", 65],
                    ["Ring of Fire", 285], ["Meteor Shower", 440], ["Meteorite", 440],
                ];
                for (const [kind, when] of casts) {
                    fx.clear();
                    await fx.begin({kind, start: 0, size: 44, from, to, ground, area, cells: [ground], flight: 490});
                    const frame = fx.render(when);
                    if (!frame.layers.some(layer => layer.commands.length > 0)) return kind;
                    if (fx.render(3500).layers.some(layer => layer.commands.length > 0)) return kind + ' did not expire';
                }
                fx.clear();
                fx.setWalls([{x: 3, y: 5, l: 2, world: {x: 192, y: -360, width: 42, height: 28}}], 44);
                fx.render(0);
                const walls = fx.render(320).layers;
                if (!walls.some(layer => layer.depth > 4000 && layer.depth < 5000 && layer.commands.length > 1000))
                    return 'Fire Wall failed to produce depth-sorted particles';
                fx.setWalls([], 44);
                if (fx.render(900).layers.some(layer => layer.commands.length > 0)) return 'Fire Wall did not expire';
                await fx.begin({kind: 'Fire Wall Crossing', start: 900, size: 44, flying: true, moveDuration: 0.5, actor: 7,
                    crossings: [{cell: {x: 3,y: 5}, center: {x: 192,y: -360}}]});
                if (fx.render(1200).layers.some(layer => layer.commands.length > 0)) return 'Fire Wall flared before landing';
                if (!fx.render(1450).layers.some(layer => layer.commands.length > 0)) return 'Fire Wall missed the landing';
                const afterburn = fx.render(1700, {7: {x: 400, y: -320}}).layers.flatMap(layer =>
                    Array.from(layer.commands).filter((_, index) => index % 17 === 9));
                if (!afterburn.includes(400)) return 'Fire Wall afterburn lost its moving stack';
                fx.setWalls([{x: 3, y: 5, l: 2, world: {x: 192, y: -360, depthY: -1140, width: 42, height: 28}}], 44, 8000);
                const first = fx.render(8000).layers.filter(layer => layer.wall);
                if (first.some(layer => layer.commands[1] > 0)) return 'an idle gap skipped Fire Wall ignition';
                const tall = fx.render(8320).layers.find(layer => layer.wall);
                if (!tall || tall.depth < 5000 || tall.commands.length < 1000) return 'Fire Wall lost unit depth on a tall board';
                return 'passed';
            };
            globalThis.testSpellEffects().then(result => { globalThis.spellResult = result; }, error => {
                globalThis.spellResult = String(error);
            });
            """)
        let result = js.evaluateScript("globalThis.spellResult")?.toString()
        try require(result == "passed", "the shared spell renderer failed: \(result ?? "no result")")
    }
}
