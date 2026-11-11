"""Studio renders of the career's rivals, headless: a lineup and a portrait each.

  node games/ice-run-godot/tools/cast_looks.mjs > <dir>/looks.json
  blender --background --python games/ice-run-godot/tools/render_cast.py -- <dir>/looks.json <out dir> [--samples=64]

Each rival is assets/generated/<model>.glb (tools/build_athlete.py --rival=<id>) wearing its
game/cast.ts costume, recoloured by material name the way scripts/skater.gd does: the
cloth slots take the costume's colour, the hair's paint is tinted by it, the skin keeps
its paint. Arms are lowered from the rig's rest pose; nothing else is posed. Presentation
only: these are not evidence of anything the physics does."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
looks=json.load(open(args[0]));out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
samples=int(next((a.split('=')[1] for a in args if a.startswith('--samples=')),'64'))
SLOTS={'Midnight plum satin':'bodice','Flowing skirt satin':'skirt','Illusion sleeve':'sleeve','Champagne crystals':'trim'}

def srgb(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
 return [x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
for engine in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE','CYCLES'):
 try:scene.render.engine=engine;break
 except TypeError:continue
if scene.render.engine=='CYCLES':scene.cycles.samples=samples
else:
 try:scene.eevee.taa_render_samples=samples
 except AttributeError:pass
scene.render.resolution_x,scene.render.resolution_y=1920,1080
scene.view_settings.view_transform='AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
world=bpy.data.worlds.new('Arena');scene.world=world;world.use_nodes=True
bg=world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.012,.016,.024,1);bg.inputs['Strength'].default_value=1

def material(name,color,rough,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF']
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
# Ice: pale, glossy, a little blue; the skaters reflect in it.
bpy.ops.mesh.primitive_plane_add(size=60)
ice=bpy.context.object;ice.data.materials.append(material('Ice',(.80,.87,.93),.08))

def light(name,kind,loc,energy,size,color=(1,1,1),aim=(0,0,1)):
 d=bpy.data.lights.new(name,kind);d.energy=energy;d.color=color
 if kind=='AREA':d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
 o.rotation_euler=(Vector(aim)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
 return o

def lower_arms(rig):
 """Each upper arm aimed 14 degrees out from hanging straight down, whatever its rest angle."""
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='POSE')
 for side in ('L','R'):
  pb=rig.pose.bones.get('Arm'+side)
  if not pb:continue
  rest=pb.bone.matrix_local.to_quaternion()
  along=(pb.bone.tail_local-pb.bone.head_local).normalized()
  out=1 if along.x>0 else -1
  want=Vector((out*math.sin(math.radians(14)),.05,-math.cos(math.radians(14)))).normalized()
  pb.rotation_mode='QUATERNION'
  pb.rotation_quaternion=rest.inverted()@along.rotation_difference(want)@rest
 bpy.context.view_layer.update()
 bpy.ops.object.mode_set(mode='OBJECT')

def dress(objs,costume):
 for o in objs:
  if o.type!='MESH':continue
  for slot in o.material_slots:
   m=slot.material
   if not m:continue
   base=m.name.split('.')[0]
   p=m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
   if not p:continue
   if base in SLOTS and costume.get(SLOTS[base]):
    p.inputs['Base Color'].default_value=(*srgb(costume[SLOTS[base]]),1)
    if SLOTS[base] in ('bodice','skirt'):p.inputs['Roughness'].default_value=.32
   if base=='Espresso hair' and costume.get('hair'):
    # scripts/skater.gd: the paint times the hair colour lifted 42% toward white.
    link=next((l for l in m.node_tree.links if l.to_socket==p.inputs['Base Color']),None)
    if link:
     mix=m.node_tree.nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs['Factor'].default_value=1
     tint=[c+(1-c)*.42 for c in srgb(costume['hair'])]
     m.node_tree.links.new(link.from_socket,mix.inputs['A']);mix.inputs['B'].default_value=(*tint,1)
     m.node_tree.links.new(mix.outputs['Result'],p.inputs['Base Color'])

placed=[]
for look in looks:
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/generated'/(look['model']+'.glb')))
 objs=[o for o in bpy.data.objects if o not in before]
 rig=next((o for o in objs if o.type=='ARMATURE'),None)
 # One empty carries everything the import brought, whatever its roots.
 top=bpy.data.objects.new(look['model'],None);scene.collection.objects.link(top)
 for o in objs:
  if o.parent is None:o.parent=top
 objs.append(top)
 dress(objs,look['costume'])
 if rig:lower_arms(rig)
 # Eyes open: the import brings the Blink shape in where scripts/skater.gd would set it each frame.
 for o in objs:
  keys=getattr(getattr(o,'data',None),'shape_keys',None)
  if keys:
   for k in keys.key_blocks:
    if k.name!='Basis':k.value=0
 # Cut-out cards (hair, brows, lashes) need their alpha honoured, as the game does.
 for o in objs:
  for slot in getattr(o,'material_slots',[]):
   m=slot.material
   if m and m.name.split('.')[0] in ('Espresso hair','Brow','Lashes'):
    for attr,val in (('surface_render_method','DITHERED'),('blend_method','HASHED')):
     try:setattr(m,attr,val)
     except (AttributeError,TypeError):pass
    p=m.node_tree.nodes.get('Principled BSDF')
    if p and m.name.startswith('Espresso hair'):p.inputs['Roughness'].default_value=.62
 placed.append((look,top,objs))

def frame_all():
 for o in scene.objects:o.hide_render=False
def only(objs):
 keep=set(objs)|{ice}
 for o in scene.objects:
  if o.type in('LIGHT','CAMERA'):continue
  o.hide_render=o not in keep
cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(cam);scene.camera=cam

# ---- the lineup: shortest at the ends, the champion in the middle ----
order=sorted(placed,key=lambda x:x[0]['height'])
row=[order[i] for i in (0,2,4,3,1)] if len(order)==5 else order
gap=.78
for i,(look,top,objs) in enumerate(row):
 top.location=((i-(len(row)-1)/2)*gap,0,0)
 top.rotation_euler=(0,0,math.radians(((len(row)-1)/2-i)*7))
light('Key','AREA',(-2.6,-4.2,3.8),900,3,(1,.96,.9),(0,0,1))
light('Fill','AREA',(3.4,-3.6,1.8),260,4,(.82,.88,1),(0,0,1))
light('Rim','AREA',(0,3.2,3.4),900,4,(.75,.85,1),(0,0,1.3))
cam.data.lens=42;cam.location=(0,-6.4,1.2);cam.rotation_euler=(math.radians(88),0,0)
frame_all();scene.render.filepath=str(out/'cast-lineup.png');bpy.ops.render.render(write_still=True)

# ---- a portrait each: head and shoulders, three-quarter ----
for look,top,objs in placed:
 only(objs)
 x=top.location.x;h=look['height']
 cam.data.lens=85
 # Head and shoulders, three-quarter, eyes about a third down the frame.
 cam.location=(x-.78,-2.05,h-.02);aim=Vector((x,0,h-.24))
 cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/f"cast-{look['model'].removeprefix('skater-rival-').removeprefix('skater-')}.png");bpy.ops.render.render(write_still=True)
frame_all()
print('RENDERED',len(placed),'rivals to',out)
