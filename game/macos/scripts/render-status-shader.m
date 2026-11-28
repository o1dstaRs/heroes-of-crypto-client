#define GL_SILENCE_DEPRECATION
#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <OpenGL/OpenGL.h>
#import <OpenGL/gl3.h>

static GLuint compileShader(GLenum type, NSString *source) {
    GLuint shader = glCreateShader(type);
    const char *code = source.UTF8String;
    glShaderSource(shader, 1, &code, NULL);
    glCompileShader(shader);
    GLint compiled;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &compiled);
    if (compiled) return shader;
    char log[4096] = {0};
    glGetShaderInfoLog(shader, sizeof(log), NULL, log);
    fprintf(stderr, "%s\n", log);
    return 0;
}

static GLuint linkShader(NSString *source) {
    // Both Pixi's GLSL ES fragment and desktop GLSL use the same body. A fullscreen triangle supplies the unit UVs.
    NSString *vertex = @"#version 150\n"
        "out vec2 vUV; out vec4 vColor;\n"
        "void main() {\n"
        "  vec2 p = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.);\n"
        "  vUV = vec2(.5 + p.x * .5, .5 - p.y * .5); vColor = vec4(1.);\n"
        "  gl_Position = vec4(p, 0., 1.);\n"
        "}\n";
    NSString *fragment = [source stringByReplacingOccurrencesOfString:@"#version 300 es" withString:@"#version 150"];
    GLuint v = compileShader(GL_VERTEX_SHADER, vertex);
    GLuint f = compileShader(GL_FRAGMENT_SHADER, fragment);
    if (!v || !f) return 0;
    GLuint program = glCreateProgram();
    glAttachShader(program, v);
    glAttachShader(program, f);
    glLinkProgram(program);
    GLint linked;
    glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (linked) return program;
    char log[4096] = {0};
    glGetProgramInfoLog(program, sizeof(log), NULL, log);
    fprintf(stderr, "%s\n", log);
    return 0;
}

static GLuint loadArtwork(NSURL *url, CGColorSpaceRef colorSpace) {
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (!source) return 0;
    CGImageRef art = CGImageSourceCreateImageAtIndex(source, 0, NULL);
    CFRelease(source);
    if (!art) return 0;
    size_t width = CGImageGetWidth(art), height = CGImageGetHeight(art);
    CGContextRef bitmap = CGBitmapContextCreate(NULL, width, height, 8, width * 4, colorSpace,
                                                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    if (!bitmap) {
        CGImageRelease(art);
        return 0;
    }
    CGContextDrawImage(bitmap, CGRectMake(0, 0, width, height), art);
    GLuint texture;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, (GLsizei)width, (GLsizei)height, 0, GL_RGBA, GL_UNSIGNED_BYTE,
                 CGBitmapContextGetData(bitmap));
    CGContextRelease(bitmap);
    CGImageRelease(art);
    return texture;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 6) return 1;
        const int cols = atoi(argv[4]), rows = atoi(argv[5]), tile = 192;
        if (cols < 1 || rows < 1 || cols > 16 || rows > 16) return 1;
        const int width = cols * tile, height = rows * tile, pitch = width * 4;
        CGLPixelFormatAttribute attrs[] = {kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core, 0};
        CGLPixelFormatObj format;
        CGLContextObj context;
        GLint count;
        CGLError error = CGLChoosePixelFormat(attrs, &format, &count);
        if (!error) {
            error = CGLCreateContext(format, NULL, &context);
            CGLReleasePixelFormat(format);
        }
        if (!error) error = CGLSetCurrentContext(context);
        if (error) {
            fprintf(stderr, "%s\n", CGLErrorString(error));
            return 1;
        }

        NSString *source = [NSString stringWithContentsOfFile:@(argv[1]) encoding:NSUTF8StringEncoding error:nil];
        if (!source) return 1;
        GLuint program = linkShader(source);
        if (!program) return 1;
        CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        GLuint artwork = loadArtwork([NSURL fileURLWithPath:@(argv[2])], colorSpace);
        if (!artwork) return 1;
        GLuint framebuffer, atlas, triangle;
        glGenFramebuffers(1, &framebuffer);
        glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
        glGenTextures(1, &atlas);
        glBindTexture(GL_TEXTURE_2D, atlas);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, atlas, 0);
        if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) return 1;
        glGenVertexArrays(1, &triangle);
        glBindVertexArray(triangle);
        glUseProgram(program);
        glBindTexture(GL_TEXTURE_2D, artwork);
        glUniform1i(glGetUniformLocation(program, "uEyes"), 0);
        GLint age = glGetUniformLocation(program, "uAge");
        for (int frame = 0; frame < cols * rows; frame++) {
            glViewport((frame % cols) * tile, height - (frame / cols + 1) * tile, tile, tile);
            glUniform1f(age, (float)frame / (float)(cols * rows));
            glDrawArrays(GL_TRIANGLES, 0, 3);
        }
        NSMutableData *bits = [NSMutableData dataWithLength:(NSUInteger)pitch * height];
        uint8_t *pixels = bits.mutableBytes;
        glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
        if (glGetError() != GL_NO_ERROR) return 1;
        for (int y = 0; y < height / 2; y++) {
            uint8_t *top = pixels + y * pitch, *bottom = pixels + (height - 1 - y) * pitch;
            for (int x = 0; x < pitch; x++) {
                uint8_t swap = top[x];
                top[x] = bottom[x];
                bottom[x] = swap;
            }
        }
        CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)bits);
        CGImageRef cels = CGImageCreate(width, height, 8, 32, pitch, colorSpace,
                                       kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big,
                                       provider, NULL, true, kCGRenderingIntentDefault);
        CGImageDestinationRef out = CGImageDestinationCreateWithURL(
            (__bridge CFURLRef)[NSURL fileURLWithPath:@(argv[3])], CFSTR("public.png"), 1, NULL);
        if (!out || !cels) return 1;
        CGImageDestinationAddImage(out, cels, NULL);
        bool success = CGImageDestinationFinalize(out);
        CFRelease(out);
        CGImageRelease(cels);
        CGDataProviderRelease(provider);
        CGColorSpaceRelease(colorSpace);
        CGLReleaseContext(context);
        return success ? 0 : 1;
    }
}
