extends Node3D
# The podium after a career result: the event's top three (the bridge's
# result.standings, game/rivals.ts), standing on three blocks at centre ice,
# each in their own model and costume (game/cast.ts via the catalog's
# story.cast[].look). You stand in your own character and costume. A rival
# without a model of their own yet wears the athlete's, in their costume.
# Presentation only: the places are the standings', nothing here scores.
const Skater = preload("res://scripts/skater.gd")
const GENERATED := "res://assets/generated/%s.glb"
const FALLBACK := "res://assets/generated/skater-athlete.glb"
# Gold in the middle, silver to its left as the camera sees it, bronze to its right.
const BLOCKS := [
	{"x": 0.0, "height": .46, "color": Color("d8b25a")},
	{"x": -1.05, "height": .32, "color": Color("c4ccd4")},
	{"x": 1.05, "height": .22, "color": Color("b98250")},
]
const ARM_OUT := 14.0 # degrees from hanging straight down, as tools/render_cast.py poses them
var standing: Array[Node3D] = []
var places: Array = []

func _ready() -> void:
	for i in BLOCKS.size():
		var b: Dictionary = BLOCKS[i]
		var block := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(.9,b.height,.7)
		block.mesh = mesh
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color("f2f4f6")
		mat.roughness = .35
		block.material_override = mat
		block.position = Vector3(b.x,b.height*.5,0)
		add_child(block)
		# A band of the place's colour round the top.
		var band := MeshInstance3D.new()
		var band_mesh := BoxMesh.new()
		band_mesh.size = Vector3(.92,.05,.72)
		band.mesh = band_mesh
		var band_mat := StandardMaterial3D.new()
		band_mat.albedo_color = b.color
		band_mat.metallic = .6
		band_mat.roughness = .3
		band.material_override = band_mat
		band.position = Vector3(b.x,b.height-.03,0)
		add_child(band)
		var number := Label3D.new()
		number.text = str(i+1)
		number.font_size = 96
		number.pixel_size = .002
		number.modulate = Color("39424d")
		number.position = Vector3(b.x,b.height*.5,.351)
		add_child(number)
	visible = false

# Builds the podium for `rows` (place, name, you), best first. `looks` maps a
# rival's name to its look; `you` is the player's model path and costume.
# Returns how many skaters stand on it.
func present(rows: Array, looks: Dictionary, you_model: String, you_costume: Dictionary) -> int:
	clear()
	for row in rows:
		if int(row.place) > 3:
			continue
		var i := int(row.place)-1
		var b: Dictionary = BLOCKS[i]
		var s := Skater.new()
		var costume: Dictionary = you_costume
		if bool(row.get("you",false)):
			s.model_path = you_model
		else:
			var look: Dictionary = looks.get(str(row.name),{})
			var model = look.get("model")
			s.model_path = GENERATED % model if model != null and ResourceLoader.exists(GENERATED % model) else FALLBACK
			costume = look.get("costume",{})
		add_child(s)
		s.effects_active = false
		s.apply_skin(costume)
		s.position = Vector3(b.x,b.height,0)
		# A skater faces -Z (scripts/skater.gd); the camera stands on +Z. Turned a little toward the middle.
		s.rotation.y = PI-b.x*.12
		lower_arms(s)
		standing.append(s)
		places.append({"place":int(row.place),"name":str(row.name),"you":bool(row.get("you",false)),"model":s.model_path})
	visible = not standing.is_empty()
	return standing.size()

func clear() -> void:
	for s in standing:
		s.queue_free()
	standing.clear()
	places.clear()
	visible = false

# The rest pose holds the arms out; this lets them hang, a little away from the body.
func lower_arms(s: Node3D) -> void:
	var sk: Skeleton3D = s.skeleton
	if sk == null:
		return
	for side in ["L","R"]:
		var arm := sk.find_bone("Arm"+side)
		var forearm := sk.find_bone("Forearm"+side)
		if arm < 0 or forearm < 0:
			continue
		var from := sk.get_bone_global_rest(arm)
		var along := (sk.get_bone_global_rest(forearm).origin-from.origin).normalized()
		var out := signf(along.x) if absf(along.x) > .01 else (1.0 if side == "L" else -1.0)
		var a := deg_to_rad(ARM_OUT)
		var want := Vector3(out*sin(a),-cos(a),.04).normalized()
		var turn := Quaternion(along,want)
		var parent := sk.get_bone_parent(arm)
		var parent_rest := sk.get_bone_global_rest(parent) if parent >= 0 else Transform3D.IDENTITY
		var global_rot := Basis(turn)*from.basis
		var local := parent_rest.basis.inverse()*global_rot
		sk.set_bone_pose_rotation(arm,local.get_rotation_quaternion())
