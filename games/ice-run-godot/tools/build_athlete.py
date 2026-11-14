"""The competition athlete, rebuilt on MakeHuman's CC0 anatomy (assets/source/makehuman).

  blender --background --python games/ice-run-godot/tools/build_athlete.py
  blender --background --python games/ice-run-godot/tools/build_athlete.py -- --rival=ansa

With --rival=<id> it builds one of the career's rivals (game/rivals.ts) instead, on
the same rig and the same material names, so the game dresses and poses them as it
does the athlete: their own build, height, skin and hair, from RIVALS below, to
assets/generated/skater-rival-<id>.glb. Their costumes' colours are game data
(game/cast.ts), not baked here. Without the flag nothing changes.

Builds to the same bone names as tools/build_skater.py, with one difference that
matters: L bones rest on the anatomical left, so a pose never drags skin across
the body. The dress, boots and sleeves are cut from the body's own surface."""
import bpy, bmesh, math, random, sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
MH=ROOT/'assets/source/makehuman'
OUT=ROOT/'assets/generated'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# The career's rivals (owner, 2026-11-11: "the five rivals"). AUTHORED looks: shape targets
# and their weights, a height in metres, the skin and hair from the CC0 pack (assets/source/makehuman/README.md).
RIVALS={
 # Two years younger and afraid of nothing: the smallest, slight, platinum ponytail.
 'ansa':{'targets':[('caucasian-female-young',1),('universal-female-young-minmuscle-minweight',.55),('female-young-averagemuscle-averageweight-idealproportions',.3)],'height':1.50,
  'skin':'young_lightskinned_female_diffuse2.png','hair':'ponytail01','hair_png':'ponytail01_platinum.png','seed':20261111},
 # The rinkmate in the far corner: average build, a black braid.
 'katya':{'targets':[('asian-female-young',1),('universal-female-young-averagemuscle-minweight',.45),('universal-female-young-maxmuscle-minweight',.2),('female-young-averagemuscle-averageweight-idealproportions',.5)],'height':1.57,
  'skin':'young_lightskinned_female_diffuse3.png','hair':'braid01','hair_png':'braid01_diffuse_black.png','seed':20261112},
 # The metronome: compact and strong, a close natural crop.
 'noor':{'targets':[('african-female-young',1),('universal-female-young-maxmuscle-averageweight',.45),('universal-female-young-averagemuscle-minweight',.3)],'height':1.58,
  'skin':'young_darkskinned_female_diffuse.png','hair':'afro01','hair_png':'afro_diffuse.png','seed':20261113},
 # The name the whole sport is saying: long lines, a gold ponytail.
 'remi':{'targets':[('caucasian-female-young',1),('universal-female-young-averagemuscle-minweight',.5),('universal-female-young-maxmuscle-minweight',.3),('female-young-averagemuscle-averageweight-idealproportions',.6)],'height':1.65,
  'skin':'young_lightskinned_female_diffuse.png','hair':'ponytail01','hair_png':'ponytail01_gold.png','seed':20261114},
 # The national champion: the tallest and the most muscle, cropped hair.
 'teodora':{'targets':[('african-female-young',.6),('caucasian-female-young',.4),('universal-female-young-maxmuscle-averageweight',.55),('universal-female-young-averagemuscle-minweight',.3)],'height':1.68,
  'skin':'young_darkskinned_female_diffuse.png','hair':'short04','hair_png':'short04_Brown.png','seed':20261115},
}
# Create-a-skater's builds (game/backstories.ts BUILDS; owner, 2026-11-14: "build more character
# models"): the athlete's skin, hair and height, only the body's shape changed. Athletic is the
# athlete herself. AUTHORED shape weights, judged on the studio renders (render_cast.py).
BUILD_LOOKS={
 # Little to carry into the air: narrow, long-limbed, the least muscle.
 'light':{'targets':[('caucasian-female-young',1),('universal-female-young-minmuscle-minweight',.6),('universal-female-young-averagemuscle-minweight',.25),('female-young-averagemuscle-averageweight-idealproportions',.5)],
  'skin':'young_lightskinned_female_diffuse.png','hair':'ponytail01','hair_png':'ponytail01_diffuse.png','seed':20261116},
 # The same legs lift more kilograms: the most muscle, a fuller frame.
 'strong':{'targets':[('caucasian-female-young',1),('universal-female-young-maxmuscle-averageweight',.6),('universal-female-young-averagemuscle-averageweight',.3),('female-young-averagemuscle-averageweight-idealproportions',.5)],
  'skin':'young_lightskinned_female_diffuse.png','hair':'ponytail01','hair_png':'ponytail01_diffuse.png','seed':20261117},
}
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
RIVAL=next((a.split('=',1)[1] for a in ARGS if a.startswith('--rival=')),None)
BUILD=next((a.split('=',1)[1] for a in ARGS if a.startswith('--build=')),None)
LOOK=RIVALS[RIVAL] if RIVAL else BUILD_LOOKS[BUILD] if BUILD else None
NAME=f'skater-rival-{RIVAL}' if RIVAL else f'skater-build-{BUILD}' if BUILD else 'skater-athlete'
random.seed(LOOK['seed'] if LOOK else 20261101)

# ---- MakeHuman data ----
def read_obj(path):
 verts,uvs,faces,groups=[],[],[],{}
 group=None
 for line in open(path):
  if line.startswith('v '):verts.append(Vector(map(float,line.split()[1:4])))
  elif line.startswith('vt '):uvs.append(tuple(map(float,line.split()[1:3])))
  elif line.startswith('g '):group=line.split()[1]
  elif line.startswith('f '):
   corners=[tuple(int(x)-1 if x else -1 for x in (p.split('/')+[''])[:2]) for p in line.split()[1:]]
   faces.append(corners)
   if group:groups.setdefault(group,[]).append(len(faces)-1)
 return verts,uvs,faces,groups
base,base_uv,base_faces,base_groups=read_obj(MH/'base.obj')
# A lean young athlete: part way from average to low body fat, some extra muscle.
ATHLETE_TARGETS=[('caucasian-female-young',1),('universal-female-young-averagemuscle-averageweight',.4),('universal-female-young-averagemuscle-minweight',.35),('universal-female-young-maxmuscle-minweight',.25),('female-young-averagemuscle-averageweight-idealproportions',.5)]
def read_target(name):
 out={}
 for line in open(MH/(name+'.target')):
  if line[0]=='#' or not line.strip():continue
  p=line.split();out[int(p[0])]=Vector(map(float,p[1:4]))
 return out
for name,weight in (LOOK['targets'] if LOOK else ATHLETE_TARGETS):
 for i,d in read_target(name).items():base[i]=base[i]+d*weight
# A rival's height is stated in metres, crown to sole, without the boot: shape targets move it
# too, so it is measured with them applied and the height target's weight solved for it (a
# target is linear in its weight). Negative weights run toward the short target.
def stature(verts):
 ids={i for f in base_groups['body'] for i,_ in base_faces[f]}
 ys=[verts[i].y for i in ids];return (max(ys)-min(ys))*.1
if LOOK and 'height' in LOOK:
 have=stature(base)
 tall=read_target('female-young-averagemuscle-averageweight-maxheight');short=read_target('female-young-averagemuscle-averageweight-minheight')
 grown=list(base)
 for i,d in (tall if LOOK['height']>have else short).items():grown[i]=grown[i]+d
 w=min(1,(LOOK['height']-have)/(stature(grown)-have))
 for i,d in (tall if LOOK['height']>have else short).items():base[i]=base[i]+d*w
 print('RIVAL %s: %.3f m before the height target, weight %.3f %s, %.3f m after'%(RIVAL,have,w,'tall' if LOOK['height']>have else 'short',stature(base)))
SOLE=.055 # steel and stanchions under the boot
sole_mh=min(base[i].y for f in base_groups['body'] for i,_ in base_faces[f])
def to_body(v):return Vector((v.x*.1,-v.z*.1,(v.y-sole_mh)*.1+SOLE))
def joint(name):
 ids={i for f in base_groups['joint-'+name] for i,_ in base_faces[f]}
 return to_body(sum((base[i] for i in ids),Vector())/len(ids))
def make_mesh(name,verts,uvs,faces,mat):
 used={}
 out_v=[];out_f=[];out_uv=[]
 for f in faces:
  face=[]
  for i,t in f:
   if i not in used:used[i]=len(out_v);out_v.append(verts[i])
   face.append(used[i]);out_uv.append(uvs[t] if t>=0 else (0,0))
  out_f.append(face)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(out_v,[],out_f);mesh.update()
 layer=mesh.uv_layers.new(name='UVMap')
 for loop,uv in zip(layer.data,out_uv):loop.uv=uv
 for poly in mesh.polygons:poly.use_smooth=True
 mesh.materials.append(mat)
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 return obj,used
def fit_proxy(stem,mat,bone,keep_face=None):
 """Places a CC0 proxy on the shaped body the way a .mhclo says to."""
 p_verts,p_uv,p_faces,_=read_obj(MH/(stem+'.obj'))
 lines=open(MH/(stem+'.mhclo')).read().split('\n')
 scale=[1,1,1];rows=[];reading=False
 for l in lines:
  t=l.split()
  if not t or t[0]=='#':continue
  if t[0] in('x_scale','y_scale','z_scale'):
   k='xyz'.index(t[0][0]);scale[k]=abs(base[int(t[1])][k]-base[int(t[2])][k])/float(t[3])
  elif t[0]=='verts':reading=True
  elif reading and t[0] in('delete_verts',):reading=False
  elif reading and t[0].lstrip('-').replace('.','').isdigit():
   rows.append([float(x) for x in t])
 placed=[]
 for n in rows[:len(p_verts)]:
  if len(n)>=9:
   q=base[int(n[0])]*n[3]+base[int(n[1])]*n[4]+base[int(n[2])]*n[5]+Vector((n[6]*scale[0],n[7]*scale[1],n[8]*scale[2]))
  else:q=base[int(n[0])]
  placed.append(to_body(q))
 if keep_face:p_faces=[f for f in p_faces if keep_face([p_uv[t] for _,t in f])]
 obj,_=make_mesh(stem,placed,p_uv,p_faces,mat)
 obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
 return obj

# ---- materials; the names are skater.gd's costume slots ----
def material(name,color,metal=0,rough=.5,image=None,alpha=False):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if image:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(MH/image))
  m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if alpha:m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
 return m
SKIN=LOOK['skin'] if LOOK else 'young_lightskinned_female_diffuse.png'
skin=material('Warm porcelain',(1,1,1),0,.46,SKIN)
tights=material('Skin-tone tights',(1,1,1),0,.56,SKIN)
bodice=material('Midnight plum satin',(.025,.09,.14),.12,.3)
skirt_mat=material('Flowing skirt satin',(.025,.09,.14),.12,.3)
sleeve=material('Illusion sleeve',(.31,.23,.23),0,.53)
hair=material('Espresso hair',(1,1,1),0,.42,LOOK['hair_png'] if LOOK else 'ponytail01_diffuse.png',True)
crystal=material('Champagne crystals',(.85,.72,.48),.75,.18)
leather=material('Ivory leather boots',(.90,.88,.82),0,.27)
lace_mat=material('Boot laces',(.72,.72,.70),0,.7)
sole_mat=material('Stacked leather heel',(.21,.16,.12),0,.6)
steel=material('Polished steel',(.62,.68,.72),.95,.14)
eye=material('Eyes',(1,1,1),0,.1,'brown.png')
brow=material('Brow',(1,1,1),0,.7,'eyebrow001.png',True)
lash=material('Lashes',(1,1,1),0,.6,'eyelashes02.png',True)

# ---- the rig: skater.gd's bone names, on the shaped body's own joints ----
ankle_z=joint('l-ankle').z
hip_l=joint('l-upper-leg');knee_l=joint('l-knee');ankle_l=joint('l-ankle')
shoulder_l=joint('l-shoulder');elbow_l=joint('l-elbow');wrist_l=joint('l-hand')
pelvis=Vector((0,0,hip_l.z))
waist=joint('spine-3');neck=joint('neck');crown=joint('head-2') if 'joint-head-2' in base_groups else joint('head')
top_of_head=max(to_body(base[i]).z for f in base_groups['body'] for i,_ in base_faces[f])
mirror=lambda v:Vector((-v.x,v.y,v.z))
bpy.ops.object.armature_add(enter_editmode=True)
rig=bpy.context.object;rig.name='SkaterRig';arm=rig.data;arm.name='EdgeworkSkeleton';arm.edit_bones.remove(arm.edit_bones[0])
def bone(name,head,tail,parent=None):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=arm.edit_bones[parent]
 return b
bone('Hips',pelvis,Vector((0,waist.y,waist.z)))
bone('Spine',Vector((0,waist.y,waist.z)),Vector((0,neck.y,neck.z)),'Hips')
bone('Head',Vector((0,neck.y,neck.z)),Vector((0,neck.y,top_of_head)),'Spine')
for side,flip in (('L',lambda v:v),('R',mirror)):
 toe=flip(Vector((joint('l-foot-2').x,joint('l-foot-2').y-.03,ankle_z-.045)))
 bone('Thigh'+side,flip(hip_l),flip(knee_l),'Hips')
 bone('Shin'+side,flip(knee_l),flip(ankle_l),'Thigh'+side)
 bone('Foot'+side,flip(ankle_l),toe,'Shin'+side)
 bone('Arm'+side,flip(shoulder_l),flip(elbow_l),'Spine')
 bone('Forearm'+side,flip(elbow_l),flip(wrist_l),'Arm'+side)
 hand_tip=flip(wrist_l+(wrist_l-elbow_l).normalized()*.16)
 bone('Hand'+side,flip(wrist_l),hand_tip,'Forearm'+side)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- the body ----
body,body_map=make_mesh('Athlete',[to_body(v) for v in base],base_uv,[base_faces[f] for f in base_groups['body']],skin)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
def segment_distance(p,a,b):
 ab=b-a;t=max(0,min(1,(p-a).dot(ab)/ab.length_squared));return (a+ab*t-p).length
segments=[(b.name,b.head_local.copy(),b.tail_local.copy()) for b in arm.bones]
unweighted=0
for v in body.data.vertices:
 if not v.groups or sum(g.weight for g in v.groups)<1e-4:
  unweighted+=1
  name=min(segments,key=lambda s:segment_distance(v.co,s[1],s[2]))[0]
  group=body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
  group.add([v.index],1,'REPLACE')
print('ATHLETE: %d verts, %d needed nearest-bone weights'%(len(body.data.vertices),unweighted))
names={g.index:g.name for g in body.vertex_groups}
def weight(v,*bones):
 return sum(g.weight for g in v.groups if names[g.group] in bones)
for poly in body.data.polygons:
 pass

def carve(source,name,keep,offset,mat,smooth=0,edge=None,tuck=None):
 """A garment: the body's faces chosen by keep(), lifted off the skin by offset."""
 mesh=source.data.copy();obj=source.copy();obj.data=mesh;obj.name=name
 bpy.context.collection.objects.link(obj)
 mesh.materials.clear();mesh.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table();bm.verts.ensure_lookup_table()
 doomed=[f for f in bm.faces if not keep(f)]
 bmesh.ops.delete(bm,geom=doomed,context='FACES')
 loose=[v for v in bm.verts if not v.link_faces]
 bmesh.ops.delete(bm,geom=loose,context='VERTS')
 bm.normal_update()
 if smooth:
  for _ in range(smooth):bmesh.ops.smooth_vert(bm,verts=list(bm.verts),factor=.5,use_axis_x=True,use_axis_y=True,use_axis_z=True)
  bm.normal_update()
 if edge:
  for v in bm.verts:
   if v.is_boundary:edge(v)
  # Then along the edge itself: what the line did not catch still steps up and down.
  rim=[v for v in bm.verts if v.is_boundary and v.co.z>waist.z]
  for _ in range(6):
   moved={}
   for v in rim:
    near=[e.other_vert(v).co for e in v.link_edges if e.is_boundary]
    if len(near)==2:moved[v]=v.co*.5+(near[0]+near[1])*.25
   for v,co in moved.items():v.co=co
  # Laying the edge on its line can lift it off the body or sink it in: back onto the skin.
  skin=BVHTree.FromPolygons([v.co.copy() for v in source.data.vertices],[tuple(p.vertices) for p in source.data.polygons])
  # What stands past the edge once it has moved would fold up as a tab; it comes in too.
  inside=[v for v in bm.verts if not v.is_boundary and tuck and tuck(v)]
  for v in rim+inside:
   on_skin=skin.find_nearest(v.co)[0]
   if on_skin is not None:v.co=on_skin
  bm.normal_update()
 for v in bm.verts:v.co+=v.normal*offset
 bm.to_mesh(mesh);bm.free();mesh.update()
 return obj
deform=body.data.vertices
def face_mean(f,*bones):
 return sum(weight(deform[v.index],*bones) for v in f.verts)/len(f.verts)
def centre(f):return f.calc_center_median()
waist_z=waist.z-.015
collar_z=neck.z-.035
# The armhole, cut on a clean line above the armpit; below it the arm's own weights decide.
armpit_z=shoulder_l.z-.075
armhole_x=shoulder_l.x-.03
# A sweetheart front and a low scooped back: skaters' necklines.
def neckline(x,y):
 # Never far above the armpit where it meets the armhole, or the corner stands up as a peak.
 if y<0:line=collar_z-.075-.05*(1-min(1,abs(x)/.11)**2)
 else:line=collar_z-.16+.09*min(1,abs(x)/.16)
 near_arm=max(0,min(1,(abs(x)-(armhole_x-.05))/.05))
 return line+(min(line,armpit_z+.006)-line)*near_arm
# Where the leotard meets the leg, seen when a spin lifts the skirt.
def leg_line(x):return hip_l.z-.06-.03*min(1,abs(x)/.13)
def is_bodice(f):
 c=centre(f)
 if c.z>armpit_z and abs(c.x)>armhole_x:return False
 if face_mean(f,'ArmL','ArmR','ForearmL','ForearmR','HandL','HandR')>.5 or face_mean(f,'Head')>.25:return False
 if c.z<leg_line(c.x):return False
 return c.z<neckline(c.x,c.y)
def clean_neckline(v):
 # The mesh's own rows cut a sawtooth; the boundary is laid onto the line itself.
 if v.co.z>armpit_z-.01 and abs(v.co.x)>armhole_x-.022:v.co.x=math.copysign(armhole_x,v.co.x)
 elif abs(v.co.x)<armhole_x and v.co.z>waist.z+.05:v.co.z=neckline(v.co.x,v.co.y)
 elif v.co.z<hip_l.z:v.co.z=leg_line(v.co.x)
def tuck_neckline(v):
 if v.co.z<armpit_z-.01 and v.co.z<waist.z+.05:return False
 moved=False
 if v.co.z>armpit_z-.01 and abs(v.co.x)>armhole_x:
  v.co.x=math.copysign(armhole_x-.001,v.co.x);moved=True
 if v.co.z>neckline(v.co.x,v.co.y)-.001:
  v.co.z=neckline(v.co.x,v.co.y)-.001;moved=True
 return moved
# The sleeve starts on a clean line round the top of the arm and ends at the wrist.
def clean_sleeve(v):
 side=shoulder_l if v.co.x>0 else mirror(shoulder_l)
 end=elbow_l if v.co.x>0 else mirror(elbow_l)
 along=(end-side).normalized()
 t=(v.co-side).dot(along)
 if t<.07:v.co+=along*(.03-t)
def is_sleeve(f):
 # Starts just down the arm, on a line round it, not on the shoulder or the chest.
 c=centre(f)
 side,end=(shoulder_l,elbow_l) if c.x>0 else (mirror(shoulder_l),mirror(elbow_l))
 if (c-side).dot((end-side).normalized())<.03:return False
 return face_mean(f,'ArmL','ArmR','ForearmL','ForearmR')>.5 and face_mean(f,'HandL','HandR')<.4
boot_top=ankle_z+.125
def is_boot(f):return centre(f).z<boot_top
dress=carve(body,'Bodice',is_bodice,.0035,bodice,edge=clean_neckline,tuck=tuck_neckline)
sheer=carve(body,'Sleeves',is_sleeve,.0022,sleeve,edge=clean_sleeve)
boots=carve(body,'Boots',is_boot,.0075,leather,smooth=14)
# ---- skin under the costume is gone; legs wear tights ----
bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table()
body.data.materials.append(tights)
doomed=[]
for f in bm.faces:
 c=centre(f)
 if is_bodice(f) and c.z<neckline(c.x,c.y)-.012 and c.z>hip_l.z-.05:
  # Inset from the garment's edge, so no bare seam shows when it moves.
  doomed.append(f)
 elif c.z<boot_top-.02:doomed.append(f)
 elif c.z<hip_l.z+.02 and face_mean(f,'ThighL','ThighR','ShinL','ShinR')>.5:f.material_index=1
bmesh.ops.delete(bm,geom=doomed,context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(body.data);bm.free();body.data.update()

# The source weights the seat to the thighs, so bending a knee swings it back through a
# skirt that hangs from the hips. Above the hip joint the body follows the pelvis.
def seat_follows_pelvis(obj):
 by_index={g.index:g.name for g in obj.vertex_groups}
 hips=obj.vertex_groups.get('Hips') or obj.vertex_groups.new(name='Hips')
 thighs=[obj.vertex_groups[n] for n in ('ThighL','ThighR') if n in obj.vertex_groups]
 for v in obj.data.vertices:
  share=max(0,min(1,(v.co.z-(hip_l.z-.075))/.06))
  if share<=0:continue
  moved=0
  for g in list(v.groups):
   if by_index[g.group] in ('ThighL','ThighR'):
    moved+=g.weight*share
    obj.vertex_groups[g.group].add([v.index],g.weight*(1-share),'REPLACE')
  if moved>0:hips.add([v.index],moved,'ADD')
for o in (body,dress):seat_follows_pelvis(o)
def piping(obj,name,mat,wanted,thick=.0024):
 """A sewn edge: a fine cord along a garment's open boundary, which also covers the mesh's own stepped rows."""
 groups={g.index:g.name for g in obj.vertex_groups}
 mesh=obj.data
 count={}
 for poly in mesh.polygons:
  for e in poly.edge_keys:count[e]=count.get(e,0)+1
 v,f,w=[],[],[]
 weights=lambda i:{groups[g.group]:g.weight for g in mesh.vertices[i].groups}
 for (i,j),n in count.items():
  a,b=mesh.vertices[i].co,mesh.vertices[j].co
  if n!=1 or not wanted((a+b)/2):continue
  u=(b-a)
  if u.length<1e-5:continue
  u.normalize()
  n1=u.cross(Vector((0,0,1)) if abs(u.z)<.9 else Vector((1,0,0))).normalized()*thick
  n2=u.cross(n1).normalized()*thick
  first=len(v)
  for c,k in ((a,i),(b,j)):
   v.extend([c+n1,c+n2,c-n1,c-n2]);w.extend([weights(k)]*4)
  for q in range(4):
   p=(q+1)%4
   f.append((first+q,first+p,first+4+p,first+4+q))
 return own_mesh(name,v,f,mat,w) if v else None
def stream(obj):
 for poly in obj.data.polygons:poly.use_smooth=True
for o in (dress,sheer,body):stream(o)
def own_mesh(name,verts,faces,mat,weights):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 for poly in mesh.polygons:poly.use_smooth=True
 mesh.materials.append(mat)
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 for i,row in enumerate(weights):
  for b,w in row.items():
   if w<=0:continue
   (obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)).add([i],w,'REPLACE')
 return obj

# The sleeve has no cord: on a sheer sleeve it reads as a wire hoop round the shoulder.
seams=[o for o in (piping(dress,'Neckline cord',bodice,lambda c:c.z>waist.z+.03),) if o]
# The sheer fabric comes in gradually down the arm: at a constant density its top edge
# shows as a hard band on the shoulder. shaders/sheer.gdshader reads this second UV.
def fade_sleeve_in(obj):
 mesh=obj.data
 base=mesh.uv_layers[0].name
 fade=mesh.uv_layers.new(name='SleeveFade')
 mesh.uv_layers.active=mesh.uv_layers[base]
 for poly in mesh.polygons:
  for li in poly.loop_indices:
   p=mesh.vertices[mesh.loops[li].vertex_index].co
   side,end=(shoulder_l,elbow_l) if p.x>0 else (mirror(shoulder_l),mirror(elbow_l))
   t=(p-side).dot((end-side).normalized())
   fade.data[li].uv=(max(0,min(1,(t-.03)/.10)),0)
fade_sleeve_in(sheer)
# ---- skirt: it starts at the waist of this body and clears this body's hips ----
body_tree=[v.co.copy() for v in deform]
SEGS,ROWS=144,12
dress_surface=BVHTree.FromPolygons([v.co.copy() for v in dress.data.vertices],[tuple(p.vertices) for p in dress.data.polygons])
def radial_at(z,theta):
 """How far out the dress is at this height and bearing, looking in at it from outside."""
 d=Vector((math.cos(theta),math.sin(theta),0))
 hit=dress_surface.ray_cast(Vector((0,0,z))+d*.6,-d)[0]
 return (hit-Vector((0,0,z))).length if hit is not None else 0
def around_body(heights):
 """The body's outline, round the circle: smooth, and never inside the body."""
 rows=[max(radial_at(z,2*math.pi*s/SEGS) for z in heights) for s in range(SEGS)]
 known=[r for r in rows if r>0]
 rows=[r or sum(known)/len(known) for r in rows]
 def blurred(values):return [sum(values[(k+o)%SEGS] for o in range(-3,4))/7 for k in range(SEGS)]
 for _ in range(4):rows=[max(r,b) for r,b in zip(rows,blurred(rows))]
 return blurred(rows)
PANELS=16 # skater.gd swings these: Skirt00.. hang from the waist
hem_z=hip_l.z-.205
skirt_v,skirt_f,skirt_w=[],[],[]
skirt_top=hip_l.z+.085
waist_r=around_body([skirt_top-.004,skirt_top,skirt_top+.004])
# Slow, uneven drape rather than a repeating pleat.
drape=[(random.uniform(.003,.008),random.randint(3,9),random.uniform(0,6.28)) for _ in range(5)]
# Row by row, each no narrower than the one above, so nothing hangs in under the seat.
row_clear=[]
for j in range(ROWS+1):
 z=skirt_top+(hem_z-skirt_top)*j/ROWS
 row=around_body([z-.012,z,z+.012]) if z>=leg_line(0)-.03 else row_clear[-1]
 row_clear.append([max(a,b) for a,b in zip(row,row_clear[-1])] if row_clear else row)
# Blurred between rows too: a sharp change in clearance creases the cloth across the hem.
for _ in range(3):
 row_clear=[[max(row_clear[j][s],(row_clear[max(0,j-1)][s]+row_clear[j][s]+row_clear[min(ROWS,j+1)][s])/3) for s in range(SEGS)] for j in range(ROWS+1)]
# Each panel flares just enough to clear the body at every row, and behind a little more,
# since a bent knee still moves the seat. Never less than the skirt's own flare. A row
# that only bulged around the seat would make a bustle, and the panels' straight bones
# could not carry one.
OUTER_FLARE=.11
SEAT_ROOM=.012
PANEL_CURVE=.55
def needed_flare(s):
 back=max(0,math.sin(2*math.pi*s/SEGS))
 top=waist_r[s]+.004
 return max([OUTER_FLARE]+[(row_clear[j][s]+.006+SEAT_ROOM*back-top)/(j/ROWS)**PANEL_CURVE for j in range(1,ROWS+1)])
panel_flare=[needed_flare(s) for s in range(SEGS)]
for _ in range(4):panel_flare=[max(panel_flare[k],sum(panel_flare[(k+o)%SEGS] for o in range(-3,4))/7) for k in range(SEGS)]
panel_flare=[sum(panel_flare[(k+o)%SEGS] for o in range(-3,4))/7 for k in range(SEGS)]
# Knife pleats: each rises slowly, then folds back sharply. 144 segments make six to a pleat.
PLEATS=24
PLEAT_DEPTH=.012
def knife_pleat(a):
 place=(a/(2*math.pi)*PLEATS)%1
 return PLEAT_DEPTH*(place/.8 if place<.8 else (1-place)/.2)
for layer,(drop,flare) in enumerate(((0,0),(-.022,.025))):
 first=len(skirt_v)
 for j in range(ROWS+1):
  t=j/ROWS
  for s in range(SEGS):
   a=2*math.pi*s/SEGS
   # Knife pleats deepening to the hem, longer behind than in front.
   back=max(0,math.sin(a))
   z=skirt_top+((hem_z-drop-.02*back)-skirt_top)*t
   # One curve from waist to hem, as cloth hangs; pleats and drape deepen toward the hem.
   r=waist_r[s]+.004+panel_flare[s]*t**PANEL_CURVE+(sum(amp*math.sin(a*n+ph) for amp,n,ph in drape)+knife_pleat(a))*t**1.2
   # The inner layer hangs just inside the outer one, so the two can never cross.
   if layer==1:r-=.003+flare*t
   x=math.cos(a)*r;y=math.sin(a)*r
   skirt_v.append(Vector((x,y,z)))
   # Each vertex hangs between its two nearest panels, so the skirt stays one cloth.
   u=s/SEGS*PANELS;i=int(u)%PANELS;f=u-int(u)
   skirt_w.append({'Skirt%02d'%i:1-f,'Skirt%02d'%((i+1)%PANELS):f})
 for j in range(ROWS):
  for s in range(SEGS):
   n=(s+1)%SEGS;row=first+j*SEGS;up=first+(j+1)*SEGS
   skirt_f.append((row+s,row+n,up+n,up+s))
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for i in range(PANELS):
 s=round(i*SEGS/PANELS)%SEGS
 bone('Skirt%02d'%i,skirt_v[s],skirt_v[s+ROWS*SEGS],'Hips')
bpy.ops.object.mode_set(mode='OBJECT')
skirt=own_mesh('Skirt',skirt_v,skirt_f,skirt_mat,skirt_w)

# ---- crystals along the neckline, thinning down the bodice ----
gems=[]
front=[v.co.copy() for v in dress.data.vertices if v.co.y<0]
if front:
 front_top={}
 for p in front:
  key=round(p.x*40)
  if key not in front_top or p.z>front_top[key].z:front_top[key]=p
 lines=list(front_top.values())
 for p in lines:gems.append(p+Vector((0,-.002,-.004)))
 for p in random.sample(front,min(180,len(front))):
  if random.random()<(p.z-waist.z)/.32:gems.append(p+Vector((0,-.003,0)))
dress_tree=KDTree(len(dress.data.vertices))
for i,v in enumerate(dress.data.vertices):dress_tree.insert(v.co,i)
dress_tree.balance()
dress_names={g.index:g.name for g in dress.vertex_groups}
gem_v,gem_f,gem_w=[],[],[]
template=[(0,0,1),(1,0,0),(0,1,0),(-1,0,0),(0,-1,0),(0,0,-1)]
for c in gems:
 r=random.uniform(.0016,.0029)
 first=len(gem_v)
 for o in template:gem_v.append(c+Vector(o)*r)
 for a,b in ((1,2),(2,3),(3,4),(4,1)):
  gem_f.append((first,first+a,first+b));gem_f.append((first+5,first+b,first+a))
 _,i,_=dress_tree.find(c)
 row={dress_names[g.group]:g.weight for g in dress.data.vertices[i].groups}
 gem_w+= [row]*6
trim_objs=[own_mesh('Crystals',gem_v,gem_f,crystal,gem_w)] if gem_v else []
# A fine band where the skirt meets the bodice.
band_v,band_f,band_w=[],[],[]
for s in range(SEGS):
 a=2*math.pi*s/SEGS;r=waist_r[s]+.0072
 for dz,dr in ((.004,0),(0,.0022),(-.004,0)):
  band_v.append(Vector((math.cos(a)*(r+dr),math.sin(a)*(r+dr),skirt_top+dz)));band_w.append({'Hips':1})
for s in range(SEGS):
 n=(s+1)%SEGS
 for k in range(2):band_f.append((s*3+k,n*3+k,n*3+k+1,s*3+k+1))
trim_objs.append(own_mesh('Waist band',band_v,band_f,crystal,band_w))

# ---- steel, sole and laces, built along each foot's own axis ----
parts=[]
for side,flip,sign in (('L',lambda v:v,1),('R',mirror,-1)):
 ankle=flip(ankle_l)
 toe_bone=arm.bones['Foot'+side].tail_local.copy()
 forward=Vector((toe_bone.x-ankle.x,toe_bone.y-ankle.y,0)).normalized()
 lateral=forward.cross(Vector((0,0,1))).normalized()
 foot_pts=[v.co for v in boots.data.vertices if (v.co.x>0)==(sign>0) and v.co.z<ankle_z-.02]
 along=[(p-ankle).dot(forward) for p in foot_pts]
 back,front_end=min(along),max(along)
 at=lambda s,w,z:ankle+forward*s+lateral*w+Vector((0,0,z-ankle.z))
 foot_w={'Foot'+side:1}
 # The boot is lofted, not grown from the foot: a skating boot is stiff, with a
 # firm toe box and a straight shaft, and hides the toes inside it. Each row is a
 # horizontal slice: height, furthest forward, furthest back, half width.
 calf=[v.co for v in boots.data.vertices if (v.co.x>0)==(sign>0)]
 def leg_at(z):
  # A leg is an oval, not a circle: its reach fore and aft and its half width, measured apart.
  near=[p for p in calf if abs(p.z-z)<.012]
  if not near:return .04,-.04,.035
  along=[(p-ankle).dot(forward) for p in near];across=[(p-ankle).dot(lateral) for p in near]
  return max(along),min(along),(max(across)-min(across))/2
 welt=SOLE+.006
 rise=ankle_z-welt
 heel=leg_at(ankle_z+.024)[1]-.003
 rows=[(welt,front_end,back,.042),(welt+rise*.18,front_end,back,.0445),(welt+rise*.42,front_end-.014,back-.001,.0445),
  (welt+rise*.68,front_end-.06,back+.006,.041),(welt+rise*.88,front_end-.105,(back+heel)/2,.038),(ankle_z+.006,.066,heel,.037)]
 for k in range(1,6):
  z=ankle_z+.024*k
  ahead,behind,half=leg_at(z)
  rows.append((z,ahead+.003,behind-.003,half+.003))
 def front_at(z):
  for (z0,f0,_,_),(z1,f1,_,_) in zip(rows,rows[1:]):
   if z0<=z<=z1:return f0+(f1-f0)*(z-z0)/(z1-z0)
  return rows[-1][1]
 RING=40
 v,f,w=[],[],[]
 for z,fr,bk,half in rows:
  centre_s=(fr+bk)/2;reach=(fr-bk)/2
  low=max(0,min(1,(ankle_z-z)/.06))
  blend=max(0,min(1,(z-ankle_z+.01)/.1))
  for j in range(RING):
   a=2*math.pi*j/RING;c,sn=math.cos(a),math.sin(a)
   # Rounder through the shaft, blockier and wider toward the ball of the foot low down.
   power=1-.28*low
   sc=math.copysign(abs(c)**power,c);ss=math.copysign(abs(sn)**power,sn)
   v.append(at(centre_s+reach*sc,half*ss*(1+.13*low*c),z))
   w.append({'Foot'+side:1-blend,'Shin'+side:blend})
 for i in range(len(rows)-1):
  for j in range(RING):
   n=(j+1)%RING;p=i*RING;q=(i+1)*RING
   f.append((p+j,p+n,q+n,q+j))
 f.append(tuple(range(RING-1,-1,-1)))
 parts.append(own_mesh('Boot '+side,v,f,leather,w))
 # A dark padded collar closes the top of the shaft around the leg.
 z,fr,bk,half=rows[-1]
 centre_s=(fr+bk)/2;reach=(fr-bk)/2
 v,f,w=[],[],[]
 for rise,grow in ((-.003,1.005),(.002,1.02),(.005,.985)):
  for j in range(RING):
   a=2*math.pi*j/RING
   v.append(at(centre_s+reach*grow*math.cos(a),half*grow*math.sin(a),z+rise));w.append({'Shin'+side:1})
 for i in range(2):
  for j in range(RING):
   n=(j+1)%RING;p=i*RING;q=(i+1)*RING
   f.append((p+j,p+n,q+n,q+j))
 parts.append(own_mesh('Boot collar '+side,v,f,sole_mat,w))
 # Rocker blade: bows along a 2.1 m radius, then sweeps up into the toe pick.
 v,f,w=[],[],[]
 N=44;start=back-.025;end=front_end+.002;mid=(start+end)*.5
 for i in range(N+1):
  s=start+(end-start)*i/N;d=s-mid;rise=d*d/(2*2.1)
  if s>end-.035:rise+=((s-(end-.035))/.035)**2*.012
  for z,wd in ((rise,.0014),(SOLE*.62,.0014),(SOLE*.62,-.0014),(rise,-.0014)):
   v.append(at(s,wd,z));w.append(foot_w)
 for i in range(N):
  for k in range(4):
   a=i*4+k;b=i*4+(k+1)%4
   f.append((a,b,b+4,a+4))
 f.append((0,3,2,1));f.append((N*4,N*4+1,N*4+2,N*4+3))
 parts.append(own_mesh('Blade '+side,v,f,steel,w))
 # Stanchions and plates carrying the blade under heel and ball.
 v,f,w=[],[],[]
 for s0,s1,hw in ((back+.02,back+.075,.016),(front_end-.115,front_end-.02,.021)):
  for s,sp in ((s0,.7),(s1,.7),(s1,1),(s0,1)):
   pass
  base_i=len(v)
  for z,scale in ((SOLE*.45,.25),(SOLE*.95,1)):
   for s,wd in ((s0,hw),(s1,hw),(s1,-hw),(s0,-hw)):
    v.append(at(s,wd*scale,z));w.append(foot_w)
  for k in range(4):
   a=base_i+k;b=base_i+(k+1)%4
   f.append((a,b,b+4,a+4))
  f.append((base_i+4,base_i+5,base_i+6,base_i+7))
 parts.append(own_mesh('Stanchions '+side,v,f,steel,w))
 # Leather sole and stacked heel.
 v,f,w=[],[],[]
 half=.5*(front_end-back);centre_s=.5*(front_end+back);R=20
 for ring,(z,sc) in enumerate(((SOLE*.98,.98),(SOLE+.006,1.0))):
  for i in range(R):
   a=2*math.pi*i/R
   s=centre_s+math.cos(a)*half*sc
   wd=math.sin(a)*(.036+.009*(s-back)/(front_end-back))*sc
   v.append(at(s,wd,z));w.append(foot_w)
 for i in range(R):
  n=(i+1)%R
  f.append((i,n,n+R,i+R))
 f.append(tuple(range(R-1,-1,-1)))
 parts.append(own_mesh('Sole '+side,v,f,sole_mat,w))
 # Laces crossing the instep and shaft, on the boot's own front line.
 v,f,w=[],[],[]
 lace_top=rows[-1][0]-.012
 z=rows[2][0]+.012
 while z<lace_top:
  for wa,wb in ((-.016,.016),(.016,-.016)):
   a=at(front_at(z)+.0012,wa,z);b=at(front_at(z+.013)+.0012,wb,z+.013)
   base_i=len(v)
   u=(b-a).normalized();n=u.cross(forward).normalized()*.0011;m=u.cross(n).normalized()*.0011
   for c in (a,b):
    v.extend([c+n,c+m,c-n,c-m]);w.extend([{'Foot'+side:1} if z<ankle_z else {'Shin'+side:1}]*4)
   for j in range(4):
    p=(j+1)%4
    f.append((base_i+j,base_i+p,base_i+4+p,base_i+4+j))
  z+=.0135
 parts.append(own_mesh('Laces '+side,v,f,lace_mat,w))
bpy.data.objects.remove(boots)
# ---- face and hair ----
# Each eye is two shells, and neither's UVs fit this texture, which is one iris filling
# the image: they blank or bloody the eye. The outer shell stays, with the iris projected
# straight onto its front at a real 6.2 mm radius; beyond it the image's edge is sclera.
IRIS_RADIUS=.0062
IRIS_IN_IMAGE=.42
EYE_SEAT_LEAST=.0003
EYE_SEAT_MOST=.0008
def outer_shell(uvs):return all(u>.8 and v<.25 for u,v in uvs)
def project_iris(obj):
 mesh=obj.data
 for sign in (1,-1):
  shell=[v.co for v in mesh.vertices if (v.co.x>0)==(sign>0)]
  mid=sum(shell,Vector())/len(shell)
  for poly in mesh.polygons:
   if (mesh.vertices[poly.vertices[0]].co.x>0)!=(sign>0):continue
   for li in poly.loop_indices:
    p=mesh.vertices[mesh.loops[li].vertex_index].co
    u=.5+(p.x-mid.x)/IRIS_RADIUS*IRIS_IN_IMAGE
    w=.5+(p.z-mid.z)/IRIS_RADIUS*IRIS_IN_IMAGE
    # Left unclamped: shaders/eye.gdshader clamps per pixel, after the gaze moves the iris.
    mesh.uv_layers[0].data[li].uv=(u,w)
 # The fitted shell stands proud of the lower lid at the outer corners. Seat it deeper
 # there and only slightly at the top, where seating shows the lid's inside.
 for sign in (1,-1):
  shell=[v for v in mesh.vertices if (v.co.x>0)==(sign>0)]
  mid=sum((v.co for v in shell),Vector())/len(shell)
  reach=max(abs(v.co.x-mid.x) for v in shell)
  for v in shell:
   toward=max(0,min(1,.5+.5*((mid.z-v.co.z)+(v.co.x-mid.x)*sign)/reach))
   v.co.y+=EYE_SEAT_LEAST+(EYE_SEAT_MOST-EYE_SEAT_LEAST)*toward*toward
 return obj
proxies=[project_iris(fit_proxy('high-poly',eye,'Head',outer_shell)),fit_proxy('eyebrow001',brow,'Head'),fit_proxy('eyelashes02',lash,'Head'),fit_proxy(LOOK['hair'] if LOOK else 'ponytail01',hair,'Head')]

# ---- one skinned mesh ----
everything=[body,dress,sheer,skirt]+seams+trim_objs+parts+proxies
bpy.ops.object.select_all(action='DESELECT')
for o in everything:
 o.select_set(True)
 mod=o.modifiers.get('Armature') or o.modifiers.new('Armature','ARMATURE');mod.object=rig
 o.parent=rig
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
# ---- the blink ----
# The eye is a dome and the lids ride on it, so a blink turns each lid about the eye's
# centre. How far depends on the opening at that column, found by looking at the face
# from the front: it pinches to nothing at the corners, so they stay put. The upper lid
# does most of the travel, and the skin above it stretches, out to the brow.
def add_blink(obj):
 UPPER_SHARE=.78
 OVERLAP=math.radians(1.5)
 UPPER_REACH=math.radians(42)
 LOWER_REACH=math.radians(30)
 LID_LIFT=.0006
 LASH_LENGTH=.62 # the proxy's lashes are stage lashes at full length
 mesh=obj.data
 names=[m.name for m in mesh.materials]
 skin_i,eye_i,lash_i=names.index('Warm porcelain'),names.index('Eyes'),names.index('Lashes')
 def verts_of(i):return {v for p in mesh.polygons if p.material_index==i for v in p.vertices}
 eye_v,skin_v,lash_v=verts_of(eye_i),verts_of(skin_i),verts_of(lash_i)
 faces=[p for p in mesh.polygons if p.material_index in (skin_i,eye_i)]
 tree=BVHTree.FromPolygons([v.co for v in mesh.vertices],[tuple(p.vertices) for p in faces])
 # Lash cards, by connected piece: a whole card belongs to one lid.
 parent={i:i for i in lash_v}
 def find(i):
  while parent[i]!=i:
   parent[i]=parent[parent[i]];i=parent[i]
  return i
 for p in mesh.polygons:
  if p.material_index==lash_i:
   for a,b in zip(p.vertices,p.vertices[1:]):parent[find(a)]=find(b)
 pieces={}
 for i in lash_v:pieces.setdefault(find(i),[]).append(i)
 print('BLINK lash pieces',len(pieces))
 basis=obj.shape_key_add(name='Basis',from_mix=False)
 blink=obj.shape_key_add(name='Blink',from_mix=False)
 moved=0
 for sign in (1,-1):
  dome=[mesh.vertices[i].co for i in eye_v if (mesh.vertices[i].co.x>0)==(sign>0)]
  lo=Vector([min(p[k] for p in dome) for k in range(3)]);hi=Vector([max(p[k] for p in dome) for k in range(3)])
  R=(hi.x-lo.x)/2
  C=Vector(((lo.x+hi.x)/2,lo.y+R,(lo.z+hi.z)/2))
  def angle(p):return math.atan2(p.z-C.z,-(p.y-C.y))
  # Each column's opening, as angles about the eye's centre.
  STEP=.0005
  columns=[]
  for c in range(int(2*R/STEP)+1):
   x=C.x-R+c*STEP
   seen=[]
   for r in range(int(2*R/.00025)+1):
    z=C.z-R+r*.00025
    loc,_,face,_=tree.ray_cast(Vector((x,C.y-.06,z)),Vector((0,1,0)))
    if loc is not None and faces[face].material_index==eye_i:seen.append(angle(loc))
   columns.append((x,max(seen),min(seen)) if len(seen)>=2 else (x,None,None))
  open_at=[(x,up-low) if up is not None else (x,0.0) for x,up,low in columns]
  # A short moving average, so a mesh edge does not show as a notch along the lid.
  soft=[sum(open_at[j][1] for j in range(max(0,c-3),min(len(open_at),c+4)))/(min(len(open_at),c+4)-max(0,c-3)) for c in range(len(open_at))]
  known=[(x,up,low) for x,up,low in columns if up is not None]
  def at_column(x):
   f=(x-(C.x-R))/STEP
   c=max(0,min(len(soft)-2,int(f)));t=max(0,min(1,f-c))
   wide=soft[c]*(1-t)+soft[c+1]*t
   near=min(known,key=lambda k:abs(k[0]-x))
   return wide,near[1],near[2]
  def turned(p,by,lift):
   d=Vector((0,p.y-C.y,p.z-C.z))
   r=d.length+lift
   a=angle(p)-by
   return Vector((p.x,C.y-r*math.cos(a),C.z+r*math.sin(a)))
  # Lashes: shortened toward the lid's edge, then carried by a column further in than
  # their own, because their tips fan out past the corner, where the lid hardly travels.
  first,last=known[0][0],known[-1][0]
  for piece in pieces.values():
   if (mesh.vertices[piece[0]].co.x>0)!=(sign>0):continue
   is_upper=sum(mesh.vertices[i].co.z for i in piece)/len(piece)>C.z
   for i in piece:
    p=mesh.vertices[i].co.copy()
    x=max(first,min(last,p.x))
    wide,up,low=at_column(x)
    root=up if is_upper else low
    # Only what stands outward of the lid's edge shortens, measured on this column's
    # circle of the dome, which is smaller than the dome near the corners.
    out=(angle(p)-root)*(1 if is_upper else -1)
    # Anything the proxy left inside the opening goes back to the lid's edge: lashes grow
    # from the lid, and a root lying over the eye shows the sclera through the hairs.
    a=root+(angle(p)-root)*LASH_LENGTH if out>0 else root
    rim=math.sqrt(max(0,R*R-(x-C.x)**2))
    across=(p-Vector((p.x,C.y,C.z))).length
    r=rim+(across-rim)*LASH_LENGTH if across>rim else across
    x_short=x+(p.x-x)*LASH_LENGTH
    short=Vector((x_short,C.y-r*math.cos(a),C.z+r*math.sin(a)))
    mesh.vertices[i].co=short
    basis.data[i].co=short
    wide=at_column(C.x+(x-C.x)*.92)[0]
    by=wide*UPPER_SHARE+OVERLAP if is_upper else -(wide*(1-UPPER_SHARE)+OVERLAP)
    blink.data[i].co=turned(short,by,0)
    moved+=1
  for i in skin_v:
   p=mesh.vertices[i].co
   if (p.x>0)!=(sign>0) or p.y>C.y:continue
   wide,up,low=at_column(p.x)
   if wide<=0:continue
   dist=(p-C).length
   if dist<R*.97:continue
   # Fades out with distance too, so nothing moved sits beside something held.
   fade=max(0,min(1,(R*1.7-dist)/(R*.5)))
   if fade<=0:continue
   a=angle(p)
   upper_turn=wide*UPPER_SHARE+OVERLAP
   lower_turn=wide*(1-UPPER_SHARE)+OVERLAP
   if a>=(up+low)/2:
    w=fade*max(0,1-max(0,a-up)/UPPER_REACH)**1.2
    blink.data[i].co=turned(p,upper_turn*w,LID_LIFT*w)
   else:
    w=fade*max(0,1-max(0,low-a)/LOWER_REACH)**1.2
    blink.data[i].co=turned(p,-lower_turn*w,LID_LIFT*w)
   moved+=1
  print('BLINK eye %+d: centre %s radius %.4f, %d columns, widest opening %.1f degrees'%(sign,tuple(round(k,4) for k in C),R,len(known),math.degrees(max(soft))))
 print('BLINK moved %d vertices'%moved)
add_blink(bpy.context.view_layer.objects.active)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
source=ROOT/'assets/source';source.mkdir(parents=True,exist_ok=True)
# A rival is rebuilt from this script and its RIVALS entry; only the athlete keeps a .blend.
if not LOOK:
 bpy.ops.file.pack_all()
 bpy.ops.wm.save_as_mainfile(filepath=str(source/'skater-athlete.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{NAME}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=False,export_image_format='AUTO')
print('ATHLETE: %d polygons, height %.3f m'%(len(bpy.context.view_layer.objects['Athlete'].data.polygons) if 'Athlete' in bpy.context.view_layer.objects else -1,top_of_head))
