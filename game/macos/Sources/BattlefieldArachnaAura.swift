import CoreGraphics
import Foundation
import JavaScriptCore
import OpenGL
import OpenGL.GL3

@MainActor
enum BattlefieldArachnaAura {
    private static let renderer = Renderer()

    static func image(area: CGRect, board: CGRect, projection: BattlefieldProjection, age: TimeInterval,
                      opacity: Double, scale: CGFloat) -> (image: CGImage, bounds: CGRect)? {
        let visible = area.intersection(board)
        guard !visible.isEmpty, opacity > 0 else { return nil }
        return renderer?.image(area: area, visible: visible, projection: projection, age: max(0, age),
                               opacity: opacity, scale: max(1, scale))
    }

    private struct Sources: Decodable {
        struct Program: Decodable { let vertex, fragment: String }
        let silk, spiders, dew: Program
        let contactSize: GLsizei
        let pulseFinish: [GLfloat]
    }

    @MainActor
    private final class Renderer {
        let scene: JSContext
        let frame: JSValue
        let loads: JSValue
        let contactSimulation: ArachnaContactSimulation
        let context: CGLContextObj
        let sources: Sources
        let grid: [CGFloat]
        let silk, spider, dew: Program
        let spiderMesh, dewMesh: Mesh
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        var silkMeshes: [(area: CGRect, mesh: Mesh)] = []
        var target: GLuint = 0
        var contact: GLuint = 0
        var framebuffer: GLuint = 0
        var targetSize = CGSize.zero

        init?() {
            guard let resources = Bundle.main.resourceURL, let scene = JSContext(),
                  let script = try? String(contentsOf: resources.appendingPathComponent("arachna-aura-frames.js"), encoding: .utf8),
                  let data = try? Data(contentsOf: resources.appendingPathComponent("arachna-aura.json")),
                  let sources = try? JSONDecoder().decode(Sources.self, from: data),
                  let contactSimulation = ArachnaContactSimulation(url: resources.appendingPathComponent("arachna-aura-tension.bin"),
                                                                   size: Int(sources.contactSize)) else { return nil }
            scene.evaluateScript(script)
            guard scene.exception == nil, let frame = scene.objectForKeyedSubscript("hocArachnaFrame"), !frame.isUndefined,
                  let loads = scene.objectForKeyedSubscript("hocArachnaLoads"), !loads.isUndefined,
                  let grid = scene.objectForKeyedSubscript("hocArachnaGrid")?.toArray() as? [NSNumber], grid.count == 3,
                  let context = Self.makeContext() else { return nil }
            let previous = CGLGetCurrentContext()
            CGLSetCurrentContext(context)
            defer { CGLSetCurrentContext(previous) }
            let plane: [(String, GLint)] = [("aPosition", 2), ("aUV", 2), ("aGround", 2)]
            let threads: [(String, GLint)] = [("aPosition", 2), ("aUV", 2), ("aWarp", 4), ("aSilk", 4), ("aKnot", 1),
                                              ("aFiber", 2), ("aWeave", 2), ("aFray", 1), ("aMainCable", 1), ("aBranchTravel", 1)]
            guard let silk = Program(sources.silk, attributes: threads),
                  let spider = Program(sources.spiders, attributes: plane + [("aSpider", 1)]),
                  let dew = Program(sources.dew, attributes: plane) else {
                CGLReleaseContext(context)
                return nil
            }
            self.context = context
            self.scene = scene
            self.frame = frame
            self.loads = loads
            self.contactSimulation = contactSimulation
            self.sources = sources
            self.grid = grid.map { CGFloat($0.doubleValue) }
            self.silk = silk
            self.spider = spider
            self.dew = dew
            self.spiderMesh = Mesh(spider)
            self.dewMesh = Mesh(dew)
            glGenFramebuffers(1, &framebuffer)
            glGenTextures(1, &target)
            glGenTextures(1, &contact)
            glBindTexture(GLenum(GL_TEXTURE_2D), contact)
            glTexParameteri(GLenum(GL_TEXTURE_2D), GLenum(GL_TEXTURE_MIN_FILTER), GL_LINEAR)
            glTexParameteri(GLenum(GL_TEXTURE_2D), GLenum(GL_TEXTURE_MAG_FILTER), GL_LINEAR)
            glTexParameteri(GLenum(GL_TEXTURE_2D), GLenum(GL_TEXTURE_WRAP_S), GL_CLAMP_TO_EDGE)
            glTexParameteri(GLenum(GL_TEXTURE_2D), GLenum(GL_TEXTURE_WRAP_T), GL_CLAMP_TO_EDGE)
            glTexImage2D(GLenum(GL_TEXTURE_2D), 0, GL_RGBA8, sources.contactSize, sources.contactSize, 0,
                         GLenum(GL_RGBA), GLenum(GL_UNSIGNED_BYTE), nil)
            glEnable(GLenum(GL_BLEND))
            glBlendFunc(GLenum(GL_ONE), GLenum(GL_ONE_MINUS_SRC_ALPHA))
        }

        func image(area: CGRect, visible: CGRect, projection: BattlefieldProjection, age: TimeInterval,
                   opacity: Double, scale: CGFloat) -> (CGImage, CGRect)? {
            let previous = CGLGetCurrentContext()
            CGLSetCurrentContext(context)
            defer { CGLSetCurrentContext(previous) }

            guard let contact = loads.call(withArguments: [age * 1000]), scene.exception == nil else { return nil }
            var samples: [Double] = []
            guard Self.withBytes(contact.forProperty("loads"), in: scene, { bytes, length in
                samples = Array(UnsafeBufferPointer(start: bytes.assumingMemoryBound(to: Double.self),
                                                    count: length / MemoryLayout<Double>.stride))
            }), samples.count.isMultiple(of: 5),
                Self.withBytes(contact.forProperty("pixels"), in: scene, { bytes, length in
                    let pixels = UnsafeMutableBufferPointer(start: UnsafeMutableRawPointer(mutating: bytes)
                        .assumingMemoryBound(to: UInt8.self), count: length)
                    contactSimulation.update(samples, pixels: pixels)
                }) else { return nil }

            let index = silkMeshes.firstIndex { $0.area == area }
            guard let geometry = frame.call(withArguments: [area.midX, area.midY, area.width, area.height,
                                                             age * 1000, index == nil]), scene.exception == nil else { return nil }
            let web: Mesh
            if let index {
                let cached = silkMeshes.remove(at: index)
                silkMeshes.append(cached)
                web = cached.mesh
            } else {
                let mesh = Mesh(silk)
                guard mesh.upload(geometry.forProperty("silk"), in: scene, usage: GLenum(GL_STATIC_DRAW)) else {
                    mesh.destroy()
                    return nil
                }
                if silkMeshes.count >= 8 { silkMeshes.removeFirst().mesh.destroy() }
                silkMeshes.append((area, mesh))
                web = mesh
            }
            guard spiderMesh.upload(geometry.forProperty("spiders"), in: scene, usage: GLenum(GL_DYNAMIC_DRAW)),
                  dewMesh.upload(geometry.forProperty("dew"), in: scene, usage: GLenum(GL_DYNAMIC_DRAW)) else { return nil }

            // Deformed strands and cast shadows can extend a little beyond their tile before the shader clips them.
            let bounds = projection.outline(of: visible).boundingBox.insetBy(dx: -projection.screenCellWidth * 0.35,
                                                                           dy: -projection.screenCellHeight * 0.35).integral
            let size = CGSize(width: ceil(bounds.width * scale), height: ceil(bounds.height * scale))
            guard prepare(size: size) else { return nil }
            glActiveTexture(GLenum(GL_TEXTURE0))
            glBindTexture(GLenum(GL_TEXTURE_2D), self.contact)
            guard Self.withBytes(geometry.forProperty("contact"), in: scene, { bytes, _ in
                glTexSubImage2D(GLenum(GL_TEXTURE_2D), 0, 0, 0, sources.contactSize, sources.contactSize,
                                GLenum(GL_RGBA), GLenum(GL_UNSIGNED_BYTE), bytes)
            }) else { return nil }

            let cell = grid[2]
            let sx = projection.screenCellWidth / cell
            let sy = projection.screenCellHeight / cell
            let bottom = projection.point(x: 0, y: 0).y
            let world: [GLfloat] = [Float(sx), 0, 0, 0, Float(-sy), 0, Float(-grid[0] * sx), Float(bottom + grid[1] * sy), 1]
            // The framebuffer's first row is the top row of the resulting CGImage.
            let screen: [GLfloat] = [Float(2 / bounds.width), 0, 0, 0, Float(2 / bounds.height), 0,
                                     Float(-1 - bounds.minX * 2 / bounds.width), Float(-1 - bounds.minY * 2 / bounds.height), 1]
            let clip = [visible.minX * cell + grid[0], visible.minY * cell + grid[1],
                        visible.maxX * cell + grid[0], visible.maxY * cell + grid[1]].map { Float($0) }
            let placement = [area.midX * cell + grid[0], area.midY * cell + grid[1], area.width * cell, -area.height * cell]
                .map { Float($0) }
            let alpha = Float(min(1, opacity * 1.12))
            let lights = projection.auraFireLights
            func bind(_ program: Program) {
                glUseProgram(program.id)
                glUniformMatrix3fv(program.uniform("uProjectionMatrix"), 1, GLboolean(GL_FALSE), screen)
                glUniformMatrix3fv(program.uniform("uWorldTransformMatrix"), 1, GLboolean(GL_FALSE), world)
                glUniformMatrix3fv(program.uniform("uTransformMatrix"), 1, GLboolean(GL_FALSE), [1, 0, 0, 0, 1, 0, 0, 0, 1])
                glUniform4f(program.uniform("uWorldColorAlpha"), alpha, alpha, alpha, alpha)
                glUniform4f(program.uniform("uColor"), 1, 1, 1, 1)
                glUniform1f(program.uniform("uTime"), Float(age))
                glUniform1f(program.uniform("uReveal"), Float(min(1, age / 0.8)))
                glUniform4fv(program.uniform("uBounds"), 1, clip)
                glUniform4fv(program.uniform("uPlacement"), 1, placement)
                glUniform4fv(program.uniform("uTorches"), 5, lights)
            }
            bind(silk)
            glUniform1i(silk.uniform("uContactField"), 0)
            glUniform3fv(silk.uniform("uPulseFinish"), 1, sources.pulseFinish)
            glUniform1f(silk.uniform("uShadow"), 1)
            web.draw()
            glUniform1f(silk.uniform("uShadow"), 0)
            web.draw()
            bind(spider)
            for (name, buffer) in [("uJoints", "joints"), ("uBody", "body"), ("uAbdomen", "abdomen")] {
                guard Self.withBytes(geometry.forProperty(buffer), in: scene, { bytes, size in
                    glUniform4fv(spider.uniform(name), GLsizei(size / (4 * MemoryLayout<GLfloat>.stride)),
                                 bytes.assumingMemoryBound(to: GLfloat.self))
                }) else { return nil }
            }
            spiderMesh.draw()
            bind(dew)
            dewMesh.draw()
            return read(size: size).map { ($0, bounds) }
        }

        private func prepare(size: CGSize) -> Bool {
            let width = GLsizei(size.width), height = GLsizei(size.height)
            guard width > 0, height > 0 else { return false }
            glBindFramebuffer(GLenum(GL_FRAMEBUFFER), framebuffer)
            if targetSize != size {
                glBindTexture(GLenum(GL_TEXTURE_2D), target)
                glTexImage2D(GLenum(GL_TEXTURE_2D), 0, GL_RGBA8, width, height, 0, GLenum(GL_RGBA), GLenum(GL_UNSIGNED_BYTE), nil)
                glFramebufferTexture2D(GLenum(GL_FRAMEBUFFER), GLenum(GL_COLOR_ATTACHMENT0), GLenum(GL_TEXTURE_2D), target, 0)
                guard glCheckFramebufferStatus(GLenum(GL_FRAMEBUFFER)) == GL_FRAMEBUFFER_COMPLETE else { return false }
                targetSize = size
            }
            glViewport(0, 0, width, height)
            glClearColor(0, 0, 0, 0)
            glClear(GLbitfield(GL_COLOR_BUFFER_BIT))
            return true
        }

        private func read(size: CGSize) -> CGImage? {
            let width = Int(size.width), height = Int(size.height)
            let stride = width * 4
            var pixels = Data(count: stride * height)
            pixels.withUnsafeMutableBytes { (bytes: UnsafeMutableRawBufferPointer) in
                glReadPixels(0, 0, GLsizei(width), GLsizei(height), GLenum(GL_RGBA), GLenum(GL_UNSIGNED_BYTE), bytes.baseAddress)
            }
            guard let provider = CGDataProvider(data: pixels as CFData) else { return nil }
            return CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                           bytesPerRow: stride, space: colorSpace,
                           bitmapInfo: [.byteOrder32Big, CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)],
                           provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        }

        private static func makeContext() -> CGLContextObj? {
            let attributes = [kCGLPFAOpenGLProfile, CGLPixelFormatAttribute(rawValue: kCGLOGLPVersion_3_2_Core.rawValue),
                              kCGLPFAAccelerated, CGLPixelFormatAttribute(rawValue: 0)]
            var format: CGLPixelFormatObj?
            var count: GLint = 0
            guard CGLChoosePixelFormat(attributes, &format, &count) == kCGLNoError, let format else { return nil }
            defer { CGLReleasePixelFormat(format) }
            var context: CGLContextObj?
            guard CGLCreateContext(format, nil, &context) == kCGLNoError else { return nil }
            return context
        }

        static func withBytes(_ value: JSValue?, in scene: JSContext, _ copy: (UnsafeRawPointer, Int) -> Void) -> Bool {
            guard let value, let js = scene.jsGlobalContextRef, let ref = value.jsValueRef,
                  let object = JSValueToObject(js, ref, nil) else { return false }
            let count = JSObjectGetTypedArrayByteLength(js, object, nil)
            guard count > 0, let bytes = JSObjectGetTypedArrayBytesPtr(js, object, nil) else { return false }
            copy(UnsafeRawPointer(bytes), count)
            return true
        }
    }

    @MainActor
    private final class Program {
        let id: GLuint
        let attributes: [(name: String, components: GLint, location: GLuint)]
        var uniforms: [String: GLint] = [:]

        init?(_ source: Sources.Program, attributes: [(String, GLint)]) {
            let program = glCreateProgram()
            for (text, kind) in [(source.vertex, GL_VERTEX_SHADER), (source.fragment, GL_FRAGMENT_SHADER)] {
                let shader = glCreateShader(GLenum(kind))
                text.withCString { text in
                    var pointer: UnsafePointer<GLchar>? = text
                    glShaderSource(shader, 1, &pointer, nil)
                }
                glCompileShader(shader)
                glAttachShader(program, shader)
                glDeleteShader(shader)
            }
            glLinkProgram(program)
            var linked: GLint = 0
            glGetProgramiv(program, GLenum(GL_LINK_STATUS), &linked)
            guard linked != 0 else { glDeleteProgram(program); return nil }
            id = program
            self.attributes = attributes.compactMap { name, components in
                let location = glGetAttribLocation(program, name)
                return location >= 0 ? (name, components, GLuint(location)) : nil
            }
        }

        func uniform(_ name: String) -> GLint {
            if let value = uniforms[name] { return value }
            let value = glGetUniformLocation(id, name)
            uniforms[name] = value
            return value
        }
    }

    @MainActor
    private final class Mesh {
        let program: Program
        var vao: GLuint = 0
        var buffers: [GLuint]
        var indexCount: GLsizei = 0
        var indexType = GLenum(GL_UNSIGNED_INT)

        init(_ program: Program) {
            self.program = program
            self.buffers = Array(repeating: 0, count: program.attributes.count + 1)
            glGenVertexArrays(1, &vao)
            glGenBuffers(GLsizei(buffers.count), &buffers)
        }

        func upload(_ geometry: JSValue?, in scene: JSContext, usage: GLenum) -> Bool {
            glBindVertexArray(vao)
            for (index, attribute) in program.attributes.enumerated() {
                glBindBuffer(GLenum(GL_ARRAY_BUFFER), buffers[index])
                guard Renderer.withBytes(geometry?.forProperty(attribute.name), in: scene, { data, size in
                    glBufferData(GLenum(GL_ARRAY_BUFFER), size, data, usage)
                }) else { return false }
                glEnableVertexAttribArray(attribute.location)
                glVertexAttribPointer(attribute.location, attribute.components, GLenum(GL_FLOAT), GLboolean(GL_FALSE), 0, nil)
            }
            let indices = geometry?.forProperty("indices")
            indexCount = indices?.forProperty("length")?.toInt32() ?? 0
            guard indexCount > 0 else { return false }
            glBindBuffer(GLenum(GL_ELEMENT_ARRAY_BUFFER), buffers[program.attributes.count])
            return Renderer.withBytes(indices, in: scene, { data, size in
                indexType = size == Int(indexCount) * 2 ? GLenum(GL_UNSIGNED_SHORT) : GLenum(GL_UNSIGNED_INT)
                glBufferData(GLenum(GL_ELEMENT_ARRAY_BUFFER), size, data, usage)
            })
        }

        func draw() {
            glBindVertexArray(vao)
            glDrawElements(GLenum(GL_TRIANGLES), indexCount, indexType, nil)
        }

        func destroy() {
            glDeleteVertexArrays(1, &vao)
            glDeleteBuffers(GLsizei(buffers.count), &buffers)
        }
    }
}
