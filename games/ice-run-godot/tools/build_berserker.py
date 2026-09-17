"""Reproducible Blender source asset: a second, selectable skater.

Same rig as build_skater.py, deliberately: scripts/skater.gd poses exactly
Hips, Spine, Head, Thigh/Shin/Foot L/R, Arm/Forearm L/R, every frame, straight
from the physics sim, by bone name. A different-looking skater only works if
it answers to the same names at the same joints — so this script reuses
build_skater.py's own armature block verbatim (see its comments) rather than
inventing a second skeleton, and builds the armor plates as ordinary
single-bone vertex groups the same way build_skater.py's bind() does, joined
into one mesh. That keeps this on the exact glTF/Godot import path the
existing character already proves works, rather than trying a second one
(Blender's per-object "Bone parent," which the armour in the operator's own
draft script used) at the same time as a new character's proportions.
"""
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
steel=material('Blackened plate',(0.018,0.020,0.026),.92,.32)
trim=material('Worn edge steel',(0.065,0.066,0.075),.88,.42)
cloth=material('Undersuit',(0.014,0.012,0.017),0,.85)
leather=material('Strap leather',(0.032,0.022,0.019),0,.68)
skin=material('Pale',(0.52,0.42,0.37),0,.55)
blade=material('Berserker blade steel',(0.46,0.55,0.61),.92,.14)
glow=material('Eye slit',(0.55,0.08,0.04),.1,.3)
parts=[]
def bind(obj,bone,mat):
 obj.data.materials.append(mat)
 bpy.context.view_layer.objects.active=obj
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for poly in obj.data.polygons:poly.use_smooth=True
 group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj)
 return obj
def ellipsoid(name,pos,size,mat,bone,segments=20,rings=12):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos)
 o=bpy.context.object;o.name=name;o.scale=size;return bind(o,bone,mat)
def tube(name,a,b,r1,r2,mat,bone,flatten=1,vertices=20):
 direction=Vector(b)-Vector(a);center=(Vector(a)+Vector(b))/2
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=direction.length,location=center)
 o=bpy.context.object;o.name=name;o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.scale.y=flatten
 return bind(o,bone,mat)
def plate(name,pos,size,mat,bone,rot=(0,0,0),bevel=.012):
 bpy.ops.mesh.primitive_cube_add(location=pos,rotation=rot)
 o=bpy.context.object;o.name=name;o.scale=size
 bpy.context.view_layer.objects.active=o
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=o.modifiers.new('Bevel','BEVEL');m.width=bevel;m.segments=2;m.limit_method='ANGLE'
 bpy.ops.object.modifier_apply(modifier=m.name)
 return bind(o,bone,mat)

# ---- Skeleton: identical to build_skater.py, so scripts/skater.gd (which
# poses bones by these exact names, every frame, from the physics state) does
# not need to change at all. Do not rename or reposition these without also
# checking games/ice-run-godot/scripts/skater.gd's aim_bone() calls. ----
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0))
rig=bpy.context.object;rig.name='BerserkerRig';arm=rig.data;arm.name='EdgeworkSkeletonBerserker';arm.edit_bones.remove(arm.edit_bones[0])
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

# ---- Undersuit: the same cloth-tube-per-limb idea build_skater.py's skin
# parts use, dark instead of bare, so nothing shows through the armor gaps. ----
tube('Torso suit',(0,0,.98),(0,0,1.40),.155,.175,cloth,'Spine',flatten=.72)
ellipsoid('Pelvis suit',(0,0,.89),(.155,.115,.14),cloth,'Hips')
tube('Neck',(0,0,1.36),(0,0,1.50),.05,.048,skin,'Head')
for side,sgn in [('L',-1),('R',1)]:
 hip=(sgn*.105,0,.89);knee=(sgn*.105,-.02,.48);ankle=(sgn*.105,0,.105)
 tube('Thigh suit'+side,knee,hip,.062,.09,cloth,'Thigh'+side)
 tube('Calf suit'+side,ankle,knee,.045,.062,cloth,'Shin'+side)
 shoulder=(sgn*.185,0,1.35);elbow=(sgn*.42,0,1.18);wrist=(sgn*.60,-.025,1.08)
 tube('Upper suit'+side,elbow,shoulder,.042,.052,cloth,'Arm'+side)
 tube('Fore suit'+side,wrist,elbow,.034,.042,cloth,'Forearm'+side)

# ---- Helmet: a closed, faceless skull with an eye slit and swept fins,
# proportioned to the Head bone's own .30 m length rather than the operator's
# draft (which was authored for a taller, unrelated skeleton). ----
ellipsoid('Helmet dome',(0,-.006,1.565),(.098,.088,.125),steel,'Head')
plate('Helmet jaw',(0,-.084,1.475),(.062,.028,.032),trim,'Head',rot=(math.radians(-10),0,0))
plate('Helmet brow',(0,-.088,1.615),(.070,.020,.014),trim,'Head',rot=(math.radians(8),0,0))
ellipsoid('Eye slit',(0,-.093,1.575),(.052,.006,.010),glow,'Head')
for side,sgn in [('L',-1),('R',1)]:
 tube('Helmet fin'+side,(sgn*.05,.01,1.66),(sgn*.155,-.01,1.86),.026,.003,steel,'Head')
tube('Helmet crest',(0,.06,1.63),(0,.03,1.92),.03,.004,trim,'Head')

# ---- Chest: a plated core, a sternum ridge, ribs stepping down toward the
# waist, and a short row of spines up the back — bound to Spine throughout,
# the same single-bone choice build_skater.py's own chest rings use. ----
plate('Chest core',(0,-.145,1.20),(.155,.095,.175),steel,'Spine',rot=(math.radians(-4),0,0))
plate('Sternum ridge',(0,-.245,1.20),(.032,.018,.155),trim,'Spine')
for i,z in enumerate((1.32,1.24,1.15)):
 w=.145-i*.018
 plate(f'Rib plate {i+1}',(0,-.185,z),(w,.020,.032),trim,'Spine',rot=(math.radians(-5+i*2),0,0))
for i,z in enumerate((1.07,1.00,.93)):
 plate(f'Ab plate {i+1}',(0,-.135,z),(.105-i*.008,.024,.032),steel,'Hips' if z<1.02 else 'Spine')
for i,z in enumerate((1.31,1.22,1.13,1.04,.96)):
 tube(f'Back spine {i+1}',(0,.13,z),(0,.05+i*.01,z+.10),.024,.002,trim,'Spine' if z>=1.0 else 'Hips')

# ---- Waist ----
tube('Belt',(0,0,.965),(0,0,1.015),.165,.165,leather,'Hips')
for side,sgn in [('L',-1),('R',1)]:
 plate(f'Hip plate {side}',(sgn*.125,-.01,.80),(.062,.06,.115),trim,'Hips',rot=(0,math.radians(8*sgn),math.radians(-5*sgn)))

# ---- Arms: pauldron and a spike, a banded bicep and vambrace, a clawed
# gauntlet — all bound to Arm/Forearm, the same two bones skater.gd poses. ----
for side,sgn in [('L',-1),('R',1)]:
 shoulder=(sgn*.185,0,1.35);elbow=(sgn*.42,0,1.18);wrist=(sgn*.60,-.025,1.08)
 ellipsoid(f'Pauldron {side}',shoulder,(.098,.085,.088),steel,'Arm'+side)
 tube(f'Pauldron spike {side}',(sgn*.24,.01,1.40),(sgn*.36,-.01,1.56),.032,.003,trim,'Arm'+side)
 tube(f'Bicep band {side}',elbow,shoulder,.056,.072,trim,'Arm'+side)
 tube(f'Vambrace {side}',wrist,elbow,.048,.062,steel,'Forearm'+side)
 ellipsoid(f'Gauntlet {side}',(sgn*.615,-.03,1.065),(.052,.038,.044),steel,'Forearm'+side)
 for finger in range(3):
  y=-.045+finger*.03
  tube(f'Claw {side} {finger+1}',(sgn*.63,y-.03,1.045),(sgn*.72,y-.05,.985),.010,.001,blade,'Forearm'+side)

# ---- Legs: thigh guard, a knee cap, a spiked greave, then the boot and
# blade — the boot/blade block is build_skater.py's own geometry, unchanged,
# so the skate sits on the ice exactly where the existing one does. ----
for side,sgn in [('L',-1),('R',1)]:
 hip=(sgn*.105,0,.88);knee=(sgn*.105,-.02,.48);ankle=(sgn*.105,0,.105)
 tube(f'Thigh guard {side}',knee,hip,.075,.105,steel,'Thigh'+side)
 ellipsoid(f'Knee {side}',knee,(.062,.055,.058),trim,'Shin'+side)
 tube(f'Greave {side}',ankle,knee,.052,.072,steel,'Shin'+side)
 tube(f'Greave spike {side}',(sgn*.105,-.06,.30),(sgn*.105,-.16,.42),.020,.002,trim,'Shin'+side)
 ellipsoid(f'Boot {side}',(sgn*.105,-.037,.095),(.048,.11,.062),leather,'Foot'+side)
 tube(f'Ankle boot {side}',(sgn*.105,0,.095),(sgn*.105,0,.19),.048,.04,leather,'Foot'+side)
 tube(f'Blade rail {side}',(sgn*.105,-.14,.027),(sgn*.105,.066,.027),.008,.008,blade,'Foot'+side)
 for y in (-.07,.035):
  tube(f'Blade stanchion {side}',(sgn*.105,y,.032),(sgn*.105,y,.065),.008,.008,blade,'Foot'+side)

bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='BlackBerserker'
modifier=body.modifiers.new('Skating skeleton','ARMATURE');modifier.object=rig
body.parent=rig
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
source=ROOT/'assets/source';source.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source/'skater-berserker.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'skater-berserker.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
print('Authored Blender skater: '+str(OUT/'skater-berserker.glb'))
