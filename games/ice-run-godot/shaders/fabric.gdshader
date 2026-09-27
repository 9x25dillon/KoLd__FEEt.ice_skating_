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
void fragment() {
 float weave=sin(fabric_pos.x*1900.0)*sin(fabric_pos.y*1900.0);
 ALBEDO=tint.rgb*(.98+weave*.02);
 METALLIC=is_sleeve ? .0 : .12;
 ROUGHNESS=(is_sleeve ? .64 : .34)+weave*.035;
 SPECULAR=.5;
 RIM=.17;
 RIM_TINT=.4;
}
