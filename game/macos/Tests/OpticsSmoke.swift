import AppKit
import SwiftUI

extension SkirmishSmoke {
    @MainActor
    static func checkBattlefieldOptics() throws {
        let size = CGSize(width: 144, height: 96)
        let renderer = ImageRenderer(content: Canvas { context, _ in
            for column in 0..<144 {
                let tone = column.isMultiple(of: 2) ? Color.white : Color.black
                context.fill(Path(CGRect(x: column, y: 0, width: 1, height: 96)), with: .color(tone))
            }
        }.frame(width: size.width, height: size.height))
        renderer.scale = 2
        let image = try renderer.cgImage.unwrap("could not stage the composed battlefield")
        let heat = BattlefieldOptics.heatSources([70, 38, 32, 29, 0.9, 0.7])
        let water = BattlefieldOptics.Field(medium: .water, center: CGPoint(x: 104, y: 64),
                                            radii: CGSize(width: 25, height: 25), strength: 1, time: 1, bodyID: 7)
        let heated = try BattlefieldOptics.refract(image, viewport: size, scale: 2, fields: heat)
            .unwrap("Fire Wall heat failed to sample the scene")
        let shield = try BattlefieldOptics.refract(image, viewport: size, scale: 2, fields: [water])
            .unwrap("Water Shield failed to sample the scene")
        try require(heated.bounds.width < size.width && shield.bounds.height < size.height,
                    "refraction regenerated colour outside the spell bounds")
        func original(under rect: CGRect) throws -> NSBitmapImageRep {
            let crop = CGRect(x: rect.minX * 2, y: rect.minY * 2, width: rect.width * 2, height: rect.height * 2)
            return NSBitmapImageRep(cgImage: try image.cropping(to: crop).unwrap("could not crop control image"))
        }
        func changes(_ patch: (image: CGImage, bounds: CGRect)) throws -> Int {
            let control = try original(under: patch.bounds)
            let result = NSBitmapImageRep(cgImage: patch.image)
            var count = 0
            for y in stride(from: 0, to: result.pixelsHigh, by: 2) {
                for x in stride(from: 0, to: result.pixelsWide, by: 2) {
                    if result.colorAt(x: x, y: y) != control.colorAt(x: x, y: y) { count += 1 }
                }
            }
            return count
        }
        try require(try changes(heated) > 60 && changes(shield) > 60, "the spells only repainted the pre-existing pixels")

        let sprite = ImageRenderer(content: Canvas { context, _ in
            context.fill(Path(CGRect(x: 0, y: 0, width: 14, height: 17)), with: .color(.white))
            context.fill(Path(CGRect(x: 28.5, y: 16, width: 0.5, height: 14)), with: .color(.white))
        }.frame(width: 32, height: 40))
        sprite.scale = 2
        let alpha = try sprite.cgImage.unwrap("could not stage a transparent sprite pose")
        let spriteBounds = CGRect(x: 88, y: 44, width: 32, height: 40)
        func shieldWithBody(mirrored: Bool) throws -> CGImage {
            let patch = BattlefieldOptics.refract(image, viewport: size, scale: 2, fields: [water],
                                                  bodyMasks: [7: .init(image: alpha, bounds: spriteBounds, mirrored: mirrored)])
            return try patch.unwrap("could not refract the masked sprite").image
        }
        let control = try original(under: shield.bounds)
        func distortion(_ patch: CGImage, in area: CGRect) -> CGFloat {
            let sample = NSBitmapImageRep(cgImage: patch)
            let region = area.offsetBy(dx: -shield.bounds.minX, dy: -shield.bounds.minY)
            var difference: CGFloat = 0
            for y in Int(region.minY * 2)..<Int(region.maxY * 2) {
                for x in Int(region.minX * 2)..<Int(region.maxX * 2) {
                    let a = sample.colorAt(x: x, y: y)?.usingColorSpace(.sRGB)?.redComponent ?? 0
                    let b = control.colorAt(x: x, y: y)?.usingColorSpace(.sRGB)?.redComponent ?? 0
                    difference += abs(a - b)
                }
            }
            return difference / (region.width * region.height * 4)
        }
        let masked = try shieldWithBody(mirrored: false)
        let mirrored = try shieldWithBody(mirrored: true)
        let left = CGRect(x: 90, y: 48, width: 10, height: 11)
        let right = CGRect(x: 108, y: 48, width: 10, height: 11)
        let transparent = CGRect(x: 93, y: 68, width: 10, height: 10)
        try require(distortion(masked, in: left) < distortion(shield.image, in: left) * 0.45 &&
                    distortion(mirrored, in: right) < distortion(shield.image, in: right) * 0.45,
                    "Water Shield distorted an opaque part of the current or mirrored pose")
        try require(distortion(masked, in: right) == distortion(shield.image, in: right) &&
                    distortion(masked, in: transparent) == distortion(shield.image, in: transparent),
                    "Water Shield mask followed the sprite's rectangle instead of its alpha")
        let besideThinEdge = CGRect(x: 117.5, y: 64, width: 0.5, height: 4)
        try require(distortion(masked, in: besideThinEdge) < distortion(shield.image, in: besideThinEdge) * 0.45,
                    "Water Shield pulled a thin sprite edge into transparent pixels")

        var vanished = water
        vanished.burst = 0.40
        let gone = try BattlefieldOptics.refract(image, viewport: size, scale: 2, fields: [vanished])
            .unwrap("an expired water field failed to preserve its input")
        try require(try changes(gone) == 0, "Water Shield still warped the board after its tear disappeared")
    }
}
