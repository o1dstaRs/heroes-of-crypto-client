import CoreGraphics
import Foundation
import Metal

/// Draw premultiplied aura meshes at the canvas's pixel density so their soft edges and dust stay sharp.
@MainActor
final class BattlefieldAuraRenderer {
    struct Vertex {
        let position: SIMD2<Float>
        let uv: SIMD2<Float>
    }

    struct Mesh {
        let bounds: CGRect
        let count: Int
        fileprivate let vertices: MTLBuffer
        fileprivate let output: MTLTexture
    }

    struct Layer {
        let material: Int
        let vertices: Range<Int>
        var parameter: Float = 0
    }

    struct Target {
        let mesh: Mesh
        let layers: [Layer]
    }

    private static let gpu: (device: MTLDevice, queue: MTLCommandQueue)? = {
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else { return nil }
        return (device, queue)
    }()

    private static let windLibrary = gpu.flatMap { loadLibrary("wind-aura", on: $0.device) }

    private static func loadLibrary(_ resource: String, on device: MTLDevice) -> MTLLibrary? {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "metal"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        do {
            return try device.makeLibrary(source: source, options: nil)
        } catch {
            NSLog("Could not compile %@: %@", resource, error.localizedDescription)
            return nil
        }
    }

    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let materials: [MTLRenderPipelineState]
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

    init?(_ fragments: [String], resource: String = "wind-aura", vertexName: String = "windVertex") {
        guard let (device, queue) = Self.gpu,
              let library = resource == "wind-aura" ? Self.windLibrary : Self.loadLibrary(resource, on: device),
              let vertex = library.makeFunction(name: vertexName) else { return nil }
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = vertex
        let color = descriptor.colorAttachments[0]!
        color.pixelFormat = .rgba8Unorm
        color.isBlendingEnabled = true
        color.sourceRGBBlendFactor = .one
        color.destinationRGBBlendFactor = .oneMinusSourceAlpha
        color.sourceAlphaBlendFactor = .one
        color.destinationAlphaBlendFactor = .oneMinusSourceAlpha
        var materials: [MTLRenderPipelineState] = []
        for fragment in fragments {
            descriptor.fragmentFunction = library.makeFunction(name: fragment)
            guard let material = try? device.makeRenderPipelineState(descriptor: descriptor) else { return nil }
            materials.append(material)
        }
        self.device = device
        self.queue = queue
        self.materials = materials
    }

    static func fieldVertices(area: CGRect, visible: CGRect, projection: BattlefieldProjection) -> [Vertex] {
        // The web's 16 × 16 mesh keeps its full-field UVs even at a clipped board edge.
        let steps = 16
        let rowWidth = steps + 1
        let plane = (0...steps).flatMap { row in
            (0...steps).map { column in
                let x = visible.minX + visible.width * CGFloat(column) / CGFloat(steps)
                let y = visible.maxY - visible.height * CGFloat(row) / CGFloat(steps)
                let point = projection.point(x: x, y: y)
                return Vertex(position: SIMD2(Float(point.x), Float(point.y)),
                              uv: SIMD2(Float((x - area.minX) / area.width), Float((area.maxY - y) / area.height)))
            }
        }
        var vertices: [Vertex] = []
        vertices.reserveCapacity(steps * steps * 6)
        for row in 0..<steps {
            for column in 0..<steps {
                let a = row * rowWidth + column
                let b = a + rowWidth
                vertices += [plane[a], plane[b], plane[a + 1], plane[a + 1], plane[b], plane[b + 1]]
            }
        }
        return vertices
    }

    func mesh(_ vertices: [Vertex], scale: CGFloat) -> Mesh? {
        let bounds = vertices.reduce(CGRect.null) { bounds, vertex in
            bounds.union(CGRect(x: CGFloat(vertex.position.x), y: CGFloat(vertex.position.y), width: 0, height: 0))
        }.integral
        guard !bounds.isNull, !bounds.isEmpty else { return nil }
        let origin = SIMD2(Float(bounds.minX), Float(bounds.minY))
        let size = SIMD2(Float(bounds.width), Float(bounds.height))
        let normalized = vertices.map { vertex in
            let p = (vertex.position - origin) / size
            return Vertex(position: SIMD2(p.x * 2 - 1, 1 - p.y * 2), uv: vertex.uv)
        }
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm,
                                                                   width: Int(ceil(bounds.width * scale)),
                                                                   height: Int(ceil(bounds.height * scale)),
                                                                   mipmapped: false)
        descriptor.usage = .renderTarget
        descriptor.storageMode = device.hasUnifiedMemory ? .shared : .managed
        guard let buffer = device.makeBuffer(bytes: normalized, length: normalized.count * MemoryLayout<Vertex>.stride),
              let output = device.makeTexture(descriptor: descriptor) else { return nil }
        return Mesh(bounds: bounds, count: normalized.count, vertices: buffer, output: output)
    }

    func image(_ mesh: Mesh, layers: [Range<Int>], uniforms: SIMD4<Float>, direction: Float = 0) -> CGImage? {
        let passes = layers.prefix(materials.count).enumerated().map {
            Layer(material: $0.offset, vertices: $0.element, parameter: direction)
        }
        return images([Target(mesh: mesh, layers: passes)], uniforms: [uniforms])?.first
    }

    func volumeTexture(bytes: Data, size: Int) -> MTLTexture? {
        guard size > 0, bytes.count == size * size * size else { return nil }
        let descriptor = MTLTextureDescriptor()
        descriptor.textureType = .type3D
        descriptor.pixelFormat = .r8Unorm
        descriptor.width = size
        descriptor.height = size
        descriptor.depth = size
        descriptor.usage = .shaderRead
        descriptor.storageMode = device.hasUnifiedMemory ? .shared : .managed
        guard let texture = device.makeTexture(descriptor: descriptor) else { return nil }
        bytes.withUnsafeBytes {
            texture.replace(region: MTLRegionMake3D(0, 0, 0, size, size, size), mipmapLevel: 0, slice: 0,
                            withBytes: $0.baseAddress!, bytesPerRow: size, bytesPerImage: size * size)
        }
        return texture
    }

    func images(_ targets: [Target], uniforms: [SIMD4<Float>], texture: MTLTexture? = nil) -> [CGImage]? {
        guard let command = queue.makeCommandBuffer() else { return nil }
        for target in targets {
            guard encode(target, in: command, uniforms: uniforms, texture: texture) else { return nil }
        }
        if !device.hasUnifiedMemory {
            guard let sync = command.makeBlitCommandEncoder() else { return nil }
            for target in targets { sync.synchronize(resource: target.mesh.output) }
            sync.endEncoding()
        }
        command.commit()
        command.waitUntilCompleted()
        guard command.status == .completed else { return nil }
        var frames: [CGImage] = []
        for target in targets {
            guard let frame = read(target.mesh) else { return nil }
            frames.append(frame)
        }
        return frames
    }

    private func encode(_ target: Target, in command: MTLCommandBuffer, uniforms: [SIMD4<Float>],
                        texture: MTLTexture?) -> Bool {
        let pass = MTLRenderPassDescriptor()
        let color = pass.colorAttachments[0]!
        color.texture = target.mesh.output
        color.loadAction = .clear
        color.storeAction = .store
        color.clearColor = MTLClearColorMake(0, 0, 0, 0)
        guard let draw = command.makeRenderCommandEncoder(descriptor: pass) else { return false }
        draw.setVertexBuffer(target.mesh.vertices, offset: 0, index: 0)
        if let texture { draw.setFragmentTexture(texture, index: 0) }
        uniforms.withUnsafeBytes { draw.setFragmentBytes($0.baseAddress!, length: $0.count, index: 0) }
        for layer in target.layers {
            var parameter = layer.parameter
            draw.setFragmentBytes(&parameter, length: MemoryLayout<Float>.stride, index: 1)
            draw.setRenderPipelineState(materials[layer.material])
            draw.drawPrimitives(type: .triangle, vertexStart: layer.vertices.lowerBound, vertexCount: layer.vertices.count)
        }
        draw.endEncoding()
        return true
    }

    private func read(_ mesh: Mesh) -> CGImage? {
        let width = mesh.output.width
        let height = mesh.output.height
        let rowBytes = width * 4
        var pixels = Data(count: rowBytes * height)
        pixels.withUnsafeMutableBytes { (bytes: UnsafeMutableRawBufferPointer) in
            mesh.output.getBytes(bytes.baseAddress!, bytesPerRow: rowBytes,
                                 from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
        }
        let alpha = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let provider = CGDataProvider(data: pixels as CFData) else { return nil }
        return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                       bytesPerRow: rowBytes, space: colorSpace, bitmapInfo: [.byteOrder32Big, alpha],
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
