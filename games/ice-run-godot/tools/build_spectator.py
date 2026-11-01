"""One seated spectator for the arena's instanced crowd, from MakeHuman's CC0 mesh.

  blender --background --python games/ice-run-godot/tools/build_spectator.py

The neutral body is bent into a chair by hand-rolled joint rotations, cut off below
the knee (the row in front hides the rest) and decimated to a few hundred triangles."""
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
 if w>0 and abs(v.x)<.4:p=turned(p,Vector((p.x,hip.y,hip.z)),Vector((1,0,0)),-1.45*w)
 out.append(p)
keep=[]
for f in groups['body']:
 ids=faces[f]
 if min(verts[i].y for i in ids)>knee.y+.02:keep.append(ids)
used={};v2=[];f2=[]
for ids in keep:
 row=[]
 for i in ids:
  if i not in used:
   used[i]=len(v2);p=out[i];v2.append(Vector((p.x,-p.z,p.y)))
  row.append(used[i])
 f2.append(row)
lowest=min(p.z for p in v2)
for p in v2:p.z-=lowest
mesh=bpy.data.meshes.new('Spectator');mesh.from_pydata(v2,[],f2);mesh.update()
for poly in mesh.polygons:poly.use_smooth=True
obj=bpy.data.objects.new('Spectator',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
mod=obj.modifiers.new('fewer','DECIMATE');mod.ratio=.024
bpy.ops.object.modifier_apply(modifier='fewer')
print('SPECTATOR: %d triangles, %.2f m tall, head from %.2f'%(sum(len(p.vertices)-2 for p in mesh.polygons),max(p.co.z for p in mesh.vertices),joint('neck').y-hip.y+.0))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/generated/spectator.glb'),export_format='GLB',use_selection=True,export_animations=False,export_materials='NONE')
