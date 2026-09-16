extends Node3D
var skeleton: Skeleton3D
var bone_ids: Dictionary = {}
var state: Dictionary = {}
var pose_low := false
var model: Node3D
var initialized := false

func _ready() -> void:
	model = load("res://assets/generated/skater.glb").instantiate()
	add_child(model)
	skeleton = find_skeleton(model)
	if skeleton:
		for i in skeleton.get_bone_count():
			bone_ids[skeleton.get_bone_name(i)] = i

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
	skeleton.set_bone_global_pose_override(index,Transform3D(Basis(correction)*rest.basis,a),1.0,true)

func _process(dt: float) -> void:
	if state.is_empty() or skeleton == null:
		return
	var target := Vector3(state.pos.x,maxf(0,float(state.jump.z)),float(state.pos.y)-18)
	position = position.lerp(target,1.0-exp(-24*dt)) if initialized else target
	initialized = true
	var heading := atan2(-float(state.heading.x),-float(state.heading.y))
	if int(state.jump.phase) == 2:
		heading += float(state.jump.rotation)
	rotation.y = lerp_angle(rotation.y,heading,1.0-exp(-24*dt))
	var knee := float(state.knee)
	var lean := float(state.lean)
	var hip := Vector3(lean*.21,.89-knee*.12,0)
	var spine := hip+Vector3(-lean*.08,.17,-knee*.07)
	var neck := spine+Vector3(-lean*.06,.33,-knee*.045)
	var head := neck+Vector3(0,.12,0)
	var air := int(state.jump.phase) == 2
	var spinning := int(state.move) == 3
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
			foot = Vector3(side*.15,.16,.22)
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
		aim_bone("Foot"+suffix,foot,foot+Vector3(0,-.025,-.18))
		var shoulder := neck+Vector3(side*.185,-.04,0)
		var spread := .44 if not air else .14
		if spinning:
			spread = .15+clampf(float(state.spin.inertia)/6.0,0.0,1.0)*.34
		var elbow := shoulder+Vector3(side*spread*.57,-.10,-.05)
		var hand := shoulder+Vector3(side*spread,-.15,-.12)
		if pose_low:
			elbow = shoulder+Vector3(side*.24,.02,.03)
			hand = shoulder+Vector3(side*.44,-.02,.05)
		if bool(state.fallen):
			elbow = shoulder+Vector3(side*.20,-.06,0)
			hand = shoulder+Vector3(side*.30,-.08,-.12)
		aim_bone("Arm"+suffix,shoulder,elbow)
		aim_bone("Forearm"+suffix,elbow,hand)
