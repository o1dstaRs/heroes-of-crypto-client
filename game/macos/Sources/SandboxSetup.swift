import Foundation

enum Footprint: String, CaseIterable, Codable {
    case single, wide, tall, square

    init(width: Int32, height: Int32) {
        self = switch (width, height) {
        case (2, 1): .wide
        case (1, 2): .tall
        case (2, 2): .square
        default: .single
        }
    }

    var width: Int32 { self == .wide || self == .square ? 2 : 1 }
    var height: Int32 { self == .tall || self == .square ? 2 : 1 }
    var label: String { "\(width) × \(height)" }

    func cells(at anchor: Cell) -> [Cell] {
        (0..<width).flatMap { dx in
            (0..<height).map { dy in Cell(x: anchor.x - dx, y: anchor.y - dy) }
        }
    }
}

struct FootprintLandings {
    let footprint: Footprint
    let anchors: Set<Cell>
    var standing: Cell? = nil

    var coveredCells: Set<Cell> { Set(anchors.flatMap(footprint.cells(at:))) }

    func anchor(covering cursor: Cell) -> Cell? {
        if let standing, footprint.cells(at: standing).contains(cursor) { return standing }
        // Like the browser, try the cursor as the lower-left corner, then slide the rectangle down and left over it.
        for dx in (0..<footprint.width).reversed() {
            for dy in (0..<footprint.height).reversed() {
                let anchor = Cell(x: cursor.x + dx, y: cursor.y + dy)
                if anchors.contains(anchor) { return anchor }
            }
        }
        return nil
    }
}

struct SandboxCreature: Decodable, Identifiable {
    let id: Int
    let name: String
    let faction: Faction
    let level: Int
    let amount: Int
    let width: Int32
    let height: Int32
    let rosterOrder: Int

    var footprint: Footprint { Footprint(width: width, height: height) }
}

struct SandboxStack: Decodable {
    let creature: Int
    var team: Team
    var amount: Int
    var x: Int32
    var y: Int32
    var footprint: Footprint? = nil

    var anchor: Cell { Cell(x: x, y: y) }
}

struct SandboxRosterPlacement {
    let anchors: [Cell: Team]
    let hasStackSlot: Bool

    func hint(for creature: SandboxCreature) -> String? {
        guard hasStackSlot else { return "Stack limit reached. Remove a stack to place \(creature.name)." }
        guard let team = anchors.values.first else {
            let footprint = creature.footprint
            return "No room for \(creature.name). Clear a \(footprint.width)×\(footprint.height) space in a deployment zone."
        }
        return anchors.values.allSatisfy { $0 == team } ? "Only \(team.title) has room for \(creature.name)." : nil
    }
}

struct SandboxSetup {
    static let maximumStacks = 32
    let creatures: [SandboxCreature]
    let sampleArmies: [SandboxStack]
    private let templates: [Int: [String: Any]]

    init(resources: URL) throws {
        let catalogue = try Data(contentsOf: resources.appendingPathComponent("sandbox-catalogue.json"))
        creatures = try JSONDecoder().decode([SandboxCreature].self, from: catalogue)
        sampleArmies = try JSONDecoder().decode([SandboxStack].self, from: Data(
            contentsOf: resources.appendingPathComponent("sandbox-sample-armies.json")
        ))
        guard let rows = try JSONSerialization.jsonObject(with: catalogue) as? [[String: Any]],
              rows.count == creatures.count else {
            throw EngineError(message: "The sandbox creature catalogue is missing its engine data.")
        }
        templates = Dictionary(uniqueKeysWithValues: zip(creatures.map(\.id), rows))
    }

    func rosterPreview(for creature: SandboxCreature, resources: URL) throws -> Stack {
        let stack = SandboxStack(creature: creature.id, team: .player, amount: creature.amount, x: 2, y: 8)
        let preview = try makeBattle(map: .normal, stacks: [stack], automated: [], resources: resources)
        guard let result = try preview.view().stacks.first else {
            throw EngineError(message: "The sandbox creature has no preview stats.")
        }
        return result
    }

    func makeBattle(map: BattlefieldMap, stacks: [SandboxStack], automated: Set<Team>, resources: URL) throws -> NativeBattle {
        let terrain = try Data(contentsOf: resources.appendingPathComponent("\(map.fixture)-sandbox.json"))
        guard var snapshot = try JSONSerialization.jsonObject(with: terrain) as? [String: Any],
              var configs = snapshot["configs"] as? [String: [String: Any]] else {
            throw EngineError(message: "The sandbox battlefield is missing its engine data.")
        }
        var units = [[String: Any]]()
        for (index, stack) in stacks.enumerated() {
            guard let template = templates[stack.creature],
                  var unit = template["unit"] as? [String: Any],
                  var fields = unit["fields"] as? [String: Any],
                  let creatureConfigs = template["configs"] as? [String: [String: Any]],
                  (1...9999).contains(stack.amount) else {
                throw EngineError(message: "A sandbox stack has invalid starting data.")
            }
            let id = String(format: "00000000-0000-5000-8000-%012d", index + 1)
            for key in ["unitProperties", "initialUnitProperties"] {
                guard var properties = fields[key] as? [String: Any] else {
                    throw EngineError(message: "A sandbox creature has incomplete stats.")
                }
                properties["id"] = id
                properties["team"] = stack.team.rawValue
                properties["amount_alive"] = stack.amount
                if let shape = stack.footprint {
                    properties["size"] = max(shape.width, shape.height)
                    properties["footprint_width"] = shape.width
                    properties["footprint_height"] = shape.height
                }
                fields[key] = properties
            }
            unit["id"] = id
            unit["team"] = stack.team.rawValue
            unit["fields"] = fields
            units.append(unit)
            for (table, entries) in creatureConfigs {
                configs[table, default: [:]].merge(entries) { current, _ in current }
            }
        }
        snapshot["units"] = units
        snapshot["configs"] = configs
        let engine = try NativeBattle(snapshot: JSONSerialization.data(withJSONObject: snapshot))
        guard engine.configureSandbox(anchors: stacks.map(\.anchor), automated: automated) else {
            throw EngineError(message: "A stack doesn’t fit in its deployment zone.")
        }
        return engine
    }

    func availableAnchors(for footprint: Footprint, team: Team, on board: BattleView,
                          ignoring id: Int? = nil, zone: [Cell]? = nil) -> [Cell] {
        let occupied = Set(board.stacks.filter { $0.id != id }.flatMap(\.cells) + board.stones)
        return availableAnchors(for: footprint, team: team, excluding: occupied, zone: zone)
    }

    func rosterPlacements(for footprint: Footprint, on board: BattleView,
                          deployment: [Team: SandboxTeamPreview]) -> SandboxRosterPlacement {
        guard board.stacks.count < Self.maximumStacks else { return SandboxRosterPlacement(anchors: [:], hasStackSlot: false) }
        let teams = [Team.player, .opponent].filter { team in
            guard let preview = deployment[team] else { return true }
            return board.stacks.filter { $0.team == team }.count < preview.capacity
        }
        let anchors = Dictionary(uniqueKeysWithValues: teams.flatMap { team in
            availableAnchors(for: footprint, team: team, on: board, zone: deployment[team]?.cells).map { ($0, team) }
        })
        return SandboxRosterPlacement(anchors: anchors, hasStackSlot: !teams.isEmpty)
    }

    func arrangeSampleArmies(on board: BattleView, deployment: [Team: SandboxTeamPreview]) throws -> [SandboxStack] {
        let byID = Dictionary(uniqueKeysWithValues: creatures.map { ($0.id, $0) })
        let footprints = try sampleArmies.map { stack in
            guard let shape = stack.footprint ?? byID[stack.creature]?.footprint else {
                throw EngineError(message: "A sample creature is missing from the roster.")
            }
            return shape
        }
        // Use the widest spaces for the large creatures first, and keep army order stable.
        let order = sampleArmies.indices.sorted {
            let left = footprints[$0], right = footprints[$1]
            return (-(left.width * left.height), $0) < (-(right.width * right.height), $1)
        }
        var occupied = Set(board.stones + board.lava + board.holes)
        occupied.formUnion(deployment.values.flatMap { $0.barrels.map(\.cell) })
        var result = sampleArmies
        for index in order {
            let stack = sampleArmies[index], footprint = footprints[index]
            guard let zone = deployment[stack.team] else {
                throw EngineError(message: "The \(stack.team.title) deployment zone is missing.")
            }
            let choices = availableAnchors(for: footprint, team: stack.team, excluding: occupied, zone: zone.cells)
            func distance(_ cell: Cell) -> Int32 { abs(cell.x - stack.x) + abs(cell.y - stack.y) }
            guard let anchor = choices.min(by: { distance($0) < distance($1) }) else {
                throw EngineError(message: "The sample army does not fit in the \(stack.team.title) deployment zone.")
            }
            result[index].x = anchor.x
            result[index].y = anchor.y
            occupied.formUnion(footprint.cells(at: anchor))
        }
        return result
    }

    private func availableAnchors(for footprint: Footprint, team: Team, excluding occupied: Set<Cell>, zone: [Cell]?) -> [Cell] {
        let allowed = zone.map { Set($0) }
        let columns = allowed.map { Set($0.map(\.x)).sorted(by: team == .player ? (>) : (<)) }
            ?? (team == .player ? [3, 2, 1] : [12, 13, 14])
        let rows: [Int32] = [8, 9, 7, 10, 6, 11, 5, 12, 4, 13, 3, 14, 2, 1, 15, 0]
        return rows.flatMap { row in
            columns.compactMap { column in
                let anchor = Cell(x: column, y: row)
                let fits = footprint.cells(at: anchor).allSatisfy { cell in
                    (allowed?.contains(cell) ?? (columns.contains(cell.x) && (1...14).contains(cell.y)))
                        && !occupied.contains(cell)
                }
                return fits ? anchor : nil
            }
        }
    }
}
