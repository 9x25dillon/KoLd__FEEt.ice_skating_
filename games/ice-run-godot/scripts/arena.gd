extends Node3D
const SimSpace = preload("res://scripts/sim_space.gd")
var trace_mesh: MultiMesh
var ice_material: ShaderMaterial
var arena_environment: Environment
var crowd_material: ShaderMaterial
var crowd_mood := 0.0
# tools/build_spectator.py: the height under a seated thigh, so a body sits on its seat.
const SEAT_HEIGHT := .36
const SEAT_PITCH := .6
const SEATS_PER_ROW := 113
const AISLE_EVERY := 28
# A second, smaller view of the skaters alone, from the camera's mirror image
# under the ice. The ice shader lays it over itself by its own fresnel.
const MIRROR_LAYER := 4
var mirror_view: SubViewport
var mirror_camera: Camera3D
var trace_count := 0
var previous: Array = [null, null]
var trace_heading: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO]
var trace_steps := 0
# A blade the presentation has lifted off the ice leaves no line (skater.gd lifted_blade).
var trace_lifted := -1
# Metres sideways off a blade's own line, between two trace samples, that no edge can carve.
const TRACE_STEP := .05
var markers: Node3D
var targets: Array[Node3D] = []
const CAPACITY := 18000
# tools/ice-lab/game/venues.ts: the room around the ice, rebuilt per venue by apply_venue().
# Everything that changes between venues is grouped here; the ice and boards never change.
var venue_id := "grand-prix"
var roof: Node3D          # ceiling, trusses, fixture housings, the centre-hung board
var hall: Node3D          # stands, seats, back walls, fascia, columns
var banner_nodes: Array[Node3D] = []
var banner_signs: Array[Label3D] = []
var fascia_signs: Array[Label3D] = []
var board_signs: Array[Label3D] = []
var key_lights: Array = []          # [DirectionalLight3D, base energy]
var fixtures: Array[SpotLight3D] = []
var crowd_batch: MultiMesh
var crowd_base: Array[Transform3D] = []
var crowd_fill: Array[float] = []   # each body's draw: shown when it is over 1 - crowd
var concrete_mat: StandardMaterial3D
var dressing: Node3D      # per-venue extras: washes, string lights, pines, stars, the Kiss & Cry
# Spectators for the seats today's arena leaves empty draw from their own stream,
# so the Grand Prix house is the same people in the same seats as before venues.
var spare_rng := RandomNumberGenerator.new()

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

func beam(a: Vector3, b: Vector3, radius: float, material: Material, parent: Node3D = null) -> void:
	var node := box(Vector3(radius, radius, a.distance_to(b)), (a+b)*.5, material, parent)
	node.look_at(b, Vector3.FORWARD if absf((b-a).normalized().y) > .99 else Vector3.UP)

func board_sign(sign: Label3D) -> void:
	sign.layers = 1|MIRROR_LAYER

func sign_text(text: String, pos: Vector3, scale_factor: float, color: Color, yaw: float = 0.0, parent: Node3D = null) -> Label3D:
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
	(parent if parent != null else self).add_child(sign)
	return sign

func crowd(transforms: Array[Transform3D], colors: Array[Color], skins: Array[Color], today: int) -> void:
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.use_colors = true
	batch.use_custom_data = true
	var scene: Node = load("res://assets/generated/spectator.glb").instantiate()
	batch.mesh = scene.find_children("*","MeshInstance3D",true,false)[0].mesh
	scene.free()
	batch.instance_count = transforms.size()
	for i in transforms.size():
		batch.set_instance_transform(i,transforms[i])
		batch.set_instance_color(i,colors[i])
		# Alpha is this person's own timing (shaders/crowd.gdshader). The extra seats draw from their own stream.
		var timing := audience_rng.randf() if i < today else spare_rng.randf()
		batch.set_instance_custom_data(i,Color(skins[i].r,skins[i].g,skins[i].b,timing))
	var node := MultiMeshInstance3D.new()
	node.multimesh = batch
	crowd_material = ShaderMaterial.new()
	crowd_material.shader = load("res://shaders/crowd.gdshader")
	node.material_override = crowd_material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	crowd_batch = batch
	crowd_base = transforms

func instances(mesh: Mesh, transforms: Array[Transform3D], colors: Array[Color], material: Material, parent: Node3D = null) -> void:
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
	(parent if parent != null else self).add_child(node)

func _ready() -> void:
	audience_rng.seed = 20260927
	spare_rng.seed = 20261114
	roof = Node3D.new()
	add_child(roof)
	hall = Node3D.new()
	add_child(hall)
	dressing = Node3D.new()
	add_child(dressing)
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("101724")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bacddd")
	env.ambient_light_energy = .16
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_white = 3.2
	env.tonemap_exposure = 1.08
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.18
	env.adjustment_contrast = 1.06
	env.glow_enabled = true
	env.glow_intensity = .35
	env.glow_bloom = .02
	env.glow_hdr_threshold = 1.1
	env.ssao_enabled = true
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.6
	env.ssil_enabled = true
	env.ssil_intensity = .7
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = .0006
	env.volumetric_fog_albedo = Color("c8d8e8")
	env.volumetric_fog_anisotropy = .35
	env.volumetric_fog_length = 90
	arena_environment = env
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
	ice_material = ice_mat
	add_child(ice)
	var dark := mat(Color("131e2b"),.25,.6)
	var concrete := mat(Color("273644"),0,.88)
	concrete_mat = concrete
	var board := mat(Color("d8e5e9"),.12,.35)
	var rail := mat(Color("173b51"),.65,.23)
	var strip := mat(Color("daedff"),0,.24,2.2)
	var gold := mat(Color("bea775"),.6,.35)
	box(Vector3(105,.5,105),Vector3(0,-.32,0),concrete)
	var ceiling := box(Vector3(100,.4,100),Vector3(0,20,0),dark,roof)
	# The arena's main light stands in for its fixtures, which sit under this roof.
	ceiling.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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
	var seat_backs: Array[Transform3D] = []
	var back_colors: Array[Color] = []
	var bodies: Array[Transform3D] = []
	var skins: Array[Color] = []
	var body_colors: Array[Color] = []
	var coats := [Color("35475e"),Color("5f5064"),Color("939495"),Color("9e7465"),Color("233342"),Color("4d6670")]
	var fills: Array[float] = []
	var extra_bodies: Array[Transform3D] = []
	var extra_colors: Array[Color] = []
	var extra_skins: Array[Color] = []
	var extra_fills: Array[float] = []
	for side in 4:
		var angle := float(side)*PI*.5
		var basis := Basis(Vector3.UP,angle)
		for row in 9:
			var depth := 31.5+float(row)*1.35
			var height := .5+float(row)*.72
			var stand := box(Vector3(69,.6,1.35),basis*Vector3(0,height-.3,depth),concrete,hall)
			stand.rotation.y = angle
			# Real seats: a pan and a back at a real pitch, in blocks with aisles between.
			for seat in SEATS_PER_ROW:
				if seat%AISLE_EVERY < 3: continue
				var x := -33.8+float(seat)*SEAT_PITCH
				var tone := Color("121f33") if row%3 else Color("16273d")
				seats.append(Transform3D(basis,basis*Vector3(x,height+SEAT_HEIGHT-.04,depth+.08)))
				seat_colors.append(tone)
				seat_backs.append(Transform3D(basis*Basis(Vector3.RIGHT,-.14),basis*Vector3(x,height+SEAT_HEIGHT+.27,depth+.33)))
				back_colors.append(tone.darkened(.1))
				var draw := audience_rng.randf()
				# Today's arena seats everyone who draws over .14 (venues.ts grand-prix crowd .86).
				# The rest are seated too, from their own stream, for a fuller house; apply_venue shows them.
				var r: RandomNumberGenerator = audience_rng if draw > .14 else spare_rng
				var size := r.randf_range(.94,1.06)
				# The model faces its +Z; turned to the ice, and settled a little each their own way.
				var facing := basis*Basis(Vector3.UP,PI+r.randf_range(-.14,.14))
				var at := Transform3D(facing.scaled(Vector3.ONE*size),basis*Vector3(x,height,depth+.1))
				var coat: Color = coats[r.randi()%coats.size()].darkened(.5)
				var skin := Color("a07a62").lerp(Color("47332a"),pow(r.randf(),1.5))
				if draw > .14:
					bodies.append(at); body_colors.append(coat); skins.append(skin); fills.append(draw)
				else:
					extra_bodies.append(at); extra_colors.append(coat); extra_skins.append(skin); extra_fills.append(draw)
		var back := box(Vector3(91,12,.5),basis*Vector3(0,8,45),dark,hall)
		back.rotation.y = angle
		var fascia := box(Vector3(72,1.4,.3),basis*Vector3(0,8.2,43),rail,hall)
		fascia.rotation.y = angle
		var led := box(Vector3(72,.045,.12),basis*Vector3(0,7.45,42.8),strip,hall)
		led.rotation.y = angle
		fascia_signs.append(sign_text("E D G E W O R K     /     GRAND PRIX",basis*Vector3(0,8.2,42.78),.018,Color("c9d9e7"),angle+PI,hall))
		# Event banners, rigging and structural columns.
		for x in [-34,-17,0,17,34]:
			box(Vector3(.5,19,.5),basis*Vector3(x,9.5,43),rail,hall)
			# Hung on the ice side of the column, or the column hides the banner's middle.
			var banner := box(Vector3(3.8,5,.08),basis*Vector3(x,12.8,42.68),rail,hall)
			banner.rotation.y = angle
			banner_nodes.append(banner)
			banner_signs.append(sign_text("GRAND\nPRIX",basis*Vector3(x,13,42.6),.014,Color("d8c295"),angle+PI,hall))
		# Board typography faces the ice.
		for x in [-13,0,13]:
			board_sign(sign_text("EDGEWORK" if x==0 else "THE ICE REMEMBERS",basis*Vector3(x,.63,27.8),.007,Color("294b60"),angle+PI))
	var seat_mesh := BoxMesh.new()
	seat_mesh.size = Vector3(.5,.07,.46)
	var vertex_mat := mat(Color.WHITE,0,.85)
	vertex_mat.vertex_color_use_as_albedo = true
	instances(seat_mesh,seats,seat_colors,vertex_mat,hall)
	var back_mesh := BoxMesh.new()
	back_mesh.size = Vector3(.5,.56,.06)
	instances(back_mesh,seat_backs,back_colors,vertex_mat,hall)
	# Today's house first, in today's order, so their timings draw as before; the extra seats after.
	var today := bodies.size()
	bodies.append_array(extra_bodies); body_colors.append_array(extra_colors); skins.append_array(extra_skins)
	fills.append_array(extra_fills)
	crowd_fill = fills
	crowd(bodies,body_colors,skins,today)
	set_crowd(.86)
	# Triangulated roof trusses and banks of luminaires.
	for z in [-32,-16,0,16,32]:
		beam(Vector3(-43,16,z),Vector3(43,16,z),.14,rail,roof)
		beam(Vector3(-43,18,z),Vector3(43,18,z),.14,rail,roof)
		for x in range(-42,42,4):
			beam(Vector3(x,16,z),Vector3(x+4,18,z),.09,rail,roof)
			beam(Vector3(x,18,z),Vector3(x+4,16,z),.09,rail,roof)
		for x in [-24,-12,0,12,24]:
			box(Vector3(3,.18,.8),Vector3(x,15.65,z),dark,roof)
			box(Vector3(2.7,.035,.62),Vector3(x,15.53,z),strip,roof)
	# A centre-hung, four-sided event board gives the venue a recognizable silhouette.
	box(Vector3(6.2,3.2,6.2),Vector3(0,11.5,0),dark,roof)
	for side in 4:
		var angle := side*PI*.5
		var basis := Basis(Vector3.UP,angle)
		var screen := box(Vector3(5.7,2.6,.035),Vector3(0,11.5,0)+basis*Vector3(0,0,3.13),rail,roof)
		screen.rotation.y = angle
		var sign := sign_text("EDGEWORK\nGRAND PRIX  /  01",Vector3(0,11.5,0)+basis*Vector3(0,0,3.17),.0078,Color("dbecf6"),angle,roof)
		board_signs.append(sign)
		if side==0: scoreboard=sign
		beam(Vector3(-2+side%2*4,13, -2+side/2*4),Vector3(-2+side%2*4,20,-2+side/2*4),.045,gold,roof)
	for setup in [[Vector3(-68,-32,0),Color("e5efff"),.5],[Vector3(-30,135,0),Color("ffe2bc"),.48],[Vector3(-48,60,0),Color("aecde9"),.3]]:
		var light := DirectionalLight3D.new()
		light.rotation_degrees = setup[0]
		light.light_color = setup[1]
		light.light_energy = setup[2]
		light.shadow_enabled = setup[2]>1
		light.directional_shadow_max_distance = 65
		light.shadow_bias = .035
		light.shadow_blur = .6
		light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
		add_child(light)
		key_lights.append([light,setup[2]])
	# Rows of roof fixtures: what lights a real rink, and what the haze catches.
	for row in range(-2,3):
		for column in range(-2,3):
			var fixture := SpotLight3D.new()
			fixture.position = Vector3(column*12,14.5,row*11)
			fixture.rotation_degrees = Vector3(-90,0,0)
			fixture.spot_range = 22
			fixture.spot_angle = 46
			fixture.spot_attenuation = 1.0
			fixture.spot_angle_attenuation = 2.2
			fixture.light_color = Color("eaf2ff")
			fixture.light_energy = 6.5
			fixture.light_volumetric_fog_energy = 1.2
			fixture.light_specular = .9
			add_child(fixture)
			fixtures.append(fixture)
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
	groove.size = Vector2(.011,1)
	trace_mesh.mesh = groove
	trace_mesh.instance_count = CAPACITY
	trace_mesh.visible_instance_count = 0
	trace_node.multimesh = trace_mesh
	# A cut in bright ice reads darker than the ice around it, in shadow along its wall.
	var cut := ShaderMaterial.new()
	cut.shader = load("res://shaders/trace.gdshader")
	trace_node.material_override = cut
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
	# The boards stand on the ice, so the ice shows them too.
	node.layers = 1|MIRROR_LAYER
	top.layers = 1|MIRROR_LAYER
	kick.layers = 1|MIRROR_LAYER
	kick.rotation.y = node.rotation.y

func clear_traces() -> void:
	trace_count = 0
	trace_mesh.visible_instance_count = 0
	previous = [null,null]
	trace_heading = [Vector3.ZERO,Vector3.ZERO]

# A reaction rises fast and takes a few seconds to die away.
func react(amount: float) -> void:
	crowd_mood = maxf(crowd_mood,amount)

func update_crowd(skater_at: Vector3, dt: float) -> void:
	crowd_mood = maxf(0,crowd_mood-dt/3.5)
	crowd_material.set_shader_parameter("skater",skater_at)
	crowd_material.set_shader_parameter("cheer",crowd_mood)

func add_mirror() -> void:
	mirror_view = SubViewport.new()
	mirror_view.size = Vector2i(640,360)
	mirror_view.transparent_bg = true
	mirror_view.msaa_3d = Viewport.MSAA_DISABLED
	mirror_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	mirror_view.world_3d = get_world_3d()
	add_child(mirror_view)
	mirror_camera = Camera3D.new()
	mirror_camera.cull_mask = MIRROR_LAYER
	# Only the skater is in this view, and it is small and soft: no screen effects.
	var plain := arena_environment.duplicate() as Environment
	plain.ssao_enabled = false
	plain.ssil_enabled = false
	plain.volumetric_fog_enabled = false
	plain.glow_enabled = false
	mirror_camera.environment = plain
	mirror_view.add_child(mirror_camera)
	ice_material.set_shader_parameter("mirror",mirror_view.get_texture())
	ice_material.set_shader_parameter("mirror_strength",1.0)

func update_mirror(camera: Camera3D) -> void:
	if mirror_camera == null:
		add_mirror()
	var eye := camera.global_position
	var forward := -camera.global_basis.z
	mirror_camera.global_position = Vector3(eye.x,-eye.y,eye.z)
	mirror_camera.look_at(mirror_camera.global_position+Vector3(forward.x,-forward.y,forward.z))
	mirror_camera.fov = camera.fov
	mirror_camera.near = camera.near
	mirror_camera.far = camera.far
	var window := camera.get_viewport().get_visible_rect().size
	mirror_view.size = Vector2i(640,maxi(1,int(640.0*window.y/window.x)))

func add_traces(frames: Array) -> void:
	for pair in frames:
		for i in range(2):
			var b: Dictionary = pair[i]
			var point := SimSpace.point(b.x,b.y,.016)
			var cutting: bool = b.contact and i != trace_lifted
			if cutting and previous[i] != null:
				var delta: Vector3 = point-previous[i]
				var length := delta.length()
				# A real blade cannot step sideways on the ice, but the solver moves a
				# contact in one tick when the support changes, two feet to one. That is
				# a foot set down, not a cut, so the line ends and a new one starts.
				var stepped: bool = trace_heading[i] != Vector3.ZERO and absf(delta.cross(trace_heading[i]).y)>TRACE_STEP
				if stepped:
					trace_heading[i] = Vector3.ZERO
					trace_steps += 1
				elif length > .015 and length < 1.5:
					var transform := Transform3D(Basis(Vector3.UP,atan2(delta.x,delta.z))*Basis.from_scale(Vector3(1,1,length)),(point+previous[i])*.5)
					trace_mesh.set_instance_transform(trace_count % CAPACITY,transform)
					trace_count += 1
					trace_mesh.visible_instance_count = mini(trace_count,CAPACITY)
					trace_heading[i] = delta/length
			if not cutting:
				trace_heading[i] = Vector3.ZERO
			previous[i] = point if cutting else null

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
		node.position = SimSpace.point(p.x,p.y,.04)
		node.material_override = mat(Color("c6b393"),.1,.4,0.25)
		markers.add_child(node)
		targets.append(node)

# A lesson's travel targets (game/tutorial.ts TutorialTarget): a ring at each reach, a cone to round;
# the next one glows. Rebuilt only when the step's targets change.
var lesson_markers: Node3D
var lesson_key := ""
var lesson_next := -2
var lesson_nodes: Array[MeshInstance3D] = []
func set_lesson_targets(list: Array, next: int) -> void:
	if lesson_markers == null:
		lesson_markers = Node3D.new()
		add_child(lesson_markers)
	var key := JSON.stringify(list)
	if key == lesson_key and next == lesson_next:
		return
	lesson_next = next
	if key != lesson_key:
		lesson_key = key
		for child in lesson_markers.get_children():
			child.queue_free()
		lesson_nodes.clear()
		for t in list:
			var node := MeshInstance3D.new()
			if str(t.kind) == "cone":
				var cone := CylinderMesh.new()
				cone.top_radius = 0.0
				cone.bottom_radius = .25
				cone.height = .7
				node.mesh = cone
				node.position = SimSpace.point(t.x,t.y,.35)
			else:
				var torus := TorusMesh.new()
				torus.inner_radius = float(t.r)-.12
				torus.outer_radius = float(t.r)
				torus.rings = 48
				torus.ring_segments = 8
				node.mesh = torus
				node.position = SimSpace.point(t.x,t.y,.04)
			lesson_markers.add_child(node)
			lesson_nodes.append(node)
	for i in lesson_nodes.size():
		var kind := str(list[i].kind)
		var color := Color("ff7a2f") if kind == "cone" else Color("9fe0b8") if kind == "checkpoint" else Color("d8c295")
		lesson_nodes[i].material_override = mat(color,.1,.4,2.5 if i == next else .3)

func update_course(frame: Dictionary) -> void:
	var index := int(frame.rookie.index) if frame.mode == "rookie" else int(frame.run.collected)%12
	for i in targets.size():
		targets[i].visible = i >= index if frame.mode == "rookie" else i == index

# ── venues (tools/ice-lab/game/venues.ts) ───────────────────────────────────
# Presentation only: the ice, the boards and every sim number are the same in every venue.
# Light levels arrive as multipliers on the values _ready() builds, which ARE the Grand Prix
# arena, so apply_venue(grand-prix) changes nothing. Every number below is AUTHORED.

# Show the seats whose draw is over 1 - fraction. At .86 that is exactly today's house.
func set_crowd(fraction: float) -> void:
	if crowd_batch == null:
		return
	for i in crowd_base.size():
		var t: Transform3D = crowd_base[i]
		crowd_batch.set_instance_transform(i, t if crowd_fill[i] > 1.0-fraction else Transform3D(Basis().scaled(Vector3.ZERO),t.origin))

func apply_venue(v: Dictionary) -> void:
	venue_id = str(v.get("id","grand-prix"))
	var l: Dictionary = v.get("light",{})
	var outdoor := bool(v.get("outdoor",false))
	roof.visible = not outdoor
	hall.visible = not outdoor
	set_crowd(0.0 if outdoor else float(v.get("crowd",.86)))
	var banner := str(v.get("banner",""))
	for b in banner_nodes: b.visible = banner != ""
	for s in banner_signs:
		s.text = banner
		s.visible = banner != ""
	for s in fascia_signs: s.text = str(v.get("fascia",""))
	# The centre-hung board: today's own text at the Grand Prix, else the venue's name.
	for s in board_signs: s.text = "EDGEWORK\nGRAND PRIX  /  01" if venue_id == "grand-prix" else "EDGEWORK\n%s" % str(v.get("name","")).to_upper()
	var env := arena_environment
	env.background_color = Color(str(l.get("sky","101724")))
	env.ambient_light_color = Color(str(l.get("ambient","bacddd")))
	env.ambient_light_energy = .16*float(l.get("ambientScale",1))
	env.fog_light_color = Color(str(l.get("fog","34465b")))
	env.fog_density = .0018*float(l.get("fogScale",1))
	env.volumetric_fog_density = .0006*float(l.get("fogScale",1))
	env.tonemap_exposure = 1.08*float(l.get("exposure",1))
	for k in key_lights.size():
		var light: DirectionalLight3D = key_lights[k][0]
		light.light_energy = float(key_lights[k][1])*float(l.get("keyScale",1))
		if k == 0: light.light_color = Color(str(l.get("key","e5efff")))
	# Only a fraction of the roof grid lit, spread evenly: the grid's 25 ranked by a stride of 7.
	var lit := float(l.get("fixtures",1))
	for i in fixtures.size():
		var f := fixtures[i]
		f.visible = not outdoor and (float((i*7)%fixtures.size())+.5)/float(fixtures.size()) < lit
		f.light_color = Color(str(l.get("fixtureColor","eaf2ff")))
		f.light_energy = 6.5*float(l.get("fixtureScale",1))
	concrete_mat.albedo_color = Color("dfe8f2") if outdoor else Color("273644")
	for child in dressing.get_children():
		child.queue_free()
	var wash: Array = l.get("wash",[])
	for k in wash.size():
		add_wash(Color(str(wash[k])), k, wash.size())
	if float(l.get("stringLights",0)) > 0:
		add_string_lights(Color(str(l.get("fixtureColor","ffd9a0"))), float(l.stringLights))
	if outdoor:
		add_pines()
		add_stars()
	if bool(v.get("kissAndCry",false)):
		add_kiss_and_cry()

# A coloured spot on the ice from high in the roof, one of `count` around the sheet.
func add_wash(color: Color, k: int, count: int) -> void:
	var a := TAU*float(k)/float(maxi(1,count)) + .4
	var spot := SpotLight3D.new()
	spot.position = Vector3(cos(a)*16,14,sin(a)*12)
	dressing.add_child(spot)
	spot.look_at(Vector3(cos(a+1.6)*6,0,sin(a+1.6)*5),Vector3.UP)
	spot.spot_range = 34
	spot.spot_angle = 17
	spot.spot_angle_attenuation = 1.4
	spot.light_color = color
	spot.light_energy = 22.0
	spot.light_volumetric_fog_energy = 2.2

# The outdoor rink: posts round the boards, bulbs strung between them, and warm pools of light.
func add_string_lights(color: Color, strength: float) -> void:
	var points: Array[Vector3] = []
	var path: Array[Vector2] = []
	for corner in 4:
		var centre := Vector2(19 if corner in [0,3] else -19,19 if corner<2 else -19)
		for segment in 7:
			var a := deg_to_rad(float(corner)*90+float(segment)*15)
			path.append(centre+Vector2(cos(a),sin(a))*10.2)
	# Walk the loop, a bulb every 0.9 m, sagging between posts every 6 m.
	var post := mat(Color("1a1d24"),.3,.6)
	var since := 0.0
	for i in path.size():
		var a2: Vector2 = path[i]
		var b2: Vector2 = path[(i+1)%path.size()]
		var n := int(ceil(a2.distance_to(b2)/.9))
		for j in n:
			var p2 := a2.lerp(b2,float(j)/float(n))
			var s := fmod(since,6.0)/6.0
			points.append(Vector3(p2.x,2.25-.35*sin(PI*s),p2.y))
			if fmod(since,6.0) < .9:
				box(Vector3(.08,2.3,.08),Vector3(p2.x,1.15,p2.y),post,dressing)
			since += a2.distance_to(b2)/float(n)
	var bulb := SphereMesh.new()
	bulb.radius = .05
	bulb.height = .1
	var glow := mat(color,0,.4,4.0*strength)
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.mesh = bulb
	batch.instance_count = points.size()
	for i in points.size():
		batch.set_instance_transform(i,Transform3D(Basis(),points[i]))
	var node := MultiMeshInstance3D.new()
	node.multimesh = batch
	node.material_override = glow
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dressing.add_child(node)
	for i in range(0,points.size(),maxi(1,points.size()/14)):
		var omni := OmniLight3D.new()
		omni.position = points[i]-Vector3(0,.2,0)
		omni.omni_range = 9
		omni.light_color = color
		omni.light_energy = 1.1*strength
		omni.shadow_enabled = false
		dressing.add_child(omni)

# A ring of pines past the snow, seeded so the treeline is the same every night.
func add_pines() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1214
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 1.0
	cone.height = 1.0
	cone.radial_segments = 8
	var transforms: Array[Transform3D] = []
	var colors: Array[Color] = []
	for i in 90:
		var a := rng.randf()*TAU
		var r := rng.randf_range(40,62)
		var h := rng.randf_range(6,12)
		var w := h*rng.randf_range(.28,.36)
		transforms.append(Transform3D(Basis().scaled(Vector3(w,h,w)),Vector3(cos(a)*r,h*.5-.1,sin(a)*r)))
		colors.append(Color("0f2a22").lerp(Color("1d3b30"),rng.randf()))
	var tree := mat(Color.WHITE,0,.9)
	tree.vertex_color_use_as_albedo = true
	instances(cone,transforms,colors,tree,dressing)

func add_stars() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1115
	var dot := SphereMesh.new()
	dot.radius = .18
	dot.height = .36
	dot.radial_segments = 4
	dot.rings = 2
	var batch := MultiMesh.new()
	batch.transform_format = MultiMesh.TRANSFORM_3D
	batch.mesh = dot
	batch.instance_count = 320
	for i in 320:
		var a := rng.randf()*TAU
		var up := rng.randf_range(.25,1.4)
		var d := 110.0
		batch.set_instance_transform(i,Transform3D(Basis().scaled(Vector3.ONE*rng.randf_range(.5,1.3)),Vector3(cos(a)*d*cos(up),d*sin(up),sin(a)*d*cos(up))))
	var node := MultiMeshInstance3D.new()
	node.multimesh = batch
	node.material_override = mat(Color("dfe8ff"),0,1,3.0)
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dressing.add_child(node)

# The Kiss & Cry, dressed rinkside behind the -z boards: a backdrop, a bench, flowers, two lamps.
func add_kiss_and_cry() -> void:
	var at := Vector3(13,0,-29.9)
	box(Vector3(3.4,2.6,.08),at+Vector3(0,1.3,-.55),mat(Color("2b3d5c"),.1,.45),dressing)
	box(Vector3(3.6,.1,.12),at+Vector3(0,2.62,-.53),mat(Color("bea775"),.6,.35),dressing)
	box(Vector3(1.9,.45,.5),at+Vector3(0,.22,0),mat(Color("1f2a3a"),0,.7),dressing)
	var title := sign_text("KISS & CRY",at+Vector3(0,2.05,-.5),.012,Color("e9eef6"),0.0,dressing)
	title.layers = 1
	for k in 7:
		var flower := MeshInstance3D.new()
		var ball := SphereMesh.new()
		ball.radius = .07
		ball.height = .14
		flower.mesh = ball
		flower.material_override = mat([Color("e8577a"),Color("f2c94c"),Color("f7f1e8")][k%3],0,.6)
		flower.position = at+Vector3(-.75+k*.04,.5,.12+k*.02)
		dressing.add_child(flower)
	for side in [-1,1]:
		var lamp := SpotLight3D.new()
		lamp.position = at+Vector3(side*1.9,3.2,1.2)
		dressing.add_child(lamp)
		lamp.look_at(at+Vector3(0,.8,-.3),Vector3.UP)
		lamp.spot_range = 7
		lamp.spot_angle = 32
		lamp.light_color = Color("fff1dc")
		lamp.light_energy = 4.0
