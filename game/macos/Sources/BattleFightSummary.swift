import Foundation

struct BattleFightSummary {
    struct Creature: Identifiable {
        let name: String
        let deployed: Int
        let lost: Int
        let damage: Double

        var id: String { name }
    }

    struct Army: Identifiable {
        let team: Team
        let creatures: [Creature]

        var id: Team { team }
        var deployed: Int { creatures.reduce(0) { $0 + $1.deployed } }
        var lost: Int { creatures.reduce(0) { $0 + $1.lost } }
        var casualties: [Creature] { creatures.filter { $0.lost > 0 }.sorted { $0.lost > $1.lost } }
    }

    struct Elimination: Equatable {
        let team: Team
        let name: String
    }

    struct Sample {
        let lap: Int
        let losses: [Team: Double]
        let eliminated: [Elimination]
    }

    private struct ArmyRoster {
        let team: Team
        let stacks: [Stack]

        var count: Int { stacks.reduce(0) { $0 + $1.amount } }

        func totals(in state: BattleView) -> [String: Int] {
            let live = Dictionary(uniqueKeysWithValues: state.stacks.map { ($0.id, $0) })
            var totals: [String: Int] = [:]
            for stack in stacks {
                let current = live[stack.id]
                let survivors = current?.team == team && current?.name == stack.name ? current?.amount ?? 0 : 0
                totals[stack.name, default: 0] += min(stack.amount, survivors)
            }
            return totals
        }
    }

    let winner: Team?
    let laps: Int
    let armies: [Army]
    let samples: [Sample]
    let maxDamage: Double

    init?(frames: [BattleView]) {
        guard let first = frames.first, let last = frames.last, last.winner != nil || last.stalled else { return nil }
        winner = last.winner
        laps = last.lap
        let teams = [Team.player, .opponent]
        let rosters = teams.map { team in ArmyRoster(team: team, stacks: first.stacks.filter { $0.team == team }) }
        armies = rosters.map { roster in
            let deployed = roster.totals(in: first)
            let survivors = roster.totals(in: last)
            let damage = Dictionary(grouping: last.damage.filter { $0.team == roster.team }, by: \.name)
            let names = Set(deployed.keys).union(damage.keys)
            let rows = names.sorted().map { name in
                let start = deployed[name, default: 0]
                return Creature(name: name, deployed: start, lost: start - survivors[name, default: 0],
                                damage: damage[name, default: []].reduce(0) { $0 + $1.amount })
            }
            return Army(team: roster.team, creatures: rows.sorted { $0.damage > $1.damage })
        }
        maxDamage = armies.flatMap(\.creatures).map(\.damage).max() ?? 0

        var previous: [Team: [String: Int]] = [:]
        var history: [Sample] = []
        for (index, frame) in frames.enumerated() {
            var losses: [Team: Double] = [:]
            var eliminated: [Elimination] = []
            for roster in rosters {
                let survivors = roster.totals(in: frame)
                let lost = roster.count - survivors.values.reduce(0, +)
                losses[roster.team] = Self.percentage(lost, of: roster.count)
                for (name, count) in (previous[roster.team] ?? [:]).sorted(by: { $0.key < $1.key })
                    where count > 0 && survivors[name, default: 0] == 0 {
                    eliminated.append(Elimination(team: roster.team, name: name))
                }
                previous[roster.team] = survivors
            }
            if history.last?.lap != frame.lap || history.last?.losses != losses || !eliminated.isEmpty || index == frames.count - 1 {
                history.append(Sample(lap: frame.lap, losses: losses, eliminated: eliminated))
            }
        }
        samples = history
    }

    static func percentage(_ count: Int, of total: Int) -> Double {
        total > 0 ? 100 * Double(count) / Double(total) : 0
    }
}
