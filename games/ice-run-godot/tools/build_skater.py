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
skin=material('Warm porcelain',(.62,.39,.28),0,.45)
fabric=material('Midnight plum satin',(.075,.035,.145),.24,.26)
meshmat=material('Illusion sleeve',(.33,.20,.22),0,.6)
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
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=pos)
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
rings('Tailored bodice',[(.84,.15,.105,0),(.94,.155,.10,0),(1.07,.115,.09,0),(1.22,.155,.10,0),(1.31,.178,.092,0),(1.37,.13,.074,0)],fabric,'Spine')
rings('Flowing skirt',[(.97,.145,.108,0),(.90,.17,.13,0),(.80,.24,.185,0),(.73,.28,.215,0)],fabric,'Hips')
ellipsoid('Pelvis',(0,0,.89),(.145,.105,.13),fabric,'Hips')
tube('Neck',(0,0,1.36),(0,0,1.48),.046,.044,skin,'Head')
ellipsoid('Face',(0,-.004,1.56),(.084,.078,.115),skin,'Head')
ellipsoid('Jaw',(0,-.014,1.50),(.056,.061,.059),skin,'Head')
ellipsoid('Hair cap',(0,.019,1.602),(.087,.075,.085),hair,'Head')
ellipsoid('Sculpted bun',(0,.092,1.628),(.055,.048,.052),hair,'Head')
ellipsoid('Nose',(0,-.078,1.554),(.012,.017,.019),skin,'Head')
for x in [-.032,.032]:
 ellipsoid('Eye',(x,-.073,1.578),(.014,.005,.008),eye,'Head')
 tube('Brow',(x-.014,-.077,1.594),(x+.012,-.076,1.597),.0028,.0024,hair,'Head')
ellipsoid('Lip',(0,-.074,1.521),(.022,.004,.0045),material('Rose lips',(.37,.10,.12),0,.45),'Head')
for side,sgn in [('L',-1),('R',1)]:
 hip=(sgn*.105,0,.88);knee=(sgn*.105,-.02,.48);ankle=(sgn*.105,0,.105)
 tube('Thigh'+side,knee,hip,.052,.08,skin,'Thigh'+side)
 ellipsoid('Knee'+side,knee,(.052,.047,.051),skin,'Shin'+side)
 tube('Calf'+side,ankle,knee,.031,.051,skin,'Shin'+side)
 ellipsoid('Boot'+side,(sgn*.105,-.037,.095),(.043,.105,.06),white,'Foot'+side)
 tube('Ankle boot'+side,(sgn*.105,0,.095),(sgn*.105,0,.19),.043,.037,white,'Foot'+side)
 tube('Blade rail'+side,(sgn*.105,-.14,.027),(sgn*.105,.066,.027),.008,.008,blade,'Foot'+side)
 for y in [-.07,.035]:tube('Blade stanchion'+side,(sgn*.105,y,.032),(sgn*.105,y,.065),.008,.008,blade,'Foot'+side)
 shoulder=(sgn*.18,0,1.35);elbow=(sgn*.42,0,1.18);wrist=(sgn*.60,-.025,1.08)
 ellipsoid('Shoulder'+side,shoulder,(.048,.055,.062),meshmat,'Arm'+side)
 tube('Upper arm'+side,elbow,shoulder,.032,.045,meshmat,'Arm'+side)
 tube('Forearm'+side,wrist,elbow,.024,.032,meshmat,'Forearm'+side)
 ellipsoid('Hand'+side,(sgn*.63,-.028,1.065),(.046,.023,.02),skin,'Forearm'+side)
 for j in range(5):
  y=-.085+j*.015
  tube('Boot laces'+side,(sgn*.105-.028,y,.145),(sgn*.105+.028,y,.145),.002,.002,white,'Foot'+side)
# Deliberately placed crystal motif follows the bodice's contours.
for row in range(12):
 z=1.0+row*.028;rx=.118+max(0,z-1.1)*.24
 for col in range(9):
  t=-math.pi/2+(col-4)*.17
  if (row+col)%3==0:continue
  x=rx*math.cos(t);y=.103*math.sin(t)-.004
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.0038,location=(x,y,z));bind(bpy.context.object,'Spine',crystal)
# Join keeps material slots and named vertex weights intact.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='Violet'
modifier=body.modifiers.new('Skating skeleton','ARMATURE');modifier.object=rig
body.parent=rig
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
source=ROOT/'assets/source';source.mkdir(parents=True,exist_ok=True);(source/'.gdignore').touch()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'skater.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'skater.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
print('Authored Blender skater: '+str(OUT/'skater.glb'))
