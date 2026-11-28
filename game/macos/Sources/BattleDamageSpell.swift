import Foundation

enum BattleDamageSpell: String, CaseIterable {
    case fireStrike = "Fire Strike"
    case fireball = "Fireball"
    case lightningStrike = "Lightning Strike"
    case ringOfFire = "Ring of Fire"
    case meteorShower = "Meteor Shower"
    case meteorite = "Meteorite"
    case fireWall = "Fire Wall"

    var targetsUnit: Bool {
        switch self {
        case .fireStrike, .fireball, .lightningStrike, .ringOfFire: true
        case .meteorShower, .meteorite, .fireWall: false
        }
    }

    var throwsProjectile: Bool { self == .fireStrike || self == .fireball }
}

struct BattleDamageSpellRules: Decodable {
    struct Flight: Decodable {
        let min: Double
        let max: Double
        let perCell: Double

        func milliseconds(distance: Double) -> Double { Swift.max(min, Swift.min(max, distance * perCell)) }
    }

    struct Atlas: Decodable {
        let id: Int
        let resource: String
        let cols: Int
        let rows: Int
    }

    let atlases: [Atlas]
    let speed: Double
    let releaseFraction: Double
    let strikeWindup: Double
    let strikeFlight: Flight
    let ballFlight: Flight
    let strikeBurn: Double
    let ringLife: Double
    let meteorLife: Double
    let lightningLead: Double
    let lightningLife: Double
    let fireWallAfterburn: Double

    static let bundled: Self? = {
        guard let url = Bundle.main.url(forResource: "damage-spells", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }()
}

struct BattleDamageCast {
    let spell: BattleDamageSpell
    let actor: Stack
    let target: Stack?
    let origin: CGPoint
    let destination: CGPoint?
    let centreCell: Cell?
    let area: [Cell]
    let mirrors: [Stack]
    let direction: String?
    let start: TimeInterval
    let poseStart: TimeInterval
    let flight: Double?
    let release: TimeInterval?
    let impact: TimeInterval
    let ends: TimeInterval

    init?(moment: Moment, actor: Stack?, target: Stack?, mirrors: [Stack], origin: CGPoint?, destination: CGPoint?, direction: String?,
          start: TimeInterval, castDuration: TimeInterval, replay: Bool) {
        guard let name = moment.spell, let spell = BattleDamageSpell(rawValue: name), let rules = BattleDamageSpellRules.bundled,
              let actor, let origin else { return nil }
        self.spell = spell
        self.actor = actor
        self.target = target
        self.mirrors = mirrors
        self.origin = origin
        self.destination = destination
        self.direction = direction
        centreCell = moment.splash?.center ?? moment.aim
        area = moment.spellArea ?? []
        poseStart = start

        let scale = 1000 * rules.speed
        let windup = spell == .fireStrike ? rules.strikeWindup / scale : 0
        let presentationDelay: TimeInterval = if !replay { 0 } else if spell.throwsProjectile {
            max(0, castDuration * rules.releaseFraction - windup)
        } else { castDuration }
        self.start = start + presentationDelay

        if spell.throwsProjectile, let destination {
            let trajectory = spell == .fireStrike ? rules.strikeFlight : rules.ballFlight
            let milliseconds = trajectory.milliseconds(distance: hypot(destination.x - origin.x, destination.y - origin.y))
            let launch = self.start + windup
            flight = milliseconds
            release = launch
            impact = launch + milliseconds / scale
        } else {
            flight = nil
            release = nil
            impact = self.start + (spell == .lightningStrike ? rules.lightningLead / 1000 : 0)
        }

        let lingering: TimeInterval = switch spell {
        case .fireStrike: rules.strikeBurn / scale
        case .fireball, .ringOfFire: rules.ringLife / scale
        case .lightningStrike: rules.lightningLife / 1000
        case .meteorShower, .meteorite:
            (rules.meteorLife + Double(max(0, area.count + min(3, area.count) - 1)) * 95 + 55) / scale
        case .fireWall: 0
        }
        ends = impact + max(lingering, mirrors.isEmpty ? 0 : 0.44)
    }
}

struct BattleFireTraversal {
    let actor: Int
    let cells: [Cell]
    let path: [CGPoint]
    let flying: Bool
    let start: TimeInterval
    let arrival: TimeInterval

    var ends: TimeInterval { arrival + (BattleDamageSpellRules.bundled?.fireWallAfterburn ?? 1.15) + 0.95 }
    var speed: Double {
        guard arrival > start else { return 0 }
        let length = zip(path, path.dropFirst()).reduce(0.0) { sum, segment in
            sum + hypot(segment.1.x - segment.0.x, segment.1.y - segment.0.y)
        }
        return length / (arrival - start)
    }
}
