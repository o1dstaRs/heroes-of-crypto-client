import SwiftUI

struct SandboxLoadingScreen: View {
    let startedAt: Date
    let battlefieldReadyAt: Date?
    let artwork: Artwork?
    let effectsEnabled: Bool
    let toggleEffects: () -> Void
    let close: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Style: Decodable {
        struct Flame: Decodable {
            let enabled: Bool
            let fireType: String
            let offsetX: CGFloat
            let offsetY: CGFloat
            let width: CGFloat
            let height: CGFloat
            let overflowBottom: CGFloat
            let alpha: Double
            let fps: Double
            let tiles: Int
            let frameOffset: Int
            let phaseStep: Int
            let overlap: CGFloat
            let alternateMirror: Bool
            let blendMode: String
        }

        struct Fire: Decodable {
            let progressGlowAlpha: Double
            let medallionVisible: Bool
            let medallionSize: CGFloat
            let medallionStartOffsetX: CGFloat
            let medallionStartOffsetY: CGFloat
            let medallionEndOffsetX: CGFloat
            let medallionEndOffsetY: CGFloat
            let overall: Flame
            let secondary: Flame
        }

        let minimumDurationMs: Double
        let fadeDurationMs: Double
        let fire: Fire
    }

    // The frame coordinates are in pixels on the browser's original loading artwork.
    private enum Layout {
        static let art = CGRect(x: 0, y: 0, width: 1672, height: 941)
        static let track = CGRect(x: 510, y: 744, width: 652, height: 27)
        static let pocketRadius: CGFloat = 24
        static let plateHalf = CGRect(x: 408, y: 700, width: 428, height: 116)
        static let plate = CGRect(x: plateHalf.minX, y: plateHalf.minY,
                                  width: plateHalf.width * 2, height: plateHalf.height)
        static let bakedPlate = CGRect(x: plate.minX, y: plate.minY, width: plate.width + 24, height: plate.height)
        static let bakedCaption = CGRect(x: 530, y: 797, width: 612, height: 52)
    }

    private enum FireSpan { case left, mirrored, continuous }

    private static let style: Style? = {
        guard let url = Bundle.main.url(forResource: "sandbox-loading", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Style.self, from: data)
    }()

    struct Artwork: Sendable {
        let base: CGImage?
        let overlay: CGImage?
        let barHalf: CGImage?
        let medallion: CGImage?

        fileprivate init() {
            func bitmap(_ name: String) -> CGImage? {
                guard let url = Bundle.main.url(forResource: name, withExtension: "webp") else { return nil }
                return BattleResources.decodeBitmap(at: url)
            }
            base = bitmap("loading_screen_forging_base")
            overlay = bitmap("loading_screen_forging_exact_overlay")
            barHalf = overlay?.cropping(to: Layout.plateHalf)
            medallion = bitmap("loading_screen_dragon_medallion")
        }
    }

    private static let artworkLoad = Task.detached(priority: .userInitiated) { Artwork() }
    private static let finishingFraction = 0.1
    private static var minimumDuration: TimeInterval { max(0.001, (style?.minimumDurationMs ?? 2000) / 1000) }
    static var fadeDuration: TimeInterval { (style?.fadeDurationMs ?? 220) / 1000 }

    static func preloadArtwork() async -> Artwork {
        if let fire = style?.fire {
            for flame in [fire.overall, fire.secondary] where flame.enabled {
                BattlefieldAtlas.prefetch(flameAtlas(flame))
            }
        }
        return await artworkLoad.value
    }

    static func finishDate(startedAt: Date, readyAt: Date) -> Date {
        finishStart(startedAt: startedAt, readyAt: readyAt).addingTimeInterval(minimumDuration * finishingFraction)
    }

    private static func finishStart(startedAt: Date, readyAt: Date) -> Date {
        max(startedAt.addingTimeInterval(minimumDuration * (1 - finishingFraction)), readyAt)
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { frame in
            let elapsed = max(0, frame.date.timeIntervalSince(startedAt))
            let finishElapsed = battlefieldReadyAt.map {
                max(0, frame.date.timeIntervalSince(Self.finishStart(startedAt: startedAt, readyAt: $0)))
            } ?? 0
            let progress = min(1 - Self.finishingFraction, elapsed / Self.minimumDuration) +
                min(Self.finishingFraction, finishElapsed / Self.minimumDuration)
            Canvas(opaque: true) { context, size in
                paint(in: context, size: size, progress: progress, flameTime: reduceMotion ? 0 : elapsed)
            }
            .accessibilityLabel("Forging the battlefield")
            .accessibilityValue("\(Int((progress * 100).rounded())) percent")
        }
        .overlay(alignment: .topTrailing) {
            BattleCloseButton(label: "Back to Home", action: close).padding(16)
        }
        .overlay(alignment: .bottomTrailing) {
            BattleSystemControls(effectsEnabled: effectsEnabled, toggleEffects: toggleEffects).padding(16)
        }
        .clipped()
    }

    private func paint(in context: GraphicsContext, size: CGSize, progress: Double, flameTime: Double) {
        let art = Layout.art
        let track = Layout.track
        let scale = max(size.width / art.width, size.height / art.height)
        context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(BattlePalette.color(0x050505)))
        var canvas = context
        canvas.translateBy(x: (size.width - art.width * scale) / 2, y: (size.height - art.height * scale) / 2)
        canvas.scaleBy(x: scale, y: scale)
        draw(artwork?.base, in: canvas, rect: art)

        var overlay = canvas
        overlay.clip(to: Path(Layout.bakedPlate), options: .inverse)
        overlay.clip(to: Path(Layout.bakedCaption), options: .inverse)
        draw(artwork?.overlay, in: overlay, rect: art)

        let fire = Self.style?.fire
        let travel = min(1, progress / 0.99)
        let startX = track.minX + (fire?.medallionStartOffsetX ?? -6.5)
        let endX = track.maxX + (fire?.medallionEndOffsetX ?? 6)
        let startY = track.midY + (fire?.medallionStartOffsetY ?? 5.5)
        let endY = track.midY + (fire?.medallionEndOffsetY ?? 4.5)
        let marker = CGPoint(x: startX + (endX - startX) * travel, y: startY + (endY - startY) * travel)
        let split = travel >= 1 ? Layout.plate.maxX : marker.x
        drawPlate(in: canvas, from: Layout.plate.minX, to: split, desaturated: false)
        drawPlate(in: canvas, from: split, to: Layout.plate.maxX, desaturated: true)

        if travel > 0 {
            let glow = Path { path in
                let radius = Layout.pocketRadius + 3
                path.addEllipse(in: CGRect(x: track.minX - radius, y: track.midY - radius,
                                           width: radius * 2, height: radius * 2))
                path.addRect(CGRect(x: track.minX, y: track.minY - 5,
                                    width: track.width * travel + 4, height: track.height + 10))
            }
            canvas.fill(glow, with: .color(BattlePalette.color(0xff4d00).opacity(fire?.progressGlowAlpha ?? 0.14)))
        }
        if let fire {
            drawFlames(fire.overall, span: .left, revealX: marker.x, time: flameTime, in: canvas)
            drawFlames(fire.overall, span: .mirrored, revealX: marker.x, time: flameTime, in: canvas)
            drawFlames(fire.secondary, span: .continuous, revealX: marker.x, time: flameTime, in: canvas)
        }

        if fire?.medallionVisible != false {
            let side = fire?.medallionSize ?? 82
            var coin = canvas
            coin.translateBy(x: marker.x, y: marker.y)
            if !reduceMotion { coin.rotate(by: .degrees(travel * 720)) }
            draw(artwork?.medallion, in: coin,
                 rect: CGRect(x: -side / 2, y: -side / 2, width: side, height: side))
        }

        let label = Text("FORGING THE BATTLEFIELD   \(Int((progress * 100).rounded()))%")
            .font(BattleResources.display(27).weight(.medium)).tracking(1.2)
            .foregroundColor(BattlePalette.color(0xd77d28))
        canvas.draw(label, at: CGPoint(x: art.midX, y: 821))
    }

    private func draw(_ bitmap: CGImage?, in context: GraphicsContext, rect: CGRect) {
        guard let bitmap else { return }
        context.draw(Image(decorative: bitmap, scale: 1), in: rect)
    }

    private func drawPlate(in context: GraphicsContext, from start: CGFloat, to end: CGFloat, desaturated: Bool) {
        guard end > start, let half = artwork?.barHalf else { return }
        var plate = context
        plate.clip(to: Path(CGRect(x: start, y: Layout.plate.minY, width: end - start, height: Layout.plate.height)))
        if desaturated { plate.addFilter(.saturation(0)) }
        let image = Image(decorative: half, scale: 1)
        plate.draw(image, in: Layout.plateHalf)
        plate.translateBy(x: Layout.art.width, y: 0)
        plate.scaleBy(x: -1, y: 1)
        plate.draw(image, in: Layout.plateHalf)
    }

    private func drawFlames(_ flame: Style.Flame, span: FireSpan, revealX: CGFloat, time: Double, in context: GraphicsContext) {
        guard flame.enabled, flame.tiles > 0 else { return }
        let radius = Layout.pocketRadius
        let leftPocket = Layout.track.minX + flame.offsetX
        let mirror = span == .mirrored
        let pocket = mirror ? Layout.art.width - leftPocket : leftPocket
        let other = span == .continuous ? pocket + flame.width * 2 : pocket + (mirror ? -flame.width : flame.width)
        let centerY = Layout.track.midY + flame.offsetY + flame.overflowBottom
        let bottom = centerY + radius
        let top = bottom - flame.height
        let stripBottom = Layout.track.maxY + flame.offsetY + flame.overflowBottom
        let tileSpan = span == .continuous ? 2 * (flame.width + radius) : flame.width + radius
        let start = mirror ? pocket + radius - tileSpan : pocket - radius
        guard revealX > start else { return }

        let mask = Path { path in
            if stripBottom > top {
                path.addRect(CGRect(x: min(pocket, other), y: top, width: abs(other - pocket), height: stripBottom - top))
            }
            let pockets = span == .continuous ? [pocket, other] : [pocket]
            for centerX in pockets {
                path.addEllipse(in: CGRect(x: centerX - radius, y: centerY - radius, width: 2 * radius, height: 2 * radius))
                if centerY > top {
                    path.addRect(CGRect(x: centerX - radius, y: top, width: 2 * radius, height: centerY - top))
                }
            }
        }
        var layer = context
        layer.clip(to: mask)
        layer.clip(to: Path(CGRect(x: 0, y: 0, width: revealX, height: Layout.art.height)))
        layer.opacity = min(1, flame.alpha)
        layer.blendMode = flame.blendMode == "add" ? .plusLighter : flame.blendMode == "screen" ? .screen : .normal

        let atlas = Self.flameAtlas(flame)
        let tileWidth = tileSpan / CGFloat(flame.tiles)
        for index in 0..<flame.tiles {
            let frame = (Int(time * flame.fps) + flame.frameOffset + index * flame.phaseStep) % 12
            guard let texture = BattlefieldAtlas.frame(atlas, columns: 4, rows: 3, index: frame, inBackground: true) else { continue }
            let slot = mirror ? flame.tiles - 1 - index : index
            var tile = layer
            tile.translateBy(x: start + (CGFloat(slot) + 0.5) * tileWidth, y: top)
            let reversed = flame.alternateMirror && !index.isMultiple(of: 2)
            if mirror != reversed { tile.scaleBy(x: -1, y: 1) }
            let width = tileWidth * flame.overlap
            tile.draw(Image(decorative: texture, scale: 1), in: CGRect(x: -width / 2, y: 0, width: width, height: flame.height))
        }
    }

    private static func flameAtlas(_ flame: Style.Flame) -> String {
        flame.fireType == "brazier" ? "ambient_fire_left_brazier_atlas.webp" : "ambient_fire_left_furnace_atlas.webp"
    }
}
