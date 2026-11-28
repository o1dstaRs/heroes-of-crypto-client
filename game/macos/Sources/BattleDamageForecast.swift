import CoreText
import SwiftUI

struct BattleDamageForecast: View {
    let damage: String
    let kills: String?
    let gaze: String?
    let divisor: Int?
    let target: Stack
    let projection: BattlefieldProjection

    private struct Row {
        let text: String
        let color: UInt32
        var fontSize: CGFloat = 24
        var icon: String? = nil
        var iconScale: CGFloat = 1
        var spacing: CGFloat = 5
    }

    var body: some View {
        Canvas { context, _ in
            let facing: CGFloat = target.team == .player ? 1 : -1
            let logical = BattlefieldProjection.logicalCenter(target.cells)
            let presentation = CreatureAnimation.boardPresentation(target, position: logical,
                                                                    projection: projection, facing: facing)
            let flagHeight = BattleStackFlag.height(for: projection.spriteCellSize)
            let flag = CreatureAnimation.flagPosition(for: target.name, presentation: presentation,
                                                      projection: projection, facing: facing, height: flagHeight)
            let tagRaise = target.responded ? (max(17, projection.spriteCellSize * 0.42) - flagHeight) / 2 : 0
            let anchor = CGPoint(x: flag.x, y: flag.y - flagHeight / 2 - tagRaise)
            let arrow = divisor.map(Self.rangeArrow)
            var rows = [Row(text: damage, color: 0xff3333, icon: arrow, iconScale: 1.45, spacing: 4)]
            if let kills { rows.append(Row(text: kills, color: 0xffffff, icon: "combat_kills_skull_icon_v1", iconScale: 1.3)) }
            if let gaze { rows.append(Row(text: gaze, color: 0xbce3ca, fontSize: 20, icon: "petrifying_gaze_256")) }

            // Use the horizontal world scale on both axes so the board's perspective never stretches the glyphs.
            let scale = 1.3 * projection.worldPointScale
            let rowHeight = 28 * scale
            let worldYScale = projection.worldPointScale * projection.screenCellHeight / max(0.001, projection.screenCellWidth)
            let blockBottom = anchor.y - 6 * worldYScale
            for (index, row) in rows.enumerated() {
                let y = blockBottom - (CGFloat(rows.count - index) - 0.5) * rowHeight
                Self.draw(row, centeredAt: CGPoint(x: anchor.x, y: y), scale: scale, in: context)
            }
        }
        .allowsHitTesting(false)
        .accessibilityLabel(([damage, kills.map { "\($0) kills" }, gaze].compactMap { $0 }).joined(separator: ", "))
    }

    static func areaRange(_ divisor: Int, at point: CGPoint, projection: BattlefieldProjection) -> some View {
        let range = "1/\(divisor)"
        return Canvas { context, _ in
            let scale = 1.3 * projection.worldPointScale
            let worldYScale = projection.worldPointScale * projection.screenCellHeight / max(0.001, projection.screenCellWidth)
            let center = CGPoint(x: point.x, y: point.y - 14 * scale - 6 * worldYScale)
            draw(Row(text: range, color: 0xff3333, icon: rangeArrow(divisor), iconScale: 1.45, spacing: 4),
                 centeredAt: center, scale: scale, in: context)
        }
        .allowsHitTesting(false)
        .accessibilityLabel("Range modifier \(range)")
    }

    private static func rangeArrow(_ divisor: Int) -> String {
        divisor == 1 ? "combat_range_full_arrow_icon_v1" : "combat_range_half_broken_arrow_icon_v1"
    }

    private static func draw(_ row: Row, centeredAt center: CGPoint, scale: CGFloat, in context: GraphicsContext) {
        let font = BattleResources.forecastFont(row.fontSize * scale)
        let attributed = NSAttributedString(string: row.text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
        ])
        let line = CTLineCreateWithAttributedString(attributed)
        var ascent: CGFloat = 0
        var descent: CGFloat = 0
        let strokeWidth = 4 * scale
        let textWidth = CTLineGetTypographicBounds(line, &ascent, &descent, nil) + strokeWidth
        let icon = row.icon.flatMap { BattleResources.cgImage($0) }
        let iconSide = icon == nil ? 0 : 24 * scale * row.iconScale
        let gap = icon == nil ? 0 : row.spacing * scale
        let left = center.x - (iconSide + gap + textWidth) / 2
        if let icon {
            let rect = CGRect(x: left, y: center.y - iconSide / 2, width: iconSide, height: iconSide)
            context.draw(Image(decorative: icon, scale: 1).interpolation(.high), in: rect)
        }
        let glyphs = CGMutablePath()
        for run in CTLineGetGlyphRuns(line) as? [CTRun] ?? [] {
            let attributes = CTRunGetAttributes(run) as NSDictionary
            let runFont = (attributes[kCTFontAttributeName] as? NSFont).map {
                CTFontCreateWithName($0.fontName as CFString, $0.pointSize, nil)
            } ?? font
            for index in 0..<CTRunGetGlyphCount(run) {
                var glyph: CGGlyph = 0
                var position = CGPoint.zero
                CTRunGetGlyphs(run, CFRange(location: index, length: 1), &glyph)
                CTRunGetPositions(run, CFRange(location: index, length: 1), &position)
                let offset = CGAffineTransform(translationX: position.x, y: position.y)
                if let path = CTFontCreatePathForGlyph(runFont, glyph, nil) { glyphs.addPath(path, transform: offset) }
            }
        }
        context.withCGContext { cg in
            cg.translateBy(x: left + iconSide + gap + strokeWidth / 2, y: center.y + (ascent - descent) / 2)
            cg.scaleBy(x: 1, y: -1)
            cg.setLineJoin(.round)
            cg.setLineWidth(strokeWidth)
            cg.setStrokeColor(CGColor(gray: 0, alpha: 1))
            cg.addPath(glyphs)
            cg.strokePath()
            let ink = CGColor(srgbRed: CGFloat((row.color >> 16) & 255) / 255,
                              green: CGFloat((row.color >> 8) & 255) / 255,
                              blue: CGFloat(row.color & 255) / 255, alpha: 1)
            cg.setFillColor(ink)
            cg.setStrokeColor(ink)
            cg.setLineWidth(row.fontSize * scale * 0.036)
            cg.addPath(glyphs)
            cg.drawPath(using: .fillStroke)
        }
    }

    static func band(_ low: Int, _ high: Int) -> String { low == high ? "\(low)" : "\(low)\u{2009}-\u{2009}\(high)" }

    static func gaze(_ input: BattleShotHit.Gaze?) -> String? {
        guard let input, let data = try? JSONEncoder().encode(input),
              let arguments = try? JSONSerialization.jsonObject(with: data),
              let calculate = BattlePresentationScript.context?.objectForKeyedSubscript("hocGazeForecast"),
              let result = calculate.call(withArguments: [arguments, input.multipleHits]),
              !result.isUndefined else { return nil }
        return result.toString()
    }
}
