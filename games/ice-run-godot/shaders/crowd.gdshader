shader_type spatial;
// One seated body per instance: its coat in the instance colour, its head and
// neck in the skin tone carried by the instance's custom data.
varying vec3 skin;
varying float bare;
void vertex() {
 skin=INSTANCE_CUSTOM.rgb;
 bare=smoothstep(.63,.67,VERTEX.y);
}
void fragment() {
 ALBEDO=mix(COLOR.rgb,skin,bare);
 ROUGHNESS=.82;
 SPECULAR=.25;
}
