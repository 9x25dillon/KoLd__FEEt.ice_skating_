extends SceneTree
# Plays a tools/pose_clip.mjs recording through the real skater script at 60 Hz,
# with frames arriving as unevenly as the bridge delivers them, and measures
# the rendered skeleton against the sim state that produced it.
#   godot4 --headless --path games/ice-run-godot --script res://tools/pose_lab.gd -- --clip=<clip.json>
# --skater=<script> measures another skater script; --legacy-map reads the world
# the way scripts before sim_space.gd did, so an old one can be compared fairly.
# With a display, --shots=<dir> adds the real arena and a chase camera and saves
# the marked ticks in --ticks=60,300,...; --write-movie records the whole passage.
const DT := 1.0/60.0
const ARRIVALS := [2,0,4,2,1,3,2,2]
const LIMITS := {"roll_deg":1.0,"foot_off_line_m":.03,"hip_m":.02,"lean_deg":6.0,"crossed_frames":0,"wrong_way_frames":0,"skirt_reach_m":1.6}
const Arena = preload("res://scripts/arena.gd")
const Shot = preload("res://scripts/shot.gd")
var args := {}
var clip: Dictionary
var skater: Node3D
var skeleton: Skeleton3D
var render := 0
var delivered := -1
var samples := {}
var previous: Array[Vector3] = []
var previous_ankles: Array[Vector3] = []
var pop := 0.0
var crossed := 0
var two_foot := 0
var wrong_way := 0
var last_heading := Vector3.ZERO
var arena: Node3D
var camera: Camera3D
var follow := Vector3(1,0,0)
var shots: Array = []
var last_trace := -1
var was_airborne := false
var shot: Dictionary = Shot.NONE
var skirt_worst := 0.0
var skirt_reach := 0.0
var skirt_rest := []

func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		var parts := arg.trim_prefix("--").split("=",true,1)
		args[parts[0]] = parts[1] if parts.size()>1 else true
	clip = JSON.parse_string(FileAccess.get_file_as_string(args.clip))
	skater = Node3D.new()
	skater.set_script(load(args.get("skater","res://scripts/skater.gd")))
	skater.model_path = args.get("model","res://assets/generated/skater-athlete.glb")
	root.add_child(skater)
	if args.has("shots") or args.has("movie"):
		arena = Arena.new()
		root.add_child(arena)
		camera = Camera3D.new()
		camera.fov = 40
		camera.far = 170
		root.add_child(camera)
		camera.make_current()
		diagnose.call_deferred()
		for tick in str(args.get("ticks","")).split(",",false): shots.append(int(tick))

# --off=probe,sun,fixtures,mirror: renders without a suspect, to find what a look comes from.
func diagnose() -> void:
	var off := str(args.get("off","")).split(",",false)
	for node in arena.get_children():
		if node is ReflectionProbe and "probe" in off: node.visible = false
		if node is DirectionalLight3D and "sun" in off: node.visible = false
		if node is DirectionalLight3D and "sunshadow" in off: node.shadow_enabled = false
		if node is SpotLight3D and "fixtures" in off: node.visible = false
	if "roof" in off: arena.ice_material.set_shader_parameter("roof_strength",0.0)
	if "mirror" in off: args["no-mirror"] = true

func point(p: Dictionary, height := 0.0) -> Vector3:
	return Vector3(p.x,height,float(p.y)-18) if args.has("legacy-map") else Vector3(p.x,height,18-float(p.y))

func direction(x: float, y: float) -> Vector3:
	return Vector3(x,0,y) if args.has("legacy-map") else Vector3(x,0,-y)

func joint(name: String) -> Vector3:
	return skeleton.global_transform*skeleton.get_bone_global_pose(skeleton.find_bone(name)).origin

func add(name: String, value: float) -> void:
	if not samples.has(name): samples[name] = PackedFloat64Array()
	samples[name].append(value)

func rms(name: String) -> float:
	var total := 0.0
	for v in samples.get(name,PackedFloat64Array()): total += v*v
	return sqrt(total/maxf(1,samples.get(name,PackedFloat64Array()).size()))

func _process(_delta: float) -> bool:
	if skeleton == null:
		# Ready has just switched processing on; the lab alone steps the skater.
		skater.set_process(false)
		skeleton = skater.skeleton
		skater.apply_frame(clip.frames[0],true)
	var ideal := render*2
	if ideal >= clip.frames.size():
		report()
		return true
	var next := mini(delivered+ARRIVALS[render%ARRIVALS.size()],clip.frames.size()-1) if delivered>=0 else 0
	if next != delivered:
		delivered = next
		var shown: Dictionary = clip.frames[delivered]
		if args.has("arm-style"): shown["armStyle"] = float(args["arm-style"])
		skater.apply_frame(shown)
	# --steps=4 stands in for a display four times as fast: 240 Hz.
	var steps := int(args.get("steps",1))
	for _i in steps: skater._process(DT/steps)
	measure(clip.frames[ideal].state,clip.frames[delivered].state)
	render += 1
	if camera: frame_camera(clip.frames[ideal].state)
	if ideal in shots:
		shoot(ideal)
	return false

func frame_camera(s: Dictionary) -> void:
	var velocity := direction(s.vel.x,s.vel.y)
	if velocity.length()>.5 and int(s.jump.phase)!=2:
		follow = follow.lerp(velocity.normalized(),1-exp(-DT*3)).normalized()
	# --view=boots or face moves in close, from the skater's right, to judge detail.
	var view := str(args.get("view",""))
	var height := .14 if view=="boots" else 1.45 if view=="face" else .72
	var away := .85 if view=="boots" else .7 if view=="face" else 3.3
	var focus := skater.position+Vector3(0,height,0)
	# Close views sit in front of the skater, where the face and the boots' fronts are.
	var facing := direction(float(s.heading.x),float(s.heading.y)).rotated(Vector3.UP,.6)
	var seat := focus+facing*away+Vector3(0,.08,0)
	var look := focus
	# The ordinary view is the game's own tracking camera (main.gd update_camera).
	if view == "":
		shot = Shot.blend(shot,Shot.framing(s),1-exp(-DT*3.0))
		focus = skater.position+Vector3(0,float(shot.aim),0)
		seat = focus-follow*float(shot.away)+Vector3(0,float(shot.height),0)+follow.cross(Vector3.UP)*float(shot.away)*.245
		look = focus+follow*float(shot.lead)*(1.0+velocity.length()*.14)
	camera.position = camera.position.lerp(seat,1-exp(-DT*(3.0 if view=="" else 10.0))) if render>1 else seat
	camera.look_at(look)
	# --view=rink and --view=broadcast are the game's other two fixed cameras (main.gd update_camera).
	if view == "rink":
		camera.position = Vector3(39,44,43)
		camera.fov = 58
		camera.cull_mask = 1
		camera.look_at(Vector3.ZERO)
	elif view == "broadcast":
		camera.position = Vector3(clampf(skater.position.x*.45,-18,18),7.8,31.5)
		camera.fov = 40
		camera.look_at(skater.position+Vector3(0,.9,0))
	if not args.has("no-mirror"): arena.update_mirror(camera)
	if was_airborne and int(s.jump.phase)!=2: arena.react(1.0)
	was_airborne = int(s.jump.phase)==2
	arena.update_crowd(skater.position,DT)
	var pieces := []
	while last_trace+4<=delivered:
		last_trace += 4
		var pair := []
		for b in clip.frames[last_trace].state.blade:
			var y: float = 36-float(b.contact.y) if args.has("legacy-map") else float(b.contact.y)
			pair.append({"x":b.contact.x,"y":y,"contact":b.inContact and int(clip.frames[last_trace].state.jump.phase)!=2})
		pieces.append(pair)
	arena.add_traces(pieces)

func shoot(tick: int) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("%s/%05d.png" % [args.shots,tick])

# `now` is where the sim is at this instant, for where the body and blades are
# on the ice; `s` is the frame the skater was last given, for how it is posed.
func measure(now: Dictionary, s: Dictionary) -> void:
	var world := skater.position
	add("lag_m",Vector2(world.x,world.z).distance_to(Vector2(point(now.pos).x,point(now.pos).z)))
	previous.append(world)
	if previous.size()>2:
		add("jerk",(previous[-1]-2*previous[-2]+previous[-3]).length()/(DT*DT))
	# A sim turn to the skater's left must show as a turn to the skater's left.
	var heading := direction(float(now.heading.x),float(now.heading.y))
	if last_heading != Vector3.ZERO and float(now.yawRate)>.2 and int(now.move)==0 and int(now.jump.phase)==0:
		if (heading-last_heading).dot(Vector3.UP.cross(last_heading))<0: wrong_way += 1
	last_heading = heading
	var hips := (joint("ThighL")+joint("ThighR"))*.5
	var grounded: bool = int(s.jump.phase)!=2 and not bool(s.fallen) and int(s.move)!=3 and int(s.move)!=5
	if grounded:
		add("hip_m",hips.y-(float(s.comZ)-float(skater.get("com_above_hip") if "com_above_hip" in skater else .06)))
		var left := direction(-float(s.heading.y),float(s.heading.x))
		var axis := joint("Head")-hips
		add("lean_deg",rad_to_deg(atan2(axis.dot(left),axis.y)-float(s.lean)))
	var ankles: Array[Vector3] = []
	for i in 2:
		var suffix := "L" if i==0 else "R"
		var bone := skeleton.find_bone("Foot"+suffix)
		var ankle := joint("Foot"+suffix)
		ankles.append(skater.to_local(ankle))
		var blade: Dictionary = s.blade[i]
		var settled: bool = "foot_on_ice" not in skater or float(skater.foot_on_ice[i])>=1.0
		if blade.inContact and grounded and settled:
			var rest := skeleton.get_bone_global_rest(bone)
			var turned := skeleton.global_basis*(skeleton.get_bone_global_pose(bone).basis.orthonormalized()*rest.basis.orthonormalized().inverse())
			var up := turned*Vector3.UP
			var blade_left := direction(-float(blade.tangent.y),float(blade.tangent.x))
			add("roll_deg",rad_to_deg(atan2(up.dot(blade_left),up.dot(Vector3.UP))-float(blade.tilt)))
			var c := point(now.blade[i].contact)
			var lift := float(skater.ankle_height) if "ankle_height" in skater else .105
			var horizontal := Vector2(ankle.x-up.x*lift,ankle.z-up.z*lift)
			var track := direction(float(blade.tangent.x),float(blade.tangent.y))
			var off := Vector3(horizontal.x-c.x,0,horizontal.y-c.z)
			add("foot_along_line_m",off.dot(track))
			add("foot_off_line_m",off.dot(blade_left))
	if grounded and int(s.supportMode)==2:
		two_foot += 1
		var a := skater.to_local(joint("FootL"))
		var b := skater.to_local(joint("FootR"))
		if a.x>b.x: crossed += 1
	if not previous_ankles.is_empty():
		for i in 2: pop = maxf(pop,ankles[i].distance_to(previous_ankles[i]))
	previous_ankles = ankles
	if "skirt_tips" in skater and not skater.skirt_tips.is_empty():
		skirt_worst = maxf(skirt_worst,float(skater.skirt_pushed))
		for tip in skater.skirt_tips:
			skirt_reach = maxf(skirt_reach,tip.distance_to(world))
			if not (tip.x==tip.x and tip.y==tip.y and tip.z==tip.z): skirt_reach = 99.0
		# How far the settled skirt sits from where it hangs at rest, on a plain two-foot glide.
		if int(now.supportMode)==2 and int(now.move)==0 and int(now.jump.phase)==0:
			for i in skater.skirt_tips.size():
				add("skirt_sag_m",skater.to_local(skater.skirt_tips[i]).distance_to(hips_local()+skater.skirt_rest_tips[i]))

func hips_local() -> Vector3:
	return skater.to_local((joint("ThighL")+joint("ThighR"))*.5)

func report() -> void:
	var result := {"frames":render,"samples":samples.get("roll_deg",[]).size(),"two_foot_frames":two_foot,"crossed_frames":crossed,"wrong_way_frames":wrong_way,"max_foot_step_m":snappedf(pop,.001),"skirt_leg_push_m":snappedf(skirt_worst,.001),"skirt_reach_m":snappedf(skirt_reach,.01)}
	for name in ["skirt_sag_m","roll_deg","foot_off_line_m","foot_along_line_m","hip_m","lean_deg","lag_m","jerk"]:
		result[name] = snappedf(rms(name),.001)
	if arena: result["trace_steps"] = arena.trace_steps
	print("POSE_LAB ",JSON.stringify(result))
	if args.has("check"):
		for name in LIMITS:
			if float(result[name])>float(LIMITS[name]):
				printerr("POSE_LAB_FAIL ",name," ",result[name]," > ",LIMITS[name])
				quit(1)
				return
		print("POSE_LAB_PASS")
	quit()
