shader_type spatial;
render_mode cull_back, depth_draw_never;
// Illusion mesh over skin: nearly clear face-on, denser where it turns away.
uniform vec4 tint : source_color = vec4(.31,.23,.23,1.0);
void fragment() {
 float edge=pow(1.0-clamp(dot(NORMAL,VIEW),0.0,1.0),2.0);
 ALBEDO=tint.rgb;
 ALPHA=.22+edge*.5;
 ROUGHNESS=.6;
 SPECULAR=.3;
}
