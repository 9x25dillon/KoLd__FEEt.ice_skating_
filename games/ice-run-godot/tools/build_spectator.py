"""One seated spectator for the arena's instanced crowd, from MakeHuman's CC0 mesh.

  blender --background --python games/ice-run-godot/tools/build_spectator.py

The neutral body is bent into a chair by hand-rolled joint rotations, feet on the floor,
and decimated to a few hundred triangles. Its measurements print for shaders/crowd.gdshader
and arena.gd, which have to agree with them."""
import bpy, math
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
MH=ROOT/'assets/source/makehuman'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
verts,faces,groups=[],[],{}
group=None
for line in open(MH/'base.obj'):
 if line.startswith('v '):verts.append(Vector(map(float,line.split()[1:4]))*.1)
 elif line.startswith('g '):group=line.split()[1]
 elif line.startswith('f '):
  faces.append([int(p.split('/')[0])-1 for p in line.split()[1:]])
  groups.setdefault(group,[]).append(len(faces)-1)
def joint(name):
 ids={i for f in groups['joint-'+name] for i in faces[f]}
 return sum((verts[i] for i in ids),Vector())/len(ids)
hip=joint('l-upper-leg');knee=joint('l-knee');shoulder=joint('l-shoulder');elbow=joint('l-elbow')
def turned(p,pivot,axis,angle):return Matrix.Rotation(angle,3,axis)@(p-pivot)+pivot
def ramp(a,b,x):return max(0,min(1,(x-a)/(b-a)))
FOLD=1.5
out=[]
for v in verts:
 p=v.copy();sign=1 if p.x>=0 else -1
 # Arms come down to the lap: rotated about the shoulder, then the elbow.
 if abs(p.x)>shoulder.x-.02 and p.y>hip.y-.1:
  piv=Vector((sign*shoulder.x,shoulder.y,shoulder.z))
  w=ramp(shoulder.x-.02,shoulder.x+.04,abs(p.x))
  p=turned(p,piv,Vector((0,0,1)),sign*-.72*w)
  p=turned(p,piv,Vector((1,0,0)),-.35*w)
 # The thigh folds forward at the hip into a chair; what is under it is cut below.
 w=ramp(hip.y+.03,hip.y-.05,v.y)
 if w>0 and abs(v.x)<.4:p=turned(p,Vector((p.x,hip.y,hip.z)),Vector((1,0,0)),-FOLD*w)
 # The shin folds back the same way at the knee, so the foot is on the floor.
 bend=ramp(knee.y+.035,knee.y-.035,v.y)
 if bend>0 and abs(v.x)<.4:
  folded=turned(Vector((p.x,knee.y,knee.z)),Vector((p.x,hip.y,hip.z)),Vector((1,0,0)),-FOLD)
  p=turned(p,folded,Vector((1,0,0)),FOLD*bend)
 out.append(p)
# Each arm is its own piece: a cheer swings it about the shoulder as a rigid part,
# where bending one continuous low-poly mesh that far tears it into spikes.
reach=(shoulder-elbow).length*2.2
def is_arm(ids):return all(abs(verts[i].x)>shoulder.x-.015 and verts[i].y>hip.y-.1 for i in ids)
pieces={'body':[],'left':[],'right':[]}
for f in groups['body']:
 ids=faces[f]
 if is_arm(ids):pieces['left' if verts[ids[0]].x>0 else 'right'].append(ids)
 else:pieces['body'].append(ids)
placed=lambda i:Vector((out[i].x,-out[i].z,out[i].y))
lowest=min(placed(i).z for ids in pieces['body'] for i in ids)
objects=[]
for name,rows in pieces.items():
 used={};v2=[];f2=[]
 for ids in rows:
  row=[]
  for i in ids:
   if i not in used:
    used[i]=len(v2);p=placed(i);p.z-=lowest;v2.append(p)
   row.append(used[i])
  f2.append(row)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(v2,[],f2);mesh.update()
 # UV: x marks an arm, y how far along it the point is, shoulder to fingertips.
 layer=mesh.uv_layers.new(name='UVMap')
 pivot=placed(0)*0
 if name!='body':
  sign=1 if name=='left' else -1
  q=Vector((sign*shoulder.x,-shoulder.z,shoulder.y-lowest))
  for loop in mesh.loops:
   layer.data[loop.index].uv=(1,min(1,(mesh.vertices[loop.vertex_index].co-q).length/reach))
 else:
  for data in layer.data:data.uv=(0,0)
 for poly in mesh.polygons:poly.use_smooth=True
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 bpy.context.view_layer.objects.active=obj;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 mod=obj.modifiers.new('fewer','DECIMATE');mod.ratio=.032 if name=='body' else .05
 bpy.ops.object.modifier_apply(modifier='fewer')
 objects.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.join()
obj=objects[0];obj.name='Spectator'
under=min(placed(i).z-lowest for ids in pieces['body'] for i in ids if knee.y+.05<verts[i].y<hip.y)
print('SPECTATOR: %d triangles; shoulder x %.3f y %.3f z %.3f; neck y %.3f; hip y %.3f; seat under thigh y %.3f; top y %.3f'%(sum(len(p.vertices)-2 for p in obj.data.polygons),shoulder.x,shoulder.y-lowest,-shoulder.z,joint('neck').y-lowest,hip.y-lowest,under,max(v.co.z for v in obj.data.vertices)))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/generated/spectator.glb'),export_format='GLB',use_selection=True,export_animations=False,export_materials='NONE')
