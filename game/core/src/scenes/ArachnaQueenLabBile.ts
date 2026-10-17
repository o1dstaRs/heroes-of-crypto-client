export const QUEEN_BILE_SCALE = 0.78;
export const QUEEN_BITE_IMPACT_MS = 250;
export type QueenBite = "melee_attack" | "melee_attack_up" | "melee_attack_down";
export function isQueenBite(state?: string): state is QueenBite {
    return state === "melee_attack" || state === "melee_attack_up" || state === "melee_attack_down";
}
// Landmarks measured on the final registered 768px attack cels, including exact idle bookends.
const mouths = {
    melee_attack: [
        [565, 509],
        [532, 476],
        [559, 484],
        [591, 512],
        [529, 476],
        [565, 509],
    ],
    melee_attack_up: [
        [565, 509],
        [525, 482],
        [546, 410],
        [602, 353],
        [535, 488],
        [565, 509],
    ],
    melee_attack_down: [
        [565, 509],
        [525, 461],
        [555, 544],
        [530, 552],
        [537, 473],
        [565, 509],
    ],
} as const;
const eyes = {
    melee_attack: [
        [515, 430],
        [503, 436],
        [532, 442],
        [554, 469],
        [500, 442],
        [515, 430],
    ],
    melee_attack_up: [
        [515, 430],
        [497, 440],
        [499, 378],
        [561, 330],
        [495, 443],
        [515, 430],
    ],
    melee_attack_down: [
        [515, 430],
        [493, 408],
        [522, 485],
        [499, 498],
        [499, 418],
        [515, 430],
    ],
} as const;
export function queenBiteBilePose(state: QueenBite, frame: number, elapsedMs: number) {
    const cel = Math.min(5, Math.max(0, Math.floor(frame)));
    const angle = state === "melee_attack_up" ? -0.58 : state === "melee_attack_down" ? 0.58 : 0;
    const age = elapsedMs - QUEEN_BITE_IMPACT_MS;
    return {
        mouth: mouths[state][cel],
        eye: eyes[state][cel],
        // A released spray retains the impact origin while the head recovers.
        origin: mouths[state][3],
        direction: [Math.cos(angle), Math.sin(angle)],
        burstSeconds: age >= 0 && age < 320 ? age / 1000 : -1,
    };
}

// Four separately painted sprites in a lossless 512px sheet. Rectangle bounds exclude padding.
export const QUEEN_BILE_GLSL = /* glsl */ `
uniform sampler2D uBileSprites;
uniform float uBileReady;
uniform float uBurstSeconds;
uniform vec2 uBurstOrigin;
uniform vec2 uBurstDirection;
vec4 bileCel(int cel, vec2 uv) {
    if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return vec4(0.0);
    vec4 rect = cel==0 ? vec4(99,2,59,252) : cel==1 ? vec4(359,2,50,252)
        : cel==2 ? vec4(58,258,140,252) : vec4(258,258,252,148);
    return texture(uBileSprites,(rect.xy+vec2(0.5)+uv*(rect.zw-vec2(1.0)))/512.0);
}
vec4 bileOver(vec4 body, vec4 ink) { return ink+body*(1.0-ink.a); }
vec4 paintedBile(vec4 body, vec2 p, vec2 mouth) {
    const float scale = ${QUEEN_BILE_SCALE};
    if (uBileReady<0.5) return body;
    for(int i=0;i<3;i++) {
        float phase=fract(uTime/1.45+float(i)/3.0);
        vec2 root=mouth+vec2(float(i)*8.0,-float(i)*7.0)*scale;
        float lengthPx=(20.0+58.0*min(phase/0.55,1.0))*scale;
        vec2 end=root+vec2(3.0*sin(uTime*3.0+float(i))*scale,lengthPx);
        if(phase<0.61) {
            vec2 uv=(p-root)/vec2(14.0*scale,lengthPx)+vec2(0.5,0.0);
            uv.x-=sin(uv.y*3.14159)*0.06*sin(uTime*2.0+float(i));
            body=bileOver(body,bileCel(i==1?1:0,uv)*(1.0-smoothstep(0.53,0.61,phase))*uLife);
        }
        if(phase>=0.55) {
            float fall=(phase-0.55)/0.45;
            vec2 drop=end+vec2(0.0,105.0*scale*fall*fall);
            vec2 uv=(p-drop)/vec2(14.0*scale,20.0*scale)+vec2(0.5);
            body=bileOver(body,bileCel(2,uv)*(1.0-smoothstep(0.88,1.0,phase))*uLife);
        }
    }
    if(uBurstSeconds>=0.0) {
        for(int i=0;i<3;i++) {
            float age=uBurstSeconds-float(i)*0.025;
            if(age<0.0) continue;
            vec2 dir=uBurstDirection;
            vec2 side=vec2(-dir.y,dir.x);
            vec2 center=uBurstOrigin+dir*(18.0+age*(690.0-float(i)*85.0))*scale
                +side*(float(i)-1.0)*age*90.0*scale+vec2(0.0,260.0*age*age)*scale;
            vec2 delta=p-center;
            vec2 uv=vec2(dot(delta,dir),dot(delta,side))/vec2(82.0,48.0)/scale+vec2(0.5);
            float fade=1.0-smoothstep(0.20,0.32,age);
            body=bileOver(body,bileCel(3,uv)*fade*uLife);
        }
    }
    return body;
}
`;
