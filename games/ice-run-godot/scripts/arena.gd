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

# The architecture is built once. Repeated seats, audience and lights are instanced.
var scoreboard: Label3D
var audience_rng := RandomNumberGenerator.new()

func beam(a: Vector3, b: Vector3, radius: float, material: Material) -> void:
	var node := box(Vector3(radius, radius, a.distance_to(b)), (a+b)*.5, material)
	node.look_at(b, Vector3.FORWARD if absf((b-a).normalized().y) > .99 else Vector3.UP)

func sign_text(text: String, pos: Vector3, scale_factor: float, color: Color, yaw: float = 0.0) -> Label3D:
	var sign := Label3D.new()
	sign.text = text
	sign.font = load("res://assets/fonts/title.ttf")
	sign.font_size = 64
	sign.pixel_size = scale_factor
	sign.position = pos
	sign.rotation.y = yaw
	sign.modulate = color
	sign.outline_size = 0
	sign.no_depth_test = false
	add_child(sign)
	return sign

func instances(mesh: Mesh, transforms: Array[Transform3D], colors: Array[Color], material: Material) -> void:
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.use_colors = true
	batch.mesh = mesh
	batch.instance_count = transforms.size()
	for i in transforms.size():
		batch.set_instance_transform(i, transforms[i])
		batch.set_instance_color(i, colors[i])
	var node := MultiMeshInstance3D.new()
	node.multimesh = batch
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)

func _ready() -> void:
	audience_rng.seed = 20260927
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("101724")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bacddd")
	env.ambient_light_energy = .48
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.15
	env.fog_enabled = true
	env.fog_light_color = Color("34465b")
	env.fog_density = .0018
	world.environment = env
	add_child(world)
	var ice := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(56,56)
	ice.mesh = plane
	var ice_mat := ShaderMaterial.new()
	ice_mat.shader = load("res://shaders/ice.gdshader")
	ice.material_override = ice_mat
	add_child(ice)
	var dark := mat(Color("131e2b"),.25,.6)
	var concrete := mat(Color("273644"),0,.88)
	var board := mat(Color("d8e5e9"),.12,.35)
	var rail := mat(Color("173b51"),.65,.23)
	var strip := mat(Color("daedff"),0,.24,2.2)
	var gold := mat(Color("bea775"),.6,.35)
	box(Vector3(105,.5,105),Vector3(0,-.32,0),concrete)
	var ceiling := box(Vector3(100,.4,100),Vector3(0,20,0),dark)
	# The high rink camera uses a roof cutaway; ice-level cameras see the ceiling.
	ceiling.layers = 2
	for corner in 4:
		var center := Vector2(19 if corner in [0,3] else -19,19 if corner<2 else -19)
		for segment in 24:
			var a := deg_to_rad(float(corner)*90+float(segment)*3.75)
			wall_segment(center+Vector2(cos(a),sin(a))*9,center+Vector2(cos(a+PI/48),sin(a+PI/48))*9,board,rail)
	for pair in [[Vector2(-19,-28),Vector2(19,-28)],[Vector2(-19,28),Vector2(19,28)],[Vector2(-28,-19),Vector2(-28,19)],[Vector2(28,-19),Vector2(28,19)]]:
		wall_segment(pair[0],pair[1],board,rail)
	# Four raked spectator banks with aisles and a lit concourse.
	var seats: Array[Transform3D] = []
	var seat_colors: Array[Color] = []
	var bodies: Array[Transform3D] = []
	var body_colors: Array[Color] = []
	var heads: Array[Transform3D] = []
	var head_colors: Array[Color] = []
	var arms: Array[Transform3D] = []
	var arm_colors: Array[Color] = []
	var coats := [Color("35475e"),Color("5f5064"),Color("939495"),Color("9e7465"),Color("233342"),Color("4d6670")]
	for side in 4:
		var angle := float(side)*PI*.5
		var basis := Basis(Vector3.UP,angle)
		for row in 9:
			var depth := 31.5+float(row)*1.35
			var height := .5+float(row)*.72
			var stand := box(Vector3(69,.6,1.35),basis*Vector3(0,height-.3,depth),concrete)
			stand.rotation.y = angle
			for seat in 58:
				if seat%15 in [0,1]: continue
				var x := -33.0+float(seat)*1.15
				var pos := basis*Vector3(x,height+.5,depth)
				seats.append(Transform3D(basis,pos))
				seat_colors.append(Color("243c55") if row%3 else Color("34516b"))
				if audience_rng.randf()>.22:
					var sway := audience_rng.randf_range(-.12,.12)
					var body_pos := basis*Vector3(x+sway,height+.69,depth-.26)
					bodies.append(Transform3D(basis.scaled(Vector3(1,audience_rng.randf_range(.85,1.15),1)),body_pos))
					var coat: Color = coats[audience_rng.randi()%coats.size()].darkened(.32)
					body_colors.append(coat)
					for arm_side in [-1,1]:
						arms.append(Transform3D(basis.rotated(basis.z,arm_side*.22),body_pos+basis*Vector3(arm_side*.19,-.06,0)))
						arm_colors.append(coat)
					heads.append(Transform3D(basis,body_pos+Vector3(0,.44,0)))
					head_colors.append(Color("b78e76").lerp(Color("654d40"),audience_rng.randf()).darkened(.22))
		var back := box(Vector3(91,12,.5),basis*Vector3(0,8,45),dark)
		back.rotation.y = angle
		var fascia := box(Vector3(72,1.4,.3),basis*Vector3(0,8.2,43),rail)
		fascia.rotation.y = angle
		var led := box(Vector3(72,.045,.12),basis*Vector3(0,7.45,42.8),strip)
		led.rotation.y = angle
		sign_text("E D G E W O R K     /     GRAND PRIX",basis*Vector3(0,8.2,42.78),.018,Color("c9d9e7"),angle+PI)
		# Event banners, rigging and structural columns.
		for x in [-34,-17,0,17,34]:
			box(Vector3(.5,19,.5),basis*Vector3(x,9.5,43),rail)
			var banner := box(Vector3(3.8,5,.08),basis*Vector3(x,12.8,43.3),rail)
			banner.rotation.y = angle
			sign_text("EW\n01",basis*Vector3(x,13,43.2),.025,Color("d8c295"),angle+PI)
		# Board typography faces the ice.
		for x in [-13,0,13]:
			sign_text("EDGEWORK" if x==0 else "THE ICE REMEMBERS",basis*Vector3(x,.63,27.8),.007,Color("294b60"),angle+PI)
	var seat_mesh := BoxMesh.new()
	seat_mesh.size = Vector3(.85,.62,.17)
	var vertex_mat := mat(Color.WHITE,0,.85)
	vertex_mat.vertex_color_use_as_albedo = true
	instances(seat_mesh,seats,seat_colors,vertex_mat)
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = .19
	body_mesh.height = .66
	body_mesh.radial_segments = 8
	body_mesh.rings = 3
	instances(body_mesh,bodies,body_colors,vertex_mat)
	var arm_mesh := CapsuleMesh.new()
	arm_mesh.radius = .065
	arm_mesh.height = .48
	arm_mesh.radial_segments = 6
	arm_mesh.rings = 2
	instances(arm_mesh,arms,arm_colors,vertex_mat)
	var head_mesh := SphereMesh.new()
	head_mesh.radius = .115
	head_mesh.height = .25
	head_mesh.radial_segments = 8
	head_mesh.rings = 4
	instances(head_mesh,heads,head_colors,vertex_mat)
	# Triangulated roof trusses and banks of luminaires.
	for z in [-32,-16,0,16,32]:
		beam(Vector3(-43,16,z),Vector3(43,16,z),.14,rail)
		beam(Vector3(-43,18,z),Vector3(43,18,z),.14,rail)
		for x in range(-42,42,4):
			beam(Vector3(x,16,z),Vector3(x+4,18,z),.09,rail)
			beam(Vector3(x,18,z),Vector3(x+4,16,z),.09,rail)
		for x in [-24,-12,0,12,24]:
			box(Vector3(3,.18,.8),Vector3(x,15.65,z),dark)
			box(Vector3(2.7,.035,.62),Vector3(x,15.53,z),strip)
	# A centre-hung, four-sided event board gives the venue a recognizable silhouette.
	box(Vector3(6.2,3.2,6.2),Vector3(0,11.5,0),dark)
	for side in 4:
		var angle := side*PI*.5
		var basis := Basis(Vector3.UP,angle)
		var screen := box(Vector3(5.7,2.6,.035),Vector3(0,11.5,0)+basis*Vector3(0,0,3.13),rail)
		screen.rotation.y = angle
		var sign := sign_text("EDGEWORK\nGRAND PRIX  /  01",Vector3(0,11.5,0)+basis*Vector3(0,0,3.17),.011,Color("dbecf6"),angle)
		if side==0: scoreboard=sign
		beam(Vector3(-2+side%2*4,13, -2+side/2*4),Vector3(-2+side%2*4,20,-2+side/2*4),.045,gold)
	for setup in [[Vector3(-68,-32,0),Color("e5efff"),1.25],[Vector3(-30,135,0),Color("ffe2bc"),.48],[Vector3(-48,60,0),Color("aecde9"),.3]]:
		var light := DirectionalLight3D.new()
		light.rotation_degrees = setup[0]
		light.light_color = setup[1]
		light.light_energy = setup[2]
		light.shadow_enabled = setup[2]>1
		light.directional_shadow_max_distance = 65
		light.shadow_bias = .035
		light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
		add_child(light)
	var probe := ReflectionProbe.new()
	probe.position = Vector3(0,4,0)
	probe.size = Vector3(94,40,94)
	probe.interior = true
	probe.box_projection = true
	probe.intensity = .65
	add_child(probe)
	var trace_node := MultiMeshInstance3D.new()
	trace_mesh = MultiMesh.new()
	trace_mesh.transform_format = MultiMesh.TRANSFORM_3D
	var groove := PlaneMesh.new()
	groove.size = Vector2(.024,1)
	trace_mesh.mesh = groove
	trace_mesh.instance_count = CAPACITY
	trace_mesh.visible_instance_count = 0
	trace_node.multimesh = trace_mesh
	trace_node.material_override = mat(Color("a6bfcb"),.12,.42)
	trace_node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(trace_node)
	markers = Node3D.new()
	add_child(markers)

func wall_segment(a: Vector2, b: Vector2, board: Material, rail: Material) -> void:
	var center := (a+b)*.5
	var node := box(Vector3(.22,1.05,a.distance_to(b)+.04),Vector3(center.x,.525,center.y),board)
	node.rotation.y = atan2(b.x-a.x,b.y-a.y)
	var top := box(Vector3(.30,.075,a.distance_to(b)+.07),Vector3(center.x,1.10,center.y),rail)
	top.rotation.y = node.rotation.y
	var kick := box(Vector3(.24,.13,a.distance_to(b)+.05),Vector3(center.x,.075,center.y),rail)
	kick.rotation.y = node.rotation.y

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
