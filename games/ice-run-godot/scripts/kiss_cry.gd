extends Node3D
# The kiss-and-cry after a career program (game/kisscry.ts): the skater on a
# bench in front of the board, waiting for the marks, then her reaction, then a
# wave, before the podium. In your own character and costume. Each clip of the
# bridge's result.kissAndCry.sequence arrives baked (motionTrack) and plays for
# its seconds; `finished` turns true when the last one has. Presentation only.
const Skater = preload("res://scripts/skater.gd")
var skater: Node3D
var sequence: Array = []
var tracks := {}
var clock := 0.0
var playing := -1
var total := 0.0
var running := false
var finished := false

func _ready() -> void:
	# The bench: dark, padded, wide enough for a skater and a coach.
	var bench := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(1.7,.42,.5)
	bench.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("1f2a3a")
	mat.roughness = .7
	bench.material_override = mat
	# Under her pelvis: she faces the camera (+Z), so her back, and the bench, are toward -Z.
	bench.position = Vector3(0,.21,-.14)
	add_child(bench)
	# The board behind it, with its name.
	var board := MeshInstance3D.new()
	var board_mesh := BoxMesh.new()
	board_mesh.size = Vector3(2.8,1.6,.06)
	board.mesh = board_mesh
	var board_mat := StandardMaterial3D.new()
	board_mat.albedo_color = Color("2b3d5c")
	board_mat.roughness = .5
	board.material_override = board_mat
	board.position = Vector3(0,.8,-.75)
	add_child(board)
	var title := Label3D.new()
	title.text = "KISS & CRY"
	title.font_size = 120
	title.pixel_size = .0026
	title.modulate = Color("e9eef6")
	title.position = Vector3(0,1.35,-.715)
	add_child(title)
	visible = false

# Seats the skater (`model`, `costume`) and starts the sequence. Returns the clip ids to bake.
func present(model: String, costume: Dictionary, kc: Dictionary) -> Array:
	clear()
	sequence = kc.get("sequence",[])
	total = 0.0
	for x in sequence: total += float(x.seconds)
	skater = Skater.new()
	skater.model_path = model
	add_child(skater)
	skater.effects_active = false
	skater.apply_skin(costume)
	skater.rotation.y = PI
	visible = true
	running = true
	var ids: Array = []
	for x in sequence:
		if not ids.has(str(x.clip)): ids.append(str(x.clip))
	return ids

func play_track(track: Dictionary) -> void:
	# Every baked clip reaches here, the podium's too (main.gd routes motionTrack to both), so keep
	# only this sequence's own, and only while it runs: a cleared bench must stay empty.
	var id := str(track.get("id",""))
	if not running or not sequence.any(func(x): return str(x.clip) == id):
		return
	# A clip that was due before its track arrived starts as soon as _process sees it.
	tracks[id] = track

func _process(dt: float) -> void:
	if not running:
		return
	clock += dt
	var at := 0.0
	for i in sequence.size():
		at += float(sequence[i].seconds)
		if clock < at:
			if i != playing and tracks.has(str(sequence[i].clip)):
				playing = i
				skater.play_track(tracks[str(sequence[i].clip)])
			return
	running = false
	finished = true

func clear() -> void:
	if skater:
		skater.queue_free()
		skater = null
	sequence = []
	tracks.clear()
	clock = 0.0
	playing = -1
	running = false
	finished = false
	visible = false
