shader_type canvas_item;
void fragment() {
 float left=1.0-smoothstep(.13,.57,UV.x);
 float right=smoothstep(.40,.65,UV.x);
 float alpha=.17+left*.57+right*.71;
 float scan=sin(UV.y*1200.0)*.003;
 COLOR=vec4(vec3(.025,.048,.075)+scan,alpha);
}
