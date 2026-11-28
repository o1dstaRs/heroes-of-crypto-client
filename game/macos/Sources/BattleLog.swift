import Foundation

/// Confirmed outcomes available directly from the native engine if a narration batch cannot be verified.
enum BattleLog {
    struct Journal: Decodable {
        struct Step: Decodable {
            struct Event: Decodable {
                let kind: String
                let arg: Int
            }
            let kind: String
            let lap: Int
            let events: [Event]
        }
        let steps: [Step]
    }

    static let limit = 5_000
    static func flag(_ team: Team?) -> String {
        switch team {
        case .player: "🟢"
        case .opponent: "🔴"
        default: ""
        }
    }

    static func line(_ text: String, team: Team?) -> String {
        let mark = flag(team)
        return mark.isEmpty ? text : "\(mark) \(text)"
    }

    static func heading(_ stack: Stack, lap: Int) -> String {
        "⌖ \(line("\(stack.name) — Lap \(lap)", team: stack.team))"
    }

    static func fallback(previous: BattleView, next: BattleView, journal: Journal?) -> [String] {
        var lines: [String] = []
        var stacks = Dictionary(uniqueKeysWithValues: previous.stacks.map { ($0.id, $0) })
        for stack in next.stacks { stacks[stack.id] = stack }
        func add(_ stack: Stack, _ detail: String) { lines.append(line("\(stack.name) \(detail)", team: stack.team)) }
        func point(_ cell: Cell) -> String { "(\(cell.x), \(cell.y))" }
        func damage(_ value: Double) -> String { value.formatted(.number.grouping(.never).precision(.fractionLength(0...2))) }
        func strike(_ actor: Stack, target: Stack, icon: String, amount: Double, killed: Int, response: Bool = false) {
            let deaths = killed > 0 ? " 💀 \(killed)" : ""
            add(actor, "\(response ? "resp " : "")\(icon) \(target.name) (\(damage(abs(amount))))\(deaths)")
        }

        if !previous.started && next.started {
            lines.append("Fight started!")
            for stack in next.stacks {
                if let anchor = stack.anchor { add(stack, "spawned at \(point(anchor))") }
            }
        }
        var reportedDestroyed = Set<Int>()
        for moment in next.moments.flatMap(\.playbackMoments) {
            guard let actor = stacks[moment.actor] else { continue }
            let target = moment.target.flatMap { stacks[$0] }
            var changes = moment.healthChanges ?? []
            if let destination = moment.route.last {
                add(actor, "moved to \(point(destination))")
            }
            switch moment.kind {
            case .melee, .shot:
                let icon = moment.kind == .shot ? "🏹" : "⚔️"
                if let target {
                    let hit = changes.first { $0.target == target.id }
                    strike(actor, target: target, icon: icon, amount: hit?.delta ?? 0, killed: hit?.casualties ?? 0)
                    changes.removeAll { $0.target == target.id }
                }
                if let reply = moment.counterattack, let responder = stacks[reply.actor], let victim = stacks[reply.target] {
                    let hit = changes.first { $0.target == victim.id }
                    strike(responder, target: victim, icon: icon, amount: hit?.delta ?? 0, killed: hit?.casualties ?? 0, response: true)
                    changes.removeAll { $0.target == victim.id }
                }
                for hit in changes where hit.delta < 0 {
                    if let victim = stacks[hit.target] { strike(actor, target: victim, icon: icon, amount: hit.delta, killed: hit.casualties) }
                }
                changes.removeAll { $0.delta < 0 }
            case .spell:
                if let spell = moment.spell {
                    let aim = target.map { " on \($0.name)" } ?? moment.aim.map { " at \(point($0))" } ?? ""
                    add(actor, "cast \(spell)\(aim)")
                }
            case .obstacle:
                add(actor, "hit mountain")
            case .wait:
                add(actor, "waits (hourglass)")
            case .defend:
                add(actor, "uses Luck Shield")
            case .place, .move, .endTurn: break
            }
            for hit in changes {
                guard let victim = stacks[hit.target], hit.delta != 0 else { continue }
                if hit.delta > 0 {
                    add(victim, "healed for \(damage(hit.delta))")
                } else {
                    let source = moment.mirrorSources?.isEmpty == false && hit.target == actor.id ? " from Magic Reflection" :
                        moment.crossedFire?.isEmpty == false && hit.target == actor.id ? " from Fire Wall" : ""
                    let deaths = hit.casualties > 0 ? " 💀 \(hit.casualties)" : ""
                    add(victim, "takes \(damage(hit.delta.magnitude)) damage\(source)\(deaths)")
                }
            }
            for entry in moment.statusApplications ?? [] {
                guard let unit = stacks[entry.target], !BattleStatusEffects.isPassive(entry.name) else { continue }
                if let source = entry.borrowedFrom.flatMap({ stacks[$0] }) {
                    add(unit, "copied \(entry.name) from \(source.name)")
                } else if moment.kind != .spell || entry.name != moment.spell || entry.target != moment.target {
                    let verb = entry.kind == .buff ? "gains" : entry.kind == .debuff ? "suffers" : "got"
                    let duration = entry.laps.flatMap { laps -> String? in
                        guard laps > 0, laps < 15 else { return nil }
                        return " for \(damage(laps)) \(laps == 1 ? "lap" : "laps")"
                    } ?? ""
                    add(unit, "\(verb) \(entry.name)\(duration)")
                }
            }
            for id in moment.waterShieldBreaks ?? [] {
                if let unit = stacks[id] { add(unit, "absorbed damage with Water Shield") }
            }
            for id in moment.covenantAbsorbs ?? [] {
                if let unit = stacks[id] { add(unit, "absorbed damage with Ember Covenant") }
            }
        }
        if previous.started {
            for stack in next.stacks where !previous.stacks.contains(where: { $0.id == stack.id }) {
                if let anchor = stack.anchor { add(stack, "spawned at \(point(anchor))") }
            }
        }
        var turn: (id: Int, lap: Int)? = previous.active.map { ($0, previous.lap) }
        for step in journal?.steps ?? [] {
            for event in step.events {
                guard let unit = stacks[event.arg] else { continue }
                switch event.kind {
                case "turn_completed":
                    if turn?.id == unit.id { turn = nil }
                case "next_unit_selected":
                    if turn?.id != unit.id || turn?.lap != step.lap {
                        lines.append(heading(unit, lap: step.lap))
                        turn = (unit.id, step.lap)
                    }
                case "unit_destroyed":
                    if reportedDestroyed.insert(unit.id).inserted { add(unit, "died") }
                case "unit_skipped":
                    add(unit, "skips turn")
                case "armageddon_applied":
                    add(unit, "was hit by Armageddon")
                default: break
                }
            }
        }
        for stack in previous.stacks where !next.stacks.contains(where: { $0.id == stack.id }) {
            if reportedDestroyed.insert(stack.id).inserted { add(stack, "died") }
        }
        if let active = next.activeStack, turn?.id != active.id || turn?.lap != next.lap {
            lines.append(heading(active, lap: next.lap))
        }
        if previous.winner == nil, let winner = next.winner {
            lines.append(winner == .draw ? "Draw" : "\(winner.title) wins")
        }
        return lines
    }
}
