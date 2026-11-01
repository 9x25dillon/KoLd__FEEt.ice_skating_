"""The competition athlete, rebuilt on MakeHuman's CC0 anatomy (assets/source/makehuman).

  blender --background --python games/ice-run-godot/tools/build_athlete.py

Builds to the same bone names as tools/build_skater.py, with one difference that
matters: L bones rest on the anatomical left, so a pose never drags skin across
the body. The dress, boots and sleeves are cut from the body's own surface."""
import bpy, bmesh, math, random
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[1]
MH=ROOT/'assets/source/makehuman'
OUT=ROOT/'assets/generated'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
random.seed(20261101)

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
for name,weight in [('caucasian-female-young',1),('universal-female-young-averagemuscle-averageweight',.4),('universal-female-young-averagemuscle-minweight',.35),('universal-female-young-maxmuscle-minweight',.25),('female-young-averagemuscle-averageweight-idealproportions',.5)]:
 for line in open(MH/(name+'.target')):
  if line[0]=='#' or not line.strip():continue
  p=line.split();base[int(p[0])]=base[int(p[0])]+Vector(map(float,p[1:4]))*weight
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
def fit_proxy(stem,mat,bone):
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
SKIN='young_lightskinned_female_diffuse.png'
skin=material('Warm porcelain',(1,1,1),0,.46,SKIN)
tights=material('Skin-tone tights',(1,1,1),0,.34,SKIN)
bodice=material('Midnight plum satin',(.025,.09,.14),.12,.3)
skirt_mat=material('Flowing skirt satin',(.025,.09,.14),.12,.3)
sleeve=material('Illusion sleeve',(.31,.23,.23),0,.53)
hair=material('Espresso hair',(1,1,1),0,.42,'ponytail01_diffuse.png',True)
crystal=material('Champagne crystals',(.85,.72,.48),.75,.18)
leather=material('Ivory leather boots',(.86,.85,.80),0,.32)
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

def carve(source,name,keep,offset,mat,smooth=0,edge=None):
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
# A sweetheart front and a low scooped back: skaters' necklines.
def neckline(x,y):
 if y<0:return collar_z-.075-.05*(1-min(1,abs(x)/.11)**2)
 return collar_z-.16+.09*min(1,abs(x)/.16)
def is_bodice(f):
 c=centre(f)
 if face_mean(f,'ArmL','ArmR','ForearmL','ForearmR','HandL','HandR')>.5 or face_mean(f,'Head')>.25:return False
 if c.z<hip_l.z-.06-.03*min(1,abs(c.x)/.13):return False
 return c.z<neckline(c.x,c.y)
def clean_neckline(v):
 # The mesh's own rows cut a sawtooth; the boundary is laid onto the line itself.
 if abs(v.co.x)<.145 and v.co.z>waist.z+.05:v.co.z=neckline(v.co.x,v.co.y)
def is_sleeve(f):
 return face_mean(f,'ArmL','ArmR','ForearmL','ForearmR')>.5 and face_mean(f,'HandL','HandR')<.4
boot_top=ankle_z+.125
def is_boot(f):return centre(f).z<boot_top
dress=carve(body,'Bodice',is_bodice,.0035,bodice,edge=clean_neckline)
sheer=carve(body,'Sleeves',is_sleeve,.0022,sleeve)
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

def stream(obj):
 for poly in obj.data.polygons:poly.use_smooth=True
for o in (dress,sheer,boots,body):stream(o)
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

# ---- skirt: it starts at the waist of this body and clears this body's hips ----
body_tree=[v.co.copy() for v in deform]
def radial_at(z,theta,band=.018):
 best=0
 d=Vector((math.cos(theta),math.sin(theta)))
 for p in dress_points:
  if abs(p.z-z)<band:
   flat=Vector((p.x,p.y))
   if flat.length>1e-4 and flat.normalized().dot(d)>.985:best=max(best,flat.length)
 return best
dress_points=[v.co.copy() for v in dress.data.vertices]
SEGS,ROWS=144,12
PANELS=16 # skater.gd swings these: Skirt00.. hang from the waist
hem_z=hip_l.z-.205
skirt_v,skirt_f,skirt_w=[],[],[]
hip_r=[radial_at(hip_l.z-.03,2*math.pi*s/SEGS,.03) or .15 for s in range(SEGS)]
skirt_top=hip_l.z+.085
waist_r=[radial_at(skirt_top,2*math.pi*s/SEGS) or .12 for s in range(SEGS)]
# Slow, uneven drape rather than a repeating pleat.
drape=[(random.uniform(.003,.008),random.randint(3,9),random.uniform(0,6.28)) for _ in range(5)]
for layer,(drop,flare) in enumerate(((0,.085),(-.022,.06))):
 first=len(skirt_v)
 for j in range(ROWS+1):
  t=j/ROWS
  for s in range(SEGS):
   a=2*math.pi*s/SEGS
   # Knife pleats deepening to the hem, longer behind than in front.
   back=max(0,math.sin(a))
   z=skirt_top+((hem_z-drop-.02*back)-skirt_top)*t
   clear=max(waist_r[s]+.004,hip_r[s]+.012)
   r=waist_r[s]+.004+(clear-waist_r[s]-.004)*min(1,t*3)+flare*(t**1.25)+sum(amp*math.sin(a*n+ph+layer) for amp,n,ph in drape)*t**1.2
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
 a=2*math.pi*s/SEGS;r=waist_r[s]+.0062
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
 # Laces crossing the front of the boot.
 boot_side=[p.co for p in boots.data.vertices if (p.co.x>0)==(sign>0)]
 def surface(s,wd,z):
  target=at(s,wd,z);best=max((p for p in boot_side if abs((p-ankle).dot(lateral)-wd)<.012 and abs(p.z-z)<.012),key=lambda p:(p-ankle).dot(forward),default=target)
  return best-forward*-.0025
 v,f,w=[],[],[]
 for k in range(8):
  z=ankle_z-.022+k*.019
  for wa,wb in ((-.017,.017),(.017,-.017)):
   a=surface(.0,wa,z);b=surface(.0,wb,z+.016)
   base_i=len(v)
   u=(b-a).normalized();n=u.cross(forward).normalized()*.0012;m=u.cross(n).normalized()*.0012
   for c in (a,b):
    v.extend([c+n,c+m,c-n,c-m]);w.extend([foot_w]*4)
   for j in range(4):
    p=(j+1)%4
    f.append((base_i+j,base_i+p,base_i+4+p,base_i+4+j))
 parts.append(own_mesh('Laces '+side,v,f,leather,w))
# The boot itself is rigid below the ankle.
for v in boots.data.vertices:
 share={names[g.group]:g.weight for g in v.groups}
 side='L' if v.co.x>0 else 'R'
 blend=max(0,min(1,(v.co.z-ankle_z+.01)/.1))
 for g in list(v.groups):boots.vertex_groups[g.group].remove([v.index])
 (boots.vertex_groups.get('Foot'+side) or boots.vertex_groups.new(name='Foot'+side)).add([v.index],1-blend,'REPLACE')
 (boots.vertex_groups.get('Shin'+side) or boots.vertex_groups.new(name='Shin'+side)).add([v.index],blend,'REPLACE')
# Flat under the foot, so the toes under the leather never read.
for v in boots.data.vertices:v.co.z=max(v.co.z,SOLE+.004)

# ---- face and hair ----
proxies=[fit_proxy('high-poly',eye,'Head'),fit_proxy('eyebrow001',brow,'Head'),fit_proxy('eyelashes02',lash,'Head'),fit_proxy('ponytail01',hair,'Head')]

# ---- one skinned mesh ----
everything=[body,dress,sheer,boots,skirt]+trim_objs+parts+proxies
bpy.ops.object.select_all(action='DESELECT')
for o in everything:
 o.select_set(True)
 mod=o.modifiers.get('Armature') or o.modifiers.new('Armature','ARMATURE');mod.object=rig
 o.parent=rig
bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
rig.select_set(True);bpy.context.view_layer.objects.active=rig
source=ROOT/'assets/source';source.mkdir(parents=True,exist_ok=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'skater-athlete.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'skater-athlete.glb'),export_format='GLB',use_selection=True,export_animations=False,export_apply=False,export_image_format='AUTO')
print('ATHLETE: %d polygons, height %.3f m'%(len(bpy.context.view_layer.objects['Athlete'].data.polygons) if 'Athlete' in bpy.context.view_layer.objects else -1,top_of_head))
