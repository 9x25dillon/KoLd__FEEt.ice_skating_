shader_type spatial;
render_mode cull_back;
varying vec3 world;
void vertex(){ world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void fragment(){
 vec2 p=world.xz;
 vec2 q=abs(p)-vec2(19.0);
 if(length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0)>9.0)discard;
 float grain=hash(floor(p*160.0));
 float cloud=sin(p.x*.43+sin(p.y*.3))*.5+.5;
 float scrape=pow(abs(sin(p.x*4.0+p.y*.06)),140.0)*.035;
 vec3 base=mix(vec3(.12,.22,.29),vec3(.34,.46,.52),cloud*.45+.4);
 float center=1.0-smoothstep(.025,.08,abs(p.y));
 float circle=1.0-smoothstep(.025,.07,abs(length(p)-5.0));
 base=mix(base,vec3(.22,.30,.39),max(center,circle)*.22);
 ALBEDO=base+scrape+grain*.012;
 METALLIC=.22;
 ROUGHNESS=.18+cloud*.055+grain*.015;
 SPECULAR=.85;
}
