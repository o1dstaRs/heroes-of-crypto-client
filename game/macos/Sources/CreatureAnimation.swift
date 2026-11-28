import ImageIO
import Observation
import SwiftUI

enum CreatureAction: String {
    case idle, walk, attack, hit, death, cast
    case meleeAttack = "melee_attack"
}

struct CreaturePose {
    let action: CreatureAction
    let time: TimeInterval
    var walkDistance: Double? = nil
    var walkLength: Double? = nil
    var playbackDuration: TimeInterval? = nil
    var verticalAttack: String? = nil
}

struct CreatureBoardFraming: Decodable {
    let heightCells: CGFloat
    let widthScale: CGFloat
    let scaleX: CGFloat
    let scaleY: CGFloat
    let squareScale: CGFloat
    let offsetXCells: CGFloat
    let offsetYCells: CGFloat
    let tallOffsetYCells: CGFloat
    let flagOffsetXCells: CGFloat?
    let flagOffsetYCells: CGFloat?

    static let fallback = Self(heightCells: 1.5, widthScale: 1, scaleX: 1, scaleY: 1, squareScale: 1,
                               offsetXCells: 0, offsetYCells: 0, tallOffsetYCells: 0,
                               flagOffsetXCells: nil, flagOffsetYCells: nil)
}

struct CreatureBoardPresentation {
    let ground: CGPoint
    let height: CGFloat
    let widthScale: CGFloat

    func canvasSize(aspect: CGFloat, heightScale: CGFloat, widthRatio: CGFloat) -> CGSize {
        let canvasHeight = height * heightScale
        return CGSize(width: canvasHeight * aspect * widthScale * widthRatio, height: canvasHeight)
    }

    func deepWoundsBounds(frame: CreatureAnimation.Frame?, facing: CGFloat, cellWidth: CGFloat) -> CGRect {
        let size = frame.map {
            canvasSize(aspect: CGFloat($0.image.width) / CGFloat($0.image.height),
                       heightScale: $0.heightScale, widthRatio: $0.widthRatio)
        }
        // The web projectile's impact point is in the upper half of the live sprite canvas.
        let x = ground.x + facing * (0.5 - (frame?.anchorX ?? 0.5)) * (size?.width ?? 0)
        let y = ground.y + (0.45 - (frame?.foot ?? 0.93)) * (size?.height ?? height)
        let side = cellWidth * 1.45 * 0.9
        return CGRect(x: x - side / 2, y: y - side / 2, width: side, height: side)
    }
}

private struct CreatureClip: Decodable {
    struct Walk: Decodable {
        let first: Int
        let last: Int
        let frameDistance: Double
        let introDistance: Double?

        func frameIndex(distance: Double, length: Double, time: TimeInterval, introHold: TimeInterval) -> Int? {
            let count = last - first + 1
            guard count > 0, frameDistance > 0 else { return nil }
            let start: Double
            if let introDistance, first > 0 {
                start = min(introDistance, length)
                if start > 0, distance < start { return min(first - 1, Int(distance / start * Double(first))) }
            } else if first > 0, introHold > 0 {
                let introTime = introHold * Double(first)
                if time < introTime { return min(first - 1, Int(time / introHold)) }
                start = distance * introTime / max(introTime, time)
            } else {
                start = 0
            }
            let steps = Int(floor(max(0, distance - start) / frameDistance + 1e-9))
            return first + steps % count
        }
    }

    struct Source: Decodable {
        struct Trim: Decodable {
            let x: CGFloat
            let y: CGFloat
            let width: CGFloat
            let height: CGFloat

            var rect: CGRect { CGRect(x: x, y: y, width: width, height: height) }
        }

        let resource: String
        let columns: Int
        let rows: Int
        let index: Int
        let trim: Trim?

        var boardPixelLimit: Int { max(2048, max(columns, rows) * 384) }
    }

    struct Page: Decodable {
        let resource: String
        let firstFrame: Int
        let frameCount: Int
        let columns: Int
        let rows: Int
    }

    struct Registration: Decodable {
        let x: CGFloat
        let y: CGFloat
        let anchorX: CGFloat?
        let foot: CGFloat?
    }

    struct BowRelease: Decodable {
        let x: CGFloat
        let y: CGFloat
        let aspect: CGFloat
        let length: CGFloat
    }

    struct IdleWind: Decodable {
        let speed: Double
        let windFrames: Int
        let gestureIntervalMs: Double
        let gestureHoldsMs: [Double]
        let subframes: Int

        func frame(at elapsed: TimeInterval) -> Int {
            let milliseconds = elapsed * 1000
            if milliseconds >= gestureIntervalMs {
                var offset = milliseconds.truncatingRemainder(dividingBy: gestureIntervalMs)
                for (index, hold) in gestureHoldsMs.enumerated() {
                    if offset < hold {
                        return windFrames + index * subframes + Int(offset / (hold / Double(subframes)))
                    }
                    offset -= hold
                }
            }
            let phase = (elapsed * speed).truncatingRemainder(dividingBy: 2 * .pi)
            return min(windFrames - 1, Int(phase / (2 * .pi) * Double(windFrames)))
        }
    }

    let resource: String?
    let columns: Int?
    let rows: Int?
    let frameCount: Int
    let frameDuration: Double
    let durations: [Double]?
    let sequence: [Int]?
    let repeatFrom: Int?
    let walk: Walk?
    let footAnchor: CGFloat
    let impactFrame: Int?
    let releaseFrame: Int?
    let bowRelease: BowRelease?
    let pages: [Page]?
    let frameSources: [Source]?
    let registration: [Registration]?
    let browserIdleFraming: Bool?
    let idleWind: IdleWind?

    var cycle: TimeInterval {
        if let durations { return durations.reduce(0, +) / 1000 }
        return Double(frameCount) * frameDuration
    }

    func frameIndex(at elapsed: TimeInterval, looping: Bool, with samples: [Double]? = nil) -> Int? {
        guard frameCount > 0 && frameDuration > 0 && elapsed >= 0 else { return nil }
        if let idleWind { return idleWind.frame(at: elapsed) }
        if let durations = samples ?? durations, durations.count == (sequence?.count ?? frameCount) {
            let period = durations.reduce(0, +)
            guard period > 0 else { return nil }
            var remaining = elapsed * 1000
            if looping && remaining >= period {
                let prefix = durations.prefix(repeatFrom ?? 0).reduce(0, +)
                guard period > prefix else { return nil }
                remaining = prefix + (remaining - prefix).truncatingRemainder(dividingBy: period - prefix)
            }
            for (index, duration) in durations.enumerated() where remaining >= 0 {
                if remaining < duration { return sequence?[index] ?? index }
                remaining -= duration
            }
            return nil
        }
        let position = elapsed / frameDuration
        return looping ? Int(position.truncatingRemainder(dividingBy: Double(frameCount))) :
            position < Double(frameCount) ? Int(position) : nil
    }
}

@MainActor
enum CreatureAnimation {
    private struct FramingTable: Decodable {
        let creatures: [String: CreatureBoardFraming]
        let topRowScale: CGFloat
        let standardFootLine: CGFloat
        let tallFootLine: CGFloat
        let duplicateIdleSpacingMs: Double?
    }

    struct Frame {
        let image: CGImage
        let index: Int
        let action: CreatureAction
        let foot: CGFloat
        let heightScale: CGFloat
        let widthRatio: CGFloat
        let anchorX: CGFloat
        let trim: CGRect?
    }
    struct Timing {
        let duration: TimeInterval
        let impact: TimeInterval?
        let release: TimeInterval?
        let lethalMeleeDuration: TimeInterval?
    }

    private static let clips: [String: [String: CreatureClip]] = {
        guard let url = Bundle.main.url(forResource: "animations", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: [String: CreatureClip]].self, from: data)) ?? [:]
    }()

    private static let framing: FramingTable? = {
        guard let url = Bundle.main.url(forResource: "creature-framing", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(FramingTable.self, from: data)
    }()
    private struct BrowserTiming: Decodable {
        let holds: [String: [String: [Double]]]
        let lethalMeleeHolds: [String: [String: Double]]
        let meleeMinimumHolds: [String: Double]
    }

    private static let browserTiming: BrowserTiming = {
        guard let url = Bundle.main.url(forResource: "animation-timing", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            return BrowserTiming(holds: [:], lethalMeleeHolds: [:], meleeMinimumHolds: [:])
        }
        let decoder = JSONDecoder()
        if let current = try? decoder.decode(BrowserTiming.self, from: data) { return current }
        let legacy = (try? decoder.decode([String: [String: [Double]]].self, from: data)) ?? [:]
        return BrowserTiming(holds: legacy, lethalMeleeHolds: [:], meleeMinimumHolds: [:])
    }()

    static var duplicateIdleSpacing: TimeInterval { (framing?.duplicateIdleSpacingMs ?? 0) / 1000 }

    static func boardPresentation(_ stack: Stack, position: CGPoint, projection: BattlefieldProjection,
                                  facing: CGFloat) -> CreatureBoardPresentation {
        boardPresentation(stack.name, footprint: stack.footprint, position: position, projection: projection, facing: facing)
    }

    static func boardPresentation(_ creature: String, footprint: Footprint, position: CGPoint,
                                  projection: BattlefieldProjection, facing: CGFloat) -> CreatureBoardPresentation {
        let profile = framing?.creatures[creature] ?? .fallback
        let height = footprint.height
        let bottomRow = position.y - CGFloat(height) / 2
        let progress = min(1, max(0, (bottomRow - 1) / CGFloat(14 - height)))
        let perspective = 1 + ((framing?.topRowScale ?? 0.85) - 1) * progress
        let square = footprint == .square ? profile.squareScale : 1
        let tall = height > 1
        let footLine = tall ? framing?.tallFootLine ?? 0.7 : framing?.standardFootLine ?? 0.25
        let groundY = position.y - footLine + (tall ? profile.tallOffsetYCells : 0)
        var ground = projection.point(x: position.x, y: groundY)
        ground.x += profile.offsetXCells * projection.screenCellWidth * facing * perspective
        ground.y += profile.offsetYCells * projection.screenCellHeight * perspective
        let bodyHeight = projection.spriteCellSize * profile.heightCells * profile.scaleY * square * perspective
        if creature == "Scavenger" { ground.y -= bodyHeight * 0.05 }
        return CreatureBoardPresentation(ground: ground, height: bodyHeight,
                                         widthScale: profile.widthScale * profile.scaleX / profile.scaleY)
    }

    static func flagPosition(for creature: String, presentation: CreatureBoardPresentation,
                             projection: BattlefieldProjection, facing: CGFloat, height: CGFloat) -> CGPoint {
        let profile = framing?.creatures[creature] ?? .fallback
        let idle = clips[creature]?[CreatureAction.idle.rawValue]
        let foot = SpriteRegistration.geometry(creature, action: .idle, index: 0, foot: idle?.footAnchor ?? 0.9)
        let first = idle?.registration?.first
        // The Champion's standing atlas reserves space above the helmet for the plume animation.
        let championHelmet = idle?.frameSources?.first?.resource == "champion_lab_idle_atlas.webp"
        let headInset: CGFloat = championHelmet ? 248.0 / 1024 : 0
        let head = presentation.height * foot.height * (first?.y ?? 1) * ((first?.foot ?? foot.foot) - headInset)
        let offsetX = (profile.flagOffsetXCells ?? 0) * projection.screenCellWidth * facing
        let offsetY = (championHelmet ? 0 : (profile.flagOffsetYCells ?? 0)) * projection.screenCellHeight
        return CGPoint(x: presentation.ground.x + offsetX,
                       y: presentation.ground.y - head - max(2, projection.spriteCellSize * 0.04) - height / 2 + offsetY)
    }

    private static func clipKey(for creature: String, action: CreatureAction, direction: String?) -> String? {
        let candidates: [CreatureAction] = switch action {
        case .attack: [.attack, .meleeAttack]
        case .meleeAttack: [.meleeAttack, .attack]
        default: [action]
        }
        let keys = candidates.flatMap { action -> [String] in
            if let band = direction, action == .attack || action == .meleeAttack {
                return ["\(action.rawValue)_\(band)", action.rawValue]
            }
            return [action.rawValue]
        }
        return keys.first { clips[creature]?[$0] != nil }
    }

    private static func browserHolds(for creature: String, key: String, clip: CreatureClip) -> [Double]? {
        guard clip.frameSources == nil, clip.sequence == nil,
              let holds = browserTiming.holds[creature]?[key], holds.count == clip.frameCount else { return nil }
        return holds
    }

    static func minimumMeleeHold(for creature: String) -> TimeInterval {
        (browserTiming.meleeMinimumHolds[creature] ?? 0) / 1000
    }

    static func timing(for creature: String, action: CreatureAction, direction: String?,
                       releaseFrame: Int? = nil) -> Timing? {
        guard let key = clipKey(for: creature, action: action, direction: direction),
              let clip = clips[creature]?[key] else { return nil }
        let webSamples = browserHolds(for: creature, key: key, clip: clip)
        let duration = webSamples.map { $0.reduce(0, +) / 1000 } ?? clip.cycle
        func contact(_ index: Int?) -> TimeInterval? {
            guard let index, (0..<clip.frameCount).contains(index) else { return nil }
            if let webSamples, webSamples.count == clip.frameCount { return webSamples.prefix(index).reduce(0, +) / 1000 }
            if let durations = clip.durations, durations.count == clip.frameCount {
                return durations.prefix(index).reduce(0, +) / 1000 * duration / clip.cycle
            }
            return Double(index) / Double(clip.frameCount) * duration
        }
        return Timing(duration: duration, impact: contact(clip.impactFrame),
                      release: contact(releaseFrame) ?? contact(clip.releaseFrame),
                      lethalMeleeDuration: browserTiming.lethalMeleeHolds[creature]?[key].map { $0 / 1000 })
    }

    static func bowRelease(for stack: Stack, at position: CGPoint, direction: String?, facing: CGFloat,
                           projection: BattlefieldProjection) -> (point: CGPoint, length: CGFloat)? {
        guard let key = clipKey(for: stack.name, action: .attack, direction: direction),
              let clip = clips[stack.name]?[key], let pin = clip.bowRelease, let index = clip.releaseFrame,
              (0..<clip.frameCount).contains(index) else { return nil }
        // Match the release cel's drawing transform without waiting for its atlas to decode.
        let frame = registration(for: stack.name, key: key, clip: clip, index: index)
        let body = boardPresentation(stack, position: position, projection: projection, facing: facing)
        let size = body.canvasSize(aspect: pin.aspect, heightScale: frame.height, widthRatio: frame.widthRatio)
        let point = CGPoint(x: body.ground.x + facing * size.width * (pin.x - frame.anchorX),
                            y: body.ground.y + size.height * (pin.y - frame.foot))
        return (point, size.width * pin.length)
    }

    static func prewarm(_ creature: String, action: CreatureAction, direction: String? = nil,
                        firstPageOnly: Bool = false) {
        guard let key = clipKey(for: creature, action: action, direction: direction),
              let clip = clips[creature]?[key] else { return }
        let combat = action != .idle
        if let sources = clip.frameSources {
            var warmed: Set<String> = []
            for source in sources where warmed.insert(source.resource).inserted {
                BattlefieldAtlas.prefetch(source.resource, maxDimension: creature == "Arbalester" ? nil : source.boardPixelLimit,
                                           combat: combat)
                if firstPageOnly { break }
            }
        } else if let resource = clip.pages?.first?.resource ?? clip.resource {
            BattlefieldAtlas.prefetch(resource, maxDimension: creature == "Arbalester" ? nil : 2048, combat: combat)
        }
    }

    static func prewarmCombatTurn(_ stack: Stack) {
        let ranged = stack.selectedAttack == .ranged
        let attack: CreatureAction = ranged ? .attack : .meleeAttack
        prewarm(stack.name, action: attack, firstPageOnly: true)
        prewarm(stack.name, action: .walk, firstPageOnly: true)
        if ranged {
            BattleProjectile.forShooter(stack.name)?.prewarm()
            BattleAimArtwork.prewarm(ranged: true)
        }
        prewarm(stack.name, action: attack, direction: "up", firstPageOnly: true)
        prewarm(stack.name, action: attack, direction: "down", firstPageOnly: true)
        if !stack.book.isEmpty {
            prewarm(stack.name, action: .cast, firstPageOnly: true)
            BattleAimArtwork.prewarm(ranged: false)
        }
    }

    static func frame(_ creature: String, pose: CreaturePose, inBackground: Bool = false) -> Frame? {
        let requested = pose.action
        guard let key = clipKey(for: creature, action: requested, direction: pose.verticalAttack),
              let clip = clips[creature]?[key] else { return nil }
        let webSamples = browserHolds(for: creature, key: key, clip: clip)
        let cycle = webSamples.map { $0.reduce(0, +) / 1000 } ?? clip.cycle
        let time: TimeInterval
        if let duration = pose.playbackDuration, duration > 0 {
            time = min(pose.time / duration, 0.999_999) * cycle
        } else {
            time = pose.time
        }
        let looping = requested == .idle || requested == .walk
        let gaitIndex = pose.walkDistance.flatMap { distance in
            clip.walk?.frameIndex(distance: distance, length: pose.walkLength ?? distance,
                                  time: pose.time, introHold: clip.frameDuration)
        }
        guard let index = gaitIndex ?? clip.frameIndex(at: time, looping: looping, with: webSamples) else { return nil }
        let image: CGImage?
        let source = clip.frameSources.flatMap { $0.indices.contains(index) ? $0[index] : nil }
        let limit = inBackground && creature != "Arbalester" ? 2048 : nil
        let combat = requested != .idle
        if let source {
            let ceiling = limit.map { _ in source.boardPixelLimit }
            image = BattlefieldAtlas.frame(source.resource, columns: source.columns, rows: source.rows, index: source.index,
                                           maxDimension: ceiling, inBackground: inBackground, combat: combat)
            if inBackground, image != nil, let sources = clip.frameSources {
                let end = min(sources.count, index + 5)
                if let upcoming = sources[(index + 1)..<end].first(where: { $0.resource != source.resource }) {
                    BattlefieldAtlas.prefetch(upcoming.resource, maxDimension: limit.map { _ in upcoming.boardPixelLimit },
                                               combat: combat)
                }
            }
        } else if let pages = clip.pages, let pageIndex = pages.firstIndex(where: { index < $0.firstFrame + $0.frameCount }) {
            let page = pages[pageIndex]
            image = BattlefieldAtlas.frame(page.resource, columns: page.columns, rows: page.rows,
                                           index: index - page.firstFrame, maxDimension: limit, inBackground: inBackground,
                                           combat: combat)
            if image != nil, pageIndex + 1 < pages.count, index >= page.firstFrame + max(0, page.frameCount - 6) {
                BattlefieldAtlas.prefetch(pages[pageIndex + 1].resource, maxDimension: limit, combat: combat)
            }
        } else if let resource = clip.resource, let columns = clip.columns, let rows = clip.rows {
            image = BattlefieldAtlas.frame(resource, columns: columns, rows: rows, index: index,
                                           maxDimension: limit, inBackground: inBackground, combat: combat)
        } else {
            image = nil
        }
        guard let image else {
            // Use the already warmed straight attack at the same point in the windup while
            // the angled atlas decodes. Holding the idle frame makes a landed click look ignored.
            if inBackground, let direction = pose.verticalAttack, key.hasSuffix("_\(direction)") {
                return frame(creature, pose: CreaturePose(action: requested, time: pose.time,
                                                         playbackDuration: pose.playbackDuration), inBackground: true)
            }
            return nil
        }
        let frame = registration(for: creature, key: key, clip: clip, index: index)
        let trim = source?.trim
        let trimRatio = trim.map { $0.height / $0.width } ?? 1
        return Frame(image: image, index: index, action: frame.action, foot: frame.foot, heightScale: frame.height,
                     widthRatio: frame.widthRatio * trimRatio, anchorX: frame.anchorX, trim: trim?.rect)
    }

    static func battlefieldImage(_ sprite: Frame, creature: String, pose: CreaturePose,
                                 idle: (time: TimeInterval, age: TimeInterval), battlefieldTime: TimeInterval,
                                 reduceMotion: Bool, battleMageStanding: @autoclosure () -> CGImage? = nil) -> CGImage {
        guard sprite.action == .idle else { return sprite.image }
        switch creature {
        case "Battle Mage" where pose.action == .idle:
            guard let standing = battleMageStanding() else { return sprite.image }
            return reduceMotion ? standing : BattleMageIdleAppearance.image(standing, elapsed: idle.time)
        case "Fairy":
            return FairyIdleAppearance.image(sprite.image, frame: sprite.index, elapsed: idle.time)
        case "Nightmare" where !reduceMotion:
            return NightmareIdleAppearance.image(sprite.image, elapsed: idle.time)
        case "Elf" where pose.action == .idle && !reduceMotion:
            return ElfIdleAppearance.image(sprite.image, time: battlefieldTime, idleAge: idle.age)
        case "Goblin Knight" where pose.action == .idle && !reduceMotion:
            return GoblinKnightIdleAppearance.image(sprite.image, frame: sprite.index, elapsed: idle.time)
        default:
            return sprite.image
        }
    }

    private static func registration(for creature: String, key: String, clip: CreatureClip, index: Int)
        -> (action: CreatureAction, foot: CGFloat, height: CGFloat, widthRatio: CGFloat, anchorX: CGFloat) {
        let action = CreatureAction(rawValue: key) ?? (key.hasPrefix("melee_attack") ? .meleeAttack : .attack)
        let geometry = clip.browserIdleFraming == true ? (height: CGFloat(1), foot: clip.footAnchor) :
            SpriteRegistration.geometry(creature, action: action, index: index, foot: clip.footAnchor)
        let registration = clip.registration.flatMap { $0.indices.contains(index) ? $0[index] : nil }
        let clipHeight = registration?.y ?? 1
        return (action, registration?.foot ?? geometry.foot, geometry.height * clipHeight,
                (registration?.x ?? 1) / clipHeight, registration?.anchorX ?? 0.5)
    }
}

// The web renderer registers the source canvases around the same standing sole row.
// Wide attack art includes room for the lunge without shrinking the creature.
private enum SpriteRegistration {
    static let wolfWalkHeights: [CGFloat] = [376, 375, 369, 365, 365, 370, 372, 370, 369, 363]
    static let wolfHitScales: [CGFloat] = [1, 1, 1.115, 1.115, 1.115, 1.115, 1.115, 1, 1]
    static let wolfDeathScales: [CGFloat] = [1, 1, 1.115, 1.115, 1.115, 1.115, 1.115, 1.1]

    static func geometry(_ creature: String, action: CreatureAction, index: Int, foot: CGFloat) -> (height: CGFloat, foot: CGFloat) {
        if creature == "Wolf" {
            switch action {
            case .attack, .meleeAttack: return (1024.0 / 768, foot)
            case .walk:
                let height = (562.0 / 768) / (wolfWalkHeights[min(index, wolfWalkHeights.count - 1)] / 512)
                return (height, (490 + (33 / (768 * height)) * 512) / 512)
            case .hit, .death:
                let scales = action == .hit ? wolfHitScales : wolfDeathScales
                let height = scales[min(index, scales.count - 1)]
                return (height, (697 + 33 / height) / 768)
            default: return (1, 730.0 / 768)
            }
        }
        if creature == "Arbalester" {
            let scale: CGFloat = 727.0 / 688
            let neutralAnchor: CGFloat = 369.0 / 384 - 32 / (768 * scale)
            switch action {
            case .attack, .meleeAttack: return (scale * 512 / 384, (neutralAnchor * 384 + 64) / 512)
            case .idle, .hit, .death: return (scale, neutralAnchor)
            default: break
            }
        }
        return (1, foot)
    }
}

@MainActor
@Observable
final class AtlasAvailability {
    var revision = 0
}

@MainActor
enum BattlefieldAtlas {
    private struct Crop: Hashable {
        let columns: Int
        let rows: Int
        let index: Int
    }
    @MainActor
    final class Sheet {
        let image: CGImage
        private var frames: [Crop: CGImage] = [:]

        init(_ image: CGImage) { self.image = image }

        func frame(columns: Int, rows: Int, index: Int) -> CGImage? {
            guard columns > 0, rows > 0, index >= 0 && index < columns * rows else { return nil }
            let crop = Crop(columns: columns, rows: rows, index: index)
            if let cached = frames[crop] { return cached }
            let column = index % columns
            let row = index / columns
            let x = column * image.width / columns
            let y = row * image.height / rows
            let rect = CGRect(x: x, y: y, width: (column + 1) * image.width / columns - x,
                              height: (row + 1) * image.height / rows - y)
            let cel = image.cropping(to: rect)
            frames[crop] = cel
            return cel
        }
    }

    static let availability = AtlasAvailability()
    private static let decodeQueue = DispatchQueue(label: "io.heroesofcrypto.atlases", qos: .userInitiated)
    // Fight art gets its own lane so a cold attack does not wait behind idle and background sheets.
    private static let combatDecodeQueue = DispatchQueue(label: "io.heroesofcrypto.atlases.combat", qos: .userInitiated)
    private static var loading: Set<String> = []
    private static var missing: Set<String> = []
    private static let sheets: NSCache<NSString, Sheet> = {
        let cache = NSCache<NSString, Sheet>()
        // Keep a crowded board's idle pages resident alongside the next combat clips.
        cache.totalCostLimit = 384 * 1024 * 1024
        return cache
    }()

    static func frame(_ resource: String, columns: Int, rows: Int, index: Int, maxDimension: Int? = nil,
                      inBackground: Bool = false, combat: Bool = false) -> CGImage? {
        guard columns > 0, rows > 0, index >= 0 && index < columns * rows else { return nil }
        let key = cacheKey(resource, maxDimension)
        guard let sheet = sheets.object(forKey: key as NSString) ?? (inBackground ? nil : load(resource, key, maxDimension)) else {
            if inBackground { prefetch(resource, maxDimension: maxDimension, combat: combat) }
            return nil
        }
        return sheet.frame(columns: columns, rows: rows, index: index)
    }

    static func prefetch(_ resource: String, maxDimension: Int? = nil, combat: Bool = false) {
        let key = cacheKey(resource, maxDimension)
        guard sheets.object(forKey: key as NSString) == nil, !loading.contains(key), !missing.contains(key) else { return }
        guard let url = Bundle.main.url(forResource: resource, withExtension: nil, subdirectory: "Atlases") else {
            missing.insert(key)
            return
        }
        loading.insert(key)
        let queue = combat ? combatDecodeQueue : decodeQueue
        queue.async {
            let image = decode(url, maxDimension: maxDimension)
            Task { @MainActor in
                loading.remove(key)
                if let image {
                    if sheets.object(forKey: key as NSString) == nil { _ = retain(image, key: key) }
                    availability.revision += 1
                } else {
                    missing.insert(key)
                }
            }
        }
    }

    private static func cacheKey(_ resource: String, _ maxDimension: Int?) -> String {
        maxDimension.map { "\(resource)#\($0)" } ?? resource
    }

    private static func load(_ resource: String, _ key: String, _ maxDimension: Int?) -> Sheet? {
        guard let url = Bundle.main.url(forResource: resource, withExtension: nil, subdirectory: "Atlases"),
              let decoded = decode(url, maxDimension: maxDimension) else { return nil }
        return retain(decoded, key: key)
    }

    private static func retain(_ image: CGImage, key: String) -> Sheet {
        let sheet = Sheet(image)
        sheets.setObject(sheet, forKey: key as NSString, cost: image.bytesPerRow * image.height)
        return sheet
    }

    nonisolated static func decode(_ url: URL, maxDimension: Int?) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let original: CGImage?
        if let maxDimension {
            original = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: maxDimension,
            ] as CFDictionary)
        } else {
            original = CGImageSourceCreateImageAtIndex(source, 0, nil)
        }
        guard let compressed = original, let space = CGColorSpace(name: CGColorSpace.sRGB),
              let bitmap = CGContext(data: nil, width: compressed.width, height: compressed.height,
                                     bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                     bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue |
                                        CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        // Back every crop with decoded pixels. A crop of the ImageIO provider can decode the WebP on each draw.
        bitmap.draw(compressed, in: CGRect(x: 0, y: 0, width: compressed.width, height: compressed.height))
        return bitmap.makeImage().map { LeprechaunAppearance.grade($0, resource: url.lastPathComponent) }
    }
}
