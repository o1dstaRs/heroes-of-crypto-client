import AppKit
import AVFoundation
import CoreText
import ImageIO
import SwiftUI

@MainActor
enum BattleResources {
    struct Portrait: Decodable {
        struct Framing: Decodable {
            let fit: String
            let scale: CGFloat
            let offsetX: CGFloat
            let offsetY: CGFloat
            let background: String
        }

        let background: String?
        let backgroundOpacity: Double
        let backgroundShadeAlpha: Double
        let backgroundShadeColor: UInt32
        let backgroundTone: String?
        let framing: Framing
        let mirrored: Bool
        let authoredFacing: CGFloat
    }

    private static let images = NSCache<NSString, NSImage>()
    private static let bitmaps = NSCache<NSString, CGImage>()
    private static let inspectorPortraits: NSCache<NSString, CGImage> = {
        let cache = NSCache<NSString, CGImage>()
        cache.totalCostLimit = 64 * 1024 * 1024
        return cache
    }()
    private static var inspectorLoads: [String: Task<CGImage?, Never>] = [:]
    static let portraits: [String: Portrait] = {
        guard let url = Bundle.main.url(forResource: "portraits", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: Portrait].self, from: data)) ?? [:]
    }()

    static let projection: BattlefieldArtwork? = {
        guard let url = Bundle.main.url(forResource: "battlefield", withExtension: "json") else { return nil }
        return try? BattlefieldArtwork.load(url)
    }()

    struct SynergyArt: Decodable {
        let icon: String
        let description: String
    }

    static let synergies: [String: SynergyArt] = {
        guard let file = Bundle.main.url(forResource: "sandbox-synergies", withExtension: "json"),
              let data = try? Data(contentsOf: file) else { return [:] }
        return (try? JSONDecoder().decode([String: SynergyArt].self, from: data)) ?? [:]
    }()

    static func image(_ name: String) -> NSImage? {
        let key = name as NSString
        if let cached = images.object(forKey: key) { return cached }
        guard let url = Bundle.main.url(forResource: name, withExtension: "webp"),
              let image = NSImage(contentsOf: url) else { return nil }
        images.setObject(image, forKey: key)
        return image
    }

    static func cgImage(_ name: String) -> CGImage? {
        let key = name as NSString
        if let cached = bitmaps.object(forKey: key) { return cached }
        guard let bitmap = image(name)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        bitmaps.setObject(bitmap, forKey: key)
        return bitmap
    }

    static func scaledIcon(_ name: String, pixelSide: Int) -> CGImage? {
        let key = "scaled-icon-\(name)-\(pixelSide)" as NSString
        if let cached = bitmaps.object(forKey: key) { return cached }
        guard let artwork = cgImage(name),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let canvas = CGContext(data: nil, width: pixelSide, height: pixelSide, bitsPerComponent: 8, bytesPerRow: 0,
                                     space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        canvas.interpolationQuality = .high
        canvas.draw(artwork, in: CGRect(x: 0, y: 0, width: pixelSide, height: pixelSide))
        guard let icon = canvas.makeImage() else { return nil }
        bitmaps.setObject(icon, forKey: key)
        return icon
    }

    static func inspectorPortrait(for name: String) -> CGImage? {
        inspectorPortraits.object(forKey: name as NSString)
    }

    static func loadInspectorPortrait(for name: String, priority: TaskPriority = .userInitiated) async -> CGImage? {
        if let cached = inspectorPortrait(for: name) { return cached }
        if let load = inspectorLoads[name] { return await load.value }
        guard let url = Bundle.main.url(forResource: "\(creature(name))_inspect", withExtension: "webp") else { return nil }

        let load = Task {
            let bitmap = await Task.detached(priority: priority) { decodeBitmap(at: url) }.value
            if let bitmap {
                inspectorPortraits.setObject(bitmap, forKey: name as NSString, cost: bitmap.bytesPerRow * bitmap.height)
            }
            inspectorLoads.removeValue(forKey: name)
            return bitmap
        }
        inspectorLoads[name] = load
        return await load.value
    }

    nonisolated static func decodeBitmap(at url: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }

    static func nameFlag(_ team: Team, filled: Bool) -> CGImage? {
        let key = "flag-\(team.rawValue)-\(filled)" as NSString
        if let cached = bitmaps.object(forKey: key) { return cached }
        let width = 512
        let height = 128
        guard let artwork = cgImage("ui_creature_name_flag_classic_v9"),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let canvas = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                     space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue |
                                        CGBitmapInfo.byteOrder32Big.rawValue),
              let pixels = canvas.data?.assumingMemoryBound(to: UInt8.self) else { return nil }
        canvas.interpolationQuality = .high
        canvas.draw(artwork, in: CGRect(x: 0, y: 0, width: width, height: height))
        let shades = BattlePalette.clothColors(team)
        let tint = team == .player ? 0.9 : team == .opponent ? 0.8 : 1
        let shifts: [UInt32] = [16, 8, 0]
        let cloth = (0..<width).map { x in
            let edge = abs(2 * Double(x) / Double(width - 1) - 1)
            return shifts.map { shift in
                let middle = Double((shades.center >> shift) & 255)
                let rim = Double((shades.edge >> shift) & 255)
                return (middle + (rim - middle) * edge) * tint / 255
            }
        }
        // Shade the folds from the source red channel and keep the painted gold trim.
        for y in 0..<height {
            for x in 0..<width {
                let offset = (y * width + x) * 4
                let alpha = Double(pixels[offset + 3])
                guard alpha > 0 else { continue }
                let red = Double(pixels[offset])
                let material = min(1, red / alpha)
                let goldRatio = Double(pixels[offset + 1]) / max(1, red)
                let gold = min(1, max(0, (goldRatio - 0.30) / 0.25))
                let goldMix = gold * gold * (3 - 2 * gold)
                for channel in 0..<3 {
                    let tone = filled ? cloth[x][channel] * (2 * min(1, 1.35 * material)) : 0.15 * material + 0.028
                    let painted = Double(pixels[offset + channel])
                    pixels[offset + channel] = UInt8(min(alpha, tone * alpha * (1 - goldMix) + painted * goldMix))
                }
            }
        }
        guard let flag = canvas.makeImage() else { return nil }
        bitmaps.setObject(flag, forKey: key)
        return flag
    }

    static func creature(_ name: String) -> String {
        name.lowercased().replacingOccurrences(of: " ", with: "_")
    }

    private static let stoneFrames = slicedStones("stones")
    private static let fightStoneFrames = slicedStones("stones-fight")

    private static func slicedStones(_ resource: String) -> [CGImage] {
        guard let atlas = cgImage(resource) else { return [] }
        return (0..<9).compactMap { index in
            atlas.cropping(to: CGRect(x: (index % 3) * 256, y: (index / 3) * 461, width: 256, height: 461))
        }
    }

    static func stone(_ cell: Cell, fighting: Bool) -> CGImage? {
        let frames = fighting && !fightStoneFrames.isEmpty ? fightStoneFrames : stoneFrames
        guard !frames.isEmpty else { return nil }
        return frames[(Int(cell.x) * 11 + Int(cell.y) * 7) % frames.count]
    }

    private static let displayName: String? = {
        guard let url = Bundle.main.url(forResource: "HoCForge-Regular", withExtension: "ttf"),
              let descriptor = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let font = descriptor.first else { return nil }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        return CTFontDescriptorCopyAttribute(font, kCTFontNameAttribute) as? String
    }()

    static func display(_ size: CGFloat) -> Font {
        if let displayName { return .custom(displayName, size: size) }
        return .system(size: size, design: .serif)
    }

    static func forecastFont(_ size: CGFloat) -> CTFont {
        CTFontCreateWithName((displayName ?? "Georgia") as CFString, size, nil)
    }
}

@MainActor
final class BattleSound {
    private struct SpellSound: Decodable { let slug: String }
    private static let spellSounds: [String: SpellSound] = {
        guard let url = Bundle.main.url(forResource: "spell-sounds", withExtension: "json", subdirectory: "Sounds"),
              let data = try? Data(contentsOf: url) else { return [:] }
        return (try? JSONDecoder().decode([String: SpellSound].self, from: data)) ?? [:]
    }()
    private var players: [String: AVAudioPlayer] = [:]
    private var movement: AVAudioPlayer?

    static func castKey(for spell: String, caster: String) -> String? {
        if caster == "Blacksmith" && spell == "Craft" { return "blacksmith_cast" }
        return spellSounds[spell]?.slug
    }

    func play(_ key: String) {
        guard let player = player(for: key) else { return }
        player.numberOfLoops = 0
        player.currentTime = 0
        player.play()
    }

    func startMovement(_ key: String) {
        stopMovement()
        guard let player = player(for: key) else { return }
        player.numberOfLoops = -1
        player.currentTime = 0
        player.play()
        movement = player
    }

    func stopMovement() {
        movement?.stop()
        movement = nil
    }

    private func player(for key: String) -> AVAudioPlayer? {
        if players[key] == nil,
           let url = Bundle.main.url(forResource: key, withExtension: "mp3", subdirectory: "Sounds") {
            players[key] = try? AVAudioPlayer(contentsOf: url)
        }
        return players[key]
    }
}
