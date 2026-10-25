import { GlProgram, Shader, type TextureSource } from "pixi.js";
import { ARACHNA_WEB_MOTION_GLSL } from "./ArachnaWebMotion";

// One persistent preset is used by both the lab and the normal battlefield.
export const ARACHNA_WEB_PULSE_FINISH = Object.freeze({ opacity: 0.93, nodeGlint: 0.24, afterglow: 0.18 });

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
in vec4 aWarp;
in vec4 aSilk;
in float aKnot;
in vec2 aFiber;
in vec2 aWeave;
in float aFray;
in float aMainCable;
in float aBranchTravel;
out float vMainCable;
out float vBranchTravel;
out vec2 vUV;
out vec4 vSilk;
out float vKnot;
out vec2 vFiber;
out vec4 vColor;
out vec2 vGround;
out vec2 vElevation;
out float vPressure;
out float vUnder;
out vec2 vCanvas;
out vec2 vScreenTangent;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
uniform float uTime;
uniform float uShadow;
uniform vec4 uPlacement;
uniform sampler2D uContactField;
${ARACHNA_WEB_MOTION_GLSL}
vec3 loadedMotion(vec2 uv) {
    vec3 motion = webMotion(uv, uTime);
    vec2 encoded = texture(uContactField, uv).rg * 255.;
    float loadHeight = (encoded.x*256. + encoded.y - 32768.)/2048.;
    float height = max(0., motion.z + loadHeight);
    motion.y -= (height-motion.z)*.7;
    motion.z = height;
    return motion;
}
void main() {
    vec3 motion = loadedMotion(aUV);
    motion.z = max(0.,motion.z+aWeave.x);
    motion.y -= aWeave.x*.7;
    motion.xy += aFray*vec2(.24*sin(uTime*3.2+aUV.x*31.),.16*sin(uTime*4.1+aUV.y*27.));
    vec2 wind = motion.xy;
    vUnder = aWeave.y;
    vec3 ahead = loadedMotion(aUV + aSilk.zw / 640.);
    vec3 behind = loadedMotion(aUV - aSilk.zw / 640.);
    vec2 tangent = normalize(aSilk.zw + (ahead.xy - behind.xy) * .5);
    // The cast shadow meets the silk at the pinned, zero-height attachments.
    vec2 offset = wind + vec2(motion.z * .32, motion.z * 1.02) * uShadow;
    vec2 position = aPosition + aWarp.xy * offset.x + aWarp.zw * offset.y;
    vGround = uPlacement.xy + (aUV + wind / 640. - .5) * uPlacement.zw;
    vUV = aUV;
    vSilk = vec4(aSilk.xy, tangent);
    vElevation = vec2(motion.z, (ahead.z - behind.z) * .5);
    vPressure = texture(uContactField, aUV).b;
    vKnot = aKnot;
    vFiber = aFiber;
    vMainCable = aMainCable;
    vBranchTravel = aBranchTravel;
    vColor = uColor * uWorldColorAlpha;
    mat3 world = uWorldTransformMatrix * uTransformMatrix;
    vCanvas = (world * vec3(position,1.)).xy;
    vec2 localTangent = aWarp.xy*tangent.x + aWarp.zw*tangent.y;
    vScreenTangent = normalize((world * vec3(localTangent,0.)).xy);
    gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(position, 1.)).xy, 0., 1.);
}`;
const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vSilk;
in float vKnot;
in vec2 vFiber;
in vec4 vColor;
in vec2 vGround;
in vec2 vElevation;
in float vPressure;
in float vUnder;
in vec2 vCanvas;
in vec2 vScreenTangent;
in float vMainCable;
in float vBranchTravel;
out vec4 finalColor;
uniform float uTime;
uniform float uReveal;
uniform float uShadow;
uniform vec4 uBounds;
uniform vec4 uTorches[5];
uniform vec3 uPulseFinish;
float silkNoise(float p) {
    float i = floor(p);
    float f = fract(p);
    f = f*f*(3.-2.*f);
    return mix(fract(sin(i*127.1+17.)*43758.5453), fract(sin((i+1.)*127.1+17.)*43758.5453), f);
}
void main() {
    if (vGround.x < uBounds.x || vGround.y < uBounds.y || vGround.x > uBounds.z || vGround.y > uBounds.w) discard;
    // Ribbon coordinates are ±4.5 source pixels. Analytic coverage preserves
    // subpixel fibres when the six-cell aura is seen at battlefield scale.
    float x = vSilk.x * 4.5;
    float aa = max(fwidth(x), .08);
    float bond = vKnot * (.45 + .55 * sin(vUV.x * 271. + vUV.y * 197.) * sin(vUV.x * 271. + vUV.y * 197.));
    // Preserve the reference's substantial cable width at battlefield zoom.
    float strandLength = vSilk.y*640.;
    float bundleVariation = silkNoise(strandLength*.32 + vUV.x*7.);
    float radius = vFiber.x * 1.15 * (1. + .65 * bond);
    radius *= mix(1.,1.75,vMainCable);
    radius *= .91 + .22*bundleVariation;
    float thickness = .12 * sin(vSilk.y * 31. + vUV.x * 19.) + .06 * sin(vSilk.y * 79. + vUV.y * 31.);
    radius *= 1. + thickness * (vFiber.x > .95 ? 1. : .45);
    radius = min(radius, 3.8);
    // A load-bearing cable keeps a full body; its fibrils modulate the normal
    // instead of cutting long black slots through the enlarged silhouette.
    float wander = (silkNoise(strandLength*.16)-.5)*.22;
    float localX = x - wander;
    float localRadius = radius;
    // Integrate the fibre across a pixel instead of multiplying two AA fades.
    // The latter incorrectly erased fine silk at normal battlefield zoom.
    float coverage = max(0., min(localX + aa*.5, localRadius) - max(localX - aa*.5, -localRadius)) / aa;
    float nx = clamp(localX / localRadius, -1., 1.);
    float reliefPhase = localX*7. + vSilk.y*17. + .6*sin(vSilk.y*37.);
    float relief = (.23*sin(reliefPhase) + .09*sin(reliefPhase*1.73+vSilk.y*11.))*(1.-smoothstep(1.,3.,fwidth(reliefPhase)));
    // Three overlapping cylindrical fibrils form one continuous bundle.
    // Only their normal relief is resolved up close; the full strand coverage
    // remains solid at gameplay scale, without black slots or lost brightness.
    float bundleCoord = localX/localRadius;
    float fiberCenter = floor((bundleCoord+1.)*1.5)/1.5 - .667;
    float fiberId = floor((bundleCoord+1.)*1.5);
    // Loosely intertwined fibres wander independently through the bundle;
    // they must not become perfectly parallel machined grooves.
    fiberCenter += .11*sin(strandLength*.57+fiberId*2.1)
        + .065*sin(strandLength*1.13+fiberId*3.7);
    float fibrilNx = clamp((bundleCoord-fiberCenter)*(2.05+.65*silkNoise(strandLength*.4+fiberId*17.)), -1., 1.);
    float fiberResolve = 1.-smoothstep(.25,.85,fwidth(bundleCoord));
    nx = clamp(mix(nx, nx*.50+fibrilNx*.50, fiberResolve) + relief, -1., 1.);
    float nz = sqrt(max(0., 1. - nx * nx));
    float bodyDepth = sqrt(max(0., 1.-clamp(bundleCoord*bundleCoord,0.,1.)));
    float viewFresnel = .04 + .96*pow(1.-nz,5.);
    vec2 tangent = normalize(vSilk.zw);
    vec2 normal = vec2(-tangent.y, tangent.x);
    vec2 light = normalize(vec2(-.65, -.76));
    // A cylindrical cross-section follows the deformed 3D fibre tangent.
    vec3 T = normalize(vec3(tangent, vElevation.y));
    vec3 B = vec3(normal, 0.);
    vec3 N = normalize(B * nx + normalize(cross(T, B)) * nz);
    vec3 L = normalize(vec3(-.65, -.76, .92));
    vec3 H = normalize(L + vec3(0.,0.,1.));
    float diffuse = max(0., dot(N,L));
    float roughness = .22 + .16 * (.5+.5*sin(vSilk.y*43.+vUV.x*13.)) + bond*.12;
    // Filter specular variance over the actual pixel footprint (including zoom
    // and perspective), so unresolved fibres merge instead of flashing.
    float normalVariance = dot(dFdx(N),dFdx(N))+dot(dFdy(N),dFdy(N));
    roughness = sqrt(roughness*roughness+min(.22,normalVariance*.12));
    float highlightPower = mix(5.,12.,fiberResolve);
    // Narrow longitudinal glints over a broad secondary reflection: silk is
    // dielectric and translucent, rather than a metallic tube or emissive wire.
    float longitudinal = dot(T,H);
    float specular = exp(-longitudinal*longitudinal/(roughness*roughness));
    float breakup = .16 + .84 * smoothstep(.14,.65,sin(vSilk.y*83.+vUV.x*23.)*sin(vSilk.y*37.+vUV.y*19.));
    float highlight = pow(max(0.,dot(N,H)),highlightPower) * (highlightPower/12.) * specular * breakup;
    float broad = pow(max(0.,dot(N,H)),5.) * (.10+.15*vMainCable) * (.5+.5*breakup);
    // Local strand tilt changes the grazing reflection. Correlated broad
    // lighting and finer glints prevent a uniform vector-stroke appearance.
    float tilt = sin(vSilk.y * 31. + vUV.x * 23. - vUV.y * 17. + vElevation.y * 9.);
    float grazing = pow(1. - abs(dot(tangent,light)) * .73, 2.);
    float pool = .5 + .5 * sin(vUV.x * 11. + vUV.y * 7. + tilt);
    float reflection = pow(.5 + .5 * tilt, 5.) * (.28 + grazing * .72);
    float rim = pow(max(0.,dot(N,normalize(vec3(.70,.3,.45)))),7.);
    // Evaluate warm key, cool ambient fill and fibre transmission in linear light.
    // Convert to display space before premultiplication; otherwise midtone silk
    // looks gray and underexposed on the dark battlefield.
    float backscatter = pow(max(0.,-dot(N,L)),2.);
    vec3 silk = vec3(.94,.67,.36) * (.29 + diffuse*.70 + backscatter*.22);
    silk += vec3(.20,.27,.34) * (.19 + max(0.,-N.x)*.12);
    silk *= .86 + pool*.24;
    silk += vec3(.93,.97,1.) * (highlight*(.34+reflection*.62)+broad);
    silk += vec3(.80,.57,.26) * rim*.18;
    // Broad relief follows height and the cable's lit shoulder at the fixed
    // battlefield view, keeping the eight structural spokes legible.
    float raised = smoothstep(.3,9.,vElevation.x);
    silk *= .87+raised*.20;
    silk += vec3(.42,.43,.31)*vMainCable*(.15+raised*.22)*pow(max(0.,dot(N,H)),3.);
    // Broad environment reflection stays coherent across the whole web. Its
    // warm upper key and cool lower fill follow deformed normals, not a clock.
    vec3 reflectedView = reflect(vec3(0.,0.,-1.),N);
    float upperReflection = smoothstep(-.35,.75,-reflectedView.y);
    vec3 environment = mix(vec3(.22,.32,.43),vec3(.90,.73,.45),upperReflection);
    float environmentMask = .55+.45*(1.-smoothstep(.15,.9,vUV.y));
    silk += environment*viewFresnel*.38*environmentMask;
    // Direct illumination uses the actual animated fire sprites in canvas space.
    vec3 screenN = normalize(vec3(vec2(-vScreenTangent.y,vScreenTangent.x)*nx,nz));
    for (int i=0;i<5;i++) {
        if(uTorches[i].w<=.001) continue;
        vec2 delta = uTorches[i].xy-vCanvas;
        float height = max(1.,uTorches[i].z);
        float attenuation = uTorches[i].w/(1.+dot(delta,delta)/(height*height*9.));
        vec3 fireL = normalize(vec3(delta,height));
        vec3 fireH = normalize(fireL+vec3(0.,0.,1.));
        float fireDiffuse = max(0.,dot(screenN,fireL));
        float fireGlint = pow(max(0.,dot(screenN,fireH)),mix(8.,22.,fiberResolve));
        silk += vec3(.48,.225,.075)*attenuation*(fireDiffuse*.38+fireGlint*.65);
    }
    // Forward-scattered light through the thinner shoulder adds depth while
    // alpha compositing leaves the actual battlefield visible through silk.
    float transmittedLight = pow(max(0.,dot(-N,L)),1.5)*(1.-bodyDepth*.55);
    silk += vec3(.48,.31,.14)*transmittedLight*.42;
    // Dense junction collars occlude their lower side without darkening the
    // entire strand; raised surfaces still retain their warm catch light.
    float collarOcclusion = bond*(1.-diffuse)*(.45+.55*bodyDepth);
    silk *= 1.-collarOcclusion*.24;
    // A crossing strand blocks light on the lower fibre. The upper fibre
    // keeps its full cylindrical profile and a small geometric lift.
    silk *= 1.-vUnder*.34;
    // Filter the fibril relief at distance to avoid sparkling/moiré.
    float fibrilPhase = reliefPhase + 1.1;
    float fibrils = sin(fibrilPhase) * (1.-smoothstep(1.,3.,fwidth(fibrilPhase)));
    silk *= .95 + .09*fibrils;
    float fiberBreak = silkNoise(strandLength*.72 + floor((localX/radius+1.)*3.)*31.);
    silk *= 1. + (fiberBreak-.5)*.24*fiberResolve;
    silk += vec3(.13,.105,.067)*bundleVariation*fiberResolve;
    // Local collars gather silk at real segment junctions. Their uneven
    // wraps catch light while the underside retains a short contact crease.
    float wrapPhase = vSilk.y*390. + localX*2.;
    float wrap = sin(wrapPhase)*(1.-smoothstep(1.,3.,fwidth(wrapPhase)));
    silk += bond*vec3(.30,.22,.12)*(.5+.5*wrap)*nz;
    silk *= 1.-vPressure*.22;
    silk *= 1.-bond*.10*(1.-nz);
    // Silk transmits most incident light. Reflections belong to its outer
    // fibres, so the body is translucent rather than an opaque painted wire.
    // Beer–Lambert attenuation through a cylindrical bundle: the center has
    // more optical mass, translucent shoulders less, and junctions build up.
    float opticalThickness = (.42+.72*bodyDepth)*(.53+.14*bond);
    float bodyAlpha = 1.-exp(-opticalThickness);
    float coreTransmission = bodyAlpha + .16*highlight + .08*reflection + .12*viewFresnel;
    float filament = 1. - step(.41, vFiber.x);
    float filamentLight = smoothstep(-.35,.8,sin(vSilk.y*83.+vUV.x*27.+vUV.y*19.));
    float fibreAlpha = mix(coreTransmission, .16 + .53 * filamentLight, filament);
    float minified = 1. - smoothstep(.5, 1.7, localRadius / aa);
    float opacity = min(.84, coverage * vFiber.y * fibreAlpha * (1. + .65 * minified));
    // A short soft scattering shoulder gives bundled silk depth without a
    // full-screen bloom pass or an opaque outline around the aura.
    float scatter = (1.-smoothstep(radius*.7, min(4.5,radius+.65), abs(x))) * .042 * vFiber.y;
    opacity += scatter*(1.-opacity);
    opacity *= 1.-vUnder*.48;
    // Concentrated reflections keep the web readable without filling its core.
    silk += vec3(.62,.66,.67) * highlight * (.10 + .16 * reflection);
    silk = mix(silk, vec3(.67,.70,.65) + reflection*.3, filament);
    vec3 baseSilk = pow(max(vec3(0.),silk/(1.+silk*.18)),vec3(1./2.2));
    float baseOpacity = opacity;
    // Approved outward heartbeat: gold at the leading edge, queen-green in
    // the trailing charge. It follows the existing silk, never the range line.
    vec2 pulsePosition = (vUV-.5)*640.;
    float pulseRadius = length(pulsePosition);
    float pulseSpoke = floor((atan(pulsePosition.y,pulsePosition.x)+3.14159265)/6.2831853*40.+.5);
    float pulseDelay = .035*sin(pulseSpoke*2.17)+.023*sin(pulseSpoke*4.31);
    float pulsePhase = fract(uTime/4.);
    float pulseTravel = (pulseRadius-60.)/385.;
    float pulseDistance = pulsePhase*1.60-.18-pulseTravel-pulseDelay-vBranchTravel;
    // Filter the head across its screen footprint so it survives zooming out.
    float pulseWidth = max(.070,fwidth(pulseTravel)*1.5);
    float pulseHead = exp(-pow(pulseDistance/pulseWidth,2.));
    float pulseTail = exp(-max(0.,pulseDistance)/.20)*smoothstep(-.015,.030,pulseDistance);
    float pulseEcho = .26*exp(-pow((pulseDistance-.24)/max(.035,pulseWidth*.60),2.));
    float pulseRadial = pow(abs(dot(normalize(pulsePosition),tangent)),6.);
    float pulse = (pulseHead+pulseTail*.78+pulseEcho)*(.48+.52*pulseRadial+bond*.28);
    float pulseMask = smoothstep(54.,69.,pulseRadius)*smoothstep(.45,.85,vFiber.x);
    pulseMask *= 1.-smoothstep(.93,1.035,max(abs(pulsePosition.x),abs(pulsePosition.y))/317.);
    pulseMask *= (1.-smoothstep(.90,.995,pulsePhase))*(1.-uShadow);
    pulse *= pulseMask;
    vec3 pulseColor = mix(vec3(.055,.72,.012),vec3(1.,.65,.085),pulseHead);
    float pulseCore = exp(-pow(localX/(radius*.43+.10),2.));
    silk = mix(silk,pulseColor*1.35,min(.65,pulse*.55));
    silk += pulseColor*pulse*(1.25+pulseCore*2.3);
    // The front briefly charges real junction collars. A quiet filament
    // reflection travels through the residual green charge behind it.
    float nodeGlint = pulseHead*pulseHead*pulseHead*bond*uPulseFinish.y*pulseMask;
    float wake = smoothstep(.055,.14,pulseDistance)*(1.-smoothstep(.34,.62,pulseDistance));
    float wakePhase = vSilk.y*85.-uTime*4.;
    float resolvedWake = 1.-smoothstep(.7,2.5,fwidth(wakePhase));
    float afterglow = wake*sqrt(pulseTail)*.85*uPulseFinish.z*pulseMask;
    float wakeGlint = pow(.5+.5*sin(wakePhase),6.)*resolvedWake;
    silk += vec3(1.,.80,.31)*nodeGlint*(.7+1.5*nz);
    silk += mix(vec3(.09,.58,.025),vec3(.88,.77,.22),wakeGlint)*afterglow*(.65+1.4*pulseCore);
    opacity = min(.96,opacity+coverage*pulse*.26);
    opacity = min(.96,opacity+coverage*(nodeGlint+afterglow)*.12);
    silk = pow(max(vec3(0.), silk/(1.+silk*.18)), vec3(1./2.2));
    // Local scattering fits inside the ribbon; no extra full-screen bloom
    // pass, render texture or filter lifetime is introduced for each aura.
    float pulseHalo = exp(-pow(x/3.5,2.))*pulse*vFiber.y*.22;
    float litOpacity = opacity+pulseHalo*(1.-opacity);
    silk = (silk*opacity+sqrt(pulseColor)*pulseHalo*(1.-opacity))/max(.0001,litOpacity);
    opacity = litOpacity;
    // Reduce the complete pulse contribution by exactly 7%, in premultiplied
    // space. The underlying transparent silk and its cast shadow stay intact.
    if (uShadow < .5) {
        float finalOpacity = mix(baseOpacity,opacity,uPulseFinish.x);
        silk = mix(baseSilk*baseOpacity,silk*opacity,uPulseFinish.x)/max(.0001,finalOpacity);
        opacity = finalOpacity;
    }
    if (uShadow > .5) {
        // Height softens the cast shadow; planted feet concentrate contact shade.
        float shadowSpread = min(4.5,radius+.55+vElevation.x*.12);
        opacity = (1.-smoothstep(radius*.35,shadowSpread,abs(x)))
            * (.18+vPressure*.055+bond*.025)*vFiber.y/(1.+vElevation.x*.045);
        silk = vec3(.018,.022,.018);
    }
    float distance = max(abs(vUV.x - .5), abs(vUV.y - .5)) * 2.;
    opacity *= 1. - smoothstep(uReveal * 1.18 - .18, uReveal * 1.18, distance);
    finalColor = vec4(silk * opacity, opacity) * vColor;
}`;
export function createArachnaWebSilkShader(shadow: boolean, contactTexture: TextureSource): Shader {
    return new Shader({
        glProgram: GlProgram.from({ name: "arachna-curved-silk", vertex, fragment }),
        resources: {
            uContactField: contactTexture,
            uContactFieldSampler: contactTexture.style,
            silk: {
                uTime: { value: 0, type: "f32" },
                uPulseFinish: {
                    value: new Float32Array([
                        ARACHNA_WEB_PULSE_FINISH.opacity,
                        ARACHNA_WEB_PULSE_FINISH.nodeGlint,
                        ARACHNA_WEB_PULSE_FINISH.afterglow,
                    ]),
                    type: "vec3<f32>",
                },
                uTorches: { value: new Float32Array(20), type: "vec4<f32>", size: 5 },
                uReveal: { value: 0, type: "f32" },
                uShadow: { value: shadow ? 1 : 0, type: "f32" },
                uBounds: { value: new Float32Array(4), type: "vec4<f32>" },
                uPlacement: { value: new Float32Array(4), type: "vec4<f32>" },
            },
        },
    });
}
