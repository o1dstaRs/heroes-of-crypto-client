import Foundation

struct BattleFloatingResult: Decodable {
    struct Damage: Decodable {
        struct Shadow: Decodable {
            let blur: CGFloat
            let angle: CGFloat
            let distance: CGFloat
        }

        let bottom: CGFloat
        let fontSize: CGFloat
        let strokeWidth: CGFloat
        let shadow: Shadow
    }

    struct Kills: Decodable {
        let bottom: CGFloat
        let fontSize: CGFloat
        let strokeWidth: CGFloat
        let iconSize: CGFloat
        let halfSpacing: CGFloat
        let y: CGFloat
    }

    let duration: TimeInterval
    let fadeIn: Double
    let fadeOutFrom: Double
    let flagGap: CGFloat
    let columnWidth: CGFloat
    let columns: [Int]
    let rowStep: CGFloat
    let damage: Damage
    let kills: Kills

    static let style = BattleStatusEffects.bundled?.floatingResult ?? Self(
        duration: 0.65, fadeIn: 0.125, fadeOutFrom: 0.62, flagGap: 6, columnWidth: 160,
        columns: [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6], rowStep: 46,
        damage: Damage(bottom: 36, fontSize: 60, strokeWidth: 5, shadow: .init(blur: 4, angle: .pi / 6, distance: 2)),
        kills: Kills(bottom: 80, fontSize: 40, strokeWidth: 4, iconSize: 40, halfSpacing: 25, y: 55)
    )

    func opacity(at elapsed: TimeInterval) -> Double {
        let progress = elapsed / duration
        return max(0, min(1, progress / fadeIn, (1 - progress) / (1 - fadeOutFrom)))
    }

    func offset(for lane: Int, casualties: Int, flagX: CGFloat, boardWidth: CGFloat, scale: CGSize) -> CGPoint {
        let spacing = columnWidth * scale.width
        let available = columns.filter { column in
            let center = flagX + CGFloat(column) * spacing
            return column == 0 || (center >= spacing / 2 && center <= boardWidth - spacing / 2)
        }
        let x = CGFloat(available[lane % available.count]) * spacing
        let bottom = casualties > 0 ? kills.bottom : damage.bottom
        let y = (bottom + flagGap + CGFloat(lane / available.count) * rowStep) * scale.height
        return CGPoint(x: x, y: -y)
    }
}

struct BattleStatusEffects: Decodable {
    struct Clip: Decodable {
        enum Style: String, Decodable { case common, roar, cut, beholder, procedural, borrow, petrifying }

        let resource: String
        let cols: Int
        let rows: Int
        let durations: [Double]
        let style: Style
        let fades: Bool?
        let restarts: Bool?
        let registration: [[Double]]?

        var authoredDuration: Double { durations.reduce(0, +) }
        var pixelLimit: Int { max(1024, max(cols, rows) * 256) }

        func sample(at progress: Double, appearanceSpeed: Double, reducedMotion: Bool) -> (frame: Int, opacity: Double)? {
            guard (0..<1).contains(progress) else { return nil }
            let total = authoredDuration
            let age = progress * total
            let accelerated = style != .beholder && style != .procedural && style != .borrow
            let elapsed = reducedMotion ? total * 0.45 :
                accelerated ? max(age, min(age * appearanceSpeed, total / 3)) : age

            var end = 0.0
            guard let frame = durations.firstIndex(where: {
                end += $0
                return elapsed < end
            }) else { return nil }
            if reducedMotion { return (frame, 1) }
            let opacity: Double
            if style == .roar {
                opacity = Self.smooth(elapsed / (total * 0.12)) * Self.smooth((total - elapsed) / (total * 0.22))
            } else if style == .petrifying {
                opacity = min(1, progress / 0.09, (1 - progress) / 0.18)
            } else if style == .beholder {
                opacity = min(1, progress / 0.075, (1 - progress) / 0.15)
            } else if fades == true {
                opacity = min(1, progress * appearanceSpeed / 0.08, (1 - progress) / 0.22)
            } else {
                opacity = 1
            }
            return (frame, opacity)
        }

        private static func smooth(_ value: Double) -> Double {
            let t = min(1, max(0, value))
            return t * t * (3 - 2 * t)
        }
    }

    let clips: [String: Clip]
    let passive: Set<String>
    let icons: [String: String]
    let colors: [String: String]
    let palette: [String: String]
    let borrowedClips: Set<String>
    let duration: TimeInterval
    let appearanceSpeed: Double
    let floatingResult: BattleFloatingResult?

    static let bundled: Self? = {
        guard let url = Bundle.main.url(forResource: "status-effects", withExtension: "json") else { return nil }
        return try? load(url)
    }()

    static let overheadDuration = bundled?.duration ?? 1.30
    static let washDuration = 0.65

    static func load(_ url: URL) throws -> Self {
        try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }

    static func isPassive(_ name: String) -> Bool {
        name == "Ember Covenant Blessing" || name.hasSuffix(" Aura") || name.hasSuffix(" Augment") ||
            bundled?.passive.contains(name) == true
    }

    static func captionColor(_ name: String, source: Faction?) -> UInt32 {
        guard let art = bundled else { return 0xe9e6df }
        let faction = art.colors[name] ?? source?.title ?? "System"
        return art.palette[faction].flatMap { UInt32($0.dropFirst(), radix: 16) } ?? 0xe9e6df
    }

    static func washTint(kind: StackStatus.Kind, age: TimeInterval) -> UInt32? {
        guard (0..<washDuration).contains(age) else { return nil }
        let progress = sin(.pi * age / washDuration) * 0.7
        let color: UInt32 = kind == .buff ? 0x4dff9e : 0x2a0a3a
        return [16, 8, 0].reduce(0) { result, channel in
            let target = Double((color >> channel) & 0xff)
            let value = UInt32((255 + (target - 255) * progress).rounded())
            return result | (value << channel)
        }
    }
}
