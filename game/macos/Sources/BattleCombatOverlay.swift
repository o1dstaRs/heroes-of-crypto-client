import CoreText
import SwiftUI

@MainActor
struct BattleCombatOverlay {
    let playback: BattlePlayback
    let projection: BattlefieldProjection
    let battle: BattleView
    let reduceMotion: Bool
    let locale: Locale

    private static let resultStyle = BattleFloatingResult.style
    private static let damageFont = ResultFont(size: resultStyle.damage.fontSize, shadowDistance: resultStyle.damage.shadow.distance)
    private static let killFont = ResultFont(size: resultStyle.kills.fontSize)

    private var resultScale: CGSize {
        let x = projection.worldPointScale
        return CGSize(width: x, height: x * projection.screenCellHeight / max(0.001, projection.screenCellWidth))
    }

    func draw(at now: Date, size: CGSize, in canvas: GraphicsContext) {
        var statusRows = [Int: [BattleCombatCue]]()
        let cell = projection.spriteCellSize
        for cue in playback.combatCues where now >= cue.started && now < cue.endsAt {
            switch cue.kind {
            case let .health(delta, casualties):
                var context = canvas
                let origin = resultOrigin(for: cue, casualties: casualties, boardWidth: size.width)
                let scale = resultScale
                context.translateBy(x: origin.x, y: origin.y)
                context.scaleBy(x: scale.width, y: scale.height)
                if !reduceMotion { context.opacity *= Self.resultStyle.opacity(at: now.timeIntervalSince(cue.started)) }
                drawHealth(delta, casualties: casualties, tone: cue.damageTone, in: context)
            case .status:
                if cue.isDeepWoundsImpact { continue }
                if let clip = cue.statusClip, clip.style == .petrifying {
                    drawPetrification(cue, clip: clip, at: now, in: canvas)
                } else {
                    statusRows[cue.stack.id, default: []].append(cue)
                }
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

    private func resultOrigin(for cue: BattleCombatCue, casualties: Int, boardWidth: CGFloat) -> CGPoint {
        let homeFacing: CGFloat = cue.stack.team == .player ? 1 : -1
        let facing = reduceMotion ? homeFacing : cue.resultFacing ?? homeFacing
        let figure = CreatureAnimation.boardPresentation(cue.stack, position: cue.position, projection: projection, facing: facing)
        let cell = projection.spriteCellSize
        let height = BattleStackFlag.height(for: cell)
        let flag = CreatureAnimation.flagPosition(for: cue.stack.name, presentation: figure,
                                                  projection: projection, facing: facing, height: height)
        let tagRaise = cue.resultResponded ? (max(17, cell * 0.42) - height) / 2 : 0
        let offset = Self.resultStyle.offset(for: cue.resultLane ?? 0, casualties: casualties,
                                             flagX: flag.x, boardWidth: boardWidth, scale: resultScale)
        return CGPoint(x: flag.x + offset.x, y: flag.y - height / 2 - tagRaise + offset.y)
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

    private func drawHealth(_ delta: Double, casualties: Int, tone: BattleCombatCue.DamageTone?, in context: GraphicsContext) {
        let healing = delta > 0
        let colors: (UInt32, UInt32) = if healing { (0x66ff99, 0x0b3d1e) }
            else if tone == .fireWall { (0xffb347, 0x5a1500) }
            else if tone == .reflection { (0xbfefff, 0x12384d) }
            else if tone == .petrifyingGaze { (0xd8d8d8, 0x5a5a5a) }
            else { (0xff3333, 0x4a0000) }
        let style = Self.resultStyle
        let shadow = style.damage.shadow
        let amount = abs(delta).formatted(.number.locale(Locale(identifier: "en_US_POSIX"))
            .grouping(.never).rounded(rule: .toNearestOrAwayFromZero).precision(.fractionLength(0...2)))
        var damage = context
        damage.addFilter(.shadow(color: .black, radius: shadow.blur / 2,
                                 x: cos(shadow.angle) * shadow.distance, y: sin(shadow.angle) * shadow.distance))
        Self.damageFont.draw((healing ? "+" : "-") + amount, strokeWidth: style.damage.strokeWidth,
                             fill: BattlePalette.color(colors.0), outline: BattlePalette.color(colors.1), in: damage)
        guard casualties > 0 else { return }
        let kills = style.kills
        let icon = CGRect(x: -kills.halfSpacing - kills.iconSize / 2, y: kills.y - kills.iconSize / 2,
                          width: kills.iconSize, height: kills.iconSize)
        if let art = BattleResources.cgImage("combat_kills_skull_icon_v1") {
            context.draw(Image(decorative: art, scale: 1), in: icon)
        } else {
            context.draw(Image(systemName: "skull"), in: icon)
        }
        var count = context
        count.translateBy(x: kills.halfSpacing, y: kills.y)
        Self.killFont.draw(String(casualties), strokeWidth: kills.strokeWidth, fill: .white, outline: .black, in: count)
    }

    @MainActor
    private struct ResultFont {
        let font: CTFont
        let baseline: CGFloat
        let shadowDistance: CGFloat
        let boldWidth: CGFloat
        private let paths = NSCache<NSString, CGPath>()

        init(size: CGFloat, shadowDistance: CGFloat = 0) {
            font = BattleResources.forecastFont(size)
            self.shadowDistance = shadowDistance
            // Pixi centres its text texture using this reference line's ink ascent and descent.
            let sample = CTLineGetBoundsWithOptions(Self.line("|ÉqÅM", font: font), .useGlyphPathBounds)
            baseline = (sample.maxY + sample.minY - shadowDistance) / 2
            // The bundled face has one weight. Canvas synthesizes bold by expanding its outline by 1/64 em.
            boldWidth = size / 32
            paths.countLimit = 256
        }

        func draw(_ text: String, strokeWidth: CGFloat, fill: Color, outline: Color, in context: GraphicsContext) {
            let key = text as NSString
            let path: Path
            if let cached = paths.object(forKey: key) {
                path = Path(cached)
            } else {
                let outline = CGMutablePath()
                let line = Self.line(text, font: font)
                let width = CTLineGetTypographicBounds(line, nil, nil, nil) + shadowDistance
                for run in CTLineGetGlyphRuns(line) as? [CTRun] ?? [] {
                    for index in 0..<CTRunGetGlyphCount(run) {
                        var glyph: CGGlyph = 0
                        var position = CGPoint.zero
                        CTRunGetGlyphs(run, CFRange(location: index, length: 1), &glyph)
                        CTRunGetPositions(run, CFRange(location: index, length: 1), &position)
                        let transform = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: position.x - width / 2,
                                                          ty: baseline - position.y)
                        if let shape = CTFontCreatePathForGlyph(font, glyph, nil) { outline.addPath(shape, transform: transform) }
                    }
                }
                paths.setObject(outline, forKey: key)
                path = Path(outline)
            }
            context.drawLayer { layer in
                layer.stroke(path, with: .color(outline), lineWidth: strokeWidth + boldWidth)
                layer.fill(path, with: .color(fill))
                layer.stroke(path, with: .color(fill), lineWidth: boldWidth)
            }
        }

        private static func line(_ text: String, font: CTFont) -> CTLine {
            CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
            ]))
        }
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
        let resultWidth = Self.resultStyle.columnWidth * resultScale.width
        let results: [CGFloat] = playback.combatCues.compactMap { cue in
            guard cue.stack.id == row.first?.stack.id, case let .health(_, casualties) = cue.kind,
                  row.contains(where: { $0.started < cue.endsAt && $0.endsAt > cue.started }) else { return nil }
            return resultOrigin(for: cue, casualties: casualties, boardWidth: viewport.width).x
        }
        let rightStart = max(flag.x - rowWidth / 2, (results.max() ?? flag.x) + resultWidth / 2 + gap)
        let leftEnd = min(flag.x + rowWidth / 2, (results.min() ?? flag.x) - resultWidth / 2 - gap)
        let overlapsDamage = !results.isEmpty && (rightStart + rowWidth <= viewport.width - 4 || leftEnd - rowWidth >= 4)
        let proposedStart = if !overlapsDamage { flag.x - rowWidth / 2 }
            else if rightStart + rowWidth <= viewport.width - 4 { rightStart }
            else { leftEnd - rowWidth }
        let rowStart = min(max(4, proposedStart), viewport.width - rowWidth - 4)
        let scale = min(1, rowWidth / totalWidth)
        let rowHeight = tiles.map { $0.size.height + $0.captionHeight }.max() ?? cell
        let rowBottom = max(4 + rowHeight * scale, edge - gap - (!results.isEmpty && !overlapsDamage ? cell * 0.92 : 0))
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
        let caption = GameLocalization.text(tile.name, locale: locale)
        let lines = wrap(caption, font: font, width: tile.captionWidth, in: context)
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
