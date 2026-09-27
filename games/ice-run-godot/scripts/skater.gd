extends Node3D
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
var smooth_knee := .35
var smooth_lean := 0.0
var effects_active := true
var cloth_materials: Array[ShaderMaterial] = []
var contact_shadow: MeshInstance3D

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
	if snap:
		position = Vector3(state.pos.x, float(state.jump.z), float(state.pos.y)-18)
		rotation.y = atan2(-float(state.heading.x),-float(state.heading.y))
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
		aimed = Basis(direction,-float(state.get("twist",0)))*aimed
	var rest_lengths := {"Hips":.17,"Spine":.37,"Head":.30,"ThighL":.4105,"ThighR":.4105,"ShinL":.3755,"ShinR":.3755,"FootL":.1825,"FootR":.1825,"ArmL":.290,"ArmR":.290,"ForearmL":.2074,"ForearmR":.2074}
	aimed.y *= clampf(a.distance_to(b)/float(rest_lengths.get(name,.3)),.65,1.3)
	skeleton.set_bone_global_pose_override(index,Transform3D(aimed,a),1.0,true)

func _process(dt: float) -> void:
	if state.is_empty() or skeleton == null:
		return
	var target := Vector3(state.pos.x,maxf(0,float(state.jump.z)),float(state.pos.y)-18)
	var motion := clampf(Vector2(state.vel.x,state.vel.y).length()*.12+absf(float(state.yawRate))*.08,0,1)
	for cloth in cloth_materials:
		cloth.set_shader_parameter("motion",motion if effects_active else .08)
	position = position.lerp(target,1.0-exp(-24*dt)) if initialized else target
	contact_shadow.position.y = .022-position.y
	contact_shadow.scale = Vector3.ONE*(1+position.y*.3)
	contact_shadow.transparency = clampf(position.y*.25,0,.8)
	initialized = true
	var heading := atan2(-float(state.heading.x),-float(state.heading.y))
	if int(state.jump.phase) == 2:
		heading += float(state.jump.rotation)
	rotation.y = lerp_angle(rotation.y,heading,1.0-exp(-24*dt))
	smooth_knee = lerpf(smooth_knee,float(state.knee),1-exp(-dt*18))
	smooth_lean = lerpf(smooth_lean,float(state.lean),1-exp(-dt*18))
	var knee := smooth_knee
	var lean := smooth_lean
	var hip := Vector3(lean*.30,.89-knee*.15,knee*.035)
	var spine := hip+Vector3(-lean*.08,.17,-knee*.07)
	var neck := spine+Vector3(-lean*.06,.33,-knee*.045)
	var head := neck+Vector3(0,.12,0)
	var air := int(state.jump.phase) == 2
	var spinning := int(state.move) == 3
	var camel := (spinning and int(state.spin.position)==2) or int(state.move)==5
	var sit := spinning and int(state.spin.position)==1
	if camel:
		spine = hip+Vector3(-lean*.08,.08,-.15)
		neck = spine+Vector3(-lean*.05,.10,-.31)
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
	aim_bone("Hips",hip,spine)
	aim_bone("Spine",spine,neck)
	aim_bone("Head",neck,head+Vector3(0,.17,0))
	for i in range(2):
		var suffix := "L" if i == 0 else "R"
		var side := -1.0 if i == 0 else 1.0
		var h := hip+Vector3(side*.105,0,0)
		var contact: Dictionary = state.blade[i].contact
		var foot := to_local(Vector3(float(contact.x),.105,float(contact.y)-18))
		if air:
			foot = Vector3(side*.04,.25,.04 if i == 0 else -.03)
		elif not bool(state.blade[i].inContact):
			var extension := clampf(float(state.strokeTime)*2.5,0,1)
			foot = Vector3(side*(.15+extension*.19),.16+extension*.06,.22+extension*.23)
			if camel: foot = Vector3(side*.08,.94,.68)
			elif sit: foot = Vector3(side*.1,.20,-.60)
		foot.y = maxf(.095,foot.y)
		if bool(state.fallen):
			foot = Vector3(side*.28,.08,.5)
		var delta := foot-h
		var d := clampf(delta.length(),.1,.80)
		var direction := delta.normalized()
		var bend := Vector3(0,0,-1)
		bend = (bend-direction*bend.dot(direction)).normalized()
		var joint := h+direction*(d*.5)+bend*sqrt(maxf(0,.42*.42-d*d*.25))
		aim_bone("Thigh"+suffix,h,joint)
		aim_bone("Shin"+suffix,joint,foot)
		var tangent: Dictionary = state.blade[i].tangent
		var blade_direction := global_basis.inverse()*Vector3(float(tangent.x),0,float(tangent.y))
		if air or not bool(state.blade[i].inContact): blade_direction = Vector3(0,0,-1)
		aim_bone("Foot"+suffix,foot,foot+blade_direction*.18+Vector3(0,-.025,0))
		sprays[i].position = foot-Vector3(0,.08,0)
		sprays[i].emitting = effects_active and not air and not bool(state.fallen) and bool(state.blade[i].inContact) and float(state.blade[i].latSlipAccel)>.3 and absf(float(state.blade[i].longSpeed))>1
		var twist := -float(state.get("twist",0))
		var shoulder := neck+Vector3(side*.185,-.04,0).rotated(Vector3.UP,twist)
		var spread := .43 if not air else clampf(float(state.jump.inertia)/6,.12,.44)
		if spinning:
			spread = .15+clampf(float(state.spin.inertia)/6.0,0.0,1.0)*.34
		var elbow := shoulder+Vector3(side*spread*.57,-.10,-.05)
		var hand := shoulder+Vector3(side*spread,-.15,-.12)
		if not air and not spinning:
			var stroke := sin(clampf(float(state.strokeTime)*3,0,1)*PI)
			var swing := (1.0 if i==int(state.get("strokeFoot",0)) else -1.0)*stroke
			elbow += Vector3(0,-.025,swing*.075).rotated(Vector3.UP,twist)
			hand += Vector3(0,-.05,swing*.16).rotated(Vector3.UP,twist)
		if air:
			elbow = shoulder+Vector3(side*.13,-.18,-.10)
			hand = shoulder+Vector3(-side*.11,-.12,-.19)
		elif camel:
			elbow = shoulder+Vector3(side*.23,.03,.08)
			hand = shoulder+Vector3(side*.45,.01,.16)
		elif sit:
			elbow = shoulder+Vector3(side*.10,-.05,-.24)
			hand = shoulder+Vector3(side*.08,-.09,-.46)
		if pose_low:
			elbow = shoulder+Vector3(side*.24,.02,.03)
			hand = shoulder+Vector3(side*.44,-.02,.05)
		if bool(state.fallen):
			elbow = shoulder+Vector3(side*.20,-.06,0)
			hand = shoulder+Vector3(side*.30,-.08,-.12)
		aim_bone("Arm"+suffix,shoulder,elbow)
		aim_bone("Forearm"+suffix,elbow,hand)
