import CoreGraphics
import Foundation

@MainActor
enum BattlefieldGriffinAura {
    struct Layer {
        let image: CGImage
        let bounds: CGRect
    }

    struct Frame {
        let back: Layer
        let front: Layer
        let clip: CGPath
        let eye: CGPath
    }

    private struct Art: Decodable {
        let segments: Int
        let rows: Int
        let widthScale: CGFloat
        let heightScale: CGFloat
        let eyeScale: CGFloat
        let eyeInset: CGFloat
        let verticalOffset: CGFloat
        let innerLiftLimit: CGFloat
        let outerLiftLimit: CGFloat
        let playbackRate: Double
        let fadeMilliseconds: Double
        let cacheMilliseconds: Double
        let minimumOpacity: Double
    }

    private struct Layout: Equatable {
        let center: CGPoint
        let footprint: Footprint
        let range: CGFloat
        let facing: CGFloat
        let board: CGRect
        let artwork: CGRect
        let scale: CGFloat
    }

    private struct Meshes {
        let layout: Layout
        let back: BattlefieldAuraRenderer.Mesh
        let front: BattlefieldAuraRenderer.Mesh
        let clip: CGPath
        let eye: CGPath
    }

    private static let art: Art? = {
        guard let url = Bundle.main.url(forResource: "griffin-aura", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Art.self, from: data)
    }()
    private static let renderer = BattlefieldAuraRenderer(["griffinWind", "griffinDust"])
    private static var cached: [Meshes] = []

    static var retention: TimeInterval { (art?.cacheMilliseconds ?? 5000) / 1000 }

    static func frame(center: CGPoint, footprint: Footprint, range: CGFloat, facing: CGFloat, board: CGRect,
                      projection: BattlefieldProjection, age: TimeInterval, opacity: Double,
                      scale: CGFloat) -> Frame? {
        guard let art, let renderer, range > 0, opacity > 0 else { return nil }
        let layout = Layout(center: center, footprint: footprint, range: range, facing: facing < 0 ? -1 : 1,
                            board: board, artwork: projection.artworkRect, scale: max(1, scale))
        guard let geometry = meshes(for: layout, art: art, projection: projection, renderer: renderer) else { return nil }
        let elapsed = max(0, age)
        let fade = min(1, elapsed * 1000 / art.fadeMilliseconds)
        let alpha = min(1, max(art.minimumOpacity, opacity)) * fade
        let uniforms = SIMD4(Float(elapsed * art.playbackRate), 0, 0, Float(alpha))
        func layer(_ mesh: BattlefieldAuraRenderer.Mesh) -> Layer? {
            renderer.image(mesh, layers: [0..<mesh.count, 0..<mesh.count], uniforms: uniforms)
                .map { Layer(image: $0, bounds: mesh.bounds) }
        }
        guard let back = layer(geometry.back), let front = layer(geometry.front) else { return nil }
        return Frame(back: back, front: front, clip: geometry.clip, eye: geometry.eye)
    }

    private static func meshes(for layout: Layout, art: Art, projection: BattlefieldProjection,
                               renderer: BattlefieldAuraRenderer) -> Meshes? {
        if let index = cached.firstIndex(where: { $0.layout == layout }) {
            let meshes = cached.remove(at: index)
            cached.append(meshes)
            return meshes
        }

        let halfWidth = CGFloat(layout.footprint.width) / 2
        let halfHeight = CGFloat(layout.footprint.height) / 2
        let radiusX = (layout.range + halfWidth) * art.widthScale
        let radiusY = (layout.range + halfHeight) * art.heightScale
        let eyeX = halfWidth * sqrt(2) * art.eyeScale - art.eyeInset
        let eyeY = halfHeight * sqrt(2) * art.eyeScale
        let center = layout.center
        let limits = CGRect(x: center.x - radiusX, y: center.y + art.verticalOffset - radiusY,
                            width: 2 * radiusX, height: 2 * radiusY).intersection(layout.board)
        guard !limits.isEmpty else { return nil }

        // Both halves sample the same raised surface, with the opening tucked toward the front legs.
        func point(_ angle: CGFloat, _ progress: CGFloat) -> CGPoint {
            let x = eyeX + (radiusX - eyeX) * progress
            let y = eyeY + (radiusY - eyeY) * progress
            let lift = min(eyeY / art.eyeScale * sin(.pi * progress), (y - eyeY) * art.innerLiftLimit,
                           (radiusY - y) * art.outerLiftLimit)
            let worldX = center.x + cos(angle) * x - art.eyeInset * layout.facing * (1 - progress)
            let worldY = center.y + sin(angle) * y + lift + art.verticalOffset * progress
            return projection.point(x: worldX, y: worldY)
        }

        let columns = art.segments + 1
        func shell(front: Bool) -> BattlefieldAuraRenderer.Mesh? {
            let points = (0...art.rows).flatMap { row in
                let progress = CGFloat(row) / CGFloat(art.rows)
                return (0...art.segments).map { column in
                    let angle = (front ? CGFloat.pi : 0) + CGFloat(column) / CGFloat(art.segments) * .pi
                    let screen = point(angle, progress)
                    return BattlefieldAuraRenderer.Vertex(position: SIMD2(Float(screen.x), Float(screen.y)),
                                                          uv: SIMD2(Float(angle / (2 * .pi)), Float(progress)))
                }
            }
            var vertices: [BattlefieldAuraRenderer.Vertex] = []
            for row in 0..<art.rows {
                for column in 0..<art.segments {
                    let a = row * columns + column
                    let b = a + columns
                    vertices += [points[a], points[b], points[a + 1], points[a + 1], points[b], points[b + 1]]
                }
            }
            return renderer.mesh(vertices, scale: layout.scale)
        }

        guard let back = shell(front: false), let front = shell(front: true) else { return nil }
        let eye = CGMutablePath()
        let steps = art.segments * 2
        eye.addLines(between: (0..<steps).map { point(CGFloat($0) / CGFloat(steps) * 2 * .pi, 0) })
        eye.closeSubpath()
        let meshes = Meshes(layout: layout, back: back, front: front, clip: projection.outline(of: limits), eye: eye)
        if cached.count >= 8 { cached.removeFirst() }
        cached.append(meshes)
        return meshes
    }
}
