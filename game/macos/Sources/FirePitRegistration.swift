import CoreGraphics
import Foundation
import ImageIO

enum FirePitRegistration {
    static let maximumOffset = 0.24

    static func load(from url: URL) -> [CGFloat] {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let sheet = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 1024,
              ] as CFDictionary) else { return [] }
        return offsets(in: sheet)
    }

    static func offsets(in sheet: CGImage) -> [CGFloat] {
        let side = 128, columns = 8, width = side * columns
        let bytesPerRow = 4 * width
        guard let canvas = CGContext(data: nil, width: width, height: width, bitsPerComponent: 8,
                                     bytesPerRow: bytesPerRow, space: CGColorSpaceCreateDeviceRGB(),
                                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue |
                                        CGBitmapInfo.byteOrder32Big.rawValue), let data = canvas.data else { return [] }
        canvas.draw(sheet, in: CGRect(x: 0, y: 0, width: width, height: width))
        let rgba = data.assumingMemoryBound(to: UInt8.self)
        let centers = (0..<64).map { frame -> Double in
            let offsetX = frame % columns * side
            let offsetY = frame / columns * side
            var total = 0.0
            var weighted = 0.0
            // Register the lower flame body where it meets the pit, leaving the tips free to flicker.
            for y in 80..<98 {
                for x in 0..<side {
                    let alpha = Double(rgba[(offsetY + y) * bytesPerRow + (offsetX + x) * 4 + 3])
                    total += alpha
                    weighted += (Double(x) + 0.5) * alpha
                }
            }
            return total > 0 ? weighted / total : Double(side) / 2
        }
        let average = centers.reduce(0, +) / Double(centers.count)
        // The base is four cells wide. Smooth the correction across the loop boundary too.
        return centers.indices.map { index in
            let smoothed = (centers[(index + 63) % 64] + 2 * centers[index] + centers[(index + 1) % 64]) / 4
            return CGFloat(min(maximumOffset, max(-maximumOffset, (average - smoothed) * 4 / Double(side))))
        }
    }
}
