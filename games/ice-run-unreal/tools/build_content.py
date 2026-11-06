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
]

tools = unreal.AssetToolsHelpers.get_asset_tools()
assets = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary


def log(message):
    unreal.log("ICE_CONTENT: " + message)


def import_skater(glb, folder):
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
        if data.asset_class_path.asset_name == "SkeletalMesh":
            meshes.append(str(data.package_name) + "." + str(data.asset_name))
    log("%s -> %s: %d assets, skeletal meshes %s" % (glb, destination, len(assets.list_assets(destination, recursive=True, include_folder=False)), meshes))
    return meshes[0] if meshes else None


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
    music = import_music()
    with open(os.path.join(PROJECT, "Content", "Generated", "music.json"), "w") as out:
        json.dump(music, out, indent=2)
    manifest = {}
    for glb, folder in SKATERS:
        mesh = import_skater(glb, folder)
        if mesh:
            manifest[folder] = mesh
    path = os.path.join(PROJECT, "Content", "Generated", "skaters.json")
    with open(path, "w") as out:
        json.dump(manifest, out, indent=2)
    log("wrote " + path + ": " + json.dumps(manifest))


main()
