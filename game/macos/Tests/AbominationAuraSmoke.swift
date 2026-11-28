import CoreGraphics
import Foundation
import Metal

extension SkirmishSmoke {
    @MainActor
    static func checkAbominationAura(_ artwork: BattlefieldArtwork) throws {
        var motion = BattlefieldAbominationAura.Motion(position: .zero, time: 0)
        motion.advance(to: CGPoint(x: 1, y: 0), time: 0.14)
        try require(motion.wakes.count == 5 && abs((motion.step?.position.x ?? 0) - 0.65) < 0.00001 &&
                    abs((motion.step?.position.y ?? 0) - 0.14) < 0.00001, "Abomination lost its world-space dust samples")
        motion.advance(to: CGPoint(x: 4, y: 0), time: 0.16)
        try require(motion.wakes.isEmpty && motion.step == nil && motion.velocity == .zero,
                    "a teleport left an Abomination dust trail across the board")

        guard MTLCreateSystemDefaultDevice() != nil else { return }
        let sand = BattlefieldAbominationAura()
        let projection = BattlefieldProjection(data: artwork, width: 932, height: 900, legacySize: 900)
        let board = CGRect(x: 0, y: 0, width: 16, height: 16)
        let area = CGRect(x: 0, y: 5, width: 6, height: 6)
        func frame(_ time: TimeInterval, board limits: CGRect = board,
                   reduced: Bool = false) throws -> BattlefieldAbominationAura.Frame {
            sand.beginFrame(at: time, reset: nil)
            return try sand.frame(owner: 1, range: 2, area: area, board: limits, projection: projection,
                                  time: time, opacity: 0.7, scale: 2, reduceMotion: reduced)
                .unwrap("Abomination's sand shader did not render")
        }
        func pixels(_ layer: BattlefieldAbominationAura.Layer) throws -> Data {
            try (layer.image.dataProvider?.data).unwrap("missing Abomination aura pixels") as Data
        }
        func isVisible(_ layer: BattlefieldAbominationAura.Layer) throws -> Bool {
            let rgba = try pixels(layer)
            return stride(from: 3, to: rgba.count, by: 4).contains { rgba[$0] > 0 }
        }
        let hidden = try frame(0)
        let revealed = try frame(0.45)
        let later = try frame(1.23)
        try require(try !isVisible(hidden.floor) && !isVisible(hidden.veil), "the sand skipped its reveal")
        try require(try isVisible(revealed.floor) && isVisible(revealed.veil), "the floor or foot veil stayed invisible")
        try require(try pixels(revealed.floor) != pixels(later.floor) && pixels(revealed.veil) != pixels(later.veil),
                    "the sand stopped moving or the foot veil lost its independent layer")
        let lift = projection.screenCellHeight * 0.12
        try require(abs(revealed.floor.bounds.minY - revealed.veil.bounds.minY - lift) < 1,
                    "the veil did not rise above Abomination's ground layer")
        let clipped = try frame(1.24, board: board.insetBy(dx: 2, dy: 2))
        try require(clipped.floor.bounds.minX > later.floor.bounds.minX &&
                    clipped.floor.bounds.maxX == later.floor.bounds.maxX,
                    "board narrowing squeezed the sand toward the owner")
        let reset = try frame(7)
        try require(try !isVisible(reset.floor), "the sand did not replay its reveal after a long absence")
        let still = try frame(7, reduced: true)
        try require(try isVisible(still.floor) && isVisible(still.veil), "reduced motion made the sand disappear")
    }
}
