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
const LIMITS := {"roll_deg":1.0,"foot_off_line_m":.03,"hip_m":.02,"lean_deg":6.0,"crossed_frames":0,"wrong_way_frames":0,"skirt_reach_m":1.6,"skirt_pierce_m":.01}
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
# A spin's finish, measured: which arm opened first, and how far the body would have turned by the second.
var last_move := 0
var exit_tick := -1
var exit_sign := 0.0
var exit_rate := 0.0
var arm_opened := {}
var rest_low := INF
var rest_high := -INF
var forearm_low := INF
var forearm_high := -INF
var upper_low := INF
var upper_high := -INF
var skirt_worst := 0.0
var skirt_reach := 0.0
var skirt_rest := []
var blink_frames := []
var gpu_total := 0.0
var gpu_frames := 0

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
		skater.face_rng.seed = 1 # the same blinks each run, so runs compare
		skeleton = skater.skeleton
		if clip.has("skin") and not args.has("no-costume"): skater.apply_skin(clip.skin)
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
	if skater.blinks>blink_frames.size(): blink_frames.append(render)
	# --gaze=x,y (rad, x toward positive head_turn, y up) and --lid=0..1 hold the face still.
	if args.has("gaze") or args.has("lid"):
		var held := str(args.get("gaze","0,0")).split(",")
		skater.pose_face(Vector2(float(held[0]),float(held[1])),float(args.get("lid",0)))
	measure(clip.frames[ideal].state,clip.frames[delivered].state)
	render += 1
	if camera: frame_camera(clip.frames[ideal].state)
	if args.has("gpu-time"):
		RenderingServer.viewport_set_measure_render_time(root.get_viewport_rid(),true)
		# The first second is shaders compiling, not the cost of a frame.
		if render>60:
			gpu_total += RenderingServer.viewport_get_measured_render_time_gpu(root.get_viewport_rid())
			gpu_frames += 1
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
	elif view == "body":
		# Square on and close, at the skater's own level: for judging her, not the shot.
		var ahead := direction(float(s.heading.x),float(s.heading.y)).rotated(Vector3.UP,float(args.get("around",.5)))
		camera.position = skater.position+ahead*2.1+Vector3(0,1.0,0)
		camera.fov = 40
		camera.look_at(skater.position+Vector3(0,.88,0))
	elif view == "torso":
		var ahead := direction(float(s.heading.x),float(s.heading.y)).rotated(Vector3.UP,float(args.get("around",.5)))
		camera.position = skater.position+ahead*float(args.get("near",1.05))+Vector3(0,1.32,0)
		camera.fov = 36
		camera.look_at(skater.position+Vector3(0,float(args.get("aim",1.25)),0))
	elif view == "eyes":
		# Locked to the head bone: the face fills the frame whatever the body is doing.
		var head_id := skeleton.find_bone("Head")
		var head_now := skeleton.global_transform*skeleton.get_bone_global_pose(head_id)*skeleton.get_bone_global_rest(head_id).inverse()
		var between := head_now*Vector3(0,1.558,.1127)
		var outward := (head_now.basis*Vector3(0,0,1)).normalized().rotated(Vector3.UP,float(args.get("around",0)))
		camera.position = between+outward*float(args.get("near",.22))
		camera.fov = 28
		camera.look_at(between)
	elif view == "stands":
		camera.position = Vector3(-4,1.6,25)
		camera.fov = 40
		camera.look_at(Vector3(2,4.2,34))
	elif view == "broadcast":
		camera.position = Vector3(clampf(skater.position.x*.45,-18,18),7.8,31.5)
		camera.fov = 40
		camera.look_at(skater.position+Vector3(0,.9,0))
	if not args.has("no-mirror"): arena.update_mirror(camera)
	if was_airborne and int(s.jump.phase)!=2: arena.react(1.0)
	was_airborne = int(s.jump.phase)==2
	arena.update_crowd(skater.position,DT)
	if "trace_lifted" in arena and skater.has_method("lifted_blade"): arena.trace_lifted = skater.lifted_blade()
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
	# A heading can only jump like this where the clip itself restarts the skater (pose_clip.mjs, the spin's entry).
	var restarted := last_heading != Vector3.ZERO and heading.distance_to(last_heading)>.5
	if last_heading != Vector3.ZERO and not restarted and float(now.yawRate)>.2 and int(now.move)==0 and int(now.jump.phase)==0:
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
	measure_spin_exit(now)
	measure_arms_and_eyes(now,grounded)
	if "skirt_tips" in skater and not skater.skirt_tips.is_empty():
		skirt_worst = maxf(skirt_worst,float(skater.skirt_pushed))
		for tip in skater.skirt_tips:
			skirt_reach = maxf(skirt_reach,tip.distance_to(world))
			if not (tip.x==tip.x and tip.y==tip.y and tip.z==tip.z): skirt_reach = 99.0
		# How far the settled skirt sits from where it hangs at rest, on a plain two-foot glide.
		if int(now.supportMode)==2 and int(now.move)==0 and int(now.jump.phase)==0:
			for i in skater.skirt_tips.size():
				add("skirt_sag_m",skater.to_local(skater.skirt_tips[i]).distance_to(hips_local()+skater.skirt_rest_tips[i]))

func sagittal(from: Vector3, to: Vector3) -> float:
	var d := skater.to_local(to)-skater.to_local(from)
	return rad_to_deg(atan2(-d.z,-d.y))

# Plain skating only: how the right arm hangs and swings, and where the eyes go travelling backward.
func measure_arms_and_eyes(now: Dictionary, grounded: bool) -> void:
	if skeleton.find_bone("HandR")<0 or not grounded or int(now.move)!=0:
		return
	if "spin_exit_left" in skater and float(skater.spin_exit_left)>0:
		return
	var calm: bool = absf(float(now.get("balanceError",0)))<.05 and absf(float(now.intAccel))<2.0
	if calm:
		add("hand_below_shoulder_m",joint("ArmR").y-joint("HandR").y)
		var shoulder := skater.to_local(joint("ArmR"))
		var elbow := skater.to_local(joint("ForearmR"))
		add("upper_arm_below_level_deg",rad_to_deg(atan2(shoulder.y-elbow.y,absf(elbow.x-shoulder.x))))
		var f := sagittal(joint("ForearmR"),joint("HandR"))
		var u := sagittal(joint("ArmR"),joint("ForearmR"))
		forearm_low = minf(forearm_low,f); forearm_high = maxf(forearm_high,f)
		# The same sweep with almost nothing asked of the arms: the resting swing alone.
		if float(skater.get("arm_energy") if "arm_energy" in skater else 1.0)<.25 and absf(float(skater.get("arm_lag") if "arm_lag" in skater else 0.0))<.03:
			rest_low = minf(rest_low,f); rest_high = maxf(rest_high,f)
		upper_low = minf(upper_low,u); upper_high = maxf(upper_high,u)
	var blade: Dictionary = now.blade[int(now.supportFoot)]
	if float(blade.longSpeed)<-1.0 and "head_down" in skater and float(skater.head_down)>.9:
		var bone := skeleton.find_bone("Head")
		var rest := skeleton.get_bone_global_rest(bone)
		var turned := skeleton.global_basis*(skeleton.get_bone_global_pose(bone).basis.orthonormalized()*rest.basis.orthonormalized().inverse())
		var gaze := turned*Vector3(0,0,1)
		var line := direction(float(blade.tangent.x),float(blade.tangent.y))
		add("gaze_off_blade_deg",rad_to_deg(Vector2(gaze.x,gaze.z).angle_to(Vector2(line.x,line.z))))
		add("gaze_down_deg",rad_to_deg(atan2(-gaze.y,Vector2(gaze.x,gaze.z).length())))

func measure_spin_exit(now: Dictionary) -> void:
	if int(now.move)==3:
		exit_sign = signf(float(now.yawRate))
		exit_rate = absf(float(now.yawRate))
	if last_move==3 and int(now.move)!=3:
		exit_tick = render
		arm_opened = {}
	last_move = int(now.move)
	if exit_tick<0 or skeleton.find_bone("HandL")<0:
		return
	for suffix in ["L","R"]:
		if not arm_opened.has(suffix) and joint("Hand"+suffix).distance_to(joint("Arm"+suffix))>.36:
			arm_opened[suffix] = render

func hips_local() -> Vector3:
	return skater.to_local((joint("ThighL")+joint("ThighR"))*.5)

func report() -> void:
	var result := {"frames":render,"samples":samples.get("roll_deg",[]).size(),"two_foot_frames":two_foot,"crossed_frames":crossed,"wrong_way_frames":wrong_way,"max_foot_step_m":snappedf(pop,.001),"skirt_leg_push_m":snappedf(skirt_worst,.001),"skirt_reach_m":snappedf(skirt_reach,.01)}
	for name in ["skirt_sag_m","roll_deg","foot_off_line_m","foot_along_line_m","hip_m","lean_deg","lag_m","jerk"]:
		result[name] = snappedf(rms(name),.001)
	if arena: result["trace_steps"] = arena.trace_steps
	result["skirt_pierce_m"] = snappedf(skater.skirt_pierce_peak,.001)
	for name in ["hand_below_shoulder_m","upper_arm_below_level_deg","gaze_off_blade_deg","gaze_down_deg"]:
		if samples.has(name): result[name] = snappedf(rms(name),.01)
	if forearm_high>forearm_low:
		result["forearm_sweep_deg"] = snappedf(forearm_high-forearm_low,1.0)
		result["upper_arm_sweep_deg"] = snappedf(upper_high-upper_low,1.0)
		if rest_high>rest_low: result["forearm_rest_sweep_deg"] = snappedf(rest_high-rest_low,1.0)
	if arm_opened.size()==2:
		var first: String = "L" if arm_opened.L<arm_opened.R else "R" if arm_opened.R<arm_opened.L else "both"
		result["spin_sign"] = exit_sign
		result["first_arm"] = first
		result["second_arm_turn_deg"] = snappedf(rad_to_deg(absf(arm_opened.L-arm_opened.R)*DT*exit_rate),1.0)
		if args.has("check") and first!=("R" if exit_sign>0 else "L"):
			printerr("POSE_LAB_FAIL the arm on the shoulder leading the spin must open first")
			quit(1)
			return
	if skater.lid_shape>=0:
		var seconds := render*DT
		result["blinks_per_minute"] = snappedf(skater.blinks*60.0/seconds,.1)
		result["eye_lead_peak_deg"] = snappedf(rad_to_deg(skater.eye_lead_peak),.1)
		result["blink_frames"] = blink_frames
		# People blink some 6 to 30 times a minute; outside that the timer or reflex is wrong.
		if args.has("check") and not (6.0<=float(result["blinks_per_minute"]) and float(result["blinks_per_minute"])<=30.0):
			printerr("POSE_LAB_FAIL blinks_per_minute ",result["blinks_per_minute"])
			quit(1)
			return
	if gpu_frames>0: result["gpu_ms_per_frame"] = snappedf(gpu_total/gpu_frames,.01)
	print("POSE_LAB ",JSON.stringify(result))
	if args.has("check"):
		for name in LIMITS:
			if float(result[name])>float(LIMITS[name]):
				printerr("POSE_LAB_FAIL ",name," ",result[name]," > ",LIMITS[name])
				quit(1)
				return
		print("POSE_LAB_PASS")
	quit()
