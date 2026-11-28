import CoreGraphics
import Foundation

@MainActor
enum BattlefieldWyvernAura {
    struct Frame {
        let floor: [Layer]
        let back: Layer
        let front: Layer
        let clip: CGPath
    }

    struct Layer {
        let image: CGImage
        let bounds: CGRect
    }

    private struct Art: Decodable {
        struct Plume: Decodable {
            let vent, front: Bool
            let x, y, width, height: CGFloat
            let opacity, seed: Float
        }
        struct Wake: Decodable {
            let capacity: Int
            let duration, maxGapMilliseconds, minIntervalMilliseconds: Double
            let halfSize, minDistance, teleportDistance: CGFloat
            let seedStep: Float
        }
        let plumes: [Plume]
        let padding: CGFloat
        let initialTime, fullOpacity, cacheMilliseconds: Double
        let sourceX, sourceY: CGFloat
        let wake: Wake
    }

    @MainActor
    final class Motion {
        fileprivate struct Puff {
            let index: Int
            let center: CGPoint
            let born: Date
        }
        let started: Date
        private(set) var seen: Date
        private var lastWake: CGPoint
        private var lastWakeTime: Date
        private var nextWake = 0
        private var puffs: [Puff] = []

        init(center: CGPoint, at now: Date) {
            started = now
            seen = now
            lastWake = center
            lastWakeTime = now
        }

        fileprivate func update(center: CGPoint, at now: Date) -> [Puff] {
            guard let style = BattlefieldWyvernAura.art?.wake else { return [] }
            let distance = hypot(center.x - lastWake.x, center.y - lastWake.y)
            if now.timeIntervalSince(seen) * 1000 > style.maxGapMilliseconds || distance > style.teleportDistance {
                puffs.removeAll()
                lastWake = center
            } else if distance > style.minDistance && now.timeIntervalSince(lastWakeTime) * 1000 >= style.minIntervalMilliseconds {
                puffs.removeAll { $0.index == nextWake }
                puffs.append(Puff(index: nextWake, center: lastWake, born: now))
                nextWake = (nextWake + 1) % style.capacity
                lastWake = center
                lastWakeTime = now
            }
            seen = now
            puffs.removeAll { now.timeIntervalSince($0.born) >= style.duration }
            return puffs.sorted { $0.index < $1.index }
        }
    }

    private struct Layout: Equatable {
        let area: CGRect
        let board: CGRect
        let facing: CGFloat
        let artwork: CGRect
        let scale: CGFloat
    }

    private struct Meshes {
        let layout: Layout
        let floor, back, front: BattlefieldAuraRenderer.Target
        let clip: CGPath
    }

    private static let art: Art? = {
        guard let url = Bundle.main.url(forResource: "wyvern-aura", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Art.self, from: data)
    }()
    private static let renderer = BattlefieldAuraRenderer(["wyvernFloor", "wyvernAir", "wyvernTrail"])
    private static var cached: [Meshes] = []

    static var retention: TimeInterval { (art?.cacheMilliseconds ?? 5000) / 1000 }

    static func frame(area: CGRect, board: CGRect, facing: CGFloat, projection: BattlefieldProjection,
                      now: Date, motion: Motion?, opacity: Double, scale: CGFloat) -> Frame? {
        guard let art, let renderer, opacity > 0, !area.intersection(board).isEmpty else { return nil }
        let layout = Layout(area: area, board: board, facing: facing < 0 ? -1 : 1,
                            artwork: projection.artworkRect, scale: max(1, scale))
        guard let geometry = meshes(for: layout, art: art, projection: projection, renderer: renderer) else { return nil }
        let center = CGPoint(x: area.midX, y: area.midY)
        let halfWidth = area.width / 2
        let halfHeight = area.height / 2
        let alpha = Float(min(1, opacity / art.fullOpacity))
        let time = art.initialTime + max(0, motion.map { now.timeIntervalSince($0.started) } ?? 0)
        var uniforms = [SIMD4(Float(time), 0, 0, alpha),
                        SIMD4(Float(art.sourceX * layout.facing / halfWidth), Float(art.sourceY / halfHeight),
                              Float(1 / halfWidth), Float(1 / halfHeight))]
        uniforms += art.plumes.map { SIMD4($0.seed, $0.vent ? 1 : 0, 0, $0.opacity * alpha) }
        var targets = [geometry.floor]
        for puff in motion?.update(center: center, at: now) ?? [] {
            let half = art.wake.halfSize
            let vertices = quad([
                projection.point(x: puff.center.x - half, y: puff.center.y - half),
                projection.point(x: puff.center.x + half, y: puff.center.y - half),
                projection.point(x: puff.center.x - half, y: puff.center.y + half),
                projection.point(x: puff.center.x + half, y: puff.center.y + half),
            ])
            guard let mesh = renderer.mesh(vertices, scale: layout.scale) else { continue }
            let layer = BattlefieldAuraRenderer.Layer(material: 2, vertices: 0..<mesh.count, parameter: Float(uniforms.count))
            uniforms.append(SIMD4(Float(now.timeIntervalSince(puff.born)), Float(puff.index) * art.wake.seedStep, 0, alpha))
            targets.append(.init(mesh: mesh, layers: [layer]))
        }
        let floorCount = targets.count
        targets += [geometry.back, geometry.front]
        guard let images = renderer.images(targets, uniforms: uniforms) else { return nil }
        let layers = zip(images, targets).map { Layer(image: $0, bounds: $1.mesh.bounds) }
        return Frame(floor: Array(layers.prefix(floorCount)), back: layers[floorCount], front: layers[floorCount + 1],
                     clip: geometry.clip)
    }

    private static func meshes(for layout: Layout, art: Art, projection: BattlefieldProjection,
                               renderer: BattlefieldAuraRenderer) -> Meshes? {
        if let index = cached.firstIndex(where: { $0.layout == layout }) {
            let meshes = cached.remove(at: index)
            cached.append(meshes)
            return meshes
        }
        let area = layout.area
        let halfWidth = area.width / 2
        let halfHeight = area.height / 2
        let feathered = area.insetBy(dx: -halfWidth * (art.padding - 1), dy: -halfHeight * (art.padding - 1))
        let field = BattlefieldAuraRenderer.fieldVertices(area: area, visible: feathered.intersection(layout.board),
                                                          projection: projection)
        guard let floor = renderer.mesh(field, scale: layout.scale) else { return nil }

        func air(front: Bool) -> BattlefieldAuraRenderer.Target? {
            var vertices: [BattlefieldAuraRenderer.Vertex] = []
            var layers: [BattlefieldAuraRenderer.Layer] = []
            for (index, plume) in art.plumes.enumerated() where plume.front == front {
                let origin = projection.point(x: area.midX + plume.x * (plume.vent ? layout.facing : halfWidth),
                                              y: area.midY + plume.y * (plume.vent ? 1 : halfHeight))
                let half = plume.width * projection.screenCellWidth / 2
                let top = origin.y - plume.height * projection.screenCellHeight
                let start = vertices.count
                vertices += quad([CGPoint(x: origin.x - half, y: origin.y), CGPoint(x: origin.x + half, y: origin.y),
                                  CGPoint(x: origin.x - half, y: top), CGPoint(x: origin.x + half, y: top)])
                layers.append(.init(material: 1, vertices: start..<vertices.count, parameter: Float(index + 2)))
            }
            return renderer.mesh(vertices, scale: layout.scale).map { .init(mesh: $0, layers: layers) }
        }

        guard let back = air(front: false), let front = air(front: true) else { return nil }
        let meshes = Meshes(layout: layout, floor: .init(mesh: floor, layers: [.init(material: 0, vertices: 0..<floor.count)]),
                            back: back, front: front, clip: projection.outline(of: layout.board))
        if cached.count >= 8 { cached.removeFirst() }
        cached.append(meshes)
        return meshes
    }

    private static func quad(_ points: [CGPoint]) -> [BattlefieldAuraRenderer.Vertex] {
        [0, 1, 2, 2, 1, 3].map { index in
            let point = points[index]
            return .init(position: SIMD2(Float(point.x), Float(point.y)), uv: SIMD2(Float(index % 2), Float(index / 2)))
        }
    }
}
