extends Node3D
const SimSpace = preload("res://scripts/sim_space.gd")
var skeleton: Skeleton3D
var bone_ids: Dictionary = {}
var state: Dictionary = {}
var pose_low := false
var model: Node3D
var initialized := false
var model_path := "res://assets/generated/skater.glb"
# The browser's costume presets (game/appearance.ts SKINS, via the bridge's
# catalog) recolour tools/build_skater.py's material slots by name. A model
# without these names — the Berserker — keeps its own authored materials.
const SKIN_SLOTS := {
	"Midnight plum satin": "bodice", "Flowing skirt satin": "skirt", "Illusion sleeve": "sleeve",
	"Champagne crystals": "trim", "Espresso hair": "hair", "Warm porcelain": "skin", "Skin-tone tights": "tights",
}
var skin: Dictionary = {}
# game/atelier.ts FABRICS, in its order; fabric.gdshader's `fabric` indexes it.
const FABRICS := ["satin","velvet","lycra","mesh"]
var sprays: Array[CPUParticles3D] = []
# Each model's own proportions, read from its skeleton (measure_rig); the
# defaults are tools/build_skater.py's. The solver's comHeight is .95.
const COM_HEIGHT := .95
var thigh := .4105
var shin := .3755
var ankle_height := .105
var hip_half_width := .105
var com_above_hip := .06
var hips_length := .17
var spine_length := .37
var shoulder_rest := Vector2(.185,.04)
var upper_arm := .29
var forearm := .2074
const BODY_WEIGHT := 540.0 # N, the support load the sim reports gliding on one foot
# Presentation-only easing, for what the sim does not state: authored poses
# (camel, sit, low, fallen), arms, and a foot leaving or rejoining the ice.
const POSE_RATE := 12.0
# A fall, from its first tick: the hip takes the ice at about FALL_HIT, and the
# trunk rolls over onto the forearm between FALL_ROLL_FROM and FALL_ROLL_TO. Presentation only.
const FALL_HIT := .26
const FALL_ROLL_FROM := .16
const FALL_ROLL_TO := .62
# sim/params.ts inertiaTucked and inertiaOpen: the range a body's inertia moves through.
const INERTIA_TUCKED := .95
const INERTIA_OPEN := 4.0
const ARM_RATE := 14.0
const FOOT_RATE := 16.0
# Draws the skater into the arena's reflection (arena.gd MIRROR_LAYER) too.
const REFLECTED_LAYERS := 1|4
var frame_age := 0.0
var upper_turn := 0.0
# How a spin finishes. Presentation only: the sim knows nothing of it.
const SPIN_EXIT := 1.6
# The second arm follows the first by this much of the body's turn (a quarter), so
# a faster spin opens faster, and a spin the other way swaps which arm goes first.
const SPIN_ARM_TURN := PI/2
var was_spinning := false
var spin_foot := 0
var spin_rate := 0.0
var spin_sign := 1.0
var spin_exit_left := 0.0
var spin_exit_power := 0.0
var arm_open: Array[float] = [1.0,1.0]
# game/armfocus.ts: 0 arms held to work, 1 arms carrying the line.
var arm_style := 1.0
var head_turn := 0.0
var head_down := 0.0
var backing := 0.0
# Radians: how far the shoulders will hold against the hips, the sim's own twistMax.
const SHOULDER_HOLD := .8
const SHOULDERS_LEVEL := .55
# Radians out from straight ahead; about 75 degrees, near a skater's real turnout.
const FREE_TOE_TURNOUT := 1.3
# Metres the crown tips forward, travelling backward: about 20 degrees down onto the tracing.
const GAZE_DOWN := .105
# The elbow's range of about 130 degrees; at rest the forearm sweeps 30% of it, ±20 degrees.
const FOREARM_SWING := .345
const FOREARM_SWING_MAX := .6
const UPPER_SWING_MAX := .38
const ARM_LAG_STIFFNESS := 40.0
const ARM_LAG_DAMPING := 9.0
# What the career's arm focus looks like, Function to Expression. Function is quick and
# economical, low and close to the body. Expression is slow with a long follow-through,
# carried higher and open, with soft wrists. Nothing here reaches the sim, and it still
# stays below the shoulder: no one holds their arms level for a program.
const ARM_RATE_FUNCTION := 18.0
const ARM_RATE_EXPRESSION := 8.0
const SWAY_RATE_FUNCTION := 1.15
const SWAY_RATE_EXPRESSION := .8
const SWAY_FUNCTION := .45
const LINE_REACH := .14 # m the leading hand goes forward along a turn, and the other back
const LINE_LIFT := .05 # m it rises as it leads, so the arms make a diagonal
const WRIST_DRAG := .07 # how far a moving hand trails its forearm
const WRIST_DROOP_FUNCTION := .1
const WRIST_DROOP_EXPRESSION := .38
const WRIST_RATE := 12.0
var arm_energy := 0.0
var sway_clock := 0.0
var arm_lag := 0.0
var arm_lag_rate := 0.0
var arm_last_yaw := 0.0
var hand_last: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO]
var hand_aim: Array[Vector3] = [Vector3.DOWN,Vector3.DOWN]
var trunk_offsets: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO,Vector3.ZERO,Vector3.ZERO]
var foot_on_ice: Array[float] = [1.0,1.0]
# The skirt: panels hanging from the waist (tools/build_athlete.py), each a tip on
# a spring toward where it hangs at rest. Presentation only; nothing reads it back.
const SKIRT_STIFFNESS := 160.0
const SKIRT_DRAG := .90
# Its own fixed step: a spring stepped by the display's frame time hangs differently at every frame rate.
const SKIRT_STEP := 1.0/120.0
const THIGH_RADIUS := .085
# Panels are a hand's width apart at the hem and the cloth between them is a straight
# chord, so a panel must stand this much clear or the leg comes through between two.
const SKIRT_LEG_CLEAR := .03
const SHIN_RADIUS := .055
var skirt_bones: Array[String] = []
var skirt_pivots: Array[Vector3] = []
var skirt_rest_tips: Array[Vector3] = []
var skirt_tips: Array[Vector3] = []
var skirt_last: Array[Vector3] = []
var skirt_gap := 0.0
var skirt_dirty := true
var skirt_pushed := 0.0
var skirt_pierce_peak := 0.0
var skirt_clock := 0.0
var skirt_pivots_last: Array[Vector3] = []
var skirt_centre_last := Vector3.ZERO
var skirt_yaw_last := 0.0
# The share of the true outward pull a spin puts on the cloth at each radius.
const SKIRT_FLARE := .6
# How close to level with the waist a flared hem may ride, in metres below it.
const SKIRT_TOP := -.07
# Metres the hem trails per m/s of travel: air on the cloth, capped.
const SKIRT_TRAIL := .012
const SKIRT_TRAIL_MAX := .07
# Metres the hem swings per m/s^2 of the edge's pull.
const SKIRT_SWING := .022
const SKIRT_SWING_MAX := .09
var last_contacts: Array[Vector3] = []
var contact_slide: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO]
var free_feet: Array[Vector3] = [Vector3(-.15,.16,.22),Vector3(.15,.16,.22)]
var arm_targets: Array[Vector3] = [Vector3(-.25,-.14,-.05),Vector3(-.43,-.19,-.12),Vector3(.25,-.14,-.05),Vector3(.43,-.19,-.12)]
var effects_active := true
# The face. Eyes reach a new target first and the head catches up, so how far they lead
# comes from the head's own lag. Fixations and blink timing are presentation, not sim.
const EYE_DOME := .0156 # m, the eye's radius in build_athlete.py
const IRIS_UV_PER_M := .42/.0062 # the iris's scale on the dome, also from the builder
const EYE_TURN_MAX := .3 # rad, about 17 degrees before the iris crowds the eye's corner
const EYE_DROP_MAX := .2
const EYE_SPEED := 8.0 # rad/s, a saccade
const EYE_DROP_PER_HEAD := .33 # rad of gaze for head_down's whole range
const SACCADE_BLINK := .2 # rad; large gaze shifts tend to bring a blink with them
const BLINK_CLOSE := .07
const BLINK_HOLD := .03
const BLINK_OPEN := .16
const BLINK_REST := 1.5 # s; a run of gaze shifts must not make her flutter
var eye_material: ShaderMaterial
var lid_mesh: MeshInstance3D
var lid_shape := -1
var face_rng := RandomNumberGenerator.new()
var eye_gaze := Vector2.ZERO # rad: x toward positive head_turn, y up
var eye_fixation := Vector2.ZERO
var fixation_left := 0.0
var blink_wait := 2.0
var blink_age := -1.0
var since_blink := BLINK_REST
var blinks := 0
var eye_lead_peak := 0.0
var face_was_airborne := false
var cloth_materials: Array[ShaderMaterial] = []
var contact_shadow: MeshInstance3D
# Pairs: the partner's supported-lift height, presented above the solver's ground plane.
var lift_height := 0.0

# s since this fall began, -1 when up; and which side of the body (+x, -x) takes it.
# game/motion/player.ts: a clip from the motion library this frame (a fall, or a dance style's
# arms), eased in and out by motion_weight; the last pose is kept to ease out of.
var motion: Dictionary = {}
var motion_pose: Dictionary = {}
var motion_layer := ""
var motion_weight := 0.0
const MOTION_RATE := 4.0
var fall_clock := -1.0
var fall_side := 1.0

# The landing hip is the side she was already going down on: where she leaned
# when the sim called the fall, or her skating foot if she was upright. Latched,
# so she does not change sides while sliding. game/fall.ts is this rule's browser twin.
func track_fall(dt: float, to_body: Basis) -> void:
	if not bool(state.fallen):
		fall_clock = -1.0
		return
	if fall_clock>=0.0:
		fall_clock += dt
		return
	fall_clock = 0.0
	var lean := float(state.lean)
	var toward_left := signf(lean) if absf(lean)>.02 else (1.0 if int(state.supportFoot)==0 else -1.0)
	var sim_left: Vector3 = to_body*SimSpace.direction(-float(state.heading.y),float(state.heading.x))
	fall_side = signf(sim_left.x)*toward_left

func _ready() -> void:
	load_model(model_path)
	contact_shadow = MeshInstance3D.new()
	var shadow_plane := PlaneMesh.new()
	shadow_plane.size = Vector2(.8,.8)
	contact_shadow.mesh = shadow_plane
	var shadow_material := ShaderMaterial.new()
	shadow_material.shader = load("res://shaders/contact.gdshader")
	contact_shadow.material_override = shadow_material
	contact_shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(contact_shadow)
	for i in 2:
		var spray := CPUParticles3D.new()
		spray.amount = 45
		spray.lifetime = .48
		spray.emitting = false
		spray.local_coords = false
		spray.direction = Vector3(0,.4,1)
		spray.spread = 30
		spray.gravity = Vector3(0,-4,0)
		spray.initial_velocity_min = .5
		spray.initial_velocity_max = 1.8
		spray.scale_amount_min = .008
		spray.scale_amount_max = .021
		var snow := SphereMesh.new()
		snow.radius = 1
		snow.height = 2
		snow.radial_segments = 4
		snow.rings = 2
		var snow_mat := StandardMaterial3D.new()
		snow_mat.albedo_color = Color("dfebef")
		snow_mat.roughness = .7
		snow.material = snow_mat
		spray.mesh = snow
		add_child(spray)
		sprays.append(spray)

# Any rigged glTF answers to this the same way, provided it poses the eleven
# bones aim_bone() below drives by exact name (Hips, Spine, Head, Thigh/Shin/
# Foot L/R, Arm/Forearm L/R) — see games/ice-run-godot/tools/build_skater.py
# and build_berserker.py, which both build to that same skeleton on purpose.
# A bone this does not find is simply never posed (see aim_bone's early
# return), so a mismatched rig would stand in its rest pose rather than error.
func load_model(path: String) -> void:
	if model and path == model_path:
		return
	if model:
		model.queue_free()
		skeleton = null
		bone_ids.clear()
		eye_material = null
		lid_mesh = null
		lid_shape = -1
	model_path = path
	cloth_materials.clear()
	model = load(model_path).instantiate()
	# Blender's -Y face direction becomes glTF +Z; the skating actor faces -Z.
	# Align before solving bones, so the blade rocker is not rotated upside down.
	model.rotation.y = PI
	add_child(model)
	recolour(model)
	reflect_in_ice(model)
	skeleton = find_skeleton(model)
	if skeleton:
		for i in skeleton.get_bone_count():
			bone_ids[skeleton.get_bone_name(i)] = i
		measure_rig()

func measure_rig() -> void:
	var at := func(bone: String) -> Vector3: return skeleton.get_bone_global_rest(bone_ids[bone]).origin if bone_ids.has(bone) else Vector3.ZERO
	if not bone_ids.has("ThighL") or not bone_ids.has("ArmL"):
		return
	thigh = at.call("ThighL").distance_to(at.call("ShinL"))
	shin = at.call("ShinL").distance_to(at.call("FootL"))
	ankle_height = at.call("FootL").y
	hip_half_width = absf(at.call("ThighL").x)
	com_above_hip = COM_HEIGHT-at.call("ThighL").y
	hips_length = at.call("Hips").distance_to(at.call("Spine"))
	spine_length = at.call("Spine").distance_to(at.call("Head"))
	shoulder_rest = Vector2(absf(at.call("ArmL").x),at.call("Head").y-at.call("ArmL").y)
	upper_arm = at.call("ArmL").distance_to(at.call("ForearmL"))
	if bone_ids.has("HandL"):
		forearm = at.call("ForearmL").distance_to(at.call("HandL"))
	measure_skirt()

func measure_skirt() -> void:
	skirt_bones.clear()
	skirt_pivots.clear()
	skirt_rest_tips.clear()
	skirt_dirty = true
	var turned := skeleton.global_basis
	var hips := skeleton.get_bone_global_rest(bone_ids["Hips"]).origin
	for bone in bone_ids:
		if not str(bone).begins_with("Skirt"):
			continue
		var rest := skeleton.get_bone_global_rest(bone_ids[bone])
		skirt_bones.append(bone)
		skirt_pivots.append(model.transform.basis*(rest.origin-hips))
		skirt_rest_tips.append(model.transform.basis*(rest.origin+rest.basis.y.normalized()*skirt_length(rest)-hips))
	if not skirt_bones.is_empty():
		skirt_gap = skirt_rest_tips[0].distance_to(skirt_rest_tips[1])

# A bone's length is not in a glTF; the builder's panels all hang from the waist
# to the hem, whose height the rig states through the thigh.
func skirt_length(rest: Transform3D) -> float:
	var drop := rest.origin.y-(skeleton.get_bone_global_rest(bone_ids["ThighL"]).origin.y-.205)
	return drop/maxf(.2,-rest.basis.y.normalized().y)

func push_off(point: Vector3, a: Vector3, b: Vector3, radius: float) -> Vector3:
	var along := b-a
	var nearest := a+along*clampf((point-a).dot(along)/along.length_squared(),0,1)
	var away := point-nearest
	if away.length()>=radius or away.length()<.0001:
		return Vector3.ZERO
	return away.normalized()*(radius-away.length())

func swing_skirt(dt: float, hip: Vector3, spine: Vector3, legs: Array[Vector3]) -> void:
	if skirt_bones.is_empty():
		return
	var count := skirt_bones.size()
	var hang := Basis(Quaternion(Vector3.UP,(spine-hip).normalized()))
	var pivots: Array[Vector3] = []
	var rests: Array[Vector3] = []
	for i in count:
		pivots.append(to_global(hip+hang*skirt_pivots[i]))
		rests.append(to_global(hip+hang*skirt_rest_tips[i]))
	if skirt_dirty or skirt_tips.size()!=count or skirt_tips[0].distance_to(rests[0])>1.2:
		skirt_tips = rests.duplicate()
		skirt_last = rests.duplicate()
		skirt_centre_last = to_global(hip)
		skirt_yaw_last = rotation.y
		skirt_dirty = false
	var wind := -SimSpace.direction(state.vel.x,state.vel.y)*SKIRT_TRAIL
	wind = wind.limit_length(SKIRT_TRAIL_MAX)
	# On an edge the cloth swings out of the curve; an edge pulls the body the other way.
	var pulled := SimSpace.direction(-float(state.heading.y),float(state.heading.x))*float(state.get("latAccel",0))
	wind += (-pulled*SKIRT_SWING).limit_length(SKIRT_SWING_MAX)
	skirt_pushed = 0.0
	var step := SKIRT_STEP
	skirt_clock = minf(skirt_clock+dt,SKIRT_STEP*8)
	var waiting := floori(skirt_clock/SKIRT_STEP)
	var centre := to_global(hip)
	var carried := (centre-skirt_centre_last)/maxi(1,waiting)
	# The cloth turns with the body and flares outward by an explicit force. Left to
	# lag in the world, a panel falls a quarter-turn behind at 33 rad/s and tangles.
	var yaw_step := wrapf(rotation.y-skirt_yaw_last,-PI,PI)/maxi(1,waiting)
	var spin_rate := yaw_step/SKIRT_STEP
	var thigh_world: Array[Vector3] = []
	for point in legs: thigh_world.append(to_global(point))
	while skirt_clock>=SKIRT_STEP:
		skirt_clock -= SKIRT_STEP
		for i in count:
			# Drag acts on how the cloth moves against the skater, not against the ice:
			# damped against the ice, plain forward speed would blow the skirt out behind.
			skirt_tips[i] = centre+(skirt_tips[i]-centre).rotated(Vector3.UP,yaw_step)
			skirt_last[i] = centre+(skirt_last[i]-centre).rotated(Vector3.UP,yaw_step)
			var moving: Vector3 = carried+(skirt_tips[i]-skirt_last[i]-carried)*SKIRT_DRAG
			var radius: Vector3 = skirt_tips[i]-centre
			radius.y = 0
			skirt_last[i] = skirt_tips[i]
			skirt_tips[i] += moving+((rests[i]+wind-skirt_tips[i])*SKIRT_STIFFNESS+radius*spin_rate*spin_rate*SKIRT_FLARE)*step*step
		for _relax in 3:
			# Neighbours stay one cloth; no panel leaves the waist or passes through a leg.
			for i in count:
				var next := (i+1)%count
				var between: Vector3 = skirt_tips[next]-skirt_tips[i]
				var wanted := clampf(between.length(),skirt_gap*.55,skirt_gap*1.7)
				if between.length()>.0001:
					var fix: Vector3 = between.normalized()*(between.length()-wanted)*.5
					skirt_tips[i] += fix
					skirt_tips[next] -= fix
			for i in count:
				var from: Vector3 = pivots[i]
				for reach in [.5,.75,1.0]:
					var at: Vector3 = from.lerp(skirt_tips[i],reach)
					for leg in range(0,thigh_world.size(),3):
						var pushed := push_off(at,thigh_world[leg],thigh_world[leg+1],THIGH_RADIUS+SKIRT_LEG_CLEAR)+push_off(at,thigh_world[leg+1],thigh_world[leg+2],SHIN_RADIUS+SKIRT_LEG_CLEAR)
						skirt_pushed = maxf(skirt_pushed,pushed.length())
						# Cloth rides out and over a leg. Pushed straight off it, neighbouring
						# panels part either side and the thigh shows through the gap.
						var outward: Vector3 = at-to_global(hip)
						outward.y = 0
						skirt_tips[i] += (outward.normalized()*.8+Vector3.UP*.45)*pushed.length()/reach
				var hanging := (skirt_tips[i]-from).limit_length(rests[i].distance_to(from))
				# Cloth does not stand above its own waist, however fast the spin.
				hanging.y = minf(hanging.y,SKIRT_TOP)
				skirt_tips[i] = from+hanging
	if waiting>0:
		skirt_centre_last = centre
		skirt_yaw_last = rotation.y
	# How deep a leg stands through the cloth between two panels; the lab holds this down.
	for i in count:
		var other := (i+1)%count
		for reach in [.5,.75,1.0]:
			var between: Vector3 = (pivots[i].lerp(skirt_tips[i],reach)+pivots[other].lerp(skirt_tips[other],reach))*.5
			for leg in range(0,thigh_world.size(),3):
				skirt_pierce_peak = maxf(skirt_pierce_peak,push_off(between,thigh_world[leg],thigh_world[leg+1],THIGH_RADIUS).length())
				skirt_pierce_peak = maxf(skirt_pierce_peak,push_off(between,thigh_world[leg+1],thigh_world[leg+2],SHIN_RADIUS).length())
	for i in count:
		aim_bone(skirt_bones[i],to_local(pivots[i]),to_local(skirt_tips[i]))

func reflect_in_ice(node: Node) -> void:
	if node is MeshInstance3D:
		node.layers = REFLECTED_LAYERS
	for child in node.get_children():
		reflect_in_ice(child)

func apply_skin(next: Dictionary) -> int:
	skin = next
	cloth_materials.clear()
	return recolour(model) if model else 0

# Returns how many surfaces now wear the costume, for the smoke test.
func recolour(node: Node) -> int:
	var count := 0
	if node is MeshInstance3D and node.mesh:
		if node.find_blend_shape_by_name("Blink") >= 0:
			lid_mesh = node
			lid_shape = node.find_blend_shape_by_name("Blink")
		for i in node.mesh.get_surface_count():
			var base := node.mesh.surface_get_material(i) as BaseMaterial3D
			var slot: String = SKIN_SLOTS.get(base.resource_name, "") if base else ""
			# Painted skin and hair keep their paint; the cards among them cut out by alpha.
			if base and base.albedo_texture:
				if base.resource_name == "Eyes":
					eye_material = ShaderMaterial.new()
					eye_material.shader = load("res://shaders/eye.gdshader")
					eye_material.set_shader_parameter("iris",base.albedo_texture)
					node.set_surface_override_material(i,eye_material)
					continue
				var painted := base.duplicate() as BaseMaterial3D
				if base.resource_name == "Espresso hair":
					# The paint fades to orange at the tips; the costume's colour settles it.
					painted.albedo_color = Color.html(str(skin.get("hair","4a3528"))).lerp(Color.WHITE,.42)
				if base.resource_name == "Espresso hair":
					painted.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
					painted.cull_mode = BaseMaterial3D.CULL_DISABLED
				elif base.resource_name in ["Brow","Lashes"]:
					# No depth of their own: it would cut the skin's scattering at the card's edge.
					painted.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
					painted.cull_mode = BaseMaterial3D.CULL_DISABLED
					# Fine dark hairs, facing the ice's light: any sheen turns them pale grey.
					painted.metallic_specular = 0.0
					painted.roughness = 1.0
				elif base.resource_name in ["Warm porcelain","Skin-tone tights"]:
					# An atelier design (game/atelier.ts) tints the paint by its swatch against the
					# paint's own tone, so the texture's detail stays. Presets keep their paint untouched.
					if bool(skin.get("custom",false)):
						var wanted := Color.html(str(skin.get("skin" if base.resource_name == "Warm porcelain" else "tights","d4a68b")))
						var own := Color("e7bfa6") if base.resource_name == "Warm porcelain" else Color("d9b39b")
						painted.albedo_color = Color(minf(wanted.r/own.r,1.4),minf(wanted.g/own.g,1.4),minf(wanted.b/own.b,1.4))
					painted.subsurf_scatter_enabled = true
					painted.subsurf_scatter_skin_mode = true
					painted.subsurf_scatter_strength = .16
				node.set_surface_override_material(i,painted)
				if slot != "": count += 1
				continue
			if slot == "" or not skin.has(slot):
				node.set_surface_override_material(i, null)
				continue
			var worn := base.duplicate() as BaseMaterial3D
			worn.albedo_color = Color.html(str(skin[slot]))
			if slot in ["bodice","skirt","sleeve"]:
				var cloth := ShaderMaterial.new()
				if slot == "sleeve" and model_path.ends_with("skater-athlete.glb"):
					cloth.shader = load("res://shaders/sheer.gdshader")
					cloth.set_shader_parameter("tint",worn.albedo_color)
					node.set_surface_override_material(i,cloth)
					count += 1
					continue
				cloth.shader = load("res://shaders/fabric.gdshader")
				cloth.set_shader_parameter("tint",worn.albedo_color)
				cloth.set_shader_parameter("is_skirt",slot=="skirt")
				cloth.set_shader_parameter("is_sleeve",slot=="sleeve")
				# game/atelier.ts designs; presets carry neither field and stay satin, bare.
				cloth.set_shader_parameter("fabric",maxi(0,FABRICS.find(str(skin.get("fabric","satin")))))
				var density := clampf(float(skin.get("crystals",0.0)),0.0,1.0)
				# Stones gather on the bodice; the skirt gets them only at the heavier settings. Authored.
				cloth.set_shader_parameter("crystals",density if slot=="bodice" else density*.6 if slot=="sleeve" else density*density)
				cloth.set_shader_parameter("crystal_tint",Color.html(str(skin.get("trim","e8cca0"))))
				node.set_surface_override_material(i,cloth)
				cloth_materials.append(cloth)
			else:
				node.set_surface_override_material(i, worn)
			count += 1
	for child in node.get_children():
		count += recolour(child)
	return count

func find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var result := find_skeleton(child)
		if result:
			return result
	return null

func apply_frame(frame: Dictionary, snap: bool = false) -> void:
	state = frame.state
	pose_low = frame.low
	var next_motion = frame.get("motion")
	motion = next_motion if next_motion is Dictionary else {}
	if not motion.is_empty():
		motion_pose = motion.get("pose",{})
		motion_layer = str(motion.get("layer",""))
	arm_style = float(frame.get("armStyle",1.0))
	frame_age = 0.0
	if snap:
		position = SimSpace.point(state.pos.x,state.pos.y,float(state.jump.z))
		rotation.y = SimSpace.yaw(state.heading.x,state.heading.y)
		initialized = true
		skirt_dirty = true

func aim_bone(name: String, head: Vector3, tail: Vector3) -> void:
	if not bone_ids.has(name):
		return
	var index: int = bone_ids[name]
	var rest := skeleton.get_bone_global_rest(index)
	var a := skeleton.to_local(to_global(head))
	var b := skeleton.to_local(to_global(tail))
	var direction := (b-a).normalized()
	var correction := Quaternion(rest.basis.y.normalized(),direction)
	var aimed := Basis(correction)*rest.basis
	if name == "Spine":
		aimed = Basis(direction,upper_turn)*aimed
	elif name == "Head":
		aimed = Basis(direction,head_turn)*aimed
	# Only a shin past its reach stretches; every other bone arrives at its own length.
	if name.begins_with("Shin"):
		aimed.y *= clampf(a.distance_to(b)/shin,1.0,1.1)
	skeleton.set_bone_global_pose_override(index,Transform3D(aimed,a),1.0,true)

func bone_frame(toe: Vector3, up: Vector3) -> Basis:
	var along := toe.normalized()
	var across := along.cross(up).normalized()
	return Basis(across,along,across.cross(along))

# A foot is placed by both its toe and its top: the top is what a tilted blade
# rolls, and an aim alone leaves that roll to whatever the rest pose implied.
func aim_foot(name: String, ankle: Vector3, toe: Vector3, up: Vector3) -> void:
	if not bone_ids.has(name):
		return
	var index: int = bone_ids[name]
	var rest := skeleton.get_bone_global_rest(index)
	var to_skeleton := skeleton.global_basis.inverse()*global_basis
	var rest_toe := Vector3(rest.basis.y.x,0,rest.basis.y.z)
	var aimed := bone_frame(to_skeleton*toe,to_skeleton*up)*bone_frame(rest_toe,Vector3.UP).inverse()*rest.basis
	skeleton.set_bone_global_pose_override(index,Transform3D(aimed,skeleton.to_local(to_global(ankle))),1.0,true)

func plant_leg(suffix: String, hip: Vector3, ankle: Vector3, pole: Vector3) -> Vector3:
	var delta := ankle-hip
	var reach := clampf(delta.length(),.1,thigh+shin-.001)
	var direction := delta.normalized()
	var bend := (pole-direction*pole.dot(direction)).normalized()
	var along := (thigh*thigh-shin*shin+reach*reach)/(2*reach)
	var knee := hip+direction*along+bend*sqrt(maxf(0,thigh*thigh-along*along))
	aim_bone("Thigh"+suffix,hip,knee)
	aim_bone("Shin"+suffix,knee,ankle)
	return knee

# 0..1: how far through the finish's rise and hold the skater is.
func exit_progress() -> float:
	return 1.0-spin_exit_left/SPIN_EXIT

func exit_amount() -> float:
	if spin_exit_left <= 0.0: return 0.0
	var at := exit_progress()
	return smoothstep(0.0,.22,at)*(1.0-smoothstep(.7,1.0,at))

# The blade the finish lifts off the ice, or -1. Two feet down, the sim still has it
# on the ice; its tracing stops with it, so the marks agree with what you see.
func lifted_blade() -> int:
	return 1-spin_foot if exit_amount()>.01 else -1

func follow_spin(dt: float, upright: bool, air: bool) -> void:
	if upright:
		spin_rate = absf(float(state.yawRate))
		if float(state.yawRate) != 0.0: spin_sign = signf(float(state.yawRate))
		spin_foot = int(state.supportFoot)
		was_spinning = true
	elif was_spinning:
		was_spinning = false
		if not air and not bool(state.fallen):
			spin_exit_left = SPIN_EXIT
			# The harder she was spinning, the bigger the finish.
			spin_exit_power = clampf(spin_rate/28.0,.45,1.0)
	if air or bool(state.fallen):
		spin_exit_left = 0.0
	spin_exit_left = maxf(0.0,spin_exit_left-dt)
	var opened := 1.0
	if upright:
		opened = clampf((float(state.spin.inertia)-INERTIA_TUCKED)/(INERTIA_OPEN-INERTIA_TUCKED),0,1)
	# The shoulder travelling forward with the spin leads: the right one anticlockwise.
	var leading := 1 if spin_sign>0 else 0
	arm_open[leading] = lerpf(arm_open[leading],opened,1.0-exp(-16.0*dt))
	var behind := clampf(SPIN_ARM_TURN/maxf(spin_rate,.1),.04,.35)
	arm_open[1-leading] = lerpf(arm_open[1-leading],arm_open[leading],1.0-exp(-dt/behind))

func start_blink() -> void:
	if blink_age < 0.0 and since_blink >= BLINK_REST:
		blink_age = 0.0
		since_blink = 0.0
		blinks += 1
		blink_wait = face_rng.randf_range(2.2,6.0)

# 0 open, 1 shut: quick to close, slower to open.
func blink_amount() -> float:
	if blink_age < 0.0: return 0.0
	if blink_age < BLINK_CLOSE: return smoothstep(0.0,BLINK_CLOSE,blink_age)
	if blink_age < BLINK_CLOSE+BLINK_HOLD: return 1.0
	return 1.0-smoothstep(BLINK_CLOSE+BLINK_HOLD,BLINK_CLOSE+BLINK_HOLD+BLINK_OPEN,blink_age)

func update_face(dt: float, looking: float, eyes_down: float, air: bool) -> void:
	if eye_material == null and lid_shape < 0: return
	fixation_left -= dt
	if fixation_left <= 0.0:
		eye_fixation = Vector2(face_rng.randf_range(-.07,.07),face_rng.randf_range(-.035,.035))
		fixation_left = face_rng.randf_range(.7,2.6)
	var lead := Vector2(looking-head_turn,(head_down-eyes_down)*EYE_DROP_PER_HEAD)
	eye_lead_peak = maxf(eye_lead_peak,absf(lead.x))
	var target := lead+eye_fixation
	target = Vector2(clampf(target.x,-EYE_TURN_MAX,EYE_TURN_MAX),clampf(target.y,-EYE_DROP_MAX,EYE_DROP_MAX))
	if eye_gaze.distance_to(target) > SACCADE_BLINK: start_blink()
	eye_gaze = eye_gaze.move_toward(target,EYE_SPEED*dt)
	# Touching down after a jump brings a reflex blink; otherwise they come every few seconds.
	if face_was_airborne and not air: start_blink()
	face_was_airborne = air
	since_blink += dt
	blink_wait -= dt
	if blink_wait <= 0.0: start_blink()
	if blink_age >= 0.0:
		blink_age += dt
		if blink_age > BLINK_CLOSE+BLINK_HOLD+BLINK_OPEN: blink_age = -1.0
	# The upper lid follows the eye down, resting lower the further down she looks.
	var lid_rest := clampf(.05-eye_gaze.y*.9+head_down*.15,0.0,.4)
	pose_face(eye_gaze,maxf(lid_rest,blink_amount()))

func pose_face(gaze: Vector2, lid: float) -> void:
	if eye_material:
		var slide := Vector2(-sin(gaze.x),sin(gaze.y))*EYE_DOME*IRIS_UV_PER_M
		eye_material.set_shader_parameter("gaze",slide)
	if lid_shape >= 0:
		lid_mesh.set_blend_shape_value(lid_shape,lid)

func _process(dt: float) -> void:
	if state.is_empty() or skeleton == null:
		return
	var motion := clampf(Vector2(state.vel.x,state.vel.y).length()*.12+absf(float(state.yawRate))*.08,0,1)
	for cloth in cloth_materials:
		cloth.set_shader_parameter("motion",motion if effects_active else .08)
	var air := int(state.jump.phase) == 2
	# The last moment of a flight opens up for the ice: arms, free leg, landing foot.
	var coming_down := air and float(state.jump.vz)<0 and float(state.jump.z)<-float(state.jump.vz)*.14
	# Frames arrive unevenly from the bridge. Carry the body on the sim's own
	# velocity between them and only ease out what that leaves, so it does not
	# trail its blades by speed/rate the way a bare low-pass does.
	var velocity := SimSpace.direction(state.vel.x,state.vel.y)
	var rise := float(state.jump.vz) if air else 0.0
	var truth := SimSpace.point(state.pos.x,state.pos.y,maxf(0,float(state.jump.z)+rise*frame_age)+lift_height)+velocity*frame_age
	position = (position+(velocity+Vector3.UP*rise)*dt).lerp(truth,1.0-exp(-18*dt)) if initialized else truth
	initialized = true
	contact_shadow.position.y = .022-position.y
	contact_shadow.scale = Vector3.ONE*(1+position.y*.3)
	contact_shadow.transparency = clampf(position.y*.25,0,.8)
	var heading := SimSpace.yaw(state.heading.x,state.heading.y)
	if air:
		heading += float(state.jump.rotation)
	var yaw_rate := float(state.yawRate)
	rotation.y = lerp_angle(rotation.y+yaw_rate*dt,heading+yaw_rate*frame_age,1.0-exp(-24*dt))
	frame_age = minf(frame_age+dt,.05)
	# The blades in the body's own frame, measured from the centre of mass
	# (s.pos): wherever the eased body has got to, they stay on their tracings.
	var to_body := Basis(Vector3.UP,-rotation.y)
	var contacts: Array[Vector3] = []
	var base := Vector3.ZERO
	var support := 0.0
	for blade in state.blade:
		var offset: Vector3 = to_body*SimSpace.direction(float(blade.contact.x)-float(state.pos.x),float(blade.contact.y)-float(state.pos.y))
		contacts.append(offset)
		if bool(blade.inContact):
			base += offset*float(blade.weight)
			support += float(blade.weight)
	var grounded := support>0 and not air and not bool(state.fallen)
	track_fall(dt,to_body)
	var fall_roll := smoothstep(FALL_ROLL_FROM,FALL_ROLL_TO,fall_clock)
	# The body hangs along the solver's own pendulum, contact to centre of mass,
	# which already holds its lean and its fore-aft pitch.
	var com := Vector3(0,float(state.comZ),0)
	var body_axis := (com-base/support).normalized() if grounded else Vector3.UP
	var knee := float(state.knee)
	var settled_hip := com-body_axis*com_above_hip+Vector3(0,0,knee*.035)
	var settled_spine := settled_hip+(body_axis+Vector3(0,0,-knee*.4)).normalized()*hips_length
	var settled_neck := settled_spine+(body_axis+Vector3(0,0,-knee*.14)).normalized()*spine_length
	var settled_head := settled_neck+Vector3(0,.12,0)
	var hip := settled_hip
	var spine := settled_spine
	var neck := settled_neck
	var head := settled_head
	var spinning := int(state.move) == 3
	var camel := (spinning and int(state.spin.position)==2) or int(state.move)==5
	var sit := spinning and int(state.spin.position)==1
	var upright_spin := spinning and int(state.spin.position)==0
	follow_spin(dt,upright_spin,air)
	var finish := exit_amount()
	if camel:
		spine = hip+Vector3(body_axis.x*.08,.08,-.15)
		neck = spine+Vector3(body_axis.x*.05,.10,-.31)
		head = neck+Vector3(0,.1,-.07)
	elif sit:
		hip.y = .50
		spine = hip+Vector3(0,.13,-.12)
		neck = spine+Vector3(0,.29,-.13)
		head = neck+Vector3(0,.12,0)
	if pose_low:
		hip.y -= .16
		spine = hip+Vector3(0,.10,.12)
		neck = spine+Vector3(0,.18,.22)
		head = neck+Vector3(0,.10,.03)
	if bool(state.fallen):
		# Down and out onto the hip with the trunk still up, then over onto the forearm.
		hip = Vector3(fall_side*.16,.13-.02*sin(PI*clampf((fall_clock-FALL_HIT)/.2,0,1)),.02)
		spine = hip+Vector3(-fall_side*.03,.20,-.04).lerp(Vector3(fall_side*.16,.14,.03),fall_roll)
		neck = spine+Vector3(-fall_side*.02,.36,-.02).lerp(Vector3(fall_side*.30,.22,.05),fall_roll)
		head = neck+Vector3(-fall_side*.02,.10,-.03)
	# Authored poses ease in as offsets, so a settled skater is the sim exactly.
	var ease_pose := 1.0-exp(-POSE_RATE*dt)
	trunk_offsets[0] = trunk_offsets[0].lerp(hip-settled_hip,ease_pose)
	trunk_offsets[1] = trunk_offsets[1].lerp(spine-settled_spine,ease_pose)
	trunk_offsets[2] = trunk_offsets[2].lerp(neck-settled_neck,ease_pose)
	trunk_offsets[3] = trunk_offsets[3].lerp(head-settled_head,ease_pose)
	hip = settled_hip+trunk_offsets[0]
	spine = settled_spine+trunk_offsets[1]
	neck = settled_neck+trunk_offsets[2]
	head = settled_head+trunk_offsets[3]
	# The trunk's bones keep their lengths through every authored shape.
	spine = hip+(spine-hip).normalized()*hips_length
	neck = spine+(neck-spine).normalized()*spine_length
	aim_bone("Hips",hip,spine)
	var ease_arm := 1.0-exp(-ARM_RATE*dt)
	var ease_foot := 1.0-exp(-FOOT_RATE*dt)
	# A skater's shoulders lead into a curve, and the eyes go where the ice is
	# going: over the shoulder when travelling backward. Neither is in the sim;
	# both are presentation only, on top of the sim's own twist.
	# How hard the arms are working, from what the sim is asking of the body: the turn,
	# the push, the balance, the momentum they are carrying into a jump.
	var yaw_rate_now := float(state.yawRate)
	var stroking := sin(clampf(float(state.strokeTime)*3,0,1)*PI)
	var carrying := float(state.get("armsL",0))
	var asked := maxf(maxf(absf(yaw_rate_now)/3.5,stroking*.8),maxf(absf(float(state.intAccel))*.25,absf(carrying)*.12))
	arm_energy = lerpf(arm_energy,clampf(asked+arm_style*.12,0,1),1.0-exp(-4.0*dt))
	sway_clock += dt*(1.4+Vector2(state.vel.x,state.vel.y).length()*.15)*lerpf(SWAY_RATE_FUNCTION,SWAY_RATE_EXPRESSION,arm_style)
	# The hands have weight: a body that turns leaves them behind, and they swing back.
	var yaw_pull := clampf((yaw_rate_now-arm_last_yaw)/maxf(dt,.001),-60,60)
	arm_last_yaw = yaw_rate_now
	arm_lag_rate += (-ARM_LAG_STIFFNESS*(arm_lag-clampf(carrying*.04,-.5,.5))-ARM_LAG_DAMPING*arm_lag_rate-yaw_pull*.9)*dt
	arm_lag = clampf(arm_lag+arm_lag_rate*dt,-.6,.6)
	var curve := clampf(yaw_rate_now*.14,-.4,.4) if grounded else 0.0
	# At full effort the swing reaches the trunk, the last joint in the chain.
	var trunk_swing := sin(sway_clock)*.09*smoothstep(.7,1.0,arm_energy) if grounded else 0.0
	# The shoulders hold square across the line she is travelling on, whichever way the
	# hips have turned under them, forward or backward. Fades out by 90 degrees off the
	# line, where "square" could be either way round. The sim's own twist comes on top.
	var over_the_hips := 0.0
	var line_of_travel := Vector2(state.vel.x,state.vel.y)
	if grounded and not spinning and line_of_travel.length()>1.0:
		var facing_now := Vector2(state.heading.x,state.heading.y)
		var off_line := wrapf(atan2(facing_now.cross(line_of_travel),facing_now.dot(line_of_travel)),-PI/2,PI/2)
		over_the_hips = off_line*smoothstep(0.0,.5,PI/2-absf(off_line))
	upper_turn = lerpf(upper_turn,float(state.get("twist",0))+curve+trunk_swing+clampf(over_the_hips,-SHOULDER_HOLD,SHOULDER_HOLD),ease_arm)
	# Forward, the eyes go where the ice is going. Travelling backward they follow the
	# blade's own line, down and along the tracing she has just cut.
	var travel := Vector2(state.vel.x,state.vel.y)
	var facing := Vector2(state.heading.x,state.heading.y)
	var looking := 0.0
	var eyes_down := 0.0
	var skating_blade: Dictionary = state.blade[int(state.supportFoot)]
	if grounded and not spinning and float(skating_blade.longSpeed)<-.8:
		var along := Vector2(skating_blade.tangent.x,skating_blade.tangent.y)
		looking = clampf(atan2(facing.cross(along),facing.dot(along)),-1.25,1.25)-upper_turn
		eyes_down = 1.0
	elif travel.length()>.8 and not air:
		looking = clampf(atan2(facing.cross(travel),facing.dot(travel)),-1.25,1.25)-upper_turn
	head_turn = lerpf(head_turn,looking,1.0-exp(-5.0*dt))
	head_down = lerpf(head_down,eyes_down,1.0-exp(-4.0*dt))
	update_face(dt,looking,eyes_down,air)
	aim_bone("Spine",spine,neck)
	aim_bone("Head",neck,head+Vector3(0,.17,0)+Vector3(0,0,-GAZE_DOWN*head_down).rotated(Vector3.UP,head_turn+upper_turn))
	var trunk_tilt := Basis(Quaternion(Vector3.UP,body_axis))
	# The trunk leans with the edge; the shoulders stay nearer level than it does.
	var shoulder_tilt := Basis(Quaternion(Vector3.UP,body_axis.lerp(Vector3.UP,SHOULDERS_LEVEL).normalized()))
	backing = lerpf(backing,1.0 if grounded and not spinning and float(skating_blade.longSpeed)<-.8 else 0.0,1.0-exp(-5.0*dt))
	var legs: Array[Vector3] = []
	for i in range(2):
		var suffix := "L" if i == 0 else "R"
		var side := -1.0 if i == 0 else 1.0
		var blade: Dictionary = state.blade[i]
		var on_ice := bool(blade.inContact) and not air and not bool(state.fallen) and not (finish>.01 and i!=spin_foot)
		# The loaded hip rides higher than the unloaded one.
		var h := hip+trunk_tilt*Vector3(side*hip_half_width,(float(blade.weight)-.5)*.05 if grounded else 0.0,0)
		var under := bool(state.fallen) and side==fall_side
		if bool(state.fallen):
			h.y += -.035 if under else .05
		var free := Vector3(side*.04,.25,.04 if i == 0 else -.03)
		if not air or coming_down:
			var extension := clampf(float(state.strokeTime)*2.5,0,1)
			# Trailing behind the skating foot and clear of it, wherever the lean has that foot.
			free = Vector3(side*(.12+extension*.19),.20+extension*.06,.36+extension*.15)
			if grounded: free.x += base.x/support
			if camel: free = Vector3(side*.08,.94,.68)
			elif sit: free = Vector3(side*.1,.20,-.60)
			free = h+(free-h).rotated(Vector3.UP,float(state.get("freeSwing",0)))
		if under:
			# The outer thigh on the ice, the knee out to that side and the foot trailing.
			free = Vector3(fall_side*.42,.08,.30)
		elif bool(state.fallen):
			# The other knee up and that foot flat ahead of her, ready to get up from.
			free = Vector3(-fall_side*.10,ankle_height,-.50)
		# Spinning, the free foot draws in to cross the skating knee as the arms do.
		if upright_spin:
			free = free.lerp(Vector3(-side*.02,.36,-.09),1.0-(arm_open[0]+arm_open[1])*.5)
		# The finish: the free leg sweeps round behind her and extends, trailing the spin.
		if finish>0.0 and i!=spin_foot:
			var long_line := Vector3(side*.12+(base.x/support if grounded else 0.0),.32+.16*spin_exit_power,.68)
			var sweep := -spin_sign*.9*(1.0-smoothstep(0.0,.35,exit_progress()))
			free = free.lerp(h+(long_line-h).rotated(Vector3.UP,sweep),finish)
		free_feet[i] = free_feet[i].lerp(free,ease_foot)
		# Coming down, the landing foot reaches for the ice ahead of the touchdown.
		var reaching := coming_down and i==int(state.supportFoot)
		foot_on_ice[i] = lerpf(foot_on_ice[i],1.0 if on_ice or reaching else 0.0,ease_foot)
		if foot_on_ice[i]>.995: foot_on_ice[i] = 1.0
		# The blade's top leans toward perpLeft(tangent) by its tilt, and the
		# ankle stands on that line, so a deep edge rolls the whole boot over.
		var toe: Vector3 = to_body*SimSpace.direction(blade.tangent.x,blade.tangent.y)
		var blade_left := Vector3.UP.cross(toe).normalized()
		var tilt := float(blade.tilt)
		var blade_up := Vector3.UP*cos(tilt)+blade_left*sin(tilt)
		# The solver moves a contact in one step when the support changes, two
		# feet to one. The boot carries that step away instead of teleporting.
		if last_contacts.size()==2 and contacts[i].distance_to(last_contacts[i])>.02:
			contact_slide[i] += last_contacts[i]-contacts[i]
		contact_slide[i] = contact_slide[i].lerp(Vector3.ZERO,ease_foot)
		var planted: Vector3 = contacts[i]+contact_slide[i]+blade_up*ankle_height
		var planting := smoothstep(0.0,1.0,foot_on_ice[i])
		var ankle: Vector3 = free_feet[i].lerp(planted,planting)
		# A free foot turns out from the hip.
		# Backward, the free foot leads her along the line: turned out from the hip and
		# pointed down it, as far as a stiff boot goes. Forward it just turns out.
		var pointed := Vector3(side*sin(FREE_TOE_TURNOUT),-.32,cos(FREE_TOE_TURNOUT)*-1.0).normalized()
		var loose_toe := Vector3(0,0,-1).rotated(Vector3.UP,-side*.6).lerp(pointed,backing).lerp(toe,planting)
		var loose_up := Vector3.UP.lerp(blade_up,planting)
		var pole := Vector3(0,0,-1).lerp(toe,.5*planting)
		if under: pole = Vector3(fall_side,.1,-.6)
		elif bool(state.fallen): pole = Vector3(-fall_side*.1,1,-.4)
		var knee_at := plant_leg(suffix,h,ankle,pole)
		legs.append_array([h,knee_at,ankle])
		if under:
			# The boot lies on its side, its top along the shin.
			loose_toe = Vector3(fall_side*.8,0,-.5).normalized()
			loose_up = (knee_at-ankle).normalized()
		elif bool(state.fallen):
			loose_toe = Vector3(-fall_side*.25,0,-1).normalized()
			loose_up = Vector3.UP
		aim_foot("Foot"+suffix,ankle,loose_toe,loose_up)
		sprays[i].position = ankle-Vector3(0,.08,0)
		sprays[i].emitting = effects_active and on_ice and float(blade.latSlipAccel)>.3 and absf(float(blade.longSpeed))>1
		# Harder the blade is loaded, harder it throws the snow.
		sprays[i].initial_velocity_max = 1.0+1.6*clampf(float(blade.normalLoad)/BODY_WEIGHT,0,1.5)
		var shoulder := neck+shoulder_tilt*Vector3(side*shoulder_rest.x,-shoulder_rest.y,0).rotated(Vector3.UP,upper_turn)
		var spread := .43 if not air else clampf(float(state.jump.inertia)/6,.12,.44)
		if spinning:
			spread = .15+clampf(float(state.spin.inertia)/6.0,0.0,1.0)*.34
		# At rest the arms hang relaxed, a little away from the sides, elbows soft: no one
		# holds them level for a whole program. The chosen style only opens them slightly.
		var elbow := Vector3(side*.10,-.26,.01).lerp(Vector3(side*.17,-.20,-.04),arm_style)
		var hand := Vector3(side*.14,-.46,-.10).lerp(Vector3(side*.34,-.31,-.21),arm_style)
		# They come out only when they are needed: when balance asks, or the sim's spin
		# has them open, or a finish shows them off. Those are the moments worth the effort.
		var lead := clampf(float(state.yawRate)*.6,-1,1)
		var wide_elbow := Vector3(side*spread*.62,-.06,-.03+side*lead*.05)
		var wide_hand := Vector3(side*spread*1.12,-.01,-.12+side*lead*.17)
		var catching := clampf(absf(float(state.intAccel))*.05+absf(float(state.get("balanceError",0)))/.25,0,1)
		var out := 1.0 if upright_spin else maxf(finish,catching*.8)
		# Expression draws a line along the turn: one arm leads and rises, the other trails.
		var line := lead*arm_style*(1.0-out)
		hand += Vector3(0,side*line*LINE_LIFT,side*line*LINE_REACH)
		elbow += Vector3(0,side*line*LINE_LIFT*.4,side*line*LINE_REACH*.4)
		elbow = elbow.lerp(wide_elbow,out)
		hand = hand.lerp(wide_hand,out)
		# An upright spin's arms follow the sim's own inertia: drawn in, they are
		# what is speeding her up, and they meet at the chest as it does.
		elbow = Vector3(side*.17,-.15,-.09).lerp(elbow,arm_open[i])
		hand = Vector3(side*.015,-.15,-.17).lerp(hand,arm_open[i])
		# Finishing, the arms rise and the leading one reaches forward along the spin.
		if finish>0.0:
			var leads := side*spin_sign
			hand += Vector3(side*.04,.10*spin_exit_power,-leads*.16)*finish
			elbow += Vector3(0,.05*spin_exit_power,-leads*.07)*finish
		if air and not coming_down:
			elbow = Vector3(side*.13,-.18,-.10)
			hand = Vector3(-side*.11,-.12,-.19)
		elif camel:
			elbow = Vector3(side*.23,.03,.08)
			hand = Vector3(side*.45,.01,.16)
		elif sit:
			elbow = Vector3(side*.10,-.05,-.24)
			hand = Vector3(side*.08,-.09,-.46)
		if pose_low:
			elbow = Vector3(side*.24,.02,.03)
			hand = Vector3(side*.44,-.02,.05)
		if under:
			# Out and ready, then taking what is left of the fall on the forearm, after the hip.
			elbow = Vector3(fall_side*.22,-.10,.02).lerp(Vector3(fall_side*.20,-shoulder.y*.5,.12),fall_roll)
			hand = Vector3(fall_side*.40,-.20,.02).lerp(Vector3(fall_side*.16,.03-shoulder.y,.04),fall_roll)
		elif bool(state.fallen):
			# The other hand comes to the raised knee.
			elbow = Vector3(-fall_side*.12,-.16,-.12)
			hand = Vector3(-fall_side*.02,-.28,-.26)
		# The swing starts below the elbow and spreads up the arm as more is asked of it.
		# Each arm runs against the other, and the body's turning drags the hands behind.
		var free_to_swing := not (spinning or (air and not coming_down) or camel or sit or pose_low or bool(state.fallen))
		if free_to_swing:
			var settle := 1.0-finish
			var sway_size := lerpf(SWAY_FUNCTION,1.0,arm_style)
			var forearm_angle := side*lerpf(FOREARM_SWING,FOREARM_SWING_MAX,arm_energy)*sin(sway_clock-.5)*settle*sway_size
			var upper_angle := side*UPPER_SWING_MAX*smoothstep(.35,1.0,arm_energy)*sin(sway_clock)*settle*sway_size
			var hanging_forearm := hand-elbow
			elbow = elbow.rotated(Vector3.RIGHT,upper_angle).rotated(Vector3.UP,arm_lag*.35*arm_energy)
			hand = elbow+hanging_forearm.rotated(Vector3.RIGHT,forearm_angle).rotated(Vector3.UP,arm_lag)
		# A save is quick at any tier; only free carriage takes its time.
		var limb_ease := ease_arm
		if free_to_swing and finish<=0.0:
			limb_ease = 1.0-exp(-lerpf(ARM_RATE_FUNCTION,ARM_RATE_EXPRESSION,arm_style*(1.0-catching))*dt)
		arm_targets[i*2] = arm_targets[i*2].lerp(elbow,limb_ease)
		arm_targets[i*2+1] = arm_targets[i*2+1].lerp(hand,limb_ease)
		# The arms ride the shoulders round and over with the trunk.
		var carried := shoulder_tilt*Basis(Vector3.UP,upper_turn)
		var elbow_at := shoulder+(carried*arm_targets[i*2]).normalized()*upper_arm
		var hand_at := elbow_at+(shoulder+carried*arm_targets[i*2+1]-elbow_at).normalized()*forearm
		aim_bone("Arm"+suffix,shoulder,elbow_at)
		aim_bone("Forearm"+suffix,elbow_at,hand_at)
		# The wrist: the hand trails its forearm when moving and droops when not.
		var along := (hand_at-elbow_at).normalized()
		var hand_moved := (hand_at-hand_last[i])/maxf(dt,.001)
		hand_last[i] = hand_at
		var droop := lerpf(WRIST_DROOP_FUNCTION,WRIST_DROOP_EXPRESSION,arm_style)
		var bend := (Vector3.DOWN*droop-hand_moved*WRIST_DRAG*arm_style).limit_length(.7)
		hand_aim[i] = hand_aim[i].lerp((along+bend).normalized(),1.0-exp(-WRIST_RATE*dt)).normalized()
		aim_bone("Hand"+suffix,hand_at,hand_at+hand_aim[i]*.1)
	last_contacts = contacts
	# A full-body clip moves the pelvis: the skirt hangs from where the clip puts it.
	var moved: Array = apply_motion(dt)
	if not moved.is_empty():
		hip = moved[0]
		spine = moved[1]
	swing_skirt(dt,hip,spine,legs)

func seg_dir(name: String, fallback: Vector3) -> Vector3:
	var segs: Dictionary = motion_pose.get("seg",{})
	if not segs.has(name):
		return fallback
	var v: Array = segs[name]
	return Vector3(float(v[0]),float(v[1]),float(v[2])).normalized()

# Where a bone's head is now, in this node's frame (after the sim-driven pose above).
func bone_head(name: String) -> Vector3:
	if not bone_ids.has(name):
		return Vector3.ZERO
	return to_local(skeleton.to_global(skeleton.get_bone_global_pose(bone_ids[name]).origin))

# game/motion: a pose is the pelvis and a direction per segment in this frame (x her right, y up,
# z behind her); joints are placed with this model's own lengths (measure_rig), each eased from
# where the sim's pose put it by motion_weight, and the bones aimed between them.
func apply_motion(dt: float) -> Array:
	motion_weight = move_toward(motion_weight,0.0 if motion.is_empty() else 1.0,dt*MOTION_RATE)
	if motion_weight <= 0.0 or motion_pose.is_empty():
		return []
	var w := smoothstep(0.0,1.0,motion_weight)
	var mix := func(bone: String, target: Vector3) -> Vector3: return bone_head(bone).lerp(target,w)
	var limb := func(upper: String, lower: String, end: String, from: Vector3, d1: Vector3, l1: float, d2: Vector3, l2: float) -> Array:
		var mid: Vector3 = mix.call(lower,from+d1*l1)
		var tip: Vector3 = mix.call(end,mid+d2*l2) if bone_ids.has(end) else from+d1*l1+d2*l2
		aim_bone(upper,from,mid)
		aim_bone(lower,mid,tip)
		return [mid,tip]
	if motion_layer == "full" and motion_pose.has("pelvis"):
		var right_v: Array = motion_pose.get("pelvisRight",[1,0,0])
		var right := Vector3(float(right_v[0]),float(right_v[1]),float(right_v[2])).normalized()
		var pelvis: Vector3 = mix.call("Hips",Vector3(0,float(motion_pose.pelvis),0))
		var trunk := seg_dir("trunk",Vector3.UP)
		var spine_at := pelvis+trunk*hips_length
		var neck := spine_at+trunk*spine_length
		aim_bone("Hips",pelvis,spine_at)
		aim_bone("Spine",spine_at,neck)
		aim_bone("Head",neck,neck+seg_dir("head",trunk)*.22)
		for side in [["L",-1.0],["R",1.0]]:
			var s: String = side[0]
			var hip_at: Vector3 = pelvis+right*hip_half_width*float(side[1])
			var leg: Array = limb.call("Thigh"+s,"Shin"+s,"Foot"+s,hip_at,seg_dir("thigh"+s,Vector3.DOWN),thigh,seg_dir("shin"+s,Vector3.DOWN),shin)
			aim_bone("Foot"+s,leg[1],leg[1]+seg_dir("foot"+s,Vector3(0,-.34,-.94))*.2)
			var across := (right-trunk*right.dot(trunk)).normalized()
			var shoulder: Vector3 = neck-trunk*shoulder_rest.y+across*shoulder_rest.x*float(side[1])
			var arm: Array = limb.call("Arm"+s,"Forearm"+s,"Hand"+s,shoulder,seg_dir("upperArm"+s,Vector3.DOWN),upper_arm,seg_dir("forearm"+s,Vector3.DOWN),forearm)
			aim_bone("Hand"+s,arm[1],arm[1]+(arm[1]-arm[0]).normalized()*.1)
		return [pelvis,spine_at]
	else:
		# A layer over the skating: the shoulders stay where the sim's pose put them.
		var neck := bone_head("Head")
		if bone_ids.has("Head"):
			aim_bone("Head",neck,(neck+Vector3.UP*.22).lerp(neck+seg_dir("head",Vector3.UP)*.22,w))
		for s in ["L","R"]:
			var shoulder := bone_head("Arm"+s)
			var arm: Array = limb.call("Arm"+s,"Forearm"+s,"Hand"+s,shoulder,seg_dir("upperArm"+s,Vector3.DOWN),upper_arm,seg_dir("forearm"+s,Vector3.DOWN),forearm)
			aim_bone("Hand"+s,arm[1],arm[1]+(arm[1]-arm[0]).normalized()*.1)
	return []
