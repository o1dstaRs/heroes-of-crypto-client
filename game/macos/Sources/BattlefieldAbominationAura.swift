import CoreGraphics
import Foundation

/// The floor and foot veil share the web aura's clock, cropped grid and movement samples.
@MainActor
final class BattlefieldAbominationAura {
    struct Layer {
        let image: CGImage
        let bounds: CGRect
    }

    struct Frame {
        let floor: Layer
        let veil: Layer
    }

    private struct Owner: Hashable {
        let id: Int
        let range: Double
    }

    private struct Animation {
        let started: TimeInterval
        var seen: TimeInterval
        var motion: Motion
    }

    private static let revealDuration = 0.45
    private static let renderer = Renderer()
    private var animations: [Owner: Animation] = [:]
    private var reset: Date?

    func beginFrame(at time: TimeInterval, reset: Date?) {
        if let reset, self.reset != reset {
            animations.removeAll()
            self.reset = reset
        }
        animations = animations.filter { time >= $0.value.seen && time - $0.value.seen <= 5 }
    }

    func frame(owner: Int, range: Double, area: CGRect, board: CGRect, projection: BattlefieldProjection,
               time: TimeInterval, opacity: Double, scale: CGFloat, reduceMotion: Bool) -> Frame? {
        let visible = area.intersection(board)
        guard range > 0, opacity > 0, !visible.isEmpty, let renderer = Self.renderer else { return nil }
        let center = CGPoint(x: area.midX, y: area.midY)
        let key = Owner(id: owner, range: range)
        var animation = animations[key] ?? Animation(started: time, seen: time, motion: Motion(position: center, time: time))
        if !reduceMotion {
            animation.motion.advance(to: center, time: time)
            animation.seen = time
            animations[key] = animation
        }
        let age = reduceMotion ? Self.revealDuration : max(0, time - animation.started)
        let alpha = min(1, max(0.9, opacity)) * min(1, age / Self.revealDuration)
        let motion = reduceMotion ? Motion(position: center, time: time) : animation.motion
        let layout = Layout(area: area, visible: visible, artwork: projection.artworkRect, scale: max(1, scale))
        let clock = SIMD4(Float(age), Float(alpha), 0, 0)
        return renderer.frame(layout, projection: projection, uniforms: [clock] + motion.uniforms(for: area, at: time))
    }

    struct Motion {
        struct Puff {
            let position: CGPoint
            let born: TimeInterval
        }

        var position: CGPoint
        var time: TimeInterval
        private(set) var velocity = CGVector.zero
        private(set) var distance: CGFloat = 0
        private(set) var wakes: [Puff] = []
        private(set) var step: Puff?
        private var wakeDistance: CGFloat = 0

        init(position: CGPoint, time: TimeInterval) {
            self.position = position
            self.time = time
        }

        // Match AbominationSandMotion.ts in logical cells and seconds.
        mutating func advance(to next: CGPoint, time now: TimeInterval) {
            let dt = now - time
            guard dt > 0 else { return }
            let dx = next.x - position.x
            let dy = next.y - position.y
            let travel = hypot(dx, dy)
            if dt > 0.35 || travel > 1.5 || travel / dt > 12 {
                self = Self(position: next, time: now)
                return
            }
            let response = 1 - exp(-dt / 0.12)
            velocity.dx += (dx / dt - velocity.dx) * response
            velocity.dy += (dy / dt - velocity.dy) * response
            wakes.removeAll { now - $0.born >= 1.35 }
            if travel > 0.00001 {
                let start = position
                let started = time
                func sample(_ fraction: CGFloat) -> Puff {
                    Puff(position: CGPoint(x: start.x + dx * fraction, y: start.y + dy * fraction),
                         born: started + dt * fraction)
                }
                let spacing: CGFloat = 0.18
                var along = spacing - wakeDistance
                while along <= travel {
                    wakes.append(sample(along / travel))
                    along += spacing
                }
                wakes = Array(wakes.suffix(6))
                wakeDistance = (wakeDistance + travel).truncatingRemainder(dividingBy: spacing)
                let stepDistance: CGFloat = 1.3 / 2
                let previousStep = Int(floor(distance / stepDistance))
                distance += travel
                let stepNumber = Int(floor(distance / stepDistance))
                if stepNumber > previousStep {
                    let fraction = 1 - (distance - CGFloat(stepNumber) * stepDistance) / travel
                    let puff = sample(fraction)
                    let offset = (stepNumber.isMultiple(of: 2) ? -0.14 : 0.14) / travel
                    step = Puff(position: CGPoint(x: puff.position.x - dy * offset,
                                                  y: puff.position.y + dx * offset), born: puff.born)
                }
            }
            position = next
            time = now
        }

        func uniforms(for area: CGRect, at now: TimeInterval) -> [SIMD4<Float>] {
            func vector(_ puff: Puff?) -> SIMD4<Float> {
                guard let puff else { return SIMD4(0, 0, 10, 0) }
                return SIMD4(Float(2 * (puff.position.x - area.midX) / area.width),
                             Float(2 * (area.midY - puff.position.y) / area.height),
                             Float(max(0, now - puff.born)), 1)
            }
            let flow = SIMD4(Float(velocity.dx), Float(-velocity.dy),
                             Float(min(1, hypot(velocity.dx, velocity.dy) / 3)), Float(distance))
            return [flow, vector(step)] + (0..<6).map { vector($0 < wakes.count ? wakes[$0] : nil) }
        }
    }

    private struct Layout: Equatable {
        let area: CGRect
        let visible: CGRect
        let artwork: CGRect
        let scale: CGFloat
    }

    private struct Mesh {
        let layout: Layout
        let floor: BattlefieldAuraRenderer.Target
        let veil: BattlefieldAuraRenderer.Target
    }

    @MainActor
    private final class Renderer {
        private let renderer: BattlefieldAuraRenderer
        private var meshes: [Mesh] = []

        init?() {
            guard let renderer = BattlefieldAuraRenderer(["sandBase", "sandCoil", "sandAir", "sandVeil"],
                                                         resource: "abomination-sand", vertexName: "sandVertex")
            else { return nil }
            self.renderer = renderer
        }

        func frame(_ layout: Layout, projection: BattlefieldProjection, uniforms: [SIMD4<Float>]) -> Frame? {
            guard let mesh = mesh(for: layout, projection: projection),
                  let images = renderer.images([mesh.floor, mesh.veil], uniforms: uniforms)
            else { return nil }
            return Frame(floor: Layer(image: images[0], bounds: mesh.floor.mesh.bounds),
                         veil: Layer(image: images[1], bounds: mesh.veil.mesh.bounds))
        }

        private func mesh(for layout: Layout, projection: BattlefieldProjection) -> Mesh? {
            if let index = meshes.firstIndex(where: { $0.layout == layout }) {
                let mesh = meshes.remove(at: index)
                meshes.append(mesh)
                return mesh
            }
            let vertices = BattlefieldAuraRenderer.fieldVertices(area: layout.area, visible: layout.visible,
                                                                 projection: projection)
            // The web lifts the entire foot mesh by 0.12 cells after the floor projection.
            let lift = SIMD2<Float>(0, Float(projection.screenCellHeight * 0.12))
            let raised = vertices.map { BattlefieldAuraRenderer.Vertex(position: $0.position - lift, uv: $0.uv) }
            guard let floor = renderer.mesh(vertices, scale: layout.scale),
                  let veil = renderer.mesh(raised, scale: layout.scale) else { return nil }
            let field = 0..<floor.count
            let layers: [BattlefieldAuraRenderer.Layer] = [
                .init(material: 0, vertices: field),
                .init(material: 1, vertices: field),
                .init(material: 1, vertices: field, parameter: .pi),
                .init(material: 2, vertices: field),
            ]
            let mesh = Mesh(layout: layout, floor: .init(mesh: floor, layers: layers),
                            veil: .init(mesh: veil, layers: [.init(material: 3, vertices: 0..<veil.count)]))
            if meshes.count >= 8 { meshes.removeFirst() }
            meshes.append(mesh)
            return mesh
        }
    }
}
