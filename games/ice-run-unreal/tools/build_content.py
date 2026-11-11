"""Builds the Unreal project's generated content from the repository's sources.

Run by tools/prepare.mjs through the editor's Python plugin:

    UnrealEditor-Cmd IceRun.uproject -run=pythonscript -script=tools/build_content.py

The skaters are the Godot game's own .glb files (games/ice-run-godot/assets/generated),
imported through Interchange into /Game/Generated: the .glb stays the source, and
Content/Generated is ignored by Git, the way Godot's .godot/imported cache is.
Materials are made here as nodes, so they are text in the repository too.
"""

import json
import os

import unreal

PROJECT = os.path.abspath(unreal.Paths.project_dir())
GLB_DIR = os.path.normpath(os.path.join(PROJECT, "..", "ice-run-godot", "assets", "generated"))
GENERATED = "/Game/Generated"
MATERIALS = GENERATED + "/Materials"

# (glb file, content folder): the athlete is the default skater, as in main.gd's CHARACTERS.
SKATERS = [
    ("skater-athlete.glb", "Athlete"),
    ("skater-competition.glb", "Competition"),
    ("skater-berserker.glb", "Berserker"),
    ("skater.glb", "Violet"),
    # The career's rivals (game/cast.ts), folder named by model: the warm-up group and the podium.
    ("skater-rival-ansa.glb", "skater-rival-ansa"),
    ("skater-rival-katya.glb", "skater-rival-katya"),
    ("skater-rival-noor.glb", "skater-rival-noor"),
    ("skater-rival-remi.glb", "skater-rival-remi"),
    ("skater-rival-teodora.glb", "skater-rival-teodora"),
]

tools = unreal.AssetToolsHelpers.get_asset_tools()
assets = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary


def log(message):
    unreal.log("ICE_CONTENT: " + message)


def import_skater(glb, folder, kind="SkeletalMesh"):
    source = os.path.join(GLB_DIR, glb)
    if not os.path.exists(source):
        log("missing " + source)
        return None
    destination = GENERATED + "/" + folder
    task = unreal.AssetImportTask()
    task.filename = source
    task.destination_path = destination
    task.replace_existing = True
    task.automated = True
    task.save = True
    tools.import_asset_tasks([task])
    meshes = []
    for path in assets.list_assets(destination, recursive=True, include_folder=False):
        data = assets.find_asset_data(path)
        if data.asset_class_path.asset_name == kind:
            meshes.append(str(data.package_name) + "." + str(data.asset_name))
    log("%s -> %s: %d assets, %s %s" % (glb, destination, len(assets.list_assets(destination, recursive=True, include_folder=False)), kind, meshes))
    return meshes[0] if meshes else None


GLTF_DEFAULT = "/InterchangeAssets/gltf/M_Default.M_Default"


def morph_parent():
    """A project copy of Interchange's glTF material that allows morph targets. The athlete's Blink
    moves her lids, and the engine draws a section a morph moves (her skin, her lashes) only with a
    material that allows it, or it draws the default. The engine's own asset is left as it is."""
    path = MATERIALS + "/M_GltfMorph"
    material = assets.load_asset(path) if assets.does_asset_exist(path) else assets.duplicate_asset(GLTF_DEFAULT.split(".")[0], path)
    material.set_editor_property("used_with_skeletal_mesh", True)
    material.set_editor_property("used_with_morph_targets", True)
    assets.save_loaded_asset(material, False)
    return material


MORPH_COPIES = {}


def morph_copy(middle, parent):
    """Interchange's in-between instance (its blend mode and sidedness, e.g. MI_Default_Blend_DS),
    copied into the project and set on the morph-ready parent."""
    key = middle.get_path_name()
    if key not in MORPH_COPIES:
        path = MATERIALS + "/" + key.split("/")[-1].split(".")[0] + "_Morph"
        copy = assets.load_asset(path) if assets.does_asset_exist(path) else assets.duplicate_asset(key.split(".")[0], path)
        mel.set_material_instance_parent(copy, parent)
        # Reparenting does not mark the package dirty: saved regardless.
        assets.save_loaded_asset(copy, False)
        MORPH_COPIES[key] = copy
    return MORPH_COPIES[key]


def allow_morphs(folder, parent):
    """Every material instance Interchange made in this skater's folder, onto the morph-ready chain."""
    moved = 0
    for path in assets.list_assets(GENERATED + "/" + folder, recursive=True, include_folder=False):
        if assets.find_asset_data(path).asset_class_path.asset_name != "MaterialInstanceConstant":
            continue
        instance = assets.load_asset(path)
        middle = instance.get_editor_property("parent")
        if not middle or not middle.get_path_name().startswith("/InterchangeAssets/"):
            continue
        target = parent if middle.get_path_name() == GLTF_DEFAULT else morph_copy(middle, parent)
        mel.set_material_instance_parent(instance, target)
        assets.save_loaded_asset(instance, False)
        moved += 1
    log("%s: %d materials allow morph targets" % (folder, moved))


def parameter(material, kind, name, default, x, y):
    node = mel.create_material_expression(material, kind, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("default_value", default)
    return node


def new_material(name):
    """A fresh graph: an existing generated material is emptied and rebuilt in place."""
    path = MATERIALS + "/" + name
    if assets.does_asset_exist(path):
        material = assets.load_asset(path)
        mel.delete_all_material_expressions(material)
        return material
    return tools.create_asset(name, MATERIALS, unreal.Material, unreal.MaterialFactoryNew())


def surface_material():
    """One colour, roughness, metalness and glow: everything in the hall but the ice."""
    m = new_material("M_Surface")
    m.set_editor_property("two_sided", True)
    # The snow off the blades is drawn instanced (Source/IceRun/IceSpray): without the flag the game draws the default material.
    m.set_editor_property("used_with_instanced_static_meshes", True)
    color = parameter(m, unreal.MaterialExpressionVectorParameter, "Color", unreal.LinearColor(.8, .8, .8, 1), -600, 0)
    rough = parameter(m, unreal.MaterialExpressionScalarParameter, "Roughness", .5, -600, 220)
    metal = parameter(m, unreal.MaterialExpressionScalarParameter, "Metallic", 0.0, -600, 320)
    glow = parameter(m, unreal.MaterialExpressionScalarParameter, "Emissive", 0.0, -600, 420)
    lit = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -300, 400)
    mel.connect_material_expressions(color, "", lit, "A")
    mel.connect_material_expressions(glow, "", lit, "B")
    mel.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    mel.connect_material_property(lit, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.recompile_material(m)
    assets.save_loaded_asset(m)
    return m


# games/ice-run-godot/shaders/crowd.gdshader, vertex(), run in the spectator's own model space:
# Interchange brings the glTF's (x, y, z) metres in as Unreal's (x, z, y) centimetres, so the code
# turns the instance-local position back into the Godot shader's frame (y up, facing +z), moves
# it there, and hands back the offset. Each person's timing is their own custom data.
CROWD_MOVE = """
float3 p = float3(LP.x, LP.z, LP.y) * .01;
const float NECK = .998;
const float3 SHOULDER = float3(.168, .933, -.015);
float joins = step(frac(Own * 7.3), .82);
float roused = saturate(Cheer * 1.25 - frac(Own * 13.7) * .25) * joins;
if (UV.x > .5)
{
    float3 shoulder = SHOULDER * float3(sign(p.x), 1., 1.);
    float a = -2.1 * roused;
    float c = cos(a), s = sin(a);
    float3 d = p - shoulder;
    p = shoulder + float3(d.x, c * d.y - s * d.z, s * d.y + c * d.z);
    float clap = .5 + .5 * sin(T * 11. + Own * 40.);
    p.x -= sign(p.x) * .16 * UV.y * (.5 + .5 * clap) * roused;
}
float3 toward = float3(Skater.x, Skater.z, Skater.y) * .01;
float look = clamp(atan2(toward.x, toward.z), -1.15, 1.15) + sin(T * .31 + Own * 50.) * .14;
float head = smoothstep(NECK - .04, NECK + .03, p.y);
float3 neck = float3(0., NECK, 0.);
float lc = cos(look), ls = sin(look);
float3 dn = p - neck;
float3 turned = neck + float3(lc * dn.x + ls * dn.z, dn.y, -ls * dn.x + lc * dn.z);
p = lerp(p, turned, head * (1. - roused * .4));
float rock = sin(T * (.35 + Own * .5) + Own * 30.) * .018 + sin(T * 7. + Own * 25.) * .03 * roused;
float sc = cos(look * .16), ss = sin(look * .16);
p = float3(sc * p.x + ss * p.z, p.y, -ss * p.x + sc * p.z);
p.x += rock * p.y;
p.y += abs(sin(T * 5.5 + Own * 20.)) * .05 * roused + .06 * roused;
return float3(p.x, p.z, p.y) * 100. - LP;
"""

# crowd.gdshader's colours, worked per vertex from the unmoved shape as its varyings are.
CROWD_COLOUR = """
float3 p = float3(LP.x, LP.z, LP.y) * .01;
const float NECK = .998;
const float HIP = .457;
const float CROWN = 1.1;
float bare = smoothstep(NECK - .04, NECK - .005, p.y) + UV.x * smoothstep(.72, .8, UV.y);
float legs = (1. - step(.5, UV.x)) * (1. - smoothstep(HIP - .03, HIP + .05, p.y));
float shoes = (1. - step(.5, UV.x)) * (1. - smoothstep(.05, .09, p.y));
float hair = smoothstep(CROWN - .02, CROWN + .01, p.y - p.z * .55 + max(0., -p.z) * .25);
float ownHair = frac(Own * 31.7);
float3 hairColour = ownHair < .45 ? float3(.05, .035, .03) : ownHair < .75 ? float3(.16, .09, .05) : ownHair < .9 ? float3(.42, .29, .14) : float3(.34, .33, .33);
float ownLegs = frac(Own * 17.3);
float3 legColour = ownLegs < .5 ? float3(.025, .03, .045) : ownLegs < .8 ? float3(.06, .055, .05) : float3(.12, .11, .09);
float3 worn = lerp(Coat, legColour, legs);
worn = lerp(worn, float3(.02, .02, .02), shoes);
return lerp(lerp(worn, Skin, saturate(bare)), hairColour, hair) * .72;
"""


def custom_node(material, name, code, inputs, x, y):
    """An HLSL node: inputs is [(pin name, expression)]."""
    node = mel.create_material_expression(material, unreal.MaterialExpressionCustom, x, y)
    node.set_editor_property("description", name)
    node.set_editor_property("code", code)
    node.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    pins = []
    for pin, _ in inputs:
        entry = unreal.CustomInput()
        entry.set_editor_property("input_name", pin)
        pins.append(entry)
    node.set_editor_property("inputs", pins)
    for pin, expression in inputs:
        mel.connect_material_expressions(expression, "", node, pin)
    return node


def crowd_material():
    """The audience (Source/IceRun/IceRink's crowd): crowd.gdshader as two HLSL nodes on instanced spectators.
    Custom data per person: the coat (0-2), the skin (3-5), their own timing (6). The game sets Skater
    (where she is, world centimetres) and Cheer (how roused the hall is) every frame."""
    m = new_material("M_Crowd")
    m.set_editor_property("used_with_instanced_static_meshes", True)
    local = mel.create_material_expression(m, unreal.MaterialExpressionLocalPosition, -1400, 0)
    local.set_editor_property("included_offsets", unreal.PositionIncludedOffsets.EXCLUDE_OFFSETS)
    uv = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -1400, 150)
    coat = mel.create_material_expression(m, unreal.MaterialExpressionPerInstanceCustomData3Vector, -1400, 300)
    coat.set_editor_property("data_index", 0)
    skin = mel.create_material_expression(m, unreal.MaterialExpressionPerInstanceCustomData3Vector, -1400, 450)
    skin.set_editor_property("data_index", 3)
    own = mel.create_material_expression(m, unreal.MaterialExpressionPerInstanceCustomData, -1400, 600)
    own.set_editor_property("data_index", 6)
    time = mel.create_material_expression(m, unreal.MaterialExpressionTime, -1400, 750)
    skater = parameter(m, unreal.MaterialExpressionVectorParameter, "Skater", unreal.LinearColor(0, 0, 0, 0), -1700, 900)
    seen = mel.create_material_expression(m, unreal.MaterialExpressionTransformPosition, -1400, 900)
    seen.set_editor_property("transform_source_type", unreal.MaterialPositionTransformSource.TRANSFORMPOSSOURCE_WORLD)
    seen.set_editor_property("transform_type", unreal.MaterialPositionTransformSource.TRANSFORMPOSSOURCE_INSTANCE)
    mel.connect_material_expressions(skater, "", seen, "")
    cheer = parameter(m, unreal.MaterialExpressionScalarParameter, "Cheer", 0.0, -1400, 1050)
    move = custom_node(m, "CrowdMove", CROWD_MOVE, [("LP", local), ("UV", uv), ("Own", own), ("T", time), ("Skater", seen), ("Cheer", cheer)], -900, 600)
    offset = mel.create_material_expression(m, unreal.MaterialExpressionTransform, -500, 600)
    offset.set_editor_property("transform_source_type", unreal.MaterialVectorCoordTransformSource.TRANSFORMSOURCE_INSTANCE)
    offset.set_editor_property("transform_type", unreal.MaterialVectorCoordTransform.TRANSFORM_WORLD)
    mel.connect_material_expressions(move, "", offset, "")
    mel.connect_material_property(offset, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
    colour = custom_node(m, "CrowdColour", CROWD_COLOUR, [("LP", local), ("UV", uv), ("Coat", coat), ("Skin", skin), ("Own", own)], -900, 100)
    carried = mel.create_material_expression(m, unreal.MaterialExpressionVertexInterpolator, -500, 100)
    mel.connect_material_expressions(colour, "", carried, "")
    mel.connect_material_property(carried, "", unreal.MaterialProperty.MP_BASE_COLOR)
    rough = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -500, 300)
    rough.set_editor_property("r", .82)
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    spec = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -500, 400)
    spec.set_editor_property("r", .25)
    mel.connect_material_property(spec, "", unreal.MaterialProperty.MP_SPECULAR)
    mel.recompile_material(m)
    assets.save_loaded_asset(m)
    return m


# games/ice-run-godot/shaders/eye.gdshader: the eye's image is one iris filling the frame, sclera at
# its edge. The gaze slides it across the dome; past the image the eye carries on in the sclera's
# colour. The CC0 image labelled brown is red-orange: its detail stays, its hue becomes iris_hue.
EYE_AT = "return clamp(UV + Gaze.xy, .01, .99);"
EYE_COLOUR = """
float r = length(UV + Gaze.xy - .5);
float overIris = 1. - smoothstep(.42 - .02, .42 + .02, r);
float3 white = lerp(C * 1.3, float3(.5, .49, .47), smoothstep(.44, .49, r));
return lerp(white, dot(C, float3(.3, .59, .11)) * float3(2.6, 1.45, .8), overIris);
"""
EYE_GLOSS = """
float r = length(UV + Gaze.xy - .5);
float overIris = 1. - smoothstep(.42 - .02, .42 + .02, r);
return float2(lerp(.42, .12, overIris), lerp(.3, .4, overIris));
"""


def eye_material():
    """The athlete's eyes (Source/IceRun/IceSkater's face): the game sets Iris (the model's own image) and Gaze."""
    m = new_material("M_Eye")
    m.set_editor_property("used_with_skeletal_mesh", True)
    m.set_editor_property("used_with_morph_targets", True)
    uv = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -1200, 0)
    gaze = parameter(m, unreal.MaterialExpressionVectorParameter, "Gaze", unreal.LinearColor(0, 0, 0, 0), -1200, 150)
    at = custom_node(m, "EyeAt", EYE_AT, [("UV", uv), ("Gaze", gaze)], -900, 0)
    at.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT2)
    iris = mel.create_material_expression(m, unreal.MaterialExpressionTextureSampleParameter2D, -600, 0)
    iris.set_editor_property("parameter_name", "Iris")
    iris.set_editor_property("texture", unreal.load_asset("/Engine/EngineResources/DefaultTexture"))
    mel.connect_material_expressions(at, "", iris, "UVs")
    colour = custom_node(m, "EyeColour", EYE_COLOUR, [("UV", uv), ("Gaze", gaze), ("C", iris)], -300, 0)
    mel.connect_material_property(colour, "", unreal.MaterialProperty.MP_BASE_COLOR)
    gloss = custom_node(m, "EyeGloss", EYE_GLOSS, [("UV", uv), ("Gaze", gaze)], -300, 300)
    gloss.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT2)
    rough = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, 0, 250)
    rough.set_editor_property("r", True)
    mel.connect_material_expressions(gloss, "", rough, "")
    mel.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    spec = mel.create_material_expression(m, unreal.MaterialExpressionComponentMask, 0, 350)
    spec.set_editor_property("g", True)
    mel.connect_material_expressions(gloss, "", spec, "")
    mel.connect_material_property(spec, "", unreal.MaterialProperty.MP_SPECULAR)
    mel.recompile_material(m)
    assets.save_loaded_asset(m)
    return m


def ice_material():
    """Ice: water's reflectance (F0 about 0.018, Specular 0.23) under a polished, lightly
    groomed surface: broad resurfacing patches and a fine grain vary its roughness and tone."""
    m = new_material("M_Ice")
    color = parameter(m, unreal.MaterialExpressionVectorParameter, "Color", unreal.LinearColor(.86, .92, .96, 1), -900, 0)
    rough = parameter(m, unreal.MaterialExpressionScalarParameter, "Roughness", .06, -900, 300)
    parameter(m, unreal.MaterialExpressionScalarParameter, "Metallic", 0.0, -900, 400)
    parameter(m, unreal.MaterialExpressionScalarParameter, "Emissive", 0.0, -900, 500)

    patches = mel.create_material_expression(m, unreal.MaterialExpressionNoise, -900, 650)
    patches.set_editor_property("scale", .0016)
    patches.set_editor_property("quality", 2)
    patches.set_editor_property("levels", 4)
    patches.set_editor_property("output_min", 0.0)
    patches.set_editor_property("output_max", 1.0)
    grain = mel.create_material_expression(m, unreal.MaterialExpressionNoise, -900, 900)
    grain.set_editor_property("scale", .09)
    grain.set_editor_property("levels", 2)
    grain.set_editor_property("output_min", 0.0)
    grain.set_editor_property("output_max", 1.0)

    # Tone: a touch darker where the patches are thin.
    tone = mel.create_material_expression(m, unreal.MaterialExpressionLinearInterpolate, -500, 100)
    tone.set_editor_property("const_a", .9)
    tone.set_editor_property("const_b", 1.0)
    mel.connect_material_expressions(patches, "", tone, "Alpha")
    tinted = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -300, 0)
    mel.connect_material_expressions(color, "", tinted, "A")
    mel.connect_material_expressions(tone, "", tinted, "B")

    # Roughness: the parameter, raised by up to 0.14 by the patches and 0.05 by the grain.
    patch_rough = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -600, 650)
    patch_rough.set_editor_property("const_b", .14)
    mel.connect_material_expressions(patches, "", patch_rough, "A")
    grain_rough = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -600, 900)
    grain_rough.set_editor_property("const_b", .05)
    mel.connect_material_expressions(grain, "", grain_rough, "A")
    add_a = mel.create_material_expression(m, unreal.MaterialExpressionAdd, -400, 400)
    mel.connect_material_expressions(rough, "", add_a, "A")
    mel.connect_material_expressions(patch_rough, "", add_a, "B")
    add_b = mel.create_material_expression(m, unreal.MaterialExpressionAdd, -250, 450)
    mel.connect_material_expressions(add_a, "", add_b, "A")
    mel.connect_material_expressions(grain_rough, "", add_b, "B")

    specular = mel.create_material_expression(m, unreal.MaterialExpressionConstant, -250, 250)
    specular.set_editor_property("r", .23)

    mel.connect_material_property(tinted, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(add_b, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(specular, "", unreal.MaterialProperty.MP_SPECULAR)
    mel.recompile_material(m)
    assets.save_loaded_asset(m)
    return m


# tools/prepare.mjs makes these: each track's audio alone, as Ogg Vorbis.
AUDIO_DIR = os.path.join(PROJECT, "Intermediate", "Music")
TRACKS = os.path.normpath(os.path.join(PROJECT, "..", "..", "tools", "ice-lab", "game", "audio", "tracks.json"))
MUSIC = GENERATED + "/Music"


def import_music():
    """The five tracks, as games/ice-run-godot/tools/prepare.mjs converts them to Ogg Vorbis."""
    out = {}
    if not os.path.exists(TRACKS):
        log("no " + TRACKS)
        return out
    with open(TRACKS) as f:
        tracks = json.load(f)
    for track in tracks:
        source = os.path.join(AUDIO_DIR, track["id"] + ".ogg")
        if not os.path.exists(source):
            log("missing " + source)
            continue
        task = unreal.AssetImportTask()
        task.filename = source
        task.destination_path = MUSIC
        task.destination_name = track["id"]
        task.replace_existing = True
        task.automated = True
        task.save = True
        tools.import_asset_tasks([task])
        path = MUSIC + "/" + track["id"]
        if assets.does_asset_exist(path):
            out[track["id"]] = path + "." + track["id"]
    log("music: " + json.dumps(out))
    return out


def main():
    log("project " + PROJECT)
    log("skaters from " + GLB_DIR)
    surface_material()
    ice_material()
    crowd_material()
    eye_material()
    # The audience: one seated spectator (the Godot arena's), instanced by Source/IceRun/IceRink.
    spectator = import_skater("spectator.glb", "Spectator", "StaticMesh")
    if spectator:
        # A small body drawn thousands of times, moved by M_Crowd's world position offset: the
        # classic path, where the material's per-vertex colour reaches the pixel. Not Nanite.
        mesh = unreal.load_asset(spectator)
        nanite = mesh.get_editor_property("nanite_settings")
        nanite.set_editor_property("enabled", False)
        mesh.set_editor_property("nanite_settings", nanite)
        assets.save_loaded_asset(mesh)
    with open(os.path.join(PROJECT, "Content", "Generated", "crowd.json"), "w") as out:
        json.dump({"mesh": spectator, "material": MATERIALS + "/M_Crowd.M_Crowd"}, out, indent=2)
    music = import_music()
    with open(os.path.join(PROJECT, "Content", "Generated", "music.json"), "w") as out:
        json.dump(music, out, indent=2)
    manifest = {}
    morphs = morph_parent()
    for glb, folder in SKATERS:
        mesh = import_skater(glb, folder)
        if mesh:
            manifest[folder] = mesh
            allow_morphs(folder, morphs)
    path = os.path.join(PROJECT, "Content", "Generated", "skaters.json")
    with open(path, "w") as out:
        json.dump(manifest, out, indent=2)
    log("wrote " + path + ": " + json.dumps(manifest))


main()
