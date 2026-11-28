import CoreGraphics
import Foundation

@MainActor
enum BattlefieldWindAura {
    private static let renderer = BattlefieldAuraRenderer(["windField", "windRim"])
    private static var meshes: [Mesh] = []

    static func image(area: CGRect, board: CGRect, projection: BattlefieldProjection, time: TimeInterval,
                      opacity: Double, scale: CGFloat, inward: Bool) -> (image: CGImage, bounds: CGRect)? {
        let visible = area.intersection(board)
        guard let renderer, !visible.isEmpty, opacity > 0 else { return nil }
        let layout = Layout(area: area, visible: visible, artwork: projection.artworkRect, scale: max(1, scale))
        guard let mesh = mesh(for: layout, projection: projection, renderer: renderer) else { return nil }
        let uniforms = SIMD4(Float(time), Float(2 * (visible.width + visible.height)),
                             Float(area.width / area.height), Float(min(1, opacity)))
        let layers = [0..<mesh.fieldCount, mesh.fieldCount..<mesh.geometry.count]
        guard let image = renderer.image(mesh.geometry, layers: layers, uniforms: uniforms,
                                         direction: inward ? 1 : 0) else { return nil }
        return (image, mesh.geometry.bounds)
    }

    private struct Layout: Equatable {
        let area: CGRect
        let visible: CGRect
        let artwork: CGRect
        let scale: CGFloat
    }

    private struct Mesh {
        let layout: Layout
        let geometry: BattlefieldAuraRenderer.Mesh
        let fieldCount: Int
    }

    private static func mesh(for layout: Layout, projection: BattlefieldProjection, renderer: BattlefieldAuraRenderer) -> Mesh? {
        if let index = meshes.firstIndex(where: { $0.layout == layout }) {
            let mesh = meshes.remove(at: index)
            meshes.append(mesh)
            return mesh
        }

        let area = layout.area
        let visible = layout.visible
        func vertex(_ x: CGFloat, _ y: CGFloat, _ u: CGFloat, _ v: CGFloat) -> BattlefieldAuraRenderer.Vertex {
            let point = projection.point(x: x, y: y)
            return .init(position: SIMD2(Float(point.x), Float(point.y)), uv: SIMD2(Float(u), Float(v)))
        }

        var vertices = BattlefieldAuraRenderer.fieldVertices(area: area, visible: visible, projection: projection)
        let fieldCount = vertices.count

        // The border's UV measures distance around the clipped range, in board cells.
        let corners = [CGPoint(x: visible.minX, y: visible.minY), CGPoint(x: visible.maxX, y: visible.minY),
                       CGPoint(x: visible.maxX, y: visible.maxY), CGPoint(x: visible.minX, y: visible.maxY)]
        var arc: CGFloat = 0
        for edge in corners.indices {
            let p = corners[edge]
            let q = corners[(edge + 1) % corners.count]
            let dx = q.x - p.x
            let dy = q.y - p.y
            let length = hypot(dx, dy)
            let divisions = Int(ceil(length * 16))
            let ribbon = (0...divisions).flatMap { index in
                let fraction = CGFloat(index) / CGFloat(divisions)
                return [-1.0, 1.0].map { side in
                    vertex(p.x + dx * fraction - dy / length * 0.42 * side,
                           p.y + dy * fraction + dx / length * 0.42 * side, arc + length * fraction, side)
                }
            }
            for index in 0..<divisions {
                let a = 2 * index
                vertices += [ribbon[a], ribbon[a + 1], ribbon[a + 2], ribbon[a + 1], ribbon[a + 3], ribbon[a + 2]]
            }
            arc += length
        }

        guard let geometry = renderer.mesh(vertices, scale: layout.scale) else { return nil }
        let mesh = Mesh(layout: layout, geometry: geometry, fieldCount: fieldCount)
        if meshes.count >= 8 { meshes.removeFirst() }
        meshes.append(mesh)
        return mesh
    }
}
