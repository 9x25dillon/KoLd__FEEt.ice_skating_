shader_type spatial;
// A blade's cut: very fine up close, and held at about a pixel's width far away,
// where a true 11 mm line would flicker and vanish, because the lines are the record of a program.
void vertex() {
 float distance_to_eye=length((MODELVIEW_MATRIX*vec4(VERTEX,1.0)).xyz);
 VERTEX.x*=clamp(distance_to_eye*.16,1.0,5.0);
}
void fragment() {
 ALBEDO=vec3(.33,.45,.54);
 ROUGHNESS=.6;
 SPECULAR=.3;
}
