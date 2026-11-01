shader_type spatial;
// The eye's image is one iris filling the frame, with sclera at its edge. The gaze slides
// it across the dome; past the image the eye carries on in the sclera's own colour, since
// clamping to the image's edge would smear its border pixels across the eye in stripes.
uniform sampler2D iris : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec2 gaze = vec2(0.0);
// The CC0 image labelled brown is red-orange. Its detail stays; its hue becomes this.
uniform vec3 iris_hue = vec3(2.6,1.45,.8);
uniform vec3 sclera = vec3(.5,.49,.47);
const float IRIS_EDGE = .42; // the iris's radius in the image, from build_athlete.py

void fragment() {
	vec2 at = UV + gaze;
	float out_from_centre = length(at - vec2(.5));
	vec3 c = texture(iris, clamp(at, vec2(.01), vec2(.99))).rgb;
	float over_iris = 1.0 - smoothstep(IRIS_EDGE - .02, IRIS_EDGE + .02, out_from_centre);
	vec3 white = mix(c*1.3, sclera, smoothstep(.44, .49, out_from_centre));
	ALBEDO = mix(white, dot(c,vec3(.3,.59,.11))*iris_hue, over_iris);
	// The sclera is wet but scatters; the cornea over the iris is glossy, and only faintly
	// reflective head on, so it does not wash the iris with the ice's light.
	ROUGHNESS = mix(.42,.12,over_iris);
	SPECULAR = mix(.3,.4,over_iris);
}
