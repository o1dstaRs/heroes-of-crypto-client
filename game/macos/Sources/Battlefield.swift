import SwiftUI

struct BattlefieldGhost {
    let name: String
    let footprint: Footprint
    let team: Team
    let anchor: Cell
}

struct Battlefield: View {
    let battle: BattleView
    let playback: BattlePlayback
    let animating: Bool
    let inspectionEnabled: Bool
    let legacySize: CGFloat
    let placement: SandboxCreature?
    let placements: [Cell: Team]
    let placingBarrel: SandboxBarrelSlot?
    let barrelTargets: Set<Cell>
    let deployedBarrels: [Cell: SandboxBarrelSlot]
    let deploymentZones: [Team: SandboxTeamPreview]
    let creatureLevel: (Stack) -> Int?
    let beginBarrelPlacement: (SandboxBarrelSlot) -> Void
    let placeRosterCreature: @MainActor (Int, Cell) -> Bool
    let choose: (Cell) -> Void
    let attack: (Int, BattleAttackAngle) -> Void
    let select: (Stack) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.sandboxCursor) private var cursor
    @State private var pointer = Pointer()
    @State private var hovered: Cell?
    @State private var hoveredAttack: BattleAttackPreview?
    @State private var rosterHover = RosterDragHover.outside
    @State private var dragged: Int?
    @State private var dragCell: Cell?
    @State private var idleStarted = Date()
    @State private var inspection: UnitInspection?

    private final class Pointer {
        var hit: BattlefieldProjection.Hit?
    }

    private struct UnitInspection: Identifiable {
        let id: Int
        let anchor: UnitPoint
    }

    private var canInspect: Bool { inspectionEnabled && !animating && battle.winner == nil && !battle.stalled }

    var body: some View {
        GeometryReader { geometry in
            if let artwork = BattleResources.projection {
                let projection = BattlefieldProjection(data: artwork, width: geometry.size.width,
                                                        height: geometry.size.height, legacySize: legacySize)
                let rosterLandings = placement.map { FootprintLandings(footprint: $0.footprint, anchors: Set(placements.keys)) }
                let moveLandings = battle.movementLandings
                let moveCells = !animating && placement == nil && placingBarrel == nil ? moveLandings.coveredCells : []
                let draft = rosterPlacement(from: rosterLandings)
                let landing = movePreview(from: moveLandings)
                let ghost = draft ?? (dragged == nil && landing?.anchor != battle.movingStack?.anchor ? landing : nil)
                let cursorMode = inspectionEnabled ? SandboxCursorMode.resolve(at: hovered, aim: hoveredAttack, in: battle,
                    placing: placement != nil || placingBarrel != nil,
                    canPlace: draft != nil || hovered.map(barrelTargets.contains) == true, animating: animating) : .standard
                let dragPoint = dragged == nil ? nil : landing.map { target in
                    BattlefieldProjection.logicalCenter(target.footprint.cells(at: target.anchor))
                }
                ZStack(alignment: .topLeading) {
                    floor(projection, moveCells: moveCells)
                    if battle.map == .firePit {
                        FirePit(projection: projection, boardSize: battle.size, flowing: !battle.lava.isEmpty)
                    }
                    boardGuides(projection, landing: draft ?? landing)
                    BattlefieldSprites(battle: battle, playback: playback, projection: projection,
                                       animating: animating, dragged: dragged, dragPoint: dragPoint, ghost: ghost)
                    forMoveButtons(projection, rosterLandings: rosterLandings, moveCells: moveCells).zIndex(2000)
                    barrelControls(projection).zIndex(2001)
                    ForEach(battle.stacks) { stack in
                        stackControl(stack, projection: projection, viewport: geometry.size, moveCells: moveCells).zIndex(2001)
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .contentShape(Rectangle())
                .coordinateSpace(name: "battlefield")
                .clipped()
                .background {
                    BattlefieldSecondaryClick(enabled: canInspect) { point in
                        if let stack = projection.stackForInspection(at: point, among: battle.stacks) {
                            showInspection(stack, at: point, viewport: geometry.size)
                            return true
                        }
                        let wasInspecting = inspection != nil
                        inspection = nil
                        return wasInspecting
                    }
                }
                .popover(item: $inspection, attachmentAnchor: .point(inspection?.anchor ?? .center), arrowEdge: .leading) { selected in
                    if let stack = battle.stacks.first(where: { $0.id == selected.id }) {
                        UnitInspectionCard(stack: stack, level: creatureLevel(stack)) { inspection = nil }
                            .id(stack.id)
                    }
                }
                .onDrop(of: [RosterCreatureDrag.contentType],
                        delegate: RosterDropTarget(enabled: !battle.started, projection: projection, landings: rosterLandings,
                                                   hovered: $rosterHover, place: placeRosterCreature))
                .onContinuousHover { phase in
                    let hit: BattlefieldProjection.Hit?
                    switch phase {
                    case let .active(point): hit = projection.hit(at: point)
                    case .ended: hit = nil
                    }
                    pointer.hit = hit
                    let cell = hit?.cell
                    if hovered != cell { hovered = cell }
                    refreshAim()
                }
                .onChange(of: battle.revision) {
                    refreshAim()
                    if let inspection, !battle.stacks.contains(where: { $0.id == inspection.id }) {
                        self.inspection = nil
                    }
                }
                .onChange(of: animating) { refreshAim() }
                .onChange(of: inspectionEnabled) { refreshAim() }
                .onChange(of: cursorMode, initial: true) { cursor?.setBoard(cursorMode) }
                .onDisappear { cursor?.setBoard(.standard) }
                .onChange(of: canInspect) { if !canInspect { inspection = nil } }
            } else {
                ContentUnavailableView("Battlefield unavailable", systemImage: "square.grid.3x3")
            }
        }
    }

    private func refreshAim() {
        let aim = !animating && inspectionEnabled ? pointer.hit.flatMap { BattleAttackPreview.resolve($0, in: battle) } : nil
        if hoveredAttack != aim { hoveredAttack = aim }
    }

    private func showInspection(_ stack: Stack, at point: CGPoint, viewport: CGSize) {
        guard canInspect, viewport.width > 0, viewport.height > 0 else { return }
        let anchor = UnitPoint(x: point.x / viewport.width, y: point.y / viewport.height)
        inspection = UnitInspection(id: stack.id, anchor: anchor)
    }

    private func rosterPlacement(from landings: FootprintLandings?) -> BattlefieldGhost? {
        guard !battle.started, let placement else { return nil }
        let cell = switch rosterHover {
        case .outside: hovered
        case .over(let target): target
        }
        guard let cell, let anchor = landings?.anchor(covering: cell), let team = placements[anchor] else { return nil }
        return BattlefieldGhost(name: placement.name, footprint: placement.footprint, team: team, anchor: anchor)
    }

    private func movePreview(from landings: FootprintLandings) -> BattlefieldGhost? {
        guard !animating, placement == nil, placingBarrel == nil, battle.preparedSpell == nil,
              !battle.started || battle.playerTurn, let stack = battle.movingStack,
              dragged == nil || dragged == stack.id, let cell = dragged == nil ? hovered : dragCell,
              !battle.areaAims.contains(where: { $0.aim == cell }),
              !battle.obstacleTargets.contains(cell), hoveredAttack == nil, let anchor = landings.anchor(covering: cell) else { return nil }
        return BattlefieldGhost(name: stack.name, footprint: stack.footprint, team: stack.team, anchor: anchor)
    }

    private func floor(_ projection: BattlefieldProjection, moveCells: Set<Cell>) -> some View {
        let bounds = projection.artworkRect
        return ZStack(alignment: .topLeading) {
            Color(red: 0.055, green: 0.052, blue: 0.047)
            if let art = BattleResources.image("board-\(battle.narrowing)") ?? BattleResources.image("board-0") {
                if animating, !reduceMotion, let prior = playback.narrowingFrom,
                   let oldArt = BattleResources.image("board-\(prior)") {
                    TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
                        let elapsed = timeline.date.timeIntervalSince(playback.started) - playback.narrowingStarts
                        let progress = min(1, max(0, elapsed / 0.65))
                        ZStack {
                            Image(nsImage: oldArt).resizable()
                            Image(nsImage: art).resizable().opacity(progress * progress * (3 - 2 * progress))
                        }
                        .frame(width: bounds.width, height: bounds.height)
                        .position(x: bounds.midX, y: bounds.midY)
                    }
                } else {
                    Image(nsImage: art).resizable()
                        .frame(width: bounds.width, height: bounds.height)
                        .position(x: bounds.midX, y: bounds.midY)
                }
                ambientFire(projection)
            }
            Canvas { context, _ in
                let noFloorArt = BattleResources.image("board-0") == nil
                let spellCells = animating ? [] : Set(battle.spellCells)
                let holes = Set(battle.holes)
                let greenZone = Set(deploymentZones[.player]?.cells ?? [])
                let redZone = Set(deploymentZones[.opponent]?.cells ?? [])
                for x in 0..<battle.size {
                    for y in 0..<battle.size {
                        let cell = Cell(x: Int32(x), y: Int32(y))
                        let inDeployment = !battle.started && (greenZone.contains(cell) || redZone.contains(cell))
                        let obstacle = hovered == cell && battle.obstacleTargets.contains(cell)
                        let barrel = deployedBarrels[cell] != nil
                        let barrelTarget = barrelTargets.contains(cell)
                        let move = battle.started && moveCells.contains(cell)
                        let spell = spellCells.contains(cell)
                        guard noFloorArt || inDeployment || obstacle || move || spell || barrel || barrelTarget else { continue }
                        let path = Path(projection.tile(cell).outline)
                        if noFloorArt {
                            context.fill(path, with: .color(holes.contains(cell) ? .black :
                                                           Color(white: (x + y).isMultiple(of: 2) ? 0.14 : 0.18)))
                            context.stroke(path, with: .color(.white.opacity(0.14)), lineWidth: 0.5)
                        }
                        if inDeployment {
                            if greenZone.contains(cell) {
                                context.fill(path, with: .color(BattlePalette.color(0x102b1b).opacity(0.35)))
                            } else if redZone.contains(cell) {
                                context.fill(path, with: .color(BattlePalette.color(0x4e1318).opacity(0.26)))
                            }
                        }
                        if spell {
                            context.fill(path, with: .color(BattlePalette.spell.opacity(hovered == cell ? 0.48 : 0.2)))
                            context.stroke(path, with: .color(BattlePalette.spell.opacity(0.82)), lineWidth: 1.1)
                        } else if obstacle {
                            context.fill(path, with: .color(BattlePalette.opponent.opacity(0.25)))
                            context.stroke(path, with: .color(BattlePalette.opponent.opacity(0.82)), lineWidth: 1.3)
                        } else if barrel || barrelTarget {
                            let selected = hovered == cell || deployedBarrels[cell] != nil && deployedBarrels[cell] == placingBarrel
                            let tone = barrel && !selected ? Color.white : BattlePalette.gold
                            context.fill(path, with: .color(tone.opacity(selected ? 0.30 : 0.09)))
                            context.stroke(path, with: .color(tone.opacity(barrel || selected ? 0.86 : 0.22)), lineWidth: 1.2)
                        } else if move {
                            let tone = Color.white
                            context.fill(path, with: .color(tone.opacity(0.07)))
                        }
                    }
                }
                if !battle.started {
                    for cells in [greenZone, redZone] {
                        guard let minX = cells.map(\.x).min(), let maxX = cells.map(\.x).max(),
                              let minY = cells.map(\.y).min(), let maxY = cells.map(\.y).max() else { continue }
                        let zone = projection.quad(centerX: CGFloat(minX + maxX + 1) / 2,
                                                   centerY: CGFloat(minY + maxY + 1) / 2,
                                                   width: CGFloat(maxX - minX + 1), height: CGFloat(maxY - minY + 1))
                        context.stroke(Path(zone.outline), with: .color(BattlePalette.gold.opacity(0.55)), lineWidth: 1.2)
                    }
                }
                for stack in battle.stacks {
                    let active = !animating && (stack.id == battle.active || (placement == nil && stack.id == battle.deploying))
                    let attack = !animating && battle.attacks.contains(stack.id)
                    let pointedAt = !animating && battle.preparedSpell == nil && hovered.map(stack.cells.contains) == true
                    let inspecting = inspection?.id == stack.id
                    guard active || attack || pointedAt || inspecting else { continue }
                    let path = Path(projection.footprintHighlight(for: stack.cells))
                    let emphasized = inspecting || pointedAt
                    let tint = inspecting ? BattlePalette.gold : attack ? BattlePalette.opponent : active ? Color.white : BattlePalette.gold
                    context.fill(path, with: .color(tint.opacity(emphasized ? 0.24 : active ? 0.10 : 0.13)))
                    context.stroke(path, with: .color(tint.opacity(emphasized ? 0.82 : 0.30)), lineWidth: emphasized ? 1.4 : 1)
                }
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }

    private func boardGuides(_ projection: BattlefieldProjection, landing: BattlefieldGhost?) -> some View {
        Canvas { context, _ in
            if let landing {
                BattlefieldGuides.landing(landing.footprint.cells(at: landing.anchor), projection: projection, in: context)
            }
            guard !animating, battle.playerTurn, battle.preparedSpell == nil, let actor = battle.activeStack else { return }
            if let hovered, let area = battle.areaAims.first(where: { $0.aim == hovered }) {
                drawSplashGuide(area.splash, from: actor, projection: projection, in: context)
            } else if let hoveredAttack {
                drawAttackGuide(hoveredAttack, for: actor, projection: projection, in: context)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawSplashGuide(_ splash: BattleSplash, from actor: Stack, projection: BattlefieldProjection,
                                 in context: GraphicsContext) {
        let cells = splash.cells(size: battle.size, excluding: Set(battle.holes))
        BattlefieldGuides.splash(cells, center: splash.center, opacity: 1, projection: projection, in: context)
        drawArrow(from: projection.center(actor.cells), to: projection.center([splash.center]), in: context)
    }

    private func drawAttackGuide(_ aim: BattleAttackPreview, for actor: Stack, projection: BattlefieldProjection,
                                 in context: GraphicsContext) {
        let from: CGPoint
        let to: CGPoint
        if let splash = aim.angle.splash {
            drawSplashGuide(splash, from: actor, projection: projection, in: context)
            return
        } else if let side = aim.angle.side {
            let edge = side.point(on: aim.angle.cell)
            from = projection.center(actor.cells)
            to = projection.point(x: edge.x, y: edge.y)
        } else {
            let landing = actor.footprint.cells(at: aim.angle.cell)
            BattlefieldGuides.landing(landing, projection: projection, in: context)
            from = projection.center(landing)
            to = projection.center([aim.targetCell])
        }
        drawArrow(from: from, to: to, in: context)
    }

    private func drawArrow(from: CGPoint, to: CGPoint, in context: GraphicsContext) {
        let length = hypot(to.x - from.x, to.y - from.y)
        guard length > 1 else { return }
        let size = min(11, length / 3)
        let dx = (to.x - from.x) / length
        let dy = (to.y - from.y) / length
        let base = CGPoint(x: to.x - dx * size, y: to.y - dy * size)
        let arrow = Path { path in
            path.move(to: from)
            path.addLine(to: to)
            path.move(to: CGPoint(x: base.x - dy * size * 0.48, y: base.y + dx * size * 0.48))
            path.addLine(to: to)
            path.addLine(to: CGPoint(x: base.x + dy * size * 0.48, y: base.y - dx * size * 0.48))
        }
        context.stroke(arrow, with: .color(.black.opacity(0.8)), lineWidth: 4)
        context.stroke(arrow, with: .color(BattlePalette.color(0xffe2a0)), lineWidth: 1.7)
    }

    private func ambientFire(_ projection: BattlefieldProjection) -> some View {
        TimelineView(.animation(minimumInterval: 1 / 16, paused: reduceMotion)) { timeline in
            let _ = reduceMotion ? BattlefieldAtlas.availability.revision : 0
            let seconds = reduceMotion ? 0 : max(0, timeline.date.timeIntervalSince(idleStarted))
            ZStack(alignment: .topLeading) {
                ForEach(BattleResources.projection?.fires ?? []) { fire in
                    let time = seconds + fire.phaseSeconds
                    let index = Int(time * fire.fps) % fire.frameCount
                    if let frame = BattlefieldAtlas.frame(fire.resource, columns: fire.columns, rows: fire.rows,
                                                         index: index, inBackground: true) {
                        let rect = projection.fireRect(fire)
                        ZStack {
                            Image(decorative: frame, scale: 1).resizable()
                                .opacity(min(1, fire.alpha))
                            Image(decorative: frame, scale: 1).resizable()
                                .opacity(min(1, fire.glowAlpha * 0.82))
                                .blendMode(.plusLighter)
                        }
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func forMoveButtons(_ projection: BattlefieldProjection, rosterLandings: FootprintLandings?, moveCells: Set<Cell>) -> some View {
        let targets = if placingBarrel != nil {
            barrelTargets.filter { deployedBarrels[$0] == nil }
        } else {
            rosterLandings?.coveredCells ?? moveCells.union(battle.spellCells).union(battle.obstacleTargets)
                .union(animating ? [] : battle.areaAims.map(\.aim))
        }
        return ForEach(targets.sorted { ($0.x, $0.y) < ($1.x, $1.y) }, id: \.self) { cell in
            let label = if let placingBarrel { "Place \(placingBarrel.team.title) barrel at \(cell.label)" }
                        else if let placement, let anchor = rosterLandings?.anchor(covering: cell), let team = placements[anchor] {
                            "Place \(placement.name) for \(team.title) at \(cell.label)"
                        }
                        else if let spell = battle.spell { "Cast \(spell.name) at \(cell.label)" }
                        else if let area = battle.areaAims.first(where: { $0.aim == cell }) {
                            "Area Throw at \(area.splash.center.label)"
                        }
                        else if battle.obstacleTargets.contains(cell) { "Attack obstacle at \(cell.label)" }
                        else if battle.started { "Move to \(cell.label)" }
                        else { "Place at \(cell.label)" }
            tileButton(cell, title: label, projection: projection) { choose(cell) }
        }
    }

    private func barrelControls(_ projection: BattlefieldProjection) -> some View {
        ForEach(deployedBarrels.keys.sorted { ($0.x, $0.y) < ($1.x, $1.y) }, id: \.self) { cell in
            if let slot = deployedBarrels[cell] {
                tileButton(cell, title: "Move \(slot.team.title) barrel \(slot.index + 1) at \(cell.label)",
                           projection: projection) { beginBarrelPlacement(slot) }
                    .simultaneousGesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("battlefield"))
                        .onChanged { _ in
                            if placingBarrel != slot { beginBarrelPlacement(slot) }
                        }
                        .onEnded { value in
                            if let cell = projection.cell(at: value.location) { choose(cell) }
                        })
            }
        }
    }

    private func stackControl(_ stack: Stack, projection: BattlefieldProjection, viewport: CGSize, moveCells: Set<Cell>) -> some View {
        let canAttack = battle.attacks.contains(stack.id)
        let prepared = battle.preparedSpell != nil
        return ForEach(stack.cells, id: \.self) { cell in
            let title = canAttack ? "Attack \(stack.name) at \(cell.label)" : "Inspect \(stack.name)"
            if !prepared && canAttack {
                tileButton(cell, title: title, projection: projection, spatialAction: { point in
                    if let hit = projection.hit(at: point),
                       let aim = BattleAttackPreview.resolve(hit, in: battle), aim.target == stack.id {
                        attack(aim.target, aim.angle)
                    } else {
                        choose(cell)
                    }
                }) {
                    if let aim = hoveredAttack, aim.target == stack.id, aim.targetCell == cell {
                        attack(aim.target, aim.angle)
                    } else {
                        choose(cell)
                    }
                }
                .help("\(stack.name) · \(stack.amount) creatures · Right-click for stats")
                .accessibilityAction(named: Text("Show unit stats")) {
                    showInspection(stack, at: projection.center(stack.cells), viewport: viewport)
                }
            } else if !prepared && !(battle.started && stack.id == battle.active && moveCells.contains(cell)) {
                tileButton(cell, title: title, projection: projection) {
                    select(stack)
                }
                .simultaneousGesture(drag(stack, projection: projection))
                .help("\(stack.name) · \(stack.amount) creatures · Right-click for stats")
                .accessibilityAction(named: Text("Show unit stats")) {
                    showInspection(stack, at: projection.center(stack.cells), viewport: viewport)
                }
            }
        }
    }

    private func tileButton(_ cell: Cell, title: String, projection: BattlefieldProjection,
                            spatialAction: ((CGPoint) -> Void)? = nil,
                            action: @escaping () -> Void) -> some View {
        let tile = projection.tile(cell)
        let rect = tile.bounds
        let shape = TileShape(points: tile.points.map { CGPoint(x: $0.x - rect.minX, y: $0.y - rect.minY) })
        let button = Button(action: action) {
            shape.fill(.clear)
                .frame(width: rect.width, height: rect.height)
                .contentShape(shape)
        }
        .buttonStyle(.plain)
        .contentShape(shape)
        .accessibilityLabel(title)
        return Group {
            if let spatialAction {
                button.highPriorityGesture(SpatialTapGesture(coordinateSpace: .named("battlefield"))
                    .onEnded { spatialAction($0.location) })
            } else {
                button
            }
        }
        .position(x: rect.midX, y: rect.midY)
    }

    private func drag(_ stack: Stack, projection: BattlefieldProjection) -> some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named("battlefield"))
            .onChanged { value in
                guard !battle.started else { return }
                if dragged != stack.id {
                    select(stack)
                    dragged = stack.id
                }
                dragCell = projection.cell(at: value.location)
            }
            .onEnded { value in
                // The live engine validates the drop. The gesture may have started before this stack was selected.
                if dragged == stack.id, let pointer = projection.cell(at: value.location) {
                    choose(pointer)
                }
                dragged = nil
                dragCell = nil
            }
    }
}

enum BattlefieldGuides {
    static func landing(_ cells: [Cell], projection: BattlefieldProjection, in context: GraphicsContext) {
        let path = Path(projection.footprintHighlight(for: cells))
        context.fill(path, with: .color(BattlePalette.color(0xffc85a).opacity(0.27)))
        let width = max(1.5, projection.spriteCellSize * 0.034)
        context.stroke(path, with: .color(.black.opacity(0.84)), lineWidth: width + 2)
        context.stroke(path, with: .color(BattlePalette.color(0xffe2a0)), lineWidth: width)
    }

    static func splash(_ cells: [Cell], center: Cell, opacity: Double, projection: BattlefieldProjection,
                       in context: GraphicsContext) {
        let affected = Path(projection.footprintHighlight(for: cells))
        let accent = BattlePalette.color(0xff7858)
        context.fill(affected, with: .color(accent.opacity(0.28 * opacity)))
        context.stroke(affected, with: .color(.black.opacity(0.85 * opacity)), lineWidth: 3)
        context.stroke(affected, with: .color(accent.opacity(0.96 * opacity)), lineWidth: 1.6)
        if cells.contains(center) {
            let hit = Path(projection.footprintHighlight(for: [center]))
            context.stroke(hit, with: .color(BattlePalette.color(0xffe2a0).opacity(opacity)), lineWidth: 2)
        }
    }
}

private enum RosterDragHover: Equatable {
    case outside, over(Cell?)
}

private struct RosterDropTarget: DropDelegate {
    let enabled: Bool
    let projection: BattlefieldProjection
    let landings: FootprintLandings?
    @Binding var hovered: RosterDragHover
    let place: @MainActor (Int, Cell) -> Bool

    func validateDrop(info: DropInfo) -> Bool { enabled }

    func dropEntered(info: DropInfo) {
        updateHover(at: info.location)
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        let cell = updateHover(at: info.location)
        return DropProposal(operation: cell.flatMap { landings?.anchor(covering: $0) } == nil ? .forbidden : .copy)
    }

    func dropExited(info: DropInfo) { hovered = .outside }

    func performDrop(info: DropInfo) -> Bool {
        hovered = .outside
        guard enabled, let cell = projection.cell(at: info.location), landings?.anchor(covering: cell) != nil,
              let item = info.itemProviders(for: [RosterCreatureDrag.contentType]).first else { return false }
        let place = self.place
        _ = item.loadTransferable(type: RosterCreatureDrag.self) { result in
            guard case let .success(creature) = result else { return }
            Task { @MainActor in _ = place(creature.id, cell) }
        }
        return true
    }

    @discardableResult
    private func updateHover(at point: CGPoint) -> Cell? {
        let cell = projection.cell(at: point)
        let position = RosterDragHover.over(cell)
        if hovered != position { hovered = position }
        return cell
    }
}

private struct TileShape: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        Path(BattlefieldProjection.Tile(points: points).outline)
    }
}
