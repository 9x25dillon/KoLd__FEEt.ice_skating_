shader_type spatial;
render_mode cull_back;
varying vec3 world;
void vertex() { world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void fragment() {
 vec2 p=world.xz;
 vec2 q=abs(p)-vec2(19.0);
 if(length(max(q,vec2(0)))+min(max(q.x,q.y),0.0)>9.0) discard;
 float cloud=noise(p*.22)*.65+noise(p*1.4)*.25+noise(p*8.0)*.1;
 float grain=hash(floor(p*270.0));
 float grooming=pow(abs(sin(p.x*3.2+p.y*.018)),75.0);
 float scratches=pow(noise(p*vec2(180.0,2.0)),18.0);
 vec3 base=mix(vec3(.48,.63,.70),vec3(.83,.90,.91),cloud*.45+.42);
 float center=1.0-smoothstep(.018,.045,abs(p.y));
 float circle=1.0-smoothstep(.025,.065,abs(length(p)-5.0));
 float medallion=1.0-smoothstep(2.8,2.83,length(p));
 float diamond=1.0-smoothstep(.018,.065,abs(abs(p.x)+abs(p.y)-1.9));
 base=mix(base,vec3(.34,.49,.58),max(center*.15,circle*.35));
 base=mix(base,vec3(.34,.46,.55),medallion*.10);
 base=mix(base,vec3(.34,.47,.55),diamond*.42);
 // Broad, deliberately restrained fixture highlights: PS3-era baked sheen,
 // augmented by the venue's reflection probe rather than a mirror-flat surface.
 vec2 grid=abs(mod(p+vec2(6.0,8.0),vec2(12.0,16.0))-vec2(6.0,8.0));
 float fixture=exp(-pow(grid.x/1.8,4.0)-pow(grid.y/.42,2.0))*.065;
 ALBEDO=base+grooming*.012+scratches*.035+grain*.006;
 EMISSION=vec3(.72,.84,.95)*fixture;
 METALLIC=.16;
 ROUGHNESS=.23+cloud*.08+scratches*.1;
 SPECULAR=.8;
 NORMAL_MAP=vec3(.5+(noise(p*24.0)-.5)*.025,.5+(grain-.5)*.022,1.0);
 NORMAL_MAP_DEPTH=.15;
}
