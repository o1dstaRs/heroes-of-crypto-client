import Foundation
import JavaScriptCore

enum SandboxAugment: String, CaseIterable, Identifiable {
    case placement = "Placement", armor = "Armor", might = "Might"
    case empower = "Empower", sniper = "Sniper", movement = "Movement"

    var id: String { rawValue }
    var title: String { self == .placement ? "Board Placement" : rawValue }
}

struct SandboxLoadout: Encodable {
    var augments: [String: Int] = [:]
    var synergies: [String: Int] = [:]
    var tier1 = 0
    var tier2 = 0
    var barrels: [SandboxPlacedBarrel]?

    var spent: Int { augments.values.reduce(0, +) }
}

struct SandboxPlacedBarrel: Codable, Identifiable {
    let index: Int
    let cell: Cell

    var id: Int { index }
}

struct SandboxBarrelSlot: Equatable {
    let team: Team
    let index: Int
}

struct SandboxLoadoutOptions: Decodable {
    struct Artifact: Decodable, Identifiable {
        let id: Int
        let tier: Int
        let name: String
        let imageKey: String
        let description: String
    }

    let artifacts: [Artifact]
    let maximumPoints: Int
    let augmentLevels: [String: Int]
    let augmentLabels: [String: [String]]
    let barrelBarricade: Int
    let synergyVariants: [String: [Int]]
    let synergyDefaults: [String: Int]
}

struct SandboxTeamPreview: Decodable {
    let team: Team
    let cells: [Cell]
    let levels: [String: Int]
    let capacity: Int
    let barrels: [SandboxPlacedBarrel]
}

/// Reuses the web engine's pre-fight rules to generate the input for the native Zig battle.
@MainActor
final class SandboxLoadoutEngine {
    let options: SandboxLoadoutOptions
    private let context: JSContext

    init(resources: URL) throws {
        guard let context = JSContext() else { throw EngineError(message: "Could not open the Sandbox setup engine.") }
        self.context = context
        let source = try String(contentsOf: resources.appendingPathComponent("sandbox-loadouts.js"), encoding: .utf8)
        context.evaluateScript(source)
        guard let text = context.objectForKeyedSubscript("hocSandboxLoadoutOptions"), text.isString,
              let json = text.toString() else {
            throw EngineError(message: context.exception?.toString() ?? "The Sandbox setup options are missing.")
        }
        options = try JSONDecoder().decode(SandboxLoadoutOptions.self, from: Data(json.utf8))
    }

    func prepare(map: BattlefieldMap, stacks: [SandboxStack], catalogue: [SandboxCreature],
                 loadouts: [Team: SandboxLoadout], automated: Set<Team>, boardSeed: UInt32? = nil) throws -> (NativeBattle, [Team: SandboxTeamPreview]) {
        let creatures = Dictionary(uniqueKeysWithValues: catalogue.map { ($0.id, $0) })
        let rows = try stacks.map { stack in
            guard let creature = creatures[stack.creature], (1...9999).contains(stack.amount) else {
                throw EngineError(message: "A Sandbox stack has invalid starting data.")
            }
            let footprint = stack.footprint ?? creature.footprint
            return Input.Stack(name: creature.name, faction: creature.faction.title, level: creature.level,
                               team: stack.team.rawValue, amount: stack.amount, x: stack.x, y: stack.y,
                               width: footprint.width, height: footprint.height)
        }
        let teams = Dictionary(uniqueKeysWithValues: loadouts.map { (String($0.key.rawValue), $0.value) })
        let request = try JSONEncoder().encode(Input(map: map.rawValue, boardSeed: boardSeed, stacks: rows, teams: teams))
        context.exception = nil
        let configure = context.objectForKeyedSubscript("hocConfigureSandbox")
        guard let result = configure?.call(withArguments: [String(decoding: request, as: UTF8.self)]),
              result.isString, let json = result.toString() else {
            let explanation = context.exception?.forProperty("message")?.toString()
            throw EngineError(message: explanation ?? "Could not apply this Sandbox setup.")
        }
        let data = Data(json.utf8)
        let preview = try JSONDecoder().decode(Preview.self, from: data)
        guard let output = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let snapshot = output["snapshot"] else {
            throw EngineError(message: "The Sandbox setup engine did not produce a battle.")
        }
        for team in preview.teams {
            let army = stacks.filter { $0.team == team.team }
            guard army.count <= team.capacity else {
                throw EngineError(message: "\(team.team.title) can deploy up to \(team.capacity) stacks with these upgrades.")
            }
        }
        let battle = try NativeBattle(snapshot: JSONSerialization.data(withJSONObject: snapshot))
        guard battle.configureSandbox(anchors: stacks.map(\.anchor), automated: automated) else {
            throw EngineError(message: "Move any stacks outside the new deployment zone before applying that change.")
        }
        return (battle, Dictionary(uniqueKeysWithValues: preview.teams.map { ($0.team, $0) }))
    }

    private struct Input: Encodable {
        struct Stack: Encodable {
            let name: String
            let faction: String
            let level: Int
            let team: Int
            let amount: Int
            let x: Int32
            let y: Int32
            let width: Int32
            let height: Int32
        }
        let map: Int
        let boardSeed: UInt32?
        let stacks: [Stack]
        let teams: [String: SandboxLoadout]
    }

    private struct Preview: Decodable {
        let teams: [SandboxTeamPreview]
    }
}
