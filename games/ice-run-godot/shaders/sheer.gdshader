shader_type spatial;
render_mode cull_back, depth_draw_never;
// Illusion mesh over skin: nearly clear face-on, denser where it turns away. UV2.x fades it
// in from nothing down the arm, so its top edge leaves no band on the shoulder.
uniform vec4 tint : source_color = vec4(.31,.23,.23,1.0);
void fragment() {
 float edge=pow(1.0-clamp(dot(NORMAL,VIEW),0.0,1.0),1.6);
 ALBEDO=tint.rgb;
 ALPHA=(.3+edge*.55)*smoothstep(0.0,1.0,UV2.x);
 ROUGHNESS=.6;
 SPECULAR=.3;
}
