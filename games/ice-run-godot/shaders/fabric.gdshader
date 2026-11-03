shader_type spatial;
render_mode cull_disabled;
uniform vec4 tint : source_color = vec4(.05,.12,.19,1.0);
uniform bool is_skirt = false;
uniform bool is_sleeve = false;
uniform float motion = 0.0;
varying vec3 fabric_pos;
void vertex() {
 fabric_pos=VERTEX;
 if(is_skirt) {
  float hem=1.0-smoothstep(.73,.96,VERTEX.y);
  float flutter=sin(TIME*6.0+VERTEX.x*19.0+VERTEX.z*12.0)*.008*hem*motion;
  VERTEX.x+=flutter; VERTEX.z+=flutter*.65;
 }
}
// game/atelier.ts: 0 satin (every preset, the values below unchanged), 1 velvet, 2 lycra, 3 mesh.
uniform int fabric = 0;
// 0..1 of the cells that carry a crystal. Presets have none.
uniform float crystals = 0.0;
uniform vec4 crystal_tint : source_color = vec4(.91,.8,.63,1.0);
float hash3(vec3 p) { return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
void fragment() {
 // The weave fades out before it is finer than a pixel, or it shimmers into stripes.
 float footprint=fwidth(fabric_pos.x)+fwidth(fabric_pos.y);
 float weave=sin(fabric_pos.x*1900.0)*sin(fabric_pos.y*1900.0)*(1.0-smoothstep(.0002,.001,footprint));
 vec3 albedo=tint.rgb*(.98+weave*.02);
 // Satin, not latex: a soft broad sheen, and less of it on a skirt seen from under.
 float rough=(is_sleeve ? .64 : is_skirt ? .62 : .5)+weave*.035;
 float spec=is_skirt ? .22 : .32;
 float rim=is_skirt ? .03 : .1;
 float rim_tint=.4;
 if(fabric==1) { albedo*=.86; rough=.9; spec=.1; rim=.6; rim_tint=.85; }
 else if(fabric==2) { rough=.28+weave*.02; spec=.5; rim=.06; }
 else if(fabric==3) { albedo*=.92; rough=.96; spec=.06; rim=.02; }
 vec3 glow=vec3(0.0);
 if(crystals>0.0) {
  // One cut stone per ~4.5 mm cell, on a share of cells; each facet tilted its own way,
  // so a stone flashes when it mirrors the arena's lights overhead into the camera.
  vec3 cell=floor(fabric_pos*220.0);
  float h=hash3(cell);
  float near=1.0-smoothstep(.002,.006,footprint);
  if(h<crystals*.35) {
   float gem=(1.0-smoothstep(.2,.32,length(fract(fabric_pos*220.0)-.5)))*near;
   vec3 facet=normalize(NORMAL+vec3(fract(h*91.7)-.5,fract(h*53.1)-.5,fract(h*17.3)-.5)*1.4);
   vec3 up=normalize((VIEW_MATRIX*vec4(0.0,1.0,0.0,0.0)).xyz);
   float glint=pow(max(dot(reflect(-VIEW,facet),up),0.0),36.0);
   albedo=mix(albedo,crystal_tint.rgb,gem*.55);
   rough=mix(rough,.06,gem);
   spec=mix(spec,.9,gem);
   glow+=crystal_tint.rgb*gem*glint*3.0;
  }
  // Too far for single stones: an even shimmer of the same tint.
  albedo=mix(albedo,crystal_tint.rgb,(1.0-near)*crystals*.12);
 }
 ALBEDO=albedo;
 METALLIC=0.0;
 ROUGHNESS=rough;
 SPECULAR=spec;
 RIM=rim;
 RIM_TINT=rim_tint;
 EMISSION=glow;
}
