import Foundation

struct SandboxTurnClock {
    struct Rules: Decodable {
        let minimumMillis: Double
        let maximumMillis: Double
        let lapMillis: Double

        static let current: Rules = {
            guard let url = Bundle.main.url(forResource: "sandbox-turn-clock", withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let rules = try? JSONDecoder().decode(Self.self, from: data) else {
                return Rules(minimumMillis: 12_000, maximumMillis: 60_000, lapMillis: 240_000)
            }
            return rules
        }()
    }

    struct Window {
        let key: Key
        let start: ContinuousClock.Instant
        var limit: TimeInterval

        var deadline: ContinuousClock.Instant { start + .seconds(limit) }

        func remaining(at now: ContinuousClock.Instant) -> TimeInterval {
            max(0, min(limit, SandboxTurnClock.seconds(now.duration(to: deadline))))
        }
    }

    struct Key: Equatable {
        let unit: Int
        let team: Team
        let lap: Int
    }

    private let rules = Rules.current
    private var lap = 0
    private var spent: [Team: Double] = [:]
    private var extended: Set<Team> = []

    mutating func begin(_ key: Key, remainingStacks: Int, at start: ContinuousClock.Instant) -> Window {
        if lap != key.lap {
            lap = key.lap
            spent.removeAll()
            extended.removeAll()
        }
        let (available, share) = budget(for: key.team, remainingStacks: remainingStacks)
        return Window(key: key, start: start, limit: max(0, min(available, share)) / 1000)
    }

    mutating func finish(_ window: Window, at now: ContinuousClock.Instant) {
        let elapsed = max(0, Self.seconds(window.start.duration(to: now)))
        spent[window.key.team, default: 0] += floor(elapsed * 1000)
    }

    func extensionTime(for team: Team, remainingStacks: Int) -> TimeInterval {
        guard !extended.contains(team), remainingStacks > 0 else { return 0 }
        let (available, share) = budget(for: team, remainingStacks: remainingStacks)
        return available > 0 ? max(0, share) / 1000 : 0
    }

    mutating func extend(_ window: inout Window, remainingStacks: Int) -> Bool {
        let additional = extensionTime(for: window.key.team, remainingStacks: remainingStacks)
        guard additional > 0 else { return false }
        extended.insert(window.key.team)
        window.limit += additional
        return true
    }

    private func budget(for team: Team, remainingStacks: Int) -> (Double, Double) {
        let left = rules.lapMillis - spent[team, default: 0]
        let reserved = rules.minimumMillis * Double(max(0, remainingStacks - 1))
        return (left - reserved, min(rules.maximumMillis, ceil(left / Double(max(1, remainingStacks)))))
    }

    private static func seconds(_ duration: Duration) -> TimeInterval {
        Double(duration.components.seconds) + Double(duration.components.attoseconds) * 1e-18
    }
}
