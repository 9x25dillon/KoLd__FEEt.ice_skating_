shader_type spatial;
render_mode cull_back, specular_disabled;
uniform sampler2D mirror : source_color, filter_linear, repeat_disable;
uniform float mirror_strength = 0.0;
uniform float roof_strength = 1.0;
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
 // Ice is a dielectric, n = 1.31: F0 .018, nearly nothing from above, a mirror
 // at a glance. The arena has rows of fixtures, not a sun, so its lights take no
 // direct highlight here; the ice shows the reflected roof grid instead, found
 // by following the view's reflection up to it, so it moves with the camera.
 vec3 to_eye=normalize(CAMERA_POSITION_WORLD-world);
 float fresnel=.018+.982*pow(1.0-clamp(to_eye.y,0.0,1.0),5.0);
 vec3 wavy=normalize(vec3((noise(p*.9)-.5)*.012,1.0,(noise(p*.9+7.0)-.5)*.012));
 vec3 up_ray=reflect(-to_eye,wavy);
 vec2 roof=p+up_ray.xz*(14.0/max(up_ray.y,.03));
 vec2 grid=abs(mod(roof+vec2(6.0,8.0),vec2(12.0,16.0))-vec2(6.0,8.0));
 // Fades out before the roof's edge: a hard limit here draws a straight line on the ice.
 float fixture=exp(-pow(grid.x/3.4,2.0)-pow(grid.y/2.4,2.0))*(1.0-smoothstep(24.0,46.0,max(abs(roof.x),abs(roof.y))));
 // The skater's own reflection, softened by the ice's surface, stretched along the view.
 vec2 uv=vec2(SCREEN_UV.x,1.0-SCREEN_UV.y)+(vec2(noise(p*17.0),noise(p*17.0+3.0))-.5)*.004;
 vec4 held=vec4(0.0);
 for(int i=-2;i<=2;i++) held+=texture(mirror,uv+vec2(0.0,float(i)*.0035))*.2;
 float mirrored=clamp(fresnel*1.5+.04,0.0,.6)*mirror_strength*held.a;
 ALBEDO=min((base*vec3(1.2,1.3,1.36)+grooming*.012+scratches*.035+grain*.006),vec3(.97))*(1.0-mirrored);
 EMISSION=vec3(.72,.84,.95)*fixture*fresnel*.55*roof_strength+held.rgb*mirrored;
 METALLIC=0.0;
 ROUGHNESS=.16+cloud*.06+scratches*.1;
 SPECULAR=.335;
 NORMAL_MAP=vec3(.5+(noise(p*24.0)-.5)*.025,.5+(grain-.5)*.022,1.0);
 NORMAL_MAP_DEPTH=.15;
}
