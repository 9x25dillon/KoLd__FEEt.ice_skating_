shader_type spatial;
// One seated body per instance: its coat in the instance colour, its head and
// neck in the skin tone carried by the instance's custom data, whose alpha gives
// each person their own timing. They watch the skater and react to the program;
// none of it is individually simulated, and nothing reads it back.
uniform vec3 skater = vec3(0.0);
uniform float cheer = 0.0;
const float NECK = .64;
const vec3 SHOULDER = vec3(.157,0.589,0.);
varying vec3 skin;
varying float bare;
mat3 turn_y(float a) { float c=cos(a),s=sin(a); return mat3(vec3(c,0.,-s),vec3(0.,1.,0.),vec3(s,0.,c)); }
mat3 turn_x(float a) { float c=cos(a),s=sin(a); return mat3(vec3(1.,0.,0.),vec3(0.,c,s),vec3(0.,-s,c)); }
void vertex() {
 skin=INSTANCE_CUSTOM.rgb;
 float own=INSTANCE_CUSTOM.a;
 bare=smoothstep(.63,.67,VERTEX.y);
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
 ALBEDO=mix(COLOR.rgb,skin,bare);
 ROUGHNESS=.82;
 SPECULAR=.25;
}
