shader_type spatial;
// One seated body per instance: its coat in the instance colour, its head and
// neck in the skin tone carried by the instance's custom data, whose alpha gives
// each person their own timing. They watch the skater and react to the program;
// none of it is individually simulated, and nothing reads it back.
uniform vec3 skater = vec3(0.0);
uniform float cheer = 0.0;
// From tools/build_spectator.py's printed measurements, metres above the floor.
const float NECK = .998;
const float HIP = .457;
const float CROWN = 1.1;
const vec3 SHOULDER = vec3(.168,.933,-.015);
varying vec3 skin;
varying float bare;
varying float legs;
varying float shoes;
varying float hair;
varying vec3 hair_colour;
varying vec3 leg_colour;
mat3 turn_y(float a) { float c=cos(a),s=sin(a); return mat3(vec3(c,0.,-s),vec3(0.,1.,0.),vec3(s,0.,c)); }
mat3 turn_x(float a) { float c=cos(a),s=sin(a); return mat3(vec3(1.,0.,0.),vec3(0.,c,s),vec3(0.,-s,c)); }
void vertex() {
 skin=INSTANCE_CUSTOM.rgb;
 float own=INSTANCE_CUSTOM.a;
 bare=smoothstep(NECK-.04,NECK-.005,VERTEX.y)+UV.x*smoothstep(.72,.8,UV.y);
 legs=(1.-step(.5,UV.x))*(1.-smoothstep(HIP-.03,HIP+.05,VERTEX.y));
 shoes=(1.-step(.5,UV.x))*(1.-smoothstep(.05,.09,VERTEX.y));
 // Hair sweeps from the crown down the back of the head; the face, forward (+Z), stays bare.
 hair=smoothstep(CROWN-.02,CROWN+.01,VERTEX.y-VERTEX.z*.55+max(0.,-VERTEX.z)*.25);
 float own_hair=fract(INSTANCE_CUSTOM.a*31.7);
 hair_colour=own_hair<.45?vec3(.05,.035,.03):own_hair<.75?vec3(.16,.09,.05):own_hair<.9?vec3(.42,.29,.14):vec3(.34,.33,.33);
 float own_legs=fract(INSTANCE_CUSTOM.a*17.3);
 leg_colour=own_legs<.5?vec3(.025,.03,.045):own_legs<.8?vec3(.06,.055,.05):vec3(.12,.11,.09);
 vec3 p=VERTEX;
 // Not everyone is on their feet for the same landing, or at the same moment.
 float joins=step(fract(own*7.3),.82);
 float roused=clamp(cheer*1.25-fract(own*13.7)*.25,0.,1.)*joins;
 // An arm is its own rigid piece (UV.x): up off the lap about its shoulder, then
 // the hands come together toward the middle, further the nearer the fingertips.
 if(UV.x>.5) {
  vec3 shoulder=SHOULDER*vec3(sign(p.x),1.,1.);
  mat3 raise=turn_x(-2.1*roused);
  p=shoulder+raise*(p-shoulder);
  NORMAL=raise*NORMAL;
  float clap=.5+.5*sin(TIME*11.+own*40.);
  p.x-=sign(p.x)*.16*UV.y*(.5+.5*clap)*roused;
 }
 // The head follows the skater, a little behind and each in their own way.
 vec3 toward=(inverse(MODEL_MATRIX)*vec4(skater,1.)).xyz;
 float look=clamp(atan(toward.x,toward.z),-1.15,1.15)+sin(TIME*.31+own*50.)*.14;
 float head=smoothstep(NECK-.04,NECK+.03,p.y);
 vec3 neck=vec3(0.,NECK,0.);
 p=mix(p,neck+turn_y(look)*(p-neck),head*(1.-roused*.4));
 // Everyone shifts in their seat; a roused crowd bounces in it.
 float rock=sin(TIME*(.35+own*.5)+own*30.)*.018+sin(TIME*7.+own*25.)*.03*roused;
 p=turn_y(look*.16)*p;
 p.x+=rock*p.y;
 p.y+=abs(sin(TIME*5.5+own*20.))*.05*roused+.06*roused;
 VERTEX=p;
}
void fragment() {
 vec3 worn=mix(COLOR.rgb,leg_colour,legs);
 worn=mix(worn,vec3(.02),shoes);
 // House lights are down: they are the audience, not the show.
 ALBEDO=mix(mix(worn,skin,clamp(bare,0.,1.)),hair_colour,hair)*.72;
 ROUGHNESS=.82;
 SPECULAR=.25;
}
