"""Renders the motion library (tools/ice-lab/game/motion) on the athlete, headless: one frame per
clip, then a labelled contact sheet per category.

  node games/ice-run-godot/tools/motion_dump.mjs [category] > <dir>/poses.json
  blender --background --python games/ice-run-godot/tools/render_motion.py -- <dir>/poses.json <out dir> [--model=skater-athlete] [--size=360]

A pose is directions (game/motion/types.ts): each bone is aimed along its segment's direction,
parents first, so the model's own bone lengths place every joint; the hips are set to the
pose's pelvis height. The body frame (x her right, y up, z behind her) becomes Blender's as
(-x, z, y): the athlete faces -Y with her left at +X (tools/build_athlete.py). Presentation only."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[1]
args = sys.argv[sys.argv.index('--') + 1:]
poses = json.load(open(args[0]))
out = Path(args[1]); out.mkdir(parents=True, exist_ok=True)
opt = {a.split('=')[0][2:]: a.split('=', 1)[1] for a in args[2:] if a.startswith('--') and '=' in a}
model = opt.get('model', 'skater-athlete'); size = int(opt.get('size', '360'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try: scene.render.engine = engine; break
    except TypeError: continue
try: scene.eevee.taa_render_samples = 16
except AttributeError: pass
scene.render.resolution_x = scene.render.resolution_y = size
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.02, .025, .035, 1)
bpy.ops.mesh.primitive_plane_add(size=20)
ice = bpy.context.object
m = bpy.data.materials.new('Ice'); m.use_nodes = True
m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.78, .85, .92, 1)
m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .15
ice.data.materials.append(m)
def light(loc, energy, size_):
    d = bpy.data.lights.new('L', 'AREA'); d.energy = energy; d.size = size_
    o = bpy.data.objects.new('L', d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, .8)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light((-2.5, -3.5, 3.5), 700, 3); light((3, -2.5, 2), 250, 3); light((0, 3, 3), 600, 3)

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/generated' / (model + '.glb')))
objs = [o for o in bpy.data.objects if o not in before]
rig = next(o for o in objs if o.type == 'ARMATURE')
for o in objs:
    keys = getattr(getattr(o, 'data', None), 'shape_keys', None)
    if keys:
        for k in keys.key_blocks:
            if k.name != 'Basis': k.value = 0
    for slot in getattr(o, 'material_slots', []):
        mat = slot.material
        if mat and mat.name.split('.')[0] in ('Espresso hair', 'Brow', 'Lashes'):
            for attr, val in (('surface_render_method', 'DITHERED'), ('blend_method', 'HASHED')):
                try: setattr(mat, attr, val)
                except (AttributeError, TypeError): pass

cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50
cam.location = (-2.3, -3.0, 1.25)
cam.rotation_euler = (Vector((0, 0, .72)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

def body(v):
    """Body frame to Blender world: (-x, z, y)."""
    return Vector((-v[0], v[2], v[1])).normalized()
TO_ARM = rig.matrix_world.inverted().to_3x3()
def arm_dir(v): return (TO_ARM @ body(v)).normalized()

STAND = {'trunk': (0, 1, 0), 'head': (0, 1, 0)}
# Segment -> bones it aims (the athlete's L bones rest on her anatomical left).
BONES = [('Hips', 'pelvisUp'), ('Spine', 'trunk'), ('Head', 'head'),
         ('ThighL', 'thighL'), ('ShinL', 'shinL'), ('FootL', 'footL'), ('ThighR', 'thighR'), ('ShinR', 'shinR'), ('FootR', 'footR'),
         ('ArmL', 'upperArmL'), ('ForearmL', 'forearmL'), ('ArmR', 'upperArmR'), ('ForearmR', 'forearmR')]
REST_PELVIS = rig.data.bones['Hips'].head_local.copy()

def apply(pose):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    seg = pose.get('seg', {})
    for name, key in BONES:
        pb = rig.pose.bones.get(name)
        if not pb: continue
        want = (pose.get('pelvisUp') or ((0, 1, 0) if 'pelvis' in pose else None)) if key == 'pelvisUp' else seg.get(key)
        if want is None: continue
        rest = pb.bone.matrix_local.to_3x3()
        along = rest.col[1].normalized()
        # The bone's current armature-space orientation (its parent may have turned it).
        cur = pb.matrix.to_3x3().normalized()
        target = arm_dir(want)
        turn = cur.col[1].normalized().rotation_difference(target).to_matrix()
        new = turn @ cur
        if name == 'Spine' and pose.get('twist'):
            # game/motion twist: the shoulders turned about the trunk; the body-to-Blender map is a proper rotation, so the sign carries.
            new = Matrix.Rotation(-math.radians(max(-60, min(60, pose['twist']))), 3, target) @ new
        head = pb.matrix.translation.copy()
        if name == 'Hips' and 'pelvis' in pose:
            head = rig.matrix_world.inverted() @ Vector((0, 0, pose['pelvis']))
        pb.matrix = Matrix.Translation(head) @ new.to_4x4()
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')

done = []
for i, p in enumerate(poses):
    apply(p['pose'])
    path = out / f"{i:03d}-{p['id']}.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    done.append({'file': path.name, 'id': p['id'], 'name': p['name'], 'category': p['category']})
json.dump(done, open(out / 'frames.json', 'w'), indent=1)
print('RENDERED', len(done), 'poses to', out)
