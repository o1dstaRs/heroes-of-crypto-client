import Foundation
import HOCEngine

struct Cell: Codable, Hashable {
    let x: Int32
    let y: Int32

    var label: String { "\(UnicodeScalar(65 + Int(x)) ?? "?")\(y + 1)" }
}

struct BattleFireWallAim: Decodable, Equatable {
    let anchor: Cell
    let footprint: [Cell]
    let lit: [Cell]
}

struct BattleTerrainTile: Decodable, Equatable {
    let cell: Cell
    let laps: Int
}

enum Team: Int, Decodable {
    case draw, opponent, player

    var title: String {
        switch self {
        case .draw: "Draw"
        case .opponent: "Red"
        case .player: "Green"
        }
    }
}

enum Faction: Int, CaseIterable, Decodable {
    case none, chaos, might, nature, life, death, order

    var title: String { String(describing: self).capitalized }
}

enum BattlefieldMap: Int, CaseIterable, Decodable {
    case normal = 1, firePit = 3, barrels = 4

    var title: String {
        switch self {
        case .normal: "Normal"
        case .firePit: "Fire Pit"
        case .barrels: "Barrels"
        }
    }

    var fixture: String {
        switch self {
        case .normal: "skirmish"
        case .firePit: "skirmish-lava"
        case .barrels: "skirmish-barrels"
        }
    }
}

struct Stack: Decodable, Equatable, Identifiable {
    let id: Int
    let name: String
    let team: Team
    let faction: Faction
    let amount: Int
    let losses: Int
    let hp: Double
    let maxHP: Double
    let shots: Double?
    let shotDistance: Double
    let fullDamageShotCells: Int?
    let selectedAttack: AttackMode
    let attack: Double
    let armor: Double
    let rangeArmor: Double
    let magicResist: Double
    let initiative: Double
    let movement: Double
    let morale: Double
    let luck: Double
    let damageMin: Double
    let damageMax: Double
    let flies: Bool
    let responded: Bool
    let immobilized: Bool
    let waiting: Bool
    var skipping: Bool? = nil
    let stackPower: Double
    let abilities: [String]
    let book: [StackSpell]
    let statuses: [StackStatus]
    var auras: [BattleAura]? = nil
    let cells: [Cell]

    var cumulativeHealth: Double { amount > 0 ? Double(amount - 1) * maxHP + max(0, hp) : 0 }
    var hasWaterShield: Bool { statuses.contains { $0.kind == .buff && $0.name == "Water Shield" } }
    var hasEmberCovenant: Bool {
        statuses.contains { $0.kind == .buff && $0.name == "Ember Covenant Blessing" && $0.laps > 0 }
    }

    var anchor: Cell? {
        guard let x = cells.map(\.x).max(), let y = cells.map(\.y).max() else { return nil }
        return Cell(x: x, y: y)
    }

    var footprint: Footprint {
        guard let anchor, let left = cells.map(\.x).min(), let bottom = cells.map(\.y).min() else { return .single }
        return Footprint(width: anchor.x - left + 1, height: anchor.y - bottom + 1)
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, team, faction, amount, losses, hp, shots, cells, attack, armor, initiative, movement, morale, luck
        case abilities, book, statuses, auras, flies, responded, immobilized, waiting, skipping
        case maxHP = "max_hp"
        case shotDistance = "shot_distance"
        case fullDamageShotCells = "full_damage_shot_cells"
        case selectedAttack = "selected_attack"
        case rangeArmor = "range_armor"
        case magicResist = "magic_resist"
        case damageMin = "damage_min"
        case damageMax = "damage_max"
        case stackPower = "stack_power"
    }
}

struct BattleAura: Decodable, Equatable {
    let name: String
    let range: Double
    let positive: Bool
}

struct StackSpell: Decodable, Equatable {
    let name: String
    let charges: Int
}

struct StackDamage: Decodable, Equatable, Identifiable {
    let id: Int
    let name: String
    let team: Team
    let amount: Double
}

struct StackStatus: Decodable, Equatable {
    enum Kind: String, Decodable { case buff, debuff, effect }
    let kind: Kind
    let name: String
    let laps: Double
    let power: Double
    let first: Int?
    let second: Int?
}

enum AttackMode: Int, Decodable {
    case none, melee, ranged, magic, meleeMagic

    var icon: String {
        switch self {
        case .ranged: "bow"
        case .magic: "scepter"
        default: "sword"
        }
    }

    var title: String {
        switch self {
        case .none: "Attack type"
        case .melee, .meleeMagic: "Melee attack"
        case .ranged: "Ranged attack"
        case .magic: "Magic attack"
        }
    }
}

enum SpellAim: String, Decodable {
    case unit, cell, army
}

struct BattleSpell: Decodable, Equatable, Identifiable {
    let id: Int32
    let name: String
    let charges: Int
    let available: Bool
    let aim: SpellAim
    let requiredPower: Double
    let unavailableReason: String?
}

enum MomentKind: String, Decodable {
    case place, move, melee, shot, obstacle, spell, wait, defend
    case endTurn = "end_turn"
}

enum ShotSide: Int32, Decodable {
    case left, right, down, up

    func point(on cell: Cell) -> CGPoint {
        let x = CGFloat(cell.x)
        let y = CGFloat(cell.y)
        return switch self {
        case .left: CGPoint(x: x, y: y + 0.5)
        case .right: CGPoint(x: x + 1, y: y + 0.5)
        case .down: CGPoint(x: x + 0.5, y: y)
        case .up: CGPoint(x: x + 0.5, y: y + 1)
        }
    }
}

struct BattleAttackAngle: Decodable, Equatable {
    let cell: Cell
    let side: ShotSide?
    var splash: BattleSplash? = nil
    var range: BattleRangeAim? = nil
    var hit: BattleShotHit? = nil
    var hits: [BattleShotHit]? = nil
}

struct BattleAimPoint: Decodable, Equatable {
    let x: CGFloat
    let y: CGFloat

    var point: CGPoint { CGPoint(x: x, y: y) }
}

struct BattleRangeAim: Decodable, Equatable {
    let aim: BattleAimPoint
    let obstacle: BattleAimPoint?
    let primary: Int?
    let hit: BattleShotHit?
    var hits: [BattleShotHit]? = nil
    let divisor: Int
    let clean: Bool
    let stopsAtObstacle: Bool

    enum CodingKeys: String, CodingKey {
        case aim, obstacle, primary, hit, hits, divisor, clean
        case stopsAtObstacle = "stops_at_obstacle"
    }
}

struct BattleThroughAim: Decodable, Equatable {
    let end: BattleAimPoint
    let obstacle: Bool
    let valid: Bool
    let hits: [BattleShotHit]
}

struct BattleShotHit: Decodable, Equatable {
    struct Gaze: Codable, Equatable {
        let min: Double
        let max: Double
        let percentageMax: Double
        let procChance: Double
        let hp: Double
        let totalHp: Double
        let immune: Bool
        let multipleHits: Bool
    }

    let target: Int
    let divisor: Int
    let min: Double
    let max: Double
    let gaze: Gaze?
}

struct BattleSpellTarget: Decodable, Equatable {
    struct Damage: Decodable, Equatable {
        let target: Int
        let damage: Double
    }

    let target: Int
    let primary: Int
    let end: BattleAimPoint?
    let positive: Bool
    let spared: Bool
    let damage: Double?
    let splash: Cell?
    var footprint: [Cell]? = nil
    let secondary: [Damage]
}

struct BattleMeteorAim: Decodable, Equatable {
    let anchor: Cell
    let footprint: [Cell]
    let hits: [BattleSpellTarget.Damage]
}

struct BattleSplash: Decodable, Equatable {
    let center: Cell
    let single: Bool

    func cells(size: Int, excluding holes: Set<Cell>) -> [Cell] {
        let radius: Int32 = single ? 0 : 1
        return (-radius...radius).flatMap { dx in
            (-radius...radius).compactMap { dy in
                let cell = Cell(x: center.x + dx, y: center.y + dy)
                guard cell.x >= 0, cell.x < size, cell.y >= 0, cell.y < size, !holes.contains(cell) else { return nil }
                return cell
            }
        }
    }
}

struct BattleAreaAim: Decodable, Equatable {
    let aim: Cell
    let splash: BattleSplash
    var hits: [BattleShotHit]? = nil
}

struct BattleAttackOptions: Decodable, Equatable {
    let target: Int
    let angles: [BattleAttackAngle]
}

struct Moment: Decodable, Equatable {
    struct ChakramFlight: Decodable, Equatable {
        struct Contact: Decodable, Equatable {
            enum Kind: String, Decodable { case hit, miss, shield }

            let target: Int
            let kind: Kind
            let route: [Cell]
            let delta: Double
            let casualties: Int
        }

        let actor: Int
        let contacts: [Contact]
    }

    struct HealthChange: Decodable, Equatable {
        let target: Int
        let delta: Double
        let casualties: Int
    }

    struct GazeImpact: Decodable, Equatable {
        let actor: Int
        let target: Int
        let damage: Double
        let casualties: Int
        let lethal: Bool
    }

    struct StatusApplication: Decodable, Equatable {
        let target: Int
        let kind: StackStatus.Kind
        let name: String
        var borrowedFrom: Int? = nil
        var laps: Double? = nil
    }

    let kind: MomentKind
    let actor: Int
    let target: Int?
    let aim: Cell?
    let aimSide: ShotSide?
    let spell: String?
    var splash: BattleSplash? = nil
    var projectileEnd: BattleAimPoint? = nil
    var spellArea: [Cell]? = nil
    var crossedFire: [Cell]? = nil
    var mirrorSources: [Int]? = nil
    var counterattack: Counterattack? = nil
    var chakramFlights: [ChakramFlight]? = nil
    var gazeImpacts: [GazeImpact]? = nil
    let route: [Cell]
    let hurt: [Int]?
    let healthChanges: [HealthChange]?
    let statusApplications: [StatusApplication]?
    var waterShieldBreaks: [Int]? = nil
    var covenantBreaks: [Int]? = nil
    var covenantAbsorbs: [Int]? = nil
}

struct Counterattack: Decodable, Equatable {
    let actor: Int
    let target: Int
    let spent: Bool
    var splash: BattleSplash? = nil
}

struct BattleView: Decodable, Equatable {
    let size: Int
    let map: BattlefieldMap
    let lap: Int
    let active: Int?
    var aggrTarget: Int? = nil
    var terrifyingGazeTarget: Int? = nil
    let activeTeamStacksToAct: Int
    let automatedTurn: Bool
    let mode: AttackMode?
    let attackModes: [AttackMode]
    let canCycle: Bool
    let deploying: Int?
    let started: Bool
    let winner: Team?
    let stalled: Bool
    let stacks: [Stack]
    let attacks: [Int]
    let attackOptions: [BattleAttackOptions]
    var canAimThrough: Bool? = nil
    let areaAims: [BattleAreaAim]
    let moves: [Cell]
    let holes: [Cell]
    let stones: [Cell]
    let lava: [Cell]
    let obstacleTargets: [Cell]
    let canWait: Bool
    let spells: [BattleSpell]
    let preparedSpell: Int32?
    let spellCells: [Cell]
    var spellTargets: [BattleSpellTarget]? = nil
    var meteorAims: [BattleMeteorAim]? = nil
    var fireTiles: [BattleTerrainTile]? = nil
    var smokeTiles: [BattleTerrainTile]? = nil
    var fireCells: [Cell]? { fireTiles?.map(\.cell) }
    var fireWallAims: [BattleFireWallAim]? = nil
    let queue: [Int]
    let revision: Int
    let moments: [Moment]
    let damage: [StackDamage]

    var activeStack: Stack? { stacks.first { $0.id == active } }
    var turnOrder: [Stack] {
        let byID = Dictionary(uniqueKeysWithValues: stacks.map { ($0.id, $0) })
        var seen = Set<Int>()
        return ([active].compactMap { $0 } + queue).compactMap { seen.insert($0).inserted ? byID[$0] : nil }
    }
    var movingStack: Stack? { started ? activeStack : stacks.first { $0.id == deploying } }
    var movementLandings: FootprintLandings {
        let stack = movingStack
        return FootprintLandings(footprint: stack?.footprint ?? .single, anchors: Set(moves),
                                 standing: started ? nil : stack?.anchor)
    }
    var playerTurn: Bool { started && !stalled && winner == nil && active != nil && !automatedTurn }
    func actionHint(at cell: Cell, target: Stack?, canAttackHere: Bool) -> String? {
        guard playerTurn, preparedSpell == nil, let actor = activeStack, !canAttackHere else { return nil }
        let enemy = target.flatMap { $0.team == actor.team ? nil : $0 }
        if let enemy, enemy.id == terrifyingGazeTarget {
            return "Terrifying Gaze — can't attack \(enemy.name)"
        }
        let aimingArea = mode == .ranged && actor.abilities.contains("Area Throw")
        if let aggrTarget, enemy?.id != aggrTarget,
           enemy != nil || stones.contains(cell) || canAimThrough == true || aimingArea,
           let source = stacks.first(where: { $0.id == aggrTarget }) {
            return "Aggr — must attack \(source.name)"
        }
        if target?.id != actor.id && actor.immobilized &&
            actor.statuses.contains(where: { $0.name == "Paralysis" && $0.laps > 0 }) {
            return "Paralyzed — can't move"
        }
        return nil
    }
    var opponentTurn: Bool { started && !stalled && winner == nil && active != nil && automatedTurn }
    var spell: BattleSpell? { spells.first { $0.id == preparedSpell } }
    var damageSpell: BattleDamageSpell? { spell.flatMap { BattleDamageSpell(rawValue: $0.name) } }
    var narrowing: Int {
        holes.map { min(Int($0.x), Int($0.y), size - 1 - Int($0.x), size - 1 - Int($0.y)) + 1 }.max() ?? 0
    }
}

struct EngineError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

enum TurnCommand {
    case wait, defend, endTurn, cycleAttack

    var raw: HOCTurnCommand {
        switch self {
        case .wait: HOCWait
        case .defend: HOCDefend
        case .endTurn: HOCEndTurn
        case .cycleAttack: HOCCycleAttack
        }
    }
}

// Zig owns the mutable state. Every access to this instance's handle is serialized, including
// the background opponent search.
final class NativeBattle: @unchecked Sendable {
    private let handle: OpaquePointer
    private let lock = NSLock()
    private var viewCapacity = 16 * 1024

    init(snapshot: Data) throws {
        var message = [CChar](repeating: 0, count: 512)
        let created = snapshot.withUnsafeBytes { bytes in
            hoc_macos_create(bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count, &message, message.count)
        }
        guard let created else {
            let detail = String(decoding: message.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
            throw EngineError(message: detail)
        }
        handle = created
    }

    deinit { hoc_macos_destroy(handle) }

    func configureSandbox(anchors: [Cell], automated: Set<Team>) -> Bool {
        let positions = anchors.map { HOCDeploymentCell(x: $0.x, y: $0.y) }
        return lock.withLock {
            positions.withUnsafeBufferPointer { buffer in
                hoc_macos_configure_sandbox(handle, buffer.baseAddress, buffer.count, Self.automationMask(automated))
            }
        }
    }

    private static func automationMask(_ teams: Set<Team>) -> UInt8 {
        teams.reduce(UInt8(0)) { $0 | (1 << $1.rawValue) }
    }

    func setAutomation(_ teams: Set<Team>) -> Bool {
        lock.withLock { hoc_macos_set_automation(handle, Self.automationMask(teams)) }
    }

    func view() throws -> BattleView {
        let data = try lock.withLock {
            var buffer = Data(count: viewCapacity)
            func read() -> Int {
                buffer.withUnsafeMutableBytes { bytes in
                    hoc_macos_view(handle, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count)
                }
            }
            var length = read()
            if length > buffer.count {
                // The size probe also projects every legal move, shot, and spell cell. Keep
                // the larger capacity for later reads instead of projecting each turn twice.
                viewCapacity = max(length, viewCapacity * 2)
                buffer = Data(count: viewCapacity)
                length = read()
            }
            guard length > 0, length <= buffer.count else {
                throw EngineError(message: "The Zig engine could not produce a battle view.")
            }
            buffer.count = length
            return buffer
        }
        return try JSONDecoder().decode(BattleView.self, from: data)
    }

    func logSteps() -> String? {
        lock.withLock {
            let size = hoc_macos_log_steps(handle, nil, 0)
            guard size > 0 else { return nil }
            var bytes = [UInt8](repeating: 0, count: size)
            guard hoc_macos_log_steps(handle, &bytes, size) == size else { return nil }
            return String(decoding: bytes, as: UTF8.self)
        }
    }

    func logStateMismatch(_ digest: String) -> String? {
        lock.withLock {
            var message = [UInt8](repeating: 0, count: 512)
            let bytes = Array(digest.utf8)
            if hoc_macos_check_log_state(handle, bytes, bytes.count, &message, message.count) { return nil }
            return String(decoding: message.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    func choose(_ cell: Cell) -> Bool { lock.withLock { hoc_macos_choose_cell(handle, cell.x, cell.y) } }
    func previewThrough(_ point: CGPoint) -> BattleThroughAim? {
        let data = lock.withLock {
            var buffer = Data(count: 8192)
            let length = buffer.withUnsafeMutableBytes { bytes in
                hoc_macos_preview_through(handle, point.x, point.y, bytes.bindMemory(to: UInt8.self).baseAddress, bytes.count)
            }
            guard length > 0, length <= buffer.count else { return Data() }
            buffer.count = length
            return buffer
        }
        return try? JSONDecoder().decode(BattleThroughAim.self, from: data)
    }
    func fireThrough(_ point: CGPoint) -> Bool {
        lock.withLock { hoc_macos_fire_through(handle, point.x, point.y) }
    }
    func attack(_ target: Int, from angle: BattleAttackAngle) -> Bool {
        guard let id = UInt8(exactly: target) else { return false }
        return lock.withLock {
            hoc_macos_attack_angle(handle, id, angle.cell.x, angle.cell.y, angle.side?.rawValue ?? -1)
        }
    }
    func select(_ stack: Int) -> Bool {
        guard let id = UInt8(exactly: stack) else { return false }
        return lock.withLock { hoc_macos_select_stack(handle, id) }
    }
    func ready() -> Bool { lock.withLock { hoc_macos_ready(handle) } }
    func perform(_ command: TurnCommand) -> Bool { lock.withLock { hoc_macos_turn_command(handle, command.raw) } }
    func chooseSpell(_ spell: Int32?) -> Bool { lock.withLock { hoc_macos_choose_spell(handle, spell ?? -1) } }
    func rotateFireWall() -> Bool { lock.withLock { hoc_macos_rotate_fire_wall(handle) } }
    func playOpponent(forced: Bool = false) -> Bool { lock.withLock { hoc_macos_opponent_turn(handle, forced) } }

    func opponentTurnView(forced: Bool = false) async throws -> BattleView? {
        try await Task.detached(priority: .userInitiated) {
            guard self.playOpponent(forced: forced) else { return nil }
            return try self.view()
        }.value
    }
}
