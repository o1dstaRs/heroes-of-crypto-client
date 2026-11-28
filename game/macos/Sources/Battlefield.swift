import SwiftUI

@Observable
private final class BattlefieldPointer {
    var location: CGPoint?
}

private struct BattlefieldPointerHint: View {
    let message: String
    let pointer: BattlefieldPointer
    let dragLocation: CGPoint?
    @State private var size = CGSize.zero

    var body: some View {
        GeometryReader { geometry in
            if let anchor = dragLocation ?? pointer.location {
                Text(LocalizedStringKey(message))
                    .font(BattleResources.display(13))
                    .foregroundStyle(BattlePalette.color(0xf2cca1))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(BattlePalette.color(0x140c08).opacity(0.94), in: .rect(cornerRadius: 7))
                    .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(BattlePalette.bronze.opacity(0.75)) }
                    .frame(maxWidth: max(1, min(300, geometry.size.width - 16)))
                    .fixedSize(horizontal: true, vertical: true)
                    .onGeometryChange(for: CGSize.self, of: { $0.size }) { size = $0 }
                    .position(pointerHintPosition(anchor: anchor, size: size, viewport: geometry.size))
                    .opacity(size.width > 0 ? 1 : 0)
                    .accessibilityIdentifier("BattlefieldPointerHint")
            }
        }
        .allowsHitTesting(false)
    }
}

struct BattlefieldGhost {
    let name: String
    let footprint: Footprint
    let team: Team
    let anchor: Cell
}

struct Battlefield: View {
    @Environment(\.locale) private var locale
    let battle: BattleView
    let playback: BattlePlayback
    let animating: Bool
    let inspectionEnabled: Bool
    let showStackFootprints: Bool
    let staggerDuplicateIdle: Bool
    let suggestion: BattleSuggestion?
    let projection: BattlefieldProjection?
    let placement: SandboxCreature?
    let placements: [Cell: Team]
    let placementHint: String?
    let rosterDragLocation: CGPoint?
    let placingBarrel: SandboxBarrelSlot?
    let barrelTargets: Set<Cell>
    let deployedBarrels: [Cell: SandboxBarrelSlot]
    let deploymentZones: [Team: SandboxTeamPreview]
    let inspectedStackID: Int?
    let creatureLevel: (Stack) -> Int?
    let beginBarrelPlacement: (SandboxBarrelSlot) -> Void
    let choose: (Cell) -> Void
    let attack: (Int, BattleAttackAngle) -> Void
    let select: (Stack) -> Void
    let previewThrough: (CGPoint) -> BattleThroughAim?
    let fireThrough: (CGPoint) -> Void
    let rotateFireWall: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.sandboxCursor) private var cursor
    @State private var pointer = BattlefieldPointer()
    @State private var hovered: Cell?
    @State private var hoveredStackID: Int?
    @State private var hoveredAttack: BattleAttackPreview?
    @State private var hoveredThrough: BattleThroughAim?
    @State private var dragged: Int?
    @State private var dragCell: Cell?
    @State private var idleStarted = Date()
    @State private var inspection: UnitInspection?
    @State private var firePitOffsets: [CGFloat] = []

    private struct UnitInspection: Identifiable {
        let id: Int
        let anchor: UnitPoint
    }

    private var canInspect: Bool { inspectionEnabled && !animating && battle.winner == nil && !battle.stalled }

    private var hoveredSpell: BattleSpellTarget? {
        battle.spellTargets?.first { $0.target == hoveredStackID }
    }

    private var hoveredMeteor: BattleMeteorAim? { battle.meteorAims?.first { $0.anchor == hovered } }
    private var hoveredArea: BattleAreaAim? { battle.areaAims.first { $0.aim == hovered } }

    private var targetTints: [Int: UInt32] {
        guard canInspect, battle.playerTurn else { return [:] }
        if battle.preparedSpell != nil {
            if let meteor = hoveredMeteor {
                return Dictionary(meteor.hits.map { ($0.target, 0xe02b16) }, uniquingKeysWith: { first, _ in first })
            }
            guard let spell = hoveredSpell else { return [:] }
            let color: UInt32 = spell.positive ? 0x18c868 : 0xe02b16
            var tints = Dictionary(spell.secondary.map { ($0.target, color) }, uniquingKeysWith: { first, _ in first })
            tints[spell.primary] = spell.spared ? 0xb8860b : color
            return tints
        }
        var targets = Set(shotHits.map(\.target))
        if let attack = hoveredAttack {
            if attack.angle.side == nil { targets.insert(attack.target) }
            else if let primary = attack.angle.range?.primary { targets.insert(primary) }
        }
        return Dictionary(uniqueKeysWithValues: targets.map { ($0, 0xff3030) })
    }

    var body: some View {
        GeometryReader { geometry in
            if let projection {
                let rosterLandings = placement.map { FootprintLandings(footprint: $0.footprint, anchors: Set(placements.keys)) }
                let moveLandings = battle.movementLandings
                let moveCells = !animating && placement == nil && placingBarrel == nil ? moveLandings.coveredCells : []
                let placementCell = if let rosterDragLocation { projection.cell(at: rosterDragLocation) } else { hovered }
                let hoveredUnit = battle.stacks.first { $0.id == hoveredStackID }
                let draft = rosterPlacement(at: placementCell, from: rosterLandings)
                let hint = placementCell.flatMap { cell -> String? in
                    guard canInspect else { return nil }
                    if placement != nil { return draft == nil ? placementHint : nil }
                    let canAttackHere = hoveredAttack != nil || hoveredThrough?.valid == true ||
                        battle.areaAims.contains { $0.aim == cell } || battle.obstacleTargets.contains(cell)
                    let target = if let ray = hoveredThrough {
                        battle.stacks.first { $0.id == ray.hits.first?.target }
                    } else { hoveredUnit }
                    return battle.actionHint(at: cell, target: target, canAttackHere: canAttackHere, locale: locale)
                }
                let landing = movePreview(from: moveLandings)
                let ghost = draft ?? (dragged == nil && landing?.anchor != battle.movingStack?.anchor ? landing : nil)
                let cursorCell = battle.spell?.aim == .unit ? unitSpellCell(on: hoveredUnit) : placementCell
                let cursorMode = inspectionEnabled ? SandboxCursorMode.resolve(at: cursorCell, aim: hoveredAttack, in: battle,
                    through: hoveredThrough, hoveringStack: hoveredUnit != nil,
                    placing: placement != nil || placingBarrel != nil,
                    canPlace: draft != nil || hovered.map(barrelTargets.contains) == true, animating: animating) : .standard
                let dragPoint = dragged == nil ? nil : landing.map { target in
                    BattlefieldProjection.logicalCenter(target.footprint.cells(at: target.anchor))
                }
                let revealsRanges = canInspect && placement == nil && placingBarrel == nil && dragged == nil
                let selectedRangeID = revealsRanges ? inspection?.id ?? inspectedStackID : nil
                let hoveredRangeID = revealsRanges ? hoveredStackID : nil
                let auras = BattlefieldAura.visible(in: battle, selectedID: selectedRangeID, hoveredID: hoveredRangeID, draggedID: dragged)
                ZStack(alignment: .topLeading) {
                    BattlefieldSprites(battle: battle, playback: playback, projection: projection,
                                       animating: animating, dragged: dragged, dragPoint: dragPoint, ghost: ghost,
                                       targetTints: targetTints, auras: auras, staggerDuplicateIdle: staggerDuplicateIdle,
                                       viewport: geometry.size) {
                        floor(projection, moveCells: moveCells)
                        if battle.map == .firePit {
                            FirePit(projection: projection, boardSize: battle.size, flowing: !battle.lava.isEmpty,
                                    registration: firePitOffsets)
                        }
                        if revealsRanges {
                            let ranges = BattleShotRange.visible(in: battle, selectedID: selectedRangeID, hoveredID: hoveredRangeID)
                            if !ranges.isEmpty { BattleShotRangeOverlay(ranges: ranges, projection: projection) }
                        }
                        boardGuides(projection, landing: draft ?? landing)
                        spellAreaGuide(projection)
                        projectileGuide(projection)
                    }
                    meleeAttackGuide(projection)
                    if canInspect, hoveredAttack == nil, hoveredThrough?.valid != true, let suggestion {
                        BattlefieldSuggestion(advice: suggestion, battle: battle, projection: projection)
                    }
                    projectileLabels(projection).zIndex(1999)
                    forMoveButtons(projection, rosterLandings: rosterLandings, moveCells: moveCells).zIndex(2000)
                    barrelControls(projection).zIndex(2001)
                    ForEach(battle.stacks) { stack in
                        stackControl(stack, projection: projection, viewport: geometry.size, moveCells: moveCells).zIndex(2001)
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .overlay {
                    if let hint {
                        BattlefieldPointerHint(message: hint, pointer: pointer, dragLocation: rosterDragLocation)
                    }
                }
                .contentShape(Rectangle())
                .clipped()
                .highPriorityGesture(
                    SpatialTapGesture(coordinateSpace: .named("battlefield")).onEnded { tap in
                        usePointerTarget(at: tap.location, in: projection)
                    },
                    including: canInspect && battle.playerTurn &&
                        (battle.canAimThrough == true || battle.spell?.aim == .unit || hoveredAttack != nil)
                        ? .all : .subviews
                )
                .background {
                    BattlefieldSecondaryClick(enabled: canInspect,
                        pointerMoved: { point in
                            pointer.location = point
                            refreshPointer(in: projection)
                        },
                        rotateFireWall: canInspect && battle.fireWallAims != nil ? rotateFireWall : nil) { point in
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
                .onChange(of: battle.revision) {
                    refreshPointer(in: projection)
                    if let inspection, !battle.stacks.contains(where: { $0.id == inspection.id }) {
                        self.inspection = nil
                    }
                }
                .onChange(of: animating) { refreshPointer(in: projection) }
                .onChange(of: inspectionEnabled) { refreshPointer(in: projection) }
                .onChange(of: cursorMode, initial: true) { cursor?.setBoard(cursorMode) }
                .onDisappear { cursor?.setBoard(.standard) }
                .onChange(of: canInspect) { if !canInspect { inspection = nil } }
                .task(id: battle.map) {
                    if battle.map == .firePit { firePitOffsets = await FirePit.registrationOffsets() }
                }
            } else {
                ContentUnavailableView("Battlefield unavailable", systemImage: "square.grid.3x3")
            }
        }
    }

    private func refreshPointer(in projection: BattlefieldProjection) {
        let point = pointer.location
        let hit = point.flatMap { projection.hit(at: $0) }
        if hovered != hit?.cell { hovered = hit?.cell }
        let stack = canInspect ? point.flatMap { projection.stackForInspection(at: $0, among: battle.stacks) } : nil
        let aim = canInspect && battle.playerTurn ? point.flatMap {
            BattleAttackPreview.resolve(at: $0, floor: hit, over: stack, projection: projection, in: battle)
        } : nil
        if hoveredAttack != aim { hoveredAttack = aim }
        let through = canInspect && battle.canAimThrough == true ? hit.flatMap { previewThrough($0.logicalPoint) } : nil
        if hoveredThrough != through { hoveredThrough = through }
        if hoveredStackID != stack?.id { hoveredStackID = stack?.id }
    }

    private func unitSpellCell(on stack: Stack?) -> Cell? {
        stack?.cells.first(where: battle.spellCells.contains)
    }

    private func usePointerTarget(at point: CGPoint, in projection: BattlefieldProjection) {
        let hit = projection.hit(at: point)
        if battle.canAimThrough == true {
            if let hit { fireThrough(hit.logicalPoint) }
            return
        }
        let stack = projection.stackForInspection(at: point, among: battle.stacks)
        if battle.spell?.aim == .unit {
            if let cell = unitSpellCell(on: stack) { choose(cell) }
        } else if let aim = BattleAttackPreview.resolve(at: point, floor: hit, over: stack, projection: projection, in: battle) {
            attack(aim.target, aim.angle)
        }
    }

    private func showInspection(_ stack: Stack, at point: CGPoint, viewport: CGSize) {
        guard canInspect, viewport.width > 0, viewport.height > 0 else { return }
        let anchor = UnitPoint(x: point.x / viewport.width, y: point.y / viewport.height)
        inspection = UnitInspection(id: stack.id, anchor: anchor)
    }

    private func rosterPlacement(at cell: Cell?, from landings: FootprintLandings?) -> BattlefieldGhost? {
        guard !battle.started, let placement, let cell,
              let anchor = landings?.anchor(covering: cell), let team = placements[anchor] else { return nil }
        return BattlefieldGhost(name: placement.name, footprint: placement.footprint, team: team, anchor: anchor)
    }

    private func movePreview(from landings: FootprintLandings) -> BattlefieldGhost? {
        guard !animating, placement == nil, placingBarrel == nil, battle.preparedSpell == nil,
              battle.canAimThrough != true,
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
                let spellCells = animating || battle.damageSpell != nil || battle.spell?.name == "Smoke" ||
                    battle.spell?.aim == .unit ? [] : Set(battle.spellCells)
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
                    let attack = !animating && battle.mode != .ranged && battle.attacks.contains(stack.id)
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
            if showStackFootprints { drawStackFootprints(projection, in: context) }
            if let landing {
                BattlefieldGuides.landing(landing.footprint.cells(at: landing.anchor), projection: projection, in: context)
            }
            guard !animating, battle.playerTurn else { return }
            if let spell = hoveredSpell, let center = spell.splash {
                let holes = Set(battle.holes)
                let cells = spell.footprint?.filter { !holes.contains($0) } ?? []
                BattlefieldGuides.splash(cells, center: center, opacity: 1, projection: projection, in: context)
            }
            guard battle.preparedSpell == nil else { return }
            let obstacle = hoveredAttack?.angle.range?.obstacle?.point ?? (hoveredThrough?.obstacle == true ? hoveredThrough?.end.point : nil)
            if let obstacle {
                let cell = Cell(x: Int32(obstacle.x.rounded(.down)), y: Int32(obstacle.y.rounded(.down)))
                BattlefieldGuides.projectileTarget([cell], projection: projection, tint: BattlePalette.color(0xff4444), in: context)
            }
            if let hovered, let area = battle.areaAims.first(where: { $0.aim == hovered }) {
                drawSplashGuide(area.splash, projection: projection, in: context)
            } else if let splash = hoveredAttack?.angle.splash {
                drawSplashGuide(splash, projection: projection, in: context)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawStackFootprints(_ projection: BattlefieldProjection, in context: GraphicsContext) {
        for stack in battle.stacks {
            guard let anchor = stack.anchor else { continue }
            let width = CGFloat(stack.footprint.width)
            let height = CGFloat(stack.footprint.height)
            let left = CGFloat(anchor.x + 1) - width
            let bottom = CGFloat(anchor.y + 1) - height
            let bounds = CGRect(x: left, y: bottom, width: width, height: height)
            let color = BattlePalette.team(stack.team)
            let outline = Path(projection.outline(of: bounds))
            context.fill(outline, with: .color(color.opacity(0.18)))
            context.stroke(outline, with: .color(color.opacity(0.55)), lineWidth: max(1, projection.spriteCellSize * 0.025))

            let gap: CGFloat = 0.05
            let pipWidth = min(0.15, (width * 0.82 - 4 * gap) / 5)
            let rowLeft = bounds.midX - (5 * pipWidth + 4 * gap) / 2
            let filled = stack.stackPower.rounded()
            for index in 0..<5 {
                let pip = CGRect(x: rowLeft + CGFloat(index) * (pipWidth + gap), y: bottom + 0.1, width: pipWidth, height: 0.07)
                let path = Path(projection.outline(of: pip))
                if Double(index) < filled {
                    context.fill(path, with: .color(color.opacity(0.95)))
                } else {
                    context.fill(path, with: .color(.black.opacity(0.38)))
                    context.stroke(path, with: .color(color.opacity(0.38)), lineWidth: 1)
                }
            }
        }
    }

    @ViewBuilder
    private func spellAreaGuide(_ projection: BattlefieldProjection) -> some View {
        if canInspect, battle.playerTurn {
            let wall = battle.fireWallAims?.first { $0.anchor == hovered }
            if let meteor = hoveredMeteor {
                let hitIDs = Set(meteor.hits.map(\.target))
                let hitCells = Set(battle.stacks.filter { hitIDs.contains($0.id) }.flatMap(\.cells))
                pulsingSpellArea { context, pulse in
                    for cell in meteor.footprint {
                        let path = Path(projection.tile(cell).outline)
                        context.fill(path, with: .color(BattlePalette.color(0xff6a1e)
                            .opacity(hitCells.contains(cell) ? 0.28 + 0.14 * pulse : 0.1)))
                        context.stroke(path, with: .color(BattlePalette.color(0xffc46b).opacity(0.7)), lineWidth: 1.1)
                    }
                }
            } else if let wall {
                pulsingSpellArea { context, pulse in
                    BattleTerrainAim.drawFireWall(wall, projection: projection, pulse: pulse, in: context)
                }
            } else if battle.spell?.name == "Smoke", let anchor = hovered, battle.spellCells.contains(anchor) {
                pulsingSpellArea { context, pulse in
                    BattleTerrainAim.drawSmoke(anchor, projection: projection, pulse: pulse, in: context)
                }
            }
        }
    }

    private func pulsingSpellArea(_ draw: @escaping (GraphicsContext, Double) -> Void) -> some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { timeline in
            let time = timeline.date.timeIntervalSince(idleStarted)
            Canvas { context, _ in draw(context, reduceMotion ? 0.5 : (sin(time * (2 * .pi / 2.5)) + 1) / 2) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawSplashGuide(_ splash: BattleSplash, projection: BattlefieldProjection, in context: GraphicsContext) {
        let cells = splash.cells(size: battle.size, excluding: Set(battle.holes))
        BattlefieldGuides.splash(cells, center: splash.center, opacity: 1, projection: projection, in: context)
    }

    @ViewBuilder
    private func meleeAttackGuide(_ projection: BattlefieldProjection) -> some View {
        if canInspect, battle.preparedSpell == nil, let aim = hoveredAttack, aim.angle.side == nil,
           let actor = battle.activeStack, let target = battle.stacks.first(where: { $0.id == aim.target }) {
            Canvas { context, _ in
                let landing = actor.footprint.cells(at: aim.angle.cell)
                let cellSize = projection.screenCellWidth
                let scale = projection.worldPointScale
                let aspect = projection.screenCellHeight / max(0.001, cellSize)
                let footprint = Path { path in
                    for cell in landing { path.addPath(Path(projection.calibratedCellOutline(cell, inset: 0.055))) }
                }
                var ground = context
                ground.scaleBy(x: 1, y: aspect)
                let outline = footprint.applying(CGAffineTransform(scaleX: 1, y: 1 / aspect))
                let borderWidth = max(2.5 * scale, cellSize * 0.035)
                ground.stroke(outline, with: .color(BattlePalette.color(0x17120b).opacity(0.9)),
                              style: StrokeStyle(lineWidth: borderWidth + 3 * scale, lineJoin: .round))
                ground.stroke(outline, with: .color(BattlePalette.color(0xffe2a0)),
                              style: StrokeStyle(lineWidth: borderWidth, lineJoin: .round))
                guard let sword = BattleResources.cgImage("cursor_melee") else { return }
                let from = BattlefieldProjection.logicalCenter(landing)
                let center = BattlefieldProjection.logicalCenter(target.cells)
                let dx = from.x - center.x, dy = from.y - center.y
                let axis = max(abs(dx), abs(dy))
                guard axis > 0 else { return }
                let edge = projection.point(x: center.x + dx / axis * CGFloat(target.footprint.width) / 2,
                                            y: center.y + dy / axis * CGFloat(target.footprint.height) / 2)
                let step = CGFloat.pi / 4
                let angle = (atan2(-dy, -dx) / step).rounded() * step
                let length = cellSize / 2
                let swordCenter = CGPoint(x: edge.x - cos(angle) * length / 2, y: edge.y + sin(angle) * length / 2 * aspect)
                var mark = context
                mark.translateBy(x: swordCenter.x, y: swordCenter.y)
                mark.scaleBy(x: 1, y: aspect)
                mark.rotate(by: .radians(Double(atan2(CGFloat(23), CGFloat(-18)) - angle)))
                let width = CGFloat(sword.width) * length / 29
                let height = CGFloat(sword.height) * length / 29
                mark.draw(Image(decorative: sword, scale: 1).interpolation(.none),
                          in: CGRect(x: -width / 2, y: -height / 2, width: width, height: height))
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func projectileGuide(_ projection: BattlefieldProjection) -> some View {
        if canInspect, battle.playerTurn, let actor = battle.activeStack {
            if let spell = hoveredSpell, let target = spell.end?.point {
                BattlefieldProjectileGuide(from: visualCenter(actor, projection: projection),
                                           to: projection.point(x: target.x, y: target.y),
                                           cellSize: projection.spriteCellSize, kind: .magic(positive: spell.positive))
            } else if battle.preparedSpell == nil, let target = rangedGuideEnd {
                let origin = BattlefieldProjection.logicalCenter(actor.cells)
                let from = BattlefieldProjection.footprintExit(from: origin, to: target, footprint: actor.footprint)
                BattlefieldProjectileGuide(from: projection.point(x: from.x, y: from.y),
                                           to: projection.point(x: target.x, y: target.y),
                                           cellSize: projection.spriteCellSize,
                                           kind: .ranged(rowScale: 1 - 0.1 * min(1, max(0, target.y / 15))))
            }
        }
    }

    private var rangedGuideEnd: CGPoint? {
        if let ray = hoveredThrough, ray.valid { return ray.end.point }
        if let cell = hovered, let area = battle.areaAims.first(where: { $0.aim == cell }) {
            return BattlefieldProjection.logicalCenter([area.splash.center])
        }
        if let angle = hoveredAttack?.angle, let side = angle.side {
            return angle.range?.obstacle?.point ?? angle.splash.map { BattlefieldProjection.logicalCenter([$0.center]) }
                ?? side.point(on: angle.cell)
        }
        if battle.mode == .ranged, let cell = hovered, battle.obstacleTargets.contains(cell) {
            return BattlefieldProjection.logicalCenter([cell])
        }
        return nil
    }

    private func visualCenter(_ stack: Stack, projection: BattlefieldProjection) -> CGPoint {
        let actor = CreatureAnimation.boardPresentation(stack, position: BattlefieldProjection.logicalCenter(stack.cells),
                                                        projection: projection, facing: stack.team == .player ? 1 : -1)
        return CGPoint(x: actor.ground.x, y: actor.ground.y - actor.height * 0.45)
    }

    @ViewBuilder
    private func projectileLabels(_ projection: BattlefieldProjection) -> some View {
        if canInspect, battle.playerTurn, let actor = battle.activeStack {
            if let spell = battle.spell {
                let origin = visualCenter(actor, projection: projection)
                HStack(spacing: 5) {
                    if let icon = BattleResources.image("spell-\(BattleResources.creature(spell.name))") {
                        Image(nsImage: icon).resizable().frame(width: 21, height: 21)
                    }
                    Text(LocalizedStringKey(spell.name)).font(BattleResources.display(12))
                }
                .foregroundStyle(BattlePalette.parchment)
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(.black.opacity(0.86), in: Capsule())
                .overlay { Capsule().strokeBorder(BattlePalette.bronze) }
                .fixedSize()
                .position(x: origin.x, y: origin.y - 21)
                .allowsHitTesting(false)
                if let aim = hoveredSpell, let damage = aim.damage,
                   let victim = battle.stacks.first(where: { $0.id == aim.primary }) {
                    damageForecast(min: damage, max: damage, over: victim, projection: projection)
                }
                ForEach(hoveredMeteor?.hits ?? hoveredSpell?.secondary ?? [], id: \.target) { hit in
                    if let victim = battle.stacks.first(where: { $0.id == hit.target }) {
                        damageForecast(min: hit.damage, max: hit.damage, over: victim, projection: projection)
                    }
                }
            } else if let aim = hoveredAttack,
                      let victim = battle.stacks.first(where: { $0.id == (aim.angle.range?.primary ?? aim.target) }),
                      !shotHits.isEmpty {
                attackForecast(shotHits, over: victim, divisor: aim.angle.range?.divisor, projection: projection)
            } else {
                ForEach(shotHits, id: \.target) { hit in
                    if let victim = battle.stacks.first(where: { $0.id == hit.target }) {
                        attackForecast([hit], over: victim, divisor: nil, projection: projection)
                    }
                }
                if let area = hoveredArea, let divisor = area.divisor {
                    let cells = area.splash.cells(size: battle.size, excluding: Set(battle.holes))
                    if let right = cells.map(\.x).max(), let bottom = cells.map(\.y).min() {
                        let corner = projection.point(x: CGFloat(right + 1) - 0.72, y: CGFloat(bottom) + 0.08)
                        BattleDamageForecast.areaRange(divisor, at: corner, projection: projection)
                    }
                }
            }
        }
    }

    private var shotHits: [BattleShotHit] {
        if let ray = hoveredThrough, ray.valid { return BattleShotHit.byVictim(ray.hits) }
        if let area = hoveredArea { return BattleShotHit.byVictim(area.hits ?? []) }
        guard let angle = hoveredAttack?.angle else { return [] }
        var hits = angle.range?.hits ?? angle.hits ?? []
        if let hit = angle.range?.hit ?? angle.hit { hits.insert(hit, at: 0) }
        return BattleShotHit.byVictim(hits)
    }

    private func attackForecast(_ hits: [BattleShotHit], over victim: Stack, divisor: Int?,
                                projection: BattlefieldProjection) -> some View {
        var damage = (min: 0.0, max: 0.0)
        var kills = (min: 0, max: 0)
        for hit in hits {
            guard let stack = battle.stacks.first(where: { $0.id == hit.target }) else { continue }
            damage.min += hit.min
            damage.max += hit.max
            kills.min += predictedLosses(hit.min, over: stack)
            kills.max += predictedLosses(hit.max, over: stack)
        }
        let gaze = BattleDamageForecast.gaze(hits.first { $0.target == victim.id }?.gaze)
        return forecastLabel(min: damage.min, max: damage.max, kills: kills, divisor: divisor,
                             gaze: gaze, over: victim, projection: projection)
    }

    private func predictedLosses(_ damage: Double, over stack: Stack) -> Int {
        guard damage > 0, stack.maxHP > 0 else { return 0 }
        return Int(min(Double(stack.amount), max(0, (damage + stack.maxHP - stack.hp) / stack.maxHP)))
    }

    private func damageForecast(min: Double, max: Double, over stack: Stack, projection: BattlefieldProjection) -> some View {
        forecastLabel(min: min, max: max, kills: (predictedLosses(min, over: stack), predictedLosses(max, over: stack)),
                      divisor: nil, gaze: nil, over: stack, projection: projection)
    }

    private func forecastLabel(min: Double, max: Double, kills: (min: Int, max: Int), divisor: Int?, gaze: String?,
                               over stack: Stack, projection: BattlefieldProjection) -> some View {
        let band = BattleDamageForecast.band(Int(min.rounded()), Int(max.rounded()))
        let damage = if let divisor, divisor > 1 { "1/\(divisor)  \(band)" } else { band }
        return BattleDamageForecast(damage: damage, kills: kills.max > 0 ? BattleDamageForecast.band(kills.min, kills.max) : nil,
                                    gaze: gaze, divisor: divisor, target: stack, projection: projection)
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
    static func projectileTarget(_ cells: [Cell], projection: BattlefieldProjection, tint: Color, in context: GraphicsContext) {
        let path = Path(projection.footprintHighlight(for: cells))
        context.fill(path, with: .color(tint.opacity(0.24)))
        context.stroke(path, with: .color(tint.opacity(0.92)), lineWidth: 1.8)
    }

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

private struct TileShape: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        Path(BattlefieldProjection.Tile(points: points).outline)
    }
}
