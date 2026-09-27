"""Reproducible Blender source asset. All geometry and materials are authored here."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/generated';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
skin=material('Warm porcelain',(.66,.43,.32),0,.48)
fabric=material('Midnight plum satin',(.025,.09,.14),.3,.29)
# The skirt and the legs carry their own slots (same colours as the bodice and
# the skin) so scripts/skater.gd can recolour them separately per costume.
skirt=material('Flowing skirt satin',(.025,.09,.14),.3,.29)
tights=material('Skin-tone tights',(.66,.43,.32),0,.48)
meshmat=material('Illusion sleeve',(.31,.23,.23),0,.53)
hair=material('Espresso hair',(.025,.014,.022),.12,.28)
white=material('Ivory leather boots',(.82,.83,.78),0,.36)
blade=material('Polished steel',(.48,.57,.63),.92,.14)
crystal=material('Champagne crystals',(.85,.72,.48),.75,.18)
eye=material('Eyes',(.015,.021,.027),0,.23)
parts=[]
def bind(obj,bone,mat):
 obj.data.materials.append(mat)
 bpy.context.view_layer.objects.active=obj
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for poly in obj.data.polygons:poly.use_smooth=True
 group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj)
 return obj
def ellipsoid(name,pos,size,mat,bone):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=pos)
 o=bpy.context.object;o.name=name;o.scale=size;return bind(o,bone,mat)
def tube(name,a,b,r1,r2,mat,bone,flatten=1):
 direction=Vector(b)-Vector(a);center=(Vector(a)+Vector(b))/2
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r1,radius2=r2,depth=direction.length,location=center)
 o=bpy.context.object;o.name=name;o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.scale.y=flatten
 return bind(o,bone,mat)
def rings(name,rows,mat,bone):
 verts=[];faces=[];count=48
 for z,rx,ry,cy in rows:
  for j in range(count):
   t=j*math.tau/count;verts.append((math.cos(t)*rx,cy+math.sin(t)*ry,z))
 for row in range(len(rows)-1):
  for j in range(count):faces.append((row*count+j,row*count+(j+1)%count,(row+1)*count+(j+1)%count,(row+1)*count+j))
 faces.extend([tuple(reversed(range(count))),tuple((len(rows)-1)*count+j for j in range(count))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return bind(o,bone,mat)
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0))
rig=bpy.context.object;rig.name='SkaterRig';arm=rig.data;arm.name='EdgeworkSkeleton';arm.edit_bones.remove(arm.edit_bones[0])
def bone(name,head,tail,parent=None):
 b=arm.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=arm.edit_bones[parent]
 return b
bone('Hips',(0,0,.85),(0,0,1.02))
bone('Spine',(0,0,1.02),(0,0,1.39),'Hips')
bone('Head',(0,0,1.39),(0,0,1.69),'Spine')
for side,sgn in [('L',-1),('R',1)]:
 bone('Thigh'+side,(sgn*.105,0,.89),(sgn*.105,-.02,.48),'Hips')
 bone('Shin'+side,(sgn*.105,-.02,.48),(sgn*.105,0,.105),'Thigh'+side)
 bone('Foot'+side,(sgn*.105,0,.105),(sgn*.105,-.18,.075),'Shin'+side)
 bone('Arm'+side,(sgn*.185,0,1.35),(sgn*.42,0,1.18),'Spine')
 bone('Forearm'+side,(sgn*.42,0,1.18),(sgn*.60,-.025,1.08),'Arm'+side)
bpy.ops.object.mode_set(mode='OBJECT')

# Continuous sculpted profiles, curved steel blades, sewn costume panels and
# hand-authored anatomy. Dimensions stay compatible with the solver-driven rig.
def mesh_object(name,verts,faces,mat,bone_name):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 return bind(obj,bone_name,mat)

def limb(name,a,b,profile,mat,bone_name):
 a,b=Vector(a),Vector(b);axis=(b-a).normalized()
 u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u).normalized()
 verts=[];faces=[];n=24
 for t,rx,ry in profile:
  center=a.lerp(b,t)
  for j in range(n):
   angle=j*math.tau/n;verts.append(tuple(center+u*math.cos(angle)*rx+v*math.sin(angle)*ry))
 for row in range(len(profile)-1):
  for j in range(n):faces.append((row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j))
 faces.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+j for j in range(n))])
 return mesh_object(name,verts,faces,mat,bone_name)

def curve(name,points,r,mat,bone_name):
 data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=r;data.bevel_resolution=2
 spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for p,co in zip(spline.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj
 obj.select_set(True);bpy.ops.object.convert(target='MESH');obj.select_set(False)
 return bind(obj,bone_name,mat)

# A continuous surface with blended bone weights replaces visible ball joints.
def articulated_surface(name,centers,radii,bone_a,bone_b,mat):
 verts=[];faces=[];n=32;count=len(centers)
 for i,center in enumerate(centers):
  center=Vector(center)
  tangent=(Vector(centers[min(i+1,count-1)])-Vector(centers[max(0,i-1)])).normalized()
  u=tangent.cross(Vector((0,1,0))).normalized();v=tangent.cross(u).normalized()
  for j in range(n):
   a=j*math.tau/n;verts.append(tuple(center+u*math.cos(a)*radii[i][0]+v*math.sin(a)*radii[i][1]))
 for i in range(count-1):
  for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
 obj=mesh_object(name,verts,faces,mat,bone_a)
 first=obj.vertex_groups[bone_a];first.remove(list(range(len(verts))));second=obj.vertex_groups.new(name=bone_b)
 for i in range(count):
  t=i/(count-1);w=max(0,min(1,(t-.4)/.24));w=w*w*(3-2*w)
  ids=list(range(i*n,(i+1)*n))
  if w<1:first.add(ids,1-w,'REPLACE')
  if w>0:second.add(ids,w,'REPLACE')
 return obj

# Rounded torso with an anatomical waist instead of a cylinder.
rings('Couture competition bodice',[(.84,.135,.09,0),(.90,.15,.105,0),(.96,.147,.098,0),(1.02,.127,.085,0),(1.09,.116,.080,0),(1.16,.129,.090,-.005),(1.23,.15,.102,-.005),(1.29,.17,.085,0),(1.33,.166,.074,0),(1.36,.12,.06,0),(1.38,.059,.047,0)],fabric,'Spine')
ellipsoid('Pelvis',(0,0,.89),(.137,.10,.11),skirt,'Hips')
# Fluted asymmetric chiffon hem, two layers and a sewn satin waistband.
for layer in range(2):
 verts=[];faces=[];n=96
 for row in range(8):
  t=row/7
  for j in range(n):
   a=j*math.tau/n;wave=math.sin(a*10)*.012*t*t
   rx=.146+t*.105+wave+layer*.006;ry=.108+t*.078+wave
   z=.955-t*.20+(math.cos(a+.5)*.035+math.sin(a*10)*.011)*t*t-layer*.012
   verts.append((math.cos(a)*rx,math.sin(a)*ry,z))
 for row in range(7):
  for j in range(n):faces.append((row*n+j,row*n+(j+1)%n,(row+1)*n+(j+1)%n,(row+1)*n+j))
 obj=mesh_object('Layered chiffon skirt '+str(layer),verts,faces,skirt,'Hips')
 for poly in obj.data.polygons:poly.use_smooth=True
curve('Crystal waist piping',[(math.cos(a)*.15,math.sin(a)*.11,.955) for a in [j*math.tau/48 for j in range(49)]],.0038,crystal,'Hips')
# V-front embroidery follows the material, not a floating graphic.
for side in [-1,1]:
 curve('Embroidered bodice seam',[(side*.14,-.07,1.31),(side*.10,-.092,1.23),(side*.06,-.086,1.11),(side*.015,-.093,1.0)],.003,crystal,'Spine')

limb('Neck',(0,0,1.34),(0,0,1.49),[(0,.049,.043),(.45,.041,.04),(1,.047,.041)],skin,'Head')
# Facial silhouette: brow, cheekbone and jaw taper are a single continuous surface.
rings('Sculpted face',[(1.452,.022,.028,-.02),(1.47,.041,.043,-.018),(1.49,.053,.057,-.012),(1.52,.068,.063,-.002),(1.555,.079,.066,0),(1.585,.076,.068,.005),(1.62,.071,.064,.01),(1.65,.061,.055,.015),(1.675,.035,.034,.018),(1.683,.003,.003,.018)],skin,'Head')
ellipsoid('Occipital hair',(0,.035,1.604),(.078,.070,.085),hair,'Head')
ellipsoid('Braided low bun',(0,.094,1.578),(.047,.038,.049),hair,'Head')
for j in range(9):
 a=j*math.tau/9
 ellipsoid('Bun braid',(math.cos(a)*.031,.10+math.sin(a)*.012,1.578+math.sin(a)*.033),(.017,.027,.014),hair,'Head')
for j in range(13):
 x=(j-6)*.011
 curve('Combed hair strand',[(x,-.030,1.647),(x*.93,.009,1.679),(x*.75,.058,1.655),(x*.45,.086,1.60)],.0013,crystal if j==6 else hair,'Head')
sclera=material('Eye whites',(.78,.79,.76),0,.25)
iris=material('Hazel iris',(.12,.19,.14),0,.26)
lips=material('Natural rose lip',(.39,.12,.13),0,.4)
for side in [-1,1]:
 x=side*.031
 ellipsoid('Eye socket',(x,-.0585,1.572),(.021,.010,.012),skin,'Head')
 ellipsoid('Eye white',(x,-.0665,1.573),(.016,.005,.007),sclera,'Head')
 ellipsoid('Iris',(x,-.071,1.573),(.0065,.002,.0065),iris,'Head')
 ellipsoid('Pupil',(x,-.073,1.573),(.003,.001,.004),eye,'Head')
 curve('Upper eyelid',[(x-.015,-.066,1.571),(x,-.072,1.580),(x+.015,-.066,1.574)],.0016,hair,'Head')
 curve('Sculpted eyebrow',[(x-.017,-.064,1.594),(x,-.066,1.599),(x+.014,-.062,1.595)],.0023,hair,'Head')
 ellipsoid('Ear',(side*.078,.005,1.555),(.013,.010,.023),skin,'Head')
 ellipsoid('Crystal earring',(side*.081,.002,1.535),(.004,.004,.007),crystal,'Head')
ellipsoid('Nose bridge',(0,-.065,1.556),(.009,.009,.026),skin,'Head')
ellipsoid('Nose tip',(0,-.078,1.545),(.012,.010,.009),skin,'Head')
curve('Upper lip',[(-.019,-.063,1.519),(-.008,-.069,1.523),(0,-.071,1.521),(.008,-.069,1.523),(.019,-.063,1.519)],.0025,lips,'Head')
ellipsoid('Lower lip',(0,-.066,1.514),(.016,.004,.003),lips,'Head')

for side,sgn in [('L',-1),('R',1)]:
 hip=(sgn*.105,0,.89);knee=(sgn*.105,-.02,.48);ankle=(sgn*.105,0,.105)
 centers=[];radii=[]
 for j in range(21):
  t=j/20;z=.89-t*.785
  y=-.02*math.sin(t*math.pi)
  centers.append((sgn*.105,y,z))
  # Profile travels hip -> thigh -> knee -> calf -> ankle.
  keys=[(0,.071,.064),(.2,.073,.063),(.38,.055,.050),(.50,.043,.042),(.62,.045,.047),(.74,.039,.043),(.90,.027,.026),(1,.025,.024)]
  for k in range(len(keys)-1):
   lo,hi=keys[k],keys[k+1]
   if lo[0]<=t<=hi[0]:
    f=(t-lo[0])/(hi[0]-lo[0]);radii.append((lo[1]+(hi[1]-lo[1])*f,lo[2]+(hi[2]-lo[2])*f));break
 articulated_surface('Continuous leg '+side,centers,radii,'Thigh'+side,'Shin'+side,tights)
 # Leather skating boots, heel, tongue, laces and curved blade with toe teeth.
 ellipsoid('Leather boot '+side,(sgn*.105,-.04,.09),(.041,.10,.05),white,'Foot'+side)
 limb('Boot ankle '+side,(sgn*.105,0,.08),(sgn*.105,.007,.205),[(0,.043,.039),(.4,.039,.038),(1,.033,.032)],white,'Foot'+side)
 sole=material('Stacked leather heel '+side,(.21,.16,.12),0,.6)
 ellipsoid('Boot sole '+side,(sgn*.105,-.04,.050),(.043,.099,.009),sole,'Foot'+side)
 ellipsoid('Raised heel '+side,(sgn*.105,.022,.039),(.03,.037,.015),sole,'Foot'+side)
 for j in range(8):
  z=.095+j*.012;y=-.07+j*.004
  curve('Crossed boot lace',[(sgn*.105-.018,y,z),(sgn*.105+.018,y-.005,z+.010)],.0013,white,'Foot'+side)
  curve('Crossed boot lace',[(sgn*.105+.018,y,z),(sgn*.105-.018,y-.005,z+.010)],.0013,white,'Foot'+side)
 verts=[];faces=[]
 for j in range(25):
  t=j/24;y=-.148+t*.235;z=.012+.013*((t-.52)*2)**2
  verts.extend([(sgn*.105-.002,y,z),(sgn*.105+.002,y,z),(sgn*.105-.002,y,z+.012),(sgn*.105+.002,y,z+.012)])
 for j in range(24):
  for a,b in [(0,1),(0,2),(1,3),(2,3)]:faces.append((j*4+a,(j+1)*4+a,(j+1)*4+b,j*4+b))
 mesh_object('Rocker steel blade '+side,verts,faces,blade,'Foot'+side)
 for y in [-.075,.035]:limb('Blade stanchion',(sgn*.105,y,.022),(sgn*.105,y,.065),[(0,.004,.008),(1,.004,.012)],blade,'Foot'+side)
 for j in range(5):tube('Toe pick tooth',(sgn*.105,-.142-j*.002,.038+j*.004),(sgn*.105,-.153-j*.002,.034+j*.004),.002,.0008,blade,'Foot'+side)
 shoulder=(sgn*.18,0,1.35);elbow=(sgn*.42,0,1.18);wrist=(sgn*.60,-.025,1.08)
 centers=[];radii=[]
 for j in range(21):
  t=j/20
  a,b=(Vector(shoulder),Vector(elbow)) if t<.55 else (Vector(elbow),Vector(wrist))
  f=t/.55 if t<.55 else (t-.55)/.45
  centers.append(tuple(a.lerp(b,f)))
  radius=.045*(1-t)+.018*t
  radii.append((radius,radius*.95))
 articulated_surface('Continuous sleeve '+side,centers,radii,'Arm'+side,'Forearm'+side,meshmat)
 ellipsoid('Shoulder blend '+side,shoulder,(.047,.049,.052),meshmat,'Arm'+side)
 ellipsoid('Hand '+side,(sgn*.624,-.026,1.064),(.031,.013,.020),skin,'Forearm'+side)
 for finger in range(4):
  y=-.04+finger*.009;length=[.037,.046,.044,.034][finger]
  start=(sgn*.637,y,1.055);end=(sgn*(.637+length),y-.004,1.036)
  limb('Finger '+side+str(finger),start,end,[(0,.0045,.004),(1,.0028,.003)],skin,'Forearm'+side)
 limb('Thumb '+side,(sgn*.618,-.045,1.07),(sgn*.647,-.066,1.043),[(0,.006,.005),(1,.004,.004)],skin,'Forearm'+side)
 for j in range(14):
  t=j/13;a=Vector(shoulder).lerp(Vector(wrist),t);a.y-=.036
  ellipsoid('Sleeve crystal',a,(.0025,.0025,.0025),crystal,'Arm'+side if t<.55 else 'Forearm'+side)
for row in range(18):
 z=.99+row*.019;rx=.12+max(0,z-1.10)*.22
 for col in range(13):
  if (row+col)%3==0:continue
  t=-math.pi/2+(col-6)*.135
  x=rx*math.cos(t);y=.102*math.sin(t)-.005
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.0028 if col%2 else .0038,location=(x,y,z));bind(bpy.context.object,'Spine',crystal)
# Keep one renderer with shared material slots and all named weights.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Competition athlete'
modifier=body.modifiers.new('Skating skeleton','ARMATURE');modifier.object=rig;body.parent=rig
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
source=ROOT/'assets/source';source.mkdir(parents=True,exist_ok=True);(source/'.gdignore').touch()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'skater-competition.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'skater-competition.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
print('COMPETITION_SKATER: '+str(len(body.data.polygons))+' polygons; '+str(OUT/'skater-competition.glb'))
