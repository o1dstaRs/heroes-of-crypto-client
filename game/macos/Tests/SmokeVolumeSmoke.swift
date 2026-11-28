import CoreGraphics
import Foundation
import Metal

extension SkirmishSmoke {
    @MainActor
    static func checkSmokeVolume(_ artwork: BattlefieldArtwork) throws {
        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let cloud = BattleSmokeClouds()
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let tiles = (6...8).flatMap { x in
            (7...9).map { y in BattleTerrainTile(cell: Cell(x: Int32(x), y: Int32(y)), laps: 2) }
        }
        let start = Date(timeIntervalSince1970: 0)
        func draw(_ tiles: [BattleTerrainTile], at age: TimeInterval) -> BattleSmokeClouds.Frame? {
            cloud.frame(tiles: tiles, projection: projection, now: start.addingTimeInterval(age),
                        scale: 1, reset: nil, reduceMotion: false)
        }
        func alpha(_ frame: BattleSmokeClouds.Frame?) throws -> Int {
            let pixels = try (frame?.image.dataProvider?.data).unwrap("Smoke did not render") as Data
            return stride(from: 3, to: pixels.count, by: 4).reduce(0) { $0 + Int(pixels[$1]) }
        }
        try require(try alpha(draw(tiles, at: 0)) == 0, "Smoke skipped the web's reveal")
        for tick in 1...9 { _ = draw(tiles, at: Double(tick) / 60) }
        let present = try alpha(draw(tiles, at: 10.0 / 60))
        let fading = try alpha(draw([], at: 13.0 / 60))
        try require(present > fading && fading > 0, "Smoke failed to fade after its authoritative tiles expired")
        try require(draw([], at: 0.5) == nil && !cloud.isVisible, "expired Smoke remained on the board")
    }
}
