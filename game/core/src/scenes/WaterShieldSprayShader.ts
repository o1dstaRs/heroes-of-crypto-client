/** Bounded analytic liquid trajectories: drag in the air, gravity, exact plane contact and secondary splash. */
export const waterShieldSprayFunctions = /* glsl */ `
float waterHash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
vec4 waterSpray(vec2 p,float age,float ground,float front){
    float body=0.,light=0.,wet=0.;
    for(int i=0;i<48;i++){
        float seed=float(i);
        float h=waterHash(seed),h2=waterHash(seed+52.);
        float a=seed*2.399963+h*.6;
        vec2 radial=vec2(cos(a),sin(a));
        float major=1.-step(12.,seed);
        float mist=step(34.,seed);
        float delay=.025+h2*.11;
        float t=max(0.,age-delay);
        float floorY=ground+(h2-.5)*.25;
        vec2 start=radial*vec2(.83,.81);
        start.y=min(start.y,floorY-.06);
        vec2 velocity=vec2(radial.x*(1.5+h*1.6),radial.y*.65-.65-h2*.45);
        float drag=.65+mist*.9;
        float gravity=4.6;
        float hit=(-velocity.y+sqrt(velocity.y*velocity.y+2.*gravity*(floorY-start.y)))/gravity;
        float flight=min(t,hit);
        vec2 center=start+vec2(velocity.x*(1.-exp(-drag*flight))/drag,
            velocity.y*flight+.5*gravity*flight*flight);
        vec2 speed=vec2(velocity.x*exp(-drag*flight),velocity.y+gravity*flight);
        float radius=mix(.035,.060,major)*( .75+h*.5)*(1.-mist*.40);
        float stretch=radius+major*.18*exp(-t*7.)+length(speed)*.009;
        vec2 axis=normalize(speed+vec2(.0001,0.));
        vec2 delta=p-center;
        vec2 q=vec2(dot(delta,axis)/stretch,dot(delta,vec2(-axis.y,axis.x))/radius);
        float d=length(q);
        float aa=max(fwidth(d),.12);
        float coverage=1.-smoothstep(1.-aa,1.+aa,d);
        float rim=exp(-pow((d-.73)/.22,2.));
        float spec=exp(-dot(q-vec2(-.25,-.35),q-vec2(-.25,-.35))*9.);
        float flying=smoothstep(delay,delay+.025,age)*(1.-step(hit,t));
        body+=coverage*flying*(.18+major*.10+rim*.26);
        light+=(rim*.18+spec*.70)*coverage*flying;
        // The droplet stops at its own ground contact. Time past contact drives a low elliptical splash.
        float impact=t-hit;
        if(impact>=0.){
            vec2 contact=vec2(start.x+velocity.x*(1.-exp(-drag*hit))/drag,floorY);
            vec2 groundDelta=p-contact;
            float life=1.-smoothstep(.10,.55,impact);
            float ringRadius=.035+impact*(.46+major*.18);
            vec2 ringPoint=groundDelta/vec2(1.,.25);
            float ring=exp(-pow((length(ringPoint)-ringRadius)/max(.016,fwidth(length(ringPoint))),2.));
            float puddle=exp(-dot(groundDelta/vec2(.13,.030),groundDelta/vec2(.13,.030))*1.8);
            wet+=puddle*(1.-smoothstep(.18,.65,impact))*.10;
            body+=ring*life*(.13+major*.10);
            light+=ring*life*.16;
            // Two short outward/upward spurs only on substantial impacts, then settle back to the floor.
            if(i<24){
                for(int j=0;j<2;j++){
                    float side=float(j)*2.-1.;
                    float bounce=min(impact,.25);
                    vec2 secondary=contact+vec2(side*bounce*(.44+h*.45),-bounce*.72+2.9*bounce*bounce);
                    vec2 small=(p-secondary)/vec2(.019+major*.008,.026);
                    float bead=exp(-dot(small,small)*1.8)*(1.-smoothstep(.16,.25,impact));
                    body+=bead*.45;
                    light+=bead*.28;
                }
            }
        }
    }
    float layer=mix(.22,1.,front);
    float alpha=clamp((body+light+wet)*layer,0.,.88);
    vec3 color=mix(vec3(.10,.34,.39),vec3(.83,.97,1.),clamp(light/max(body+light,.001),0.,1.));
    return vec4(color*alpha,alpha);
}`;
