import SwiftUI

@MainActor
struct BattleCombatOverlay {
    let playback: BattlePlayback
    let projection: BattlefieldProjection
    let battle: BattleView
    let reduceMotion: Bool

    func draw(at now: Date, size: CGSize, in canvas: GraphicsContext) {
        var healthLanes = [Int: Int]()
        var statusRows = [Int: [BattleCombatCue]]()
        let cell = projection.spriteCellSize
        for cue in playback.combatCues where now >= cue.started && now < cue.endsAt {
            if case .status = cue.kind {
                if let clip = cue.statusClip, clip.style == .petrifying {
                    drawPetrification(cue, clip: clip, at: now, in: canvas)
                } else {
                    statusRows[cue.stack.id, default: []].append(cue)
                }
                continue
            }
            let age = now.timeIntervalSince(cue.started)
            let progress = age / cue.duration
            let facing: CGFloat = cue.stack.team == .player ? 1 : -1
            let figure = CreatureAnimation.boardPresentation(cue.stack, position: cue.position,
                                                              projection: projection, facing: facing)
            let height = max(9, cell * 0.20)
            let flag = CreatureAnimation.flagPosition(for: cue.stack.name, presentation: figure,
                                                       projection: projection, facing: facing, height: height)
            let edge = flag.y - height / 2
            var context = canvas
            switch cue.kind {
            case let .health(delta, casualties):
                let lane = healthLanes[cue.stack.id, default: 0]
                healthLanes[cue.stack.id, default: 0] += 1
                let fontSize = max(15, cell * 0.43)
                let rows: CGFloat = casualties > 0 ? 1.62 : 0.79
                let center = CGPoint(x: min(max(39, flag.x), size.width - 39),
                                     y: max(fontSize, edge - fontSize * (rows + CGFloat(lane) * 1.45)))
                // Flag-anchored numbers fade in place at full size on the web.
                animate(&context, at: center, progress: progress, pop: 0.20, startScale: 1, fadeIn: 0.125, fadeOut: 0.62)
                drawHealth(delta, casualties: casualties, tone: cue.damageTone, fontSize: fontSize, in: context)
            case .status: break
            }
        }
        let elapsed = max(0, now.timeIntervalSince(playback.started))
        for id in statusRows.keys.sorted() {
            guard let row = statusRows[id], let first = row.first else { continue }
            let live = battle.stacks.first { $0.id == id }
            let captured = row.first { $0.statusName == "Borrowed Grace" || $0.statusName == "Magic Reflection" }
            guard let stack = live ?? captured?.stack else { continue }
            let position = live != nil && !reduceMotion ? playback.logicalPosition(stack, at: elapsed) :
                live.map { BattlefieldProjection.logicalCenter($0.cells) } ?? captured?.position ?? first.position
            let facing = playback.facing(for: stack, elapsed: elapsed, reducedMotion: reduceMotion)
            let figure = CreatureAnimation.boardPresentation(stack, position: position, projection: projection, facing: facing)
            let height = max(9, cell * 0.20)
            let flag = CreatureAnimation.flagPosition(for: stack.name, presentation: figure,
                                                       projection: projection, facing: facing, height: height)
            drawStatusRow(row, flag: flag, edge: flag.y - height / 2, cell: cell, viewport: size, now: now, in: canvas)
        }
    }

    private func drawPetrification(_ cue: BattleCombatCue, clip: BattleStatusEffects.Clip,
                                   at now: Date, in canvas: GraphicsContext) {
        let progress = now.timeIntervalSince(cue.started) / cue.duration
        guard let pose = clip.sample(at: progress, appearanceSpeed: 1, reducedMotion: reduceMotion),
              let image = BattlefieldAtlas.frame(clip.resource, columns: clip.cols, rows: clip.rows, index: pose.frame,
                                                 maxDimension: clip.pixelLimit, inBackground: !reduceMotion, combat: true) else { return }
        let elapsed = max(0, now.timeIntervalSince(playback.started))
        let facing = playback.facing(for: cue.stack, elapsed: elapsed, reducedMotion: reduceMotion)
        let logical = reduceMotion ? cue.position : playback.logicalPosition(cue.stack, at: elapsed)
        let figure = CreatureAnimation.boardPresentation(cue.stack, position: logical, projection: projection, facing: facing)
        let flag = CreatureAnimation.flagPosition(for: cue.stack.name, presentation: figure, projection: projection, facing: facing,
                                                  height: BattleStackFlag.height(for: projection.spriteCellSize))
        let side = projection.screenCellWidth * 1.45
        let rect = CGRect(x: flag.x - side / 2, y: flag.y - side * 0.86 - projection.screenCellHeight * 0.07,
                          width: side, height: side)
        var context = canvas
        context.opacity *= pose.opacity
        context.draw(Image(decorative: image, scale: 1).interpolation(.high), in: rect)
    }

    private func animate(_ context: inout GraphicsContext, at position: CGPoint, progress: Double,
                         pop: Double, startScale: Double, fadeIn: Double, fadeOut: Double) {
        let growth = min(1, progress / pop)
        let scale = reduceMotion ? 1 : startScale + (1 - startScale) * (1 - (1 - growth) * (1 - growth))
        if !reduceMotion {
            context.opacity *= min(1, progress / fadeIn, (1 - progress) / (1 - fadeOut))
        }
        context.translateBy(x: position.x, y: position.y)
        context.scaleBy(x: scale, y: scale)
    }

    private func drawHealth(_ delta: Double, casualties: Int, tone: BattleCombatCue.DamageTone?, fontSize: CGFloat, in context: GraphicsContext) {
        let healing = delta > 0
        let colors: (UInt32, UInt32) = if healing { (0x66ff99, 0x0b3d1e) }
            else if tone == .fireWall { (0xffb347, 0x5a1500) }
            else if tone == .reflection { (0xbfefff, 0x12384d) }
            else if tone == .petrifyingGaze { (0xd8d8d8, 0x5a5a5a) }
            else { (0xff3333, 0x4a0000) }
        let fill = BattlePalette.color(colors.0)
        let outline = BattlePalette.color(colors.1)
        let font = Font.system(size: fontSize, weight: .black).monospacedDigit()
        outlined((healing ? "+" : "−") + hudNumber(abs(delta)), at: .zero, font: font,
                 fill: fill, outline: outline, in: context)
        guard casualties > 0 else { return }
        let icon = CGRect(x: -fontSize * 0.99, y: fontSize * 0.56, width: fontSize * 0.83, height: fontSize * 0.83)
        if let art = BattleResources.cgImage("combat_kills_skull_icon_v1") {
            context.draw(Image(decorative: art, scale: 1), in: icon)
        } else {
            context.draw(Image(systemName: "skull"), in: icon)
        }
        outlined(casualties.formatted(), at: CGPoint(x: fontSize * 0.41, y: fontSize * 0.99),
                 font: .system(size: fontSize * 0.73, weight: .black), fill: BattlePalette.parchment,
                 outline: .black, in: context)
    }

    private struct StatusTile {
        let cue: BattleCombatCue
        let name: String
        let clip: BattleStatusEffects.Clip?
        let icon: String?
        let size: CGSize
        let cell: CGFloat
        let progress: Double

        var compact: Bool { clip?.style == .beholder }
        var hasCaption: Bool { !cue.borrowedIcon }
        var captionSize: CGFloat { cell * (compact ? 0.20 : 0.25) }
        var captionWidth: CGFloat { cell * (compact ? 1 : 1.9) }
        var captionHeight: CGFloat { hasCaption ? captionSize * 2.4 + cell * 0.055 : 0 }
        var layoutWidth: CGFloat {
            if compact { return cell * 1.04 }
            return max(size.width, hasCaption ? captionWidth : 0)
        }
    }

    private func drawStatusRow(_ row: [BattleCombatCue], flag: CGPoint, edge: CGFloat, cell: CGFloat, viewport: CGSize,
                               now: Date, in canvas: GraphicsContext) {
        let art = BattleStatusEffects.bundled
        let tiles: [StatusTile] = row.compactMap { cue in
            guard case let .status(name, kind) = cue.kind else { return nil }
            let clip = cue.statusClip
            let icon = clip == nil && (cue.borrowedIcon || kind == .buff || name == "Dismorale") ? art?.icons[name] : nil
            let width: CGFloat
            let height: CGFloat
            switch clip?.style {
            case .beholder:
                width = cell
                height = cell
            case .procedural:
                width = cell * 1.45
                height = width * 0.82
            case .some:
                width = cell * 1.45 * 0.9
                height = width
            case nil:
                width = icon == nil ? 0 : cell * (cue.borrowedIcon ? 0.65 : 0.72)
                height = width
            }
            return StatusTile(cue: cue, name: name, clip: clip, icon: icon, size: CGSize(width: width, height: height),
                              cell: cell, progress: now.timeIntervalSince(cue.started) / cue.duration)
        }
        let gap = cell * 0.025
        let totalWidth = tiles.reduce(0) { $0 + $1.layoutWidth } + max(0, CGFloat(tiles.count - 1)) * gap
        let rowWidth = min(totalWidth, viewport.width - 8)
        guard rowWidth > 0 else { return }
        // Keep colocated damage legible for the full cue, including after its numbers fade.
        let health = playback.combatCues.first { entry in
            guard entry.stack.id == row.first?.stack.id, case .health = entry.kind else { return false }
            return row.contains { $0.started < entry.endsAt && $0.endsAt > entry.started }
        }
        let numberWidth = max(cell * 0.83, 24)
        let damageX = (health.map { projection.point(x: $0.position.x, y: $0.position.y).x }) ?? flag.x
        let rightStart = max(flag.x - rowWidth / 2, damageX + numberWidth / 2 + gap)
        let leftEnd = min(flag.x + rowWidth / 2, damageX - numberWidth / 2 - gap)
        let overlapsDamage = health != nil && (rightStart + rowWidth <= viewport.width - 4 || leftEnd - rowWidth >= 4)
        let proposedStart = if !overlapsDamage { flag.x - rowWidth / 2 }
            else if rightStart + rowWidth <= viewport.width - 4 { rightStart }
            else { leftEnd - rowWidth }
        let rowStart = min(max(4, proposedStart), viewport.width - rowWidth - 4)
        let scale = min(1, rowWidth / totalWidth)
        let rowHeight = tiles.map { $0.size.height + $0.captionHeight }.max() ?? cell
        let rowBottom = max(4 + rowHeight * scale, edge - gap - (health != nil && !overlapsDamage ? cell * 0.92 : 0))
        var rowContext = canvas
        rowContext.translateBy(x: rowStart, y: rowBottom)
        rowContext.scaleBy(x: scale, y: scale)
        var left: CGFloat = 0
        for tile in tiles {
            let center = left + tile.layoutWidth / 2
            let bottom = overlapsDamage ? -max(0, rowHeight / 2 - (tile.size.height / 2 + tile.captionHeight)) : 0
            drawStatusTile(tile, center: center, bottom: bottom, in: rowContext)
            left += tile.layoutWidth + gap
        }
    }

    private func drawStatusTile(_ tile: StatusTile, center: CGFloat, bottom: CGFloat, in canvas: GraphicsContext) {
        var context = canvas
        var artCenter = CGPoint(x: center, y: bottom - tile.captionHeight - tile.size.height / 2)
        var dimensions = tile.size
        if let clip = tile.clip,
           let pose = clip.sample(at: tile.progress, appearanceSpeed: BattleStatusEffects.bundled?.appearanceSpeed ?? 1.25,
                                  reducedMotion: reduceMotion) {
            context.opacity *= pose.opacity
            if let offsets = clip.registration?[pose.frame] {
                artCenter.x += offsets[0] * tile.cell / 256
                let bottomExtent = clip.registration?.map { $0[1] / 256 + $0[2] / 2 }.max() ?? 0.5
                artCenter.y += (offsets[1] / 256 + 0.5 - bottomExtent) * tile.cell
                dimensions.width *= offsets[2]
                dimensions.height *= offsets[2]
            }
            if let art = BattlefieldAtlas.frame(clip.resource, columns: clip.cols, rows: clip.rows, index: pose.frame,
                                                maxDimension: clip.pixelLimit,
                                                inBackground: !reduceMotion, combat: true) {
                draw(art, at: artCenter, size: dimensions, in: context)
            }
        } else {
            let alpha = if tile.cue.borrowedIcon { min(1, tile.progress / 0.12, (1 - tile.progress) / 0.24) }
                else { min(1, tile.progress / (0.16 / 1.8 / 1.25), (1 - tile.progress) / 0.30) }
            context.opacity *= reduceMotion ? 1 : alpha
            if let icon = tile.icon.flatMap({ BattleResources.cgImage($0) }) {
                if tile.cue.borrowedIcon && !reduceMotion {
                    let scale = min(1, 0.9 + tile.progress * 0.1 / 0.16)
                    dimensions.width *= scale
                    dimensions.height *= scale
                }
                draw(icon, at: artCenter, size: dimensions, in: context)
            }
        }
        guard tile.hasCaption else { return }
        let fill = BattlePalette.color(BattleStatusEffects.captionColor(tile.name, source: tile.cue.statusSource))
        let font = Font.custom("Arial", size: tile.captionSize).weight(.bold)
        let lines = wrap(tile.name, font: font, width: tile.captionWidth, in: context)
        let artBottom = bottom - tile.captionHeight
        for (index, line) in lines.enumerated() {
            let point = CGPoint(x: center, y: artBottom + tile.cell * 0.055 + tile.captionSize * (0.6 + CGFloat(index) * 1.2))
            outlined(line, at: point, font: font, fill: fill, outline: BattlePalette.color(0x101319), in: context)
        }
    }

    private func draw(_ image: CGImage, at point: CGPoint, size: CGSize, in context: GraphicsContext) {
        context.draw(Image(decorative: image, scale: 1), in: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                                                                    width: size.width, height: size.height))
    }

    private func wrap(_ name: String, font: Font, width: CGFloat, in context: GraphicsContext) -> [String] {
        let words = name.split(separator: " ").map(String.init)
        var lines: [String] = []
        var line = ""
        for word in words {
            let proposal = line.isEmpty ? word : "\(line) \(word)"
            if !line.isEmpty && context.resolve(Text(proposal).font(font)).measure(in: CGSize(width: 2000, height: 200)).width > width {
                lines.append(line)
                line = word
            } else {
                line = proposal
            }
        }
        if !line.isEmpty { lines.append(line) }
        return lines
    }

    private func outlined(_ text: String, at center: CGPoint, font: Font, fill: Color, outline: Color,
                          in context: GraphicsContext) {
        let edge = context.resolve(Text(text).font(font).foregroundStyle(outline))
        for offset in [CGPoint(x: -1, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 0, y: -1), CGPoint(x: 0, y: 1)] {
            context.draw(edge, at: CGPoint(x: center.x + offset.x, y: center.y + offset.y))
        }
        context.draw(Text(text).font(font).foregroundStyle(fill), at: center)
    }
}
