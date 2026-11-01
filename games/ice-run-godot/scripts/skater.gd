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
var sprays: Array[CPUParticles3D] = []
# The rig every skater builds to (tools/build_skater.py), and where it sits
# against the solver's body: comHeight .95 over a straight-legged hip at .89.
const THIGH := .4105
const SHIN := .3755
const ANKLE_HEIGHT := .105
const HIP_HALF_WIDTH := .105
const COM_ABOVE_HIP := .06
const BODY_WEIGHT := 540.0 # N, the support load the sim reports gliding on one foot
# Presentation-only easing, for what the sim does not state: authored poses
# (camel, sit, low, fallen), arms, and a foot leaving or rejoining the ice.
const POSE_RATE := 12.0
const ARM_RATE := 14.0
const FOOT_RATE := 16.0
var frame_age := 0.0
var trunk_offsets: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO,Vector3.ZERO,Vector3.ZERO]
var foot_on_ice: Array[float] = [1.0,1.0]
var last_contacts: Array[Vector3] = []
var contact_slide: Array[Vector3] = [Vector3.ZERO,Vector3.ZERO]
var free_feet: Array[Vector3] = [Vector3(-.15,.16,.22),Vector3(.15,.16,.22)]
var arm_targets: Array[Vector3] = [Vector3(-.25,-.14,-.05),Vector3(-.43,-.19,-.12),Vector3(.25,-.14,-.05),Vector3(.43,-.19,-.12)]
var effects_active := true
var cloth_materials: Array[ShaderMaterial] = []
var contact_shadow: MeshInstance3D
# Pairs: the partner's supported-lift height, presented above the solver's ground plane.
var lift_height := 0.0

func _ready() -> void:
	load_model(model_path)
	contact_shadow = MeshInstance3D.new()
	var shadow_plane := PlaneMesh.new()
	shadow_plane.size = Vector2(1.3,1.3)
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
	model_path = path
	cloth_materials.clear()
	model = load(model_path).instantiate()
	# Blender's -Y face direction becomes glTF +Z; the skating actor faces -Z.
	# Align before solving bones, so the blade rocker is not rotated upside down.
	model.rotation.y = PI
	add_child(model)
	recolour(model)
	skeleton = find_skeleton(model)
	if skeleton:
		for i in skeleton.get_bone_count():
			bone_ids[skeleton.get_bone_name(i)] = i

func apply_skin(next: Dictionary) -> int:
	skin = next
	cloth_materials.clear()
	return recolour(model) if model else 0

# Returns how many surfaces now wear the costume, for the smoke test.
func recolour(node: Node) -> int:
	var count := 0
	if node is MeshInstance3D and node.mesh:
		for i in node.mesh.get_surface_count():
			var base := node.mesh.surface_get_material(i) as BaseMaterial3D
			var slot: String = SKIN_SLOTS.get(base.resource_name, "") if base else ""
			if slot == "" or not skin.has(slot):
				node.set_surface_override_material(i, null)
				continue
			var worn := base.duplicate() as BaseMaterial3D
			worn.albedo_color = Color.html(str(skin[slot]))
			if slot in ["bodice","skirt","sleeve"]:
				var cloth := ShaderMaterial.new()
				cloth.shader = load("res://shaders/fabric.gdshader")
				cloth.set_shader_parameter("tint",worn.albedo_color)
				cloth.set_shader_parameter("is_skirt",slot=="skirt")
				cloth.set_shader_parameter("is_sleeve",slot=="sleeve")
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
	frame_age = 0.0
	if snap:
		position = SimSpace.point(state.pos.x,state.pos.y,float(state.jump.z))
		rotation.y = SimSpace.yaw(state.heading.x,state.heading.y)
		initialized = true

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
		aimed = Basis(direction,float(state.get("twist",0)))*aimed
	var rest_lengths := {"Hips":.17,"Spine":.37,"Head":.30,"ThighL":.4105,"ThighR":.4105,"ShinL":.3755,"ShinR":.3755,"FootL":.1825,"FootR":.1825,"ArmL":.290,"ArmR":.290,"ForearmL":.2074,"ForearmR":.2074}
	aimed.y *= clampf(a.distance_to(b)/float(rest_lengths.get(name,.3)),.65,1.3)
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
	var aimed := bone_frame(to_skeleton*toe,to_skeleton*up)*bone_frame(rest.basis.y,Vector3.UP).inverse()*rest.basis
	skeleton.set_bone_global_pose_override(index,Transform3D(aimed,skeleton.to_local(to_global(ankle))),1.0,true)

func plant_leg(suffix: String, hip: Vector3, ankle: Vector3, pole: Vector3) -> void:
	var delta := ankle-hip
	var reach := clampf(delta.length(),.1,THIGH+SHIN-.001)
	var direction := delta.normalized()
	var bend := (pole-direction*pole.dot(direction)).normalized()
	var along := (THIGH*THIGH-SHIN*SHIN+reach*reach)/(2*reach)
	var knee := hip+direction*along+bend*sqrt(maxf(0,THIGH*THIGH-along*along))
	aim_bone("Thigh"+suffix,hip,knee)
	aim_bone("Shin"+suffix,knee,ankle)

func _process(dt: float) -> void:
	if state.is_empty() or skeleton == null:
		return
	var motion := clampf(Vector2(state.vel.x,state.vel.y).length()*.12+absf(float(state.yawRate))*.08,0,1)
	for cloth in cloth_materials:
		cloth.set_shader_parameter("motion",motion if effects_active else .08)
	var air := int(state.jump.phase) == 2
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
	# The body hangs along the solver's own pendulum, contact to centre of mass,
	# which already holds its lean and its fore-aft pitch.
	var com := Vector3(0,float(state.comZ),0)
	var body_axis := (com-base/support).normalized() if grounded else Vector3.UP
	var knee := float(state.knee)
	var settled_hip := com-body_axis*COM_ABOVE_HIP+Vector3(0,0,knee*.035)
	var settled_spine := settled_hip+body_axis*.17+Vector3(0,0,-knee*.07)
	var settled_neck := settled_spine+body_axis*.33+Vector3(0,0,-knee*.045)
	var settled_head := settled_neck+Vector3(0,.12,0)
	var hip := settled_hip
	var spine := settled_spine
	var neck := settled_neck
	var head := settled_head
	var spinning := int(state.move) == 3
	var camel := (spinning and int(state.spin.position)==2) or int(state.move)==5
	var sit := spinning and int(state.spin.position)==1
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
		hip = Vector3(0,.19,0)
		spine = hip+Vector3(0,.02,-.18)
		neck = spine+Vector3(0,.04,-.30)
		head = neck+Vector3(0,.08,-.10)
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
	aim_bone("Hips",hip,spine)
	aim_bone("Spine",spine,neck)
	aim_bone("Head",neck,head+Vector3(0,.17,0))
	var twist := float(state.get("twist",0))
	var ease_arm := 1.0-exp(-ARM_RATE*dt)
	var ease_foot := 1.0-exp(-FOOT_RATE*dt)
	for i in range(2):
		var suffix := "L" if i == 0 else "R"
		var side := -1.0 if i == 0 else 1.0
		var blade: Dictionary = state.blade[i]
		var on_ice := bool(blade.inContact) and not air and not bool(state.fallen)
		# The loaded hip rides higher than the unloaded one.
		var h := hip+Vector3(side*HIP_HALF_WIDTH,(float(blade.weight)-.5)*.05 if grounded else 0.0,0)
		var free := Vector3(side*.04,.25,.04 if i == 0 else -.03)
		if not air:
			var extension := clampf(float(state.strokeTime)*2.5,0,1)
			# Trailing behind the skating foot and clear of it, wherever the lean has that foot.
			free = Vector3(side*(.12+extension*.19),.20+extension*.06,.36+extension*.15)
			if grounded: free.x += base.x/support
			if camel: free = Vector3(side*.08,.94,.68)
			elif sit: free = Vector3(side*.1,.20,-.60)
			free = h+(free-h).rotated(Vector3.UP,float(state.get("freeSwing",0)))
		if bool(state.fallen):
			free = Vector3(side*.28,.08,.5)
		free_feet[i] = free_feet[i].lerp(free,ease_foot)
		# Coming down, the landing foot reaches for the ice ahead of the touchdown.
		var reaching := air and i==int(state.supportFoot) and float(state.jump.vz)<0 and float(state.jump.z)<-float(state.jump.vz)*.14
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
		var planted: Vector3 = contacts[i]+contact_slide[i]+blade_up*ANKLE_HEIGHT
		var planting := smoothstep(0.0,1.0,foot_on_ice[i])
		var ankle: Vector3 = free_feet[i].lerp(planted,planting)
		# A free foot turns out from the hip.
		var loose_toe := Vector3(0,0,-1).rotated(Vector3.UP,-side*.6).lerp(toe,planting)
		var loose_up := Vector3.UP.lerp(blade_up,planting)
		plant_leg(suffix,h,ankle,Vector3(0,0,-1).lerp(toe,.5*planting))
		aim_foot("Foot"+suffix,ankle,loose_toe*.18-loose_up*.025,loose_up)
		sprays[i].position = ankle-Vector3(0,.08,0)
		sprays[i].emitting = effects_active and on_ice and float(blade.latSlipAccel)>.3 and absf(float(blade.longSpeed))>1
		# Harder the blade is loaded, harder it throws the snow.
		sprays[i].initial_velocity_max = 1.0+1.6*clampf(float(blade.normalLoad)/BODY_WEIGHT,0,1.5)
		var shoulder := neck+Vector3(side*.185,-.04,0).rotated(Vector3.UP,twist)
		var spread := .43 if not air else clampf(float(state.jump.inertia)/6,.12,.44)
		if spinning:
			spread = .15+clampf(float(state.spin.inertia)/6.0,0.0,1.0)*.34
		# The arms rise with whatever balance they are being asked to supply.
		var balance := Vector3(0,clampf(absf(float(state.intAccel))*.015,0,.12),0)
		var elbow := Vector3(side*spread*.57,-.10,-.05)+balance*.5
		var hand := Vector3(side*spread,-.15,-.12)+balance
		if not air and not spinning:
			var stroke := sin(clampf(float(state.strokeTime)*3,0,1)*PI)
			var swing := (1.0 if i==int(state.get("strokeFoot",0)) else -1.0)*stroke
			elbow += Vector3(0,-.025,swing*.075).rotated(Vector3.UP,twist)
			hand += Vector3(0,-.05,swing*.16).rotated(Vector3.UP,twist)
		if air:
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
		if bool(state.fallen):
			elbow = Vector3(side*.20,-.06,0)
			hand = Vector3(side*.30,-.08,-.12)
		arm_targets[i*2] = arm_targets[i*2].lerp(elbow,ease_arm)
		arm_targets[i*2+1] = arm_targets[i*2+1].lerp(hand,ease_arm)
		aim_bone("Arm"+suffix,shoulder,shoulder+arm_targets[i*2])
		aim_bone("Forearm"+suffix,shoulder+arm_targets[i*2],shoulder+arm_targets[i*2+1])
	last_contacts = contacts
