shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
void fragment() {
 float d=length((UV-vec2(.5))*vec2(2.0,2.7));
 ALBEDO=vec3(.07,.13,.18);
 ALPHA=(1.0-smoothstep(.05,.85,d))*.28;
}
