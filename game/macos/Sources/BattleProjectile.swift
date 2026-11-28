import CoreGraphics
import Foundation

@MainActor
enum BattleAimArtwork {
    static let arrowhead = "shot_trajectory_orc_bronze_arrowhead_distant_match_v8.webp"
    static let fletching = "shot_trajectory_orc_bronze_fletching_distant_match_v8.webp"
    static let casing = "shot_trajectory_hammered_bronze_casing_sprite_v4.webp"
    static let helix = "magic_aim_dual_helix_default_atlas.webp"

    static func prewarm(ranged: Bool) {
        for resource in ranged ? [arrowhead, fletching, casing] : [helix] {
            BattlefieldAtlas.prefetch(resource, combat: true)
        }
    }
}

@MainActor
struct BattleProjectile: Decodable {
    struct Atlas: Decodable {
        let columns: Int
        let rows: Int
        let frames: Int
        let secondsPerFrame: TimeInterval

        func index(at elapsed: TimeInterval) -> Int {
            Int(elapsed / secondsPerFrame) % frames
        }
    }

    struct Anchor: Decodable {
        let x: CGFloat
        let y: CGFloat
    }

    struct ChakramOrigin: Decodable {
        let x: CGFloat
        let y: CGFloat
        let diameter: CGFloat
    }

    struct Impact: Decodable {
        let resource: String
        let columns: Int
        let rows: Int
        let durations: [TimeInterval]
        let paintedFraction: CGFloat
        let footprint: CGFloat

        var duration: TimeInterval { durations.reduce(0, +) }

        @MainActor func image(at elapsed: TimeInterval, inBackground: Bool) -> CGImage? {
            guard elapsed >= 0 else { return nil }
            var time = elapsed
            for (index, hold) in durations.enumerated() {
                if time < hold {
                    return BattlefieldAtlas.frame(resource, columns: columns, rows: rows, index: index,
                                                 maxDimension: 1536, inBackground: inBackground, combat: true)
                }
                time -= hold
            }
            return nil
        }
    }

    private struct Catalogue: Decodable {
        let fallback: BattleProjectile
        let shooters: [String: BattleProjectile]
    }

    let resource: String
    let widthCells: CGFloat
    let directional: Bool?
    let spin: Double?
    let arcCells: CGFloat?
    let releaseFrame: Int?
    let authoredRelease: Bool?
    let cellsPerSecond: CGFloat?
    let piercingSpeedMultiplier: CGFloat?
    let atlas: Atlas?
    let anchor: Anchor?
    let impact: Impact?
    let chakramOrigins: [String: ChakramOrigin]?

    private static let catalogue: Catalogue? = {
        guard let url = Bundle.main.url(forResource: "projectiles", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalogue.self, from: data)
    }()

    static func forShooter(_ name: String?) -> BattleProjectile? {
        guard let catalogue else { return nil }
        return name.flatMap { catalogue.shooters[$0] } ?? catalogue.fallback
    }

    private var pixelLimit: Int { atlas == nil ? 384 : 1280 }

    func prewarm() {
        BattlefieldAtlas.prefetch(resource, maxDimension: pixelLimit, combat: true)
        if let impact { BattlefieldAtlas.prefetch(impact.resource, maxDimension: 1536, combat: true) }
    }

    func image(at elapsed: TimeInterval, inBackground: Bool) -> CGImage? {
        BattlefieldAtlas.frame(resource, columns: atlas?.columns ?? 1, rows: atlas?.rows ?? 1,
                              index: atlas?.index(at: elapsed) ?? 0, maxDimension: pixelLimit,
                              inBackground: inBackground, combat: true)
    }
}
