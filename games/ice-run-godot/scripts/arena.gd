extends Node3D
var trace_mesh: MultiMesh
var trace_count := 0
var previous: Array = [null, null]
var markers: Node3D
var targets: Array[Node3D] = []
const CAPACITY := 18000

func mat(color: Color, metal: float = 0.0, rough: float = 0.5, emission: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metal
	m.roughness = rough
	if emission > 0.0:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = emission
	return m

func box(size: Vector3, pos: Vector3, material: Material, parent: Node3D = null) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.position = pos
	(parent if parent != null else self).add_child(node)
	return node

func _ready() -> void:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("0b121c")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("a4bdd3")
	env.ambient_light_energy = 0.24
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color("344153")
	env.fog_density = 0.0025
	environment.environment = env
	add_child(environment)
	var ice := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(56, 56)
	ice.mesh = plane
	var ice_mat := ShaderMaterial.new()
	ice_mat.shader = load("res://shaders/ice.gdshader")
	ice.material_override = ice_mat
	add_child(ice)
	var dark := mat(Color("101723"), 0.2, 0.55)
	var wood := mat(Color("503e35"), 0.05, 0.7)
	var board := mat(Color("cfdbdd"), 0.15, 0.35)
	var rail := mat(Color("263a49"), 0.65, 0.25)
	var strip := mat(Color("b5d3e2"), 0.0, 0.3, 1.4)
	box(Vector3(95, 0.5, 95),Vector3(0,-0.33,0),dark)
	# Rounded boards follow precisely the same boundary as the Ice Lab solver.
	for corner in range(4):
		var center := Vector2(19 if corner in [0, 3] else -19, 19 if corner < 2 else -19)
		for segment in range(20):
			var a := (float(corner) * 90.0 + float(segment) * 4.5) * PI / 180.0
			var b := a + deg_to_rad(4.5)
			# Corner order: bottom-right, bottom-left, top-left, top-right.
			var p := center + Vector2(cos(a), sin(a)) * 9.0
			var end := center + Vector2(cos(b), sin(b)) * 9.0
			wall_segment(p, end, board, rail)
	for pair in [[Vector2(-19,-28),Vector2(19,-28)],[Vector2(-19,28),Vector2(19,28)],[Vector2(-28,-19),Vector2(-28,19)],[Vector2(28,-19),Vector2(28,19)]]:
		wall_segment(pair[0],pair[1],board,rail)
	for side in [-1,1]:
		for row in range(5):
			var z: float = side * (31.0 + row * 1.65)
			box(Vector3(65,0.35,1.6),Vector3(0,0.25+row*.7,z),wood)
			for seat in range(42):
				box(Vector3(.92,.65,.18),Vector3(-30+seat*1.45,0.9+row*.7,z+side*.5),dark)
		box(Vector3(70,5,0.5),Vector3(0,6.5,side*40),dark)
		box(Vector3(66,.08,.08),Vector3(0,4.5,side*37),strip)
		for x in [-30,30]:
			box(Vector3(.6,13,.6),Vector3(x,6.5,side*30),rail)
	for z in [-22,0,22]:
		box(Vector3(66,.25,.3),Vector3(0,12,z),rail)
		for x in [-20,-10,0,10,20]:
			box(Vector3(2.5,.10,.4),Vector3(x,11.7,z),strip)
	for setup in [[Vector3(-55,-25,0),Color("e6edf5"),.72],[Vector3(-25,130,0),Color("e5b799"),.24],[Vector3(-40,60,0),Color("a2adc9"),.20]]:
		var light := DirectionalLight3D.new()
		light.rotation_degrees = setup[0]
		light.light_color = setup[1]
		light.light_energy = setup[2]
		light.shadow_enabled = setup[2] > 0.5
		light.directional_shadow_max_distance = 70
		add_child(light)
	var brand := Label3D.new()
	brand.text = "E D G E W O R K"
	brand.font_size = 120
	brand.pixel_size = .025
	brand.position = Vector3(0,5.8,-39.6)
	brand.modulate = Color("b7c9d4")
	brand.no_depth_test = false
	add_child(brand)
	var slogan := Label3D.new()
	slogan.text = "THE ICE REMEMBERS EVERY LINE"
	slogan.font_size = 42
	slogan.pixel_size = .024
	slogan.position = Vector3(0,4,-39.6)
	slogan.modulate = Color("8b9aaa")
	add_child(slogan)
	var trace_node := MultiMeshInstance3D.new()
	trace_mesh = MultiMesh.new()
	trace_mesh.transform_format = MultiMesh.TRANSFORM_3D
	var groove := PlaneMesh.new()
	groove.size = Vector2(.019,1.0)
	trace_mesh.mesh = groove
	trace_mesh.instance_count = CAPACITY
	trace_mesh.visible_instance_count = 0
	trace_node.multimesh = trace_mesh
	trace_node.material_override = mat(Color("e4eff0"),0.05,.72)
	trace_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(trace_node)
	markers = Node3D.new()
	add_child(markers)

func wall_segment(a: Vector2, b: Vector2, board: Material, rail: Material) -> void:
	var center := (a+b)*.5
	var node := box(Vector3(.24,1.05,a.distance_to(b)+.04),Vector3(center.x,.525,center.y),board)
	node.rotation.y = atan2(b.x-a.x,b.y-a.y)
	var top := box(Vector3(.32,.09,a.distance_to(b)+.07),Vector3(center.x,1.10,center.y),rail)
	top.rotation.y = node.rotation.y

func clear_traces() -> void:
	trace_count = 0
	trace_mesh.visible_instance_count = 0
	previous = [null,null]

func add_traces(frames: Array) -> void:
	for pair in frames:
		for i in range(2):
			var b: Dictionary = pair[i]
			var point := Vector3(float(b.x),.016,float(b.y)-18.0)
			if b.contact and previous[i] != null:
				var delta: Vector3 = point-previous[i]
				var length := delta.length()
				if length > .015 and length < 1.5:
					var transform := Transform3D(Basis(Vector3.UP,atan2(delta.x,delta.z)),(point+previous[i])*.5)
					transform.basis = transform.basis.scaled(Vector3(1,1,length))
					trace_mesh.set_instance_transform(trace_count % CAPACITY,transform)
					trace_count += 1
					trace_mesh.visible_instance_count = mini(trace_count,CAPACITY)
			previous[i] = point if b.contact else null

func set_course(mode: String, catalog: Dictionary) -> void:
	for child in markers.get_children():
		child.queue_free()
	targets.clear()
	var points: Array = catalog.get("gates",[]) if mode == "rookie" else catalog.get("lights",[]) if mode == "timed" else []
	for p in points:
		var node := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = 1.7
		torus.outer_radius = 1.83
		torus.rings = 32
		torus.ring_segments = 8
		node.mesh = torus
		node.position = Vector3(float(p.x),.04,float(p.y)-18)
		node.material_override = mat(Color("c6b393"),.1,.4,0.25)
		markers.add_child(node)
		targets.append(node)

func update_course(frame: Dictionary) -> void:
	var index := int(frame.rookie.index) if frame.mode == "rookie" else int(frame.run.collected)%12
	for i in targets.size():
		targets[i].visible = i >= index if frame.mode == "rookie" else i == index
