import CoreGraphics
import Foundation

struct BattlefieldArtwork: Decodable {
    struct Row: Decodable { let y: CGFloat; let x: [CGFloat] }
    struct Point: Decodable { let x: CGFloat; let y: CGFloat }
    struct Field: Decodable { let topLeft: Point; let bottomLeft: Point; let bottomRight: Point }
    struct Artwork: Decodable { let width: CGFloat; let height: CGFloat; let field: Field }
    struct Fire: Decodable, Identifiable {
        let key: String
        let resource: String
        let sourceX: CGFloat
        let sourceY: CGFloat
        let sourceWidth: CGFloat
        let sourceHeight: CGFloat
        let columns: Int
        let frameCount: Int
        let fps: Double
        let phaseSeconds: Double
        let alpha: Double
        let glowAlpha: Double

        var id: String { key }
        var rows: Int { (frameCount + columns - 1) / columns }
    }

    let artwork: Artwork
    let rows: [Row]
    let heightRatio: CGFloat
    let overscan: CGFloat
    let horizontalBias: CGFloat
    let fires: [Fire]

    static func load(_ url: URL) throws -> Self {
        let value = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
        guard value.rows.count == 17, value.rows.allSatisfy({ $0.x.count == 17 }),
              value.artwork.width > 0, value.artwork.height > 0, value.heightRatio > 0, value.overscan > 0,
              value.artwork.field.bottomRight.x > value.artwork.field.bottomLeft.x,
              value.artwork.field.bottomLeft.y > value.artwork.field.topLeft.y else {
            throw EngineError(message: "The battlefield artwork has invalid geometry.")
        }
        return value
    }
}

struct BattlefieldProjection {
    struct Hit {
        let cell: Cell
        let logicalPoint: CGPoint
    }

    struct Quad {
        let topLeft: CGPoint
        let topRight: CGPoint
        let bottomRight: CGPoint
        let bottomLeft: CGPoint

        var outline: CGPath {
            let path = CGMutablePath()
            path.addLines(between: [topLeft, topRight, bottomRight, bottomLeft])
            path.closeSubpath()
            return path
        }

        var bounds: CGRect { outline.boundingBox }
    }

    struct Tile {
        let points: [CGPoint]

        var outline: CGPath {
            let path = CGMutablePath()
            if let first = points.first {
                path.move(to: first)
                for vertex in points.dropFirst() { path.addLine(to: vertex) }
                path.closeSubpath()
            }
            return path
        }

        var bounds: CGRect {
            let x = points.map(\.x)
            let y = points.map(\.y)
            let left = x.min() ?? 0
            let top = y.min() ?? 0
            return CGRect(x: left, y: top, width: (x.max() ?? 0) - left, height: (y.max() ?? 0) - top)
        }
    }

    let artworkRect: CGRect
    let spriteCellSize: CGFloat
    let screenCellWidth: CGFloat
    let screenCellHeight: CGFloat
    private let data: BattlefieldArtwork
    private let scaleX: CGFloat
    private let scaleY: CGFloat

    init(data: BattlefieldArtwork, width: CGFloat, height: CGFloat, legacySize: CGFloat) {
        self.data = data
        let field = data.artwork.field
        let x = width * data.overscan / (field.bottomRight.x - field.bottomLeft.x)
        let y = legacySize * data.heightRatio / (field.bottomLeft.y - field.topLeft.y)
        scaleX = x
        scaleY = y
        let bottomMidX = (field.bottomLeft.x + field.bottomRight.x) / 2
        artworkRect = CGRect(x: width * (0.5 + data.horizontalBias) - bottomMidX * x,
                             y: height - field.bottomLeft.y * y,
                             width: data.artwork.width * x, height: data.artwork.height * y)
        spriteCellSize = legacySize / 16
        screenCellWidth = width / 16
        screenCellHeight = legacySize * data.heightRatio / 16
    }

    func point(x: CGFloat, y: CGFloat) -> CGPoint {
        let artworkY = 16 - y
        let row = min(15, max(0, Int(artworkY.rounded(.down))))
        let column = min(15, max(0, Int(x.rounded(.down))))
        let u = x - CGFloat(column)
        let v = artworkY - CGFloat(row)
        let top = data.rows[row]
        let bottom = data.rows[row + 1]
        let topX = top.x[column] + (top.x[column + 1] - top.x[column]) * u
        let bottomX = bottom.x[column] + (bottom.x[column + 1] - bottom.x[column]) * u
        return CGPoint(x: artworkRect.minX + (topX + (bottomX - topX) * v) * scaleX,
                       y: artworkRect.minY + (top.y + (bottom.y - top.y) * v) * scaleY)
    }

    func fireRect(_ fire: BattlefieldArtwork.Fire) -> CGRect {
        let width = fire.sourceWidth * scaleX
        let height = fire.sourceHeight * scaleY
        return CGRect(x: artworkRect.minX + fire.sourceX * scaleX - width / 2,
                      y: artworkRect.minY + fire.sourceY * scaleY - height, width: width, height: height)
    }

    func quad(centerX: CGFloat, centerY: CGFloat, width: CGFloat, height: CGFloat) -> Quad {
        let left = centerX - width / 2
        let right = centerX + width / 2
        let top = centerY + height / 2
        let bottom = centerY - height / 2
        return Quad(topLeft: point(x: left, y: top), topRight: point(x: right, y: top),
                    bottomRight: point(x: right, y: bottom), bottomLeft: point(x: left, y: bottom))
    }

    func barrelFrame(for cell: Cell) -> CGRect {
        let x = CGFloat(cell.x) + 0.5
        let y = CGFloat(cell.y) + 0.5
        let center = point(x: x, y: y)
        let width = point(x: x + 0.5, y: y).x - point(x: x - 0.5, y: y).x
        let depth = point(x: x, y: y - 0.5).y - point(x: x, y: y + 0.5).y
        let rowScale = 1 - CGFloat(cell.y) / 15 * 0.1
        let height = width * (461.0 / 256) * 1.785 * rowScale
        let base = center.y + depth * 0.30
        let drawnWidth = width * rowScale * 0.95
        return CGRect(x: center.x - drawnWidth / 2, y: base - height, width: drawnWidth, height: height)
    }

    func tile(_ cell: Cell) -> Tile {
        let x = CGFloat(cell.x)
        let y = CGFloat(cell.y)
        return Tile(points: [point(x: x, y: y), point(x: x + 1, y: y),
                             point(x: x + 1, y: y + 1), point(x: x, y: y + 1)])
    }

    func footprintHighlight(for cells: [Cell]) -> CGPath {
        let path = CGMutablePath()
        for cell in cells {
            let tile = quad(centerX: CGFloat(cell.x) + 0.5, centerY: CGFloat(cell.y) + 0.5, width: 0.89, height: 0.89)
            path.addPath(tile.outline)
        }
        return path
    }

    func cell(at position: CGPoint) -> Cell? { hit(at: position)?.cell }

    @MainActor
    func stackForInspection(at point: CGPoint, among stacks: [Stack]) -> Stack? {
        // Let a click on the painted body win over an occupied tile behind it. At overlaps
        // choose the front stack, using the same screen-depth order as the battlefield art.
        var hitStack: Stack?
        var frontDepth: CGFloat = -.infinity
        for stack in stacks where !stack.cells.isEmpty {
            let center = Self.logicalCenter(stack.cells)
            let facing: CGFloat = stack.team == .player ? 1 : -1
            let body = CreatureAnimation.boardPresentation(stack, position: center, projection: self, facing: facing)
            let halfWidth = max(screenCellWidth * CGFloat(stack.footprint.width) * 0.43, body.height * body.widthScale * 0.26)
            let x = (point.x - body.ground.x) / halfWidth
            let y = (point.y - body.ground.y + body.height * 0.47) / (body.height * 0.43)
            let depth = self.point(x: center.x, y: center.y).y
            if (x * x + y * y) <= 1, depth >= frontDepth {
                hitStack = stack
                frontDepth = depth
            }
        }
        if let hitStack { return hitStack }
        guard let cell = cell(at: point) else { return nil }
        return stacks.first { $0.cells.contains(cell) }
    }

    func hit(at position: CGPoint) -> Hit? {
        guard scaleX > 0, scaleY > 0 else { return nil }
        let y = (position.y - artworkRect.minY) / scaleY
        let x = (position.x - artworkRect.minX) / scaleX
        for row in 0..<16 where data.rows[row].y <= y && y <= data.rows[row + 1].y {
            let top = data.rows[row]
            let bottom = data.rows[row + 1]
            let fraction = (y - top.y) / (bottom.y - top.y)
            let seams = zip(top.x, bottom.x).map { $0 + ($1 - $0) * fraction }
            for column in 0..<16 where seams[column] <= x && x <= seams[column + 1] {
                let across = (x - seams[column]) / (seams[column + 1] - seams[column])
                return Hit(cell: Cell(x: Int32(column), y: Int32(15 - row)),
                           logicalPoint: CGPoint(x: CGFloat(column) + across, y: CGFloat(16 - row) - fraction))
            }
        }
        return nil
    }

    static func logicalCenter(_ cells: [Cell]) -> CGPoint {
        let count = CGFloat(max(1, cells.count))
        let x = cells.reduce(0) { $0 + CGFloat($1.x) + 0.5 } / count
        let y = cells.reduce(0) { $0 + CGFloat($1.y) + 0.5 } / count
        return CGPoint(x: x, y: y)
    }

    func center(_ cells: [Cell]) -> CGPoint {
        let center = Self.logicalCenter(cells)
        return point(x: center.x, y: center.y)
    }
}

struct BattleAttackPreview: Equatable {
    let target: Int
    let targetCell: Cell
    let angle: BattleAttackAngle

    static func resolve(_ hit: BattlefieldProjection.Hit, in battle: BattleView) -> Self? {
        guard battle.playerTurn, battle.preparedSpell == nil, let actor = battle.activeStack,
              let enemy = battle.stacks.first(where: { $0.team != actor.team && $0.cells.contains(hit.cell) }),
              let options = battle.attackOptions.first(where: { $0.target == enemy.id })?.angles,
              let first = options.first else { return nil }
        let pointer = hit.logicalPoint
        let angle: BattleAttackAngle?
        if first.side != nil {
            let onCell = options.filter { $0.cell == hit.cell }
            angle = (onCell.isEmpty ? options : onCell).min {
                distance($0.side?.point(on: $0.cell), from: pointer) < distance($1.side?.point(on: $1.cell), from: pointer)
            }
        } else {
            let center = BattlefieldProjection.logicalCenter([hit.cell])
            // The browser gives each corner its own diagonal approach and leaves the middle as a neutral aim.
            let dx = sector(pointer.x - center.x)
            let dy = sector(pointer.y - center.y)
            let wanted = BattlefieldProjection.logicalCenter([Cell(x: hit.cell.x + dx, y: hit.cell.y + dy)])
            let standing = BattlefieldProjection.logicalCenter(actor.cells)
            func score(_ option: BattleAttackAngle) -> (CGFloat, CGFloat, CGFloat) {
                let cells = actor.footprint.cells(at: option.cell)
                let closest = cells.map { BattlefieldProjection.logicalCenter([$0]) }
                return (closest.map { distance($0, from: wanted) }.min() ?? .infinity,
                        closest.map { distance($0, from: pointer) }.min() ?? .infinity,
                        distance(BattlefieldProjection.logicalCenter(cells), from: standing))
            }
            angle = (dx == 0 && dy == 0 ? options.first { $0.cell == actor.anchor } : nil) ?? options.min {
                score($0) < score($1)
            }
        }
        return angle.map { Self(target: enemy.id, targetCell: hit.cell, angle: $0) }
    }

    private static func sector(_ offset: CGFloat) -> Int32 {
        offset < -1 / 6 ? -1 : offset > 1 / 6 ? 1 : 0
    }

    private static func distance(_ point: CGPoint?, from reference: CGPoint) -> CGFloat {
        guard let point else { return .infinity }
        let x = point.x - reference.x
        let y = point.y - reference.y
        return x * x + y * y
    }
}

enum SandboxCursorMode: Hashable {
    case standard, interactive, melee(MeleeDirection), ranged, magic

    enum MeleeDirection: Int, Hashable {
        case right, upRight, up, upLeft, left, downLeft, down, downRight

        init(from: CGPoint, to: CGPoint) {
            let octant = Int((atan2(to.y - from.y, to.x - from.x) * 4 / .pi).rounded())
            self = Self(rawValue: (octant + 8) % 8) ?? .right
        }

        var angle: CGFloat { CGFloat(rawValue) * .pi / 4 }
    }

    static func resolve(at cell: Cell?, aim: BattleAttackPreview? = nil, in battle: BattleView,
                        placing: Bool = false, canPlace: Bool = false, animating: Bool = false) -> Self {
        guard !animating, battle.winner == nil, !battle.stalled, let cell else { return .standard }
        if placing { return canPlace ? .interactive : .standard }
        let stack = battle.stacks.first { $0.cells.contains(cell) }

        if battle.preparedSpell != nil {
            return battle.playerTurn && battle.spellCells.contains(cell) ? .magic : .standard
        }
        if battle.playerTurn, battle.areaAims.contains(where: { $0.aim == cell }) { return .ranged }
        if battle.playerTurn, let actor = battle.activeStack,
           stack.map({ battle.attacks.contains($0.id) }) == true || battle.obstacleTargets.contains(cell) {
            switch battle.mode {
            case .ranged: return .ranged
            case .magic: return .magic
            case .melee, .meleeMagic:
                let from = if let aim, aim.target == stack?.id, aim.targetCell == cell, aim.angle.side == nil {
                    actor.footprint.cells(at: aim.angle.cell)
                } else {
                    actor.cells
                }
                return .melee(MeleeDirection(from: BattlefieldProjection.logicalCenter(from),
                                             to: BattlefieldProjection.logicalCenter([cell])))
            default: break
            }
        }
        let canMove = (!battle.started || battle.playerTurn) && battle.movementLandings.anchor(covering: cell) != nil
        return stack != nil || canMove ? .interactive : .standard
    }
}
