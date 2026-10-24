/** Local emissive flame, not a fluid solver. No atlas, texture uploads or fullscreen pass. */
export interface LanternFireParameters {
    speed: number;
    brightness: number;
    opacity: number;
}

export const lanternFireBufferSize = (width: number, height: number, dpr: number) => {
    const scale = Math.min(2, Math.max(1, dpr), 320 / Math.max(1, width), 512 / Math.max(1, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
`;
const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uBrightness;
uniform float uOpacity;
uniform vec2 uResolution;
// Continuous 3D value noise, sampled in rising material coordinates.
float hash(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
    vec3 i=floor(p), f=fract(p);
    vec3 u=f*f*f*(f*(f*6.-15.)+10.);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),u.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),u.x),u.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),u.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),u.x),u.y),u.z);
}
float turbulence(vec3 p) {
    return .66*noise(p)+.34*noise(p*2.07+vec3(7.1,3.7,1.8));
}
void main() {
    // The canvas has atmospheric padding; these coordinates preserve the original wick and flame size.
    vec2 uv=vec2((vUv.x-.5)*1.6+.5, vUv.y*1.6);
    float y=uv.y;
    float t=uTime;
    float root=smoothstep(0.,.065,y);
    float lift=smoothstep(.04,.72,y);
    // Large eddies move the column; small eddies wrinkle the reacting sheets inside it.
    float drift=noise(vec3(y*3.7-t*.9, .4, t*.18))-.5;
    float curl=noise(vec3(y*7.5-t*1.7, 3.1, t*.24))-.5;
    float centre=lift*(drift*.38+curl*.14);
    float height=.87+.075*sin(t*1.7)+.035*sin(t*4.13);
    float age=y/height;
    float radius=(.18+.23*sin(min(1.,age)*3.14159))*(1.-.85*age);
    radius=max(.015,radius);
    float x=(uv.x-.5)*2.-centre;
    float extinction=0.;
    vec3 emission=vec3(0.);
    // Sixteen front-to-back depth samples. No texture, grid simulation or full-screen pass.
    if (y < 1.02 && abs(x) < radius+.25) {
    for(int i=0;i<16;i++) {
        float z=(float(i)+.5)/16.*.92-.46;
        vec3 flow=vec3(x*5.8, y*5.2-t*1.75, z*6.+t*.13);
        float folds=turbulence(flow);
        float fine=noise(flow*3.1+vec3(1.2,-t*.48,4.));
        float distance=length(vec2(x,z*.85));
        // Wrinkled, asymmetric fuel envelope. The root never breaks away from the wick.
        float wrinkling=(folds-.47)*(.055+.31*lift);
        float surface=radius-distance+wrinkling;
        float coverage=smoothstep(-.035,.055,surface);
        float burnout=1.-smoothstep(.62+folds*.32,.88+folds*.24,age);
        float source=root*(1.-smoothstep(.94,1.,y));
        // Thin luminous reaction fronts with transparent pockets; avoid a solid gradient droplet.
        float sheet=exp(-abs(surface-.025)*20.);
        float thread=smoothstep(.32,.72,folds+.18*(fine-.5));
        float density=coverage*burnout*source*(.12+.88*sheet)*(.35+1.35*thread);
        float heat=clamp(.48+.52*folds+.15*fine-.37*age,0.,1.);
        vec3 colour=mix(vec3(1.,.16,.012),vec3(1.,.53,.065),smoothstep(.15,.54,heat));
        colour=mix(colour,vec3(1.,.92,.66),smoothstep(.51,.81,heat));
        float weight=density*.19;
        emission+=exp(-extinction*.3)*colour*weight*(1.2+heat*1.5);
        extinction+=weight;
    }
    }
    // Two thin fragments shed by the upper reaction front, carried upward and consumed.
    for(int i=0;i<2;i++) {
        float id=float(i);
        float phase=fract(t*.46+id*.47);
        float py=.67+phase*.59;
        float px=.07*sin(t*1.8+id*3.1)+phase*.17*sin(t*.9+id*2.7);
        float width=.052*(1.-phase)+.008;
        vec2 p=vec2(((uv.x-.5)*2.-px)/width,(y-py)/(.07+.03*phase));
        float wisp=exp(-dot(p,p)*1.8)*pow(sin(phase*3.14159),2.)*.14;
        wisp*=smoothstep(.25,.7,noise(vec3(uv.x*18.,y*14.-t*3.,id+7.)));
        emission+=vec3(1.,.39,.045)*wisp;
        extinction+=wisp*.65;
    }
    float alpha=(1.-exp(-extinction*2.8))*min(1.,uOpacity);
    // Tone-map radiance before premultiplication; dense folds stay warm rather than clipping yellow-green.
    vec3 colour=vec3(1.)-exp(-emission*uBrightness*2.1);
    colour=pow(max(colour,vec3(0.)),vec3(.72));
    float peak=max(colour.r,max(colour.g,colour.b));
    colour/=max(peak,.001);
    // A faint absorbing soot ribbon above the flame. It widens and cools as it rises.
    float smokeY=max(0.,y-.69);
    float smokeBend=.12*sin(y*7.-t*.95)+.09*sin(y*12.-t*1.43);
    float smokeX=(uv.x-.5)*2.-smokeBend;
    float smokeWidth=.055+smokeY*.12;
    float smokeFlow=turbulence(vec3(smokeX*13.,y*8.-t*.72,t*.1+11.));
    float smoke=exp(-pow(smokeX/smokeWidth,2.))*smoothstep(.24,.7,smokeFlow);
    smoke*=smoothstep(.69,.93,y)*(1.-smoothstep(1.05,1.58,y))*.25*min(1.,uOpacity);
    vec3 soot=mix(vec3(.46,.33,.20),vec3(.23,.215,.19),smoothstep(.8,1.35,y));
    vec3 result=colour*alpha+soot*smoke*(1.-alpha);
    float coverage=alpha+smoke*(1.-alpha);
    // At most two tiny glowing carbon flecks, infrequent and extinguished inside the lantern.
    for(int i=0;i<2;i++) {
        float id=float(i);
        float clock=t+id*2.39;
        float cycle=floor(clock/5.7);
        float age=mod(clock,5.7)/1.25;
        float seed=hash(vec3(cycle,id,8.7));
        float py=.42+age*.88;
        float px=(seed-.5)*.22+sin(age*4.+seed*6.)*.06*age;
        vec2 p=vec2(((uv.x-.5)*2.-px)/max(.013,2.0/uResolution.x),(y-py)/.026);
        float spark=exp(-dot(p,p)*2.)*smoothstep(0.,.12,age)*(1.-smoothstep(.45,1.,age));
        spark*=.48*min(1.,uOpacity);
        result=vec3(1.,.61,.19)*spark+result*(1.-spark);
        coverage=spark+coverage*(1.-spark);
    }
    gl_FragColor=vec4(result,coverage);
}
`;

export interface LanternFireController {
    dispose: () => void;
    update: (parameters: LanternFireParameters) => void;
}

/** Visibility / reduced-motion / context-loss aware; all handles belong to this canvas. */
export function startLanternFireEngine(
    canvas: HTMLCanvasElement,
    light: HTMLElement | null,
    parameters: LanternFireParameters,
): LanternFireController {
    const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
    });
    if (!gl) {
        canvas.dataset.renderer = "fallback";
        return { dispose: () => {}, update: () => {} };
    }
    let currentParameters = parameters;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0;
    let disposed = false;
    let inView = true;
    let lost = false;
    let time = 0;
    let previous = 0;
    let timeLocation: WebGLUniformLocation | null = null;
    let resolutionLocation: WebGLUniformLocation | null = null;
    let brightnessLocation: WebGLUniformLocation | null = null;
    let opacityLocation: WebGLUniformLocation | null = null;
    const stop = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
    };
    const release = () => {
        gl.useProgram(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        buffer = null;
        program = null;
    };
    const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Lantern shader allocation failed");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Lantern shader: ${message}`);
        }
        return shader;
    };
    const draw = () => {
        if (!program || lost || disposed) return;
        gl.useProgram(program);
        gl.uniform1f(timeLocation, time);
        gl.uniform1f(brightnessLocation, currentParameters.brightness);
        gl.uniform1f(opacityLocation, currentParameters.opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (light) light.style.opacity = String(0.86 + 0.085 * Math.sin(time * 1.7) + 0.035 * Math.sin(time * 4.13));
    };
    const tick = (now: number) => {
        frame = 0;
        if (disposed || lost || document.hidden || !inView || reduced.matches) return;
        if (previous) time += Math.min(0.05, (now - previous) / 1000) * currentParameters.speed;
        previous = now;
        draw();
        frame = requestAnimationFrame(tick);
    };
    const sync = () => {
        stop();
        if (disposed || lost || document.hidden || !inView) return;
        draw();
        if (!reduced.matches && program) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
        const size = lanternFireBufferSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
        canvas.width = size.width;
        canvas.height = size.height;
        gl.viewport(0, 0, size.width, size.height);
        if (program) {
            gl.useProgram(program);
            gl.uniform2f(resolutionLocation, size.width, size.height);
            draw();
        }
    };
    const initialize = () => {
        let vertex: WebGLShader | null = null;
        let fragment: WebGLShader | null = null;
        try {
            vertex = compile(gl.VERTEX_SHADER, VERTEX);
            fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
            program = gl.createProgram();
            if (!program) throw new Error("Lantern program allocation failed");
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.bindAttribLocation(program, 0, "aPosition");
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                throw new Error(gl.getProgramInfoLog(program) || "Lantern link failed");
            gl.useProgram(program);
            buffer = gl.createBuffer();
            if (!buffer) throw new Error("Lantern buffer allocation failed");
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, "aPosition");
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            timeLocation = gl.getUniformLocation(program, "uTime");
            resolutionLocation = gl.getUniformLocation(program, "uResolution");
            brightnessLocation = gl.getUniformLocation(program, "uBrightness");
            opacityLocation = gl.getUniformLocation(program, "uOpacity");
            gl.disable(gl.BLEND);
            canvas.dataset.renderer = "webgl";
            resize();
            sync();
        } catch (error) {
            release();
            canvas.dataset.renderer = "fallback";
            console.warn("Lantern fire uses its static fallback", error);
        } finally {
            if (vertex) gl.deleteShader(vertex);
            if (fragment) gl.deleteShader(fragment);
        }
    };
    const onLost = (event: Event) => {
        event.preventDefault();
        lost = true;
        stop();
        program = null;
        buffer = null;
        canvas.dataset.renderer = "fallback";
    };
    const onRestored = () => {
        lost = false;
        initialize();
    };
    const observer = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        sync();
    });
    observer.observe(canvas);
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    initialize();
    return {
        update: (next) => {
            currentParameters = next;
            draw();
        },
        dispose: () => {
            disposed = true;
            stop();
            observer.disconnect();
            intersection.disconnect();
            document.removeEventListener("visibilitychange", sync);
            reduced.removeEventListener("change", sync);
            canvas.removeEventListener("webglcontextlost", onLost);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            // React may restart this effect on the same canvas when tuning changes.
            // Delete owned resources, but do not force that reusable context into a lost state.
            release();
        },
    };
}
