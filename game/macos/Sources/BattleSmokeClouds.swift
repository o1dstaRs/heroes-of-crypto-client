import CoreGraphics
import Foundation
import Metal

/// Engine-owned Smoke cells rendered with the web's volume, seed and presence curve.
@MainActor
final class BattleSmokeClouds {
    private struct Style: Decodable {
        let timeScale, maxTimeStep, reveal, fade, lastLap: Double
        let lift, radius: CGFloat
        let noiseSize: Int
    }

    private struct Cloud {
        var tile: BattleTerrainTile
        var presence: Double
    }

    struct Frame {
        let image: CGImage
        let bounds: CGRect
    }

    private struct Mesh {
        let cells: [Cell]
        let artwork: CGRect
        let scale: CGFloat
        let target: BattlefieldAuraRenderer.Target
    }

    private static let graphics: (Style, BattlefieldAuraRenderer, MTLTexture)? = {
        guard let styleURL = Bundle.main.url(forResource: "smoke-cloud", withExtension: "json"),
              let styleBytes = try? Data(contentsOf: styleURL),
              let style = try? JSONDecoder().decode(Style.self, from: styleBytes),
              let noiseURL = Bundle.main.url(forResource: "smoke-noise", withExtension: "dat"),
              let noiseBytes = try? Data(contentsOf: noiseURL),
              let renderer = BattlefieldAuraRenderer(["smokeFragment"], resource: "smoke-cloud", vertexName: "smokeVertex"),
              let volume = renderer.volumeTexture(bytes: noiseBytes, size: style.noiseSize)
        else { return nil }
        return (style, renderer, volume)
    }()

    private var clouds: [Cloud] = []
    private var mesh: Mesh?
    private var lastFrame: Date?
    private var reset: Date?
    private var time = 0.0
    var isVisible: Bool { !clouds.isEmpty }

    func frame(tiles: [BattleTerrainTile], projection: BattlefieldProjection, now: Date, scale: CGFloat,
               reset: Date?, reduceMotion: Bool) -> Frame? {
        if let reset, self.reset != reset {
            self.reset = reset
            clouds.removeAll()
            mesh = nil
            time = 0
            lastFrame = now
        }
        let dt = max(0, lastFrame.map { now.timeIntervalSince($0) } ?? 0)
        lastFrame = now
        guard (!tiles.isEmpty || !clouds.isEmpty), let (style, renderer, volume) = Self.graphics else { return nil }
        let seconds = dt * style.timeScale
        if !reduceMotion {
            // A 30 Hz canvas may coalesce web simulation ticks, but a background pause must not advance the noise.
            time += dt > 0.1 ? style.maxTimeStep : seconds
        }
        let active = Dictionary(uniqueKeysWithValues: tiles.map { ($0.cell, $0) })
        let existing = Set(clouds.map(\.tile.cell))
        clouds += tiles.filter { !existing.contains($0.cell) }.map { Cloud(tile: $0, presence: 0) }
        clouds = clouds.compactMap { cloud in
            let tile = active[cloud.tile.cell]
            let presence = if reduceMotion { tile == nil ? 0.0 : 1.0 }
                else { min(1, max(0, cloud.presence + seconds / (tile == nil ? -style.fade : style.reveal))) }
            guard tile != nil || presence > 0 else { return nil }
            return Cloud(tile: tile ?? cloud.tile, presence: presence)
        }
        guard !clouds.isEmpty else { return nil }
        let cells = clouds.map(\.tile.cell)
        let scale = max(1, scale)
        if mesh?.cells != cells || mesh?.artwork != projection.artworkRect || mesh?.scale != scale {
            let vertices = cells.flatMap { Self.vertices($0, projection: projection, style: style) }
            guard let geometry = renderer.mesh(vertices, scale: scale) else { return nil }
            let layers = cells.indices.map {
                BattlefieldAuraRenderer.Layer(material: 0, vertices: ($0 * 6)..<(($0 + 1) * 6), parameter: Float($0))
            }
            mesh = Mesh(cells: cells, artwork: projection.artworkRect, scale: scale, target: .init(mesh: geometry, layers: layers))
        }
        guard let mesh else { return nil }
        let uniforms: [SIMD4<Float>] = clouds.map { cloud in
            let cell = cloud.tile.cell
            let seed = abs((sin(Double(cell.x) * 127.1 + Double(cell.y) * 311.7) * 43758.5453)
                .truncatingRemainder(dividingBy: 31))
            let p = cloud.presence
            let density = p * p * (3 - 2 * p) * (cloud.tile.laps <= 1 ? style.lastLap : 1)
            return SIMD4(Float(time), Float(seed), Float(density), 0)
        }
        guard let image = renderer.images([mesh.target], uniforms: uniforms, texture: volume)?.first else { return nil }
        return Frame(image: image, bounds: mesh.target.mesh.bounds)
    }

    private static func vertices(_ cell: Cell, projection: BattlefieldProjection, style: Style) -> [BattlefieldAuraRenderer.Vertex] {
        let metrics = projection.terrainMetrics(cell)
        let aspect = projection.screenCellHeight / max(0.001, projection.screenCellWidth)
        let halfWidth = metrics.cellSize * style.radius
        let halfHeight = halfWidth * aspect
        let centerY = metrics.center.y - metrics.cellSize * aspect * style.lift
        let x = Float(metrics.center.x - halfWidth), y = Float(centerY - halfHeight)
        let right = Float(metrics.center.x + halfWidth), bottom = Float(centerY + halfHeight)
        let bl = BattlefieldAuraRenderer.Vertex(position: SIMD2(x, bottom), uv: SIMD2(0, 0))
        let br = BattlefieldAuraRenderer.Vertex(position: SIMD2(right, bottom), uv: SIMD2(1, 0))
        let tr = BattlefieldAuraRenderer.Vertex(position: SIMD2(right, y), uv: SIMD2(1, 1))
        let tl = BattlefieldAuraRenderer.Vertex(position: SIMD2(x, y), uv: SIMD2(0, 1))
        return [bl, br, tr, bl, tr, tl]
    }
}
