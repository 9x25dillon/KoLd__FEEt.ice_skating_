extends Node3D
const EngineLink = preload("res://scripts/engine_link.gd")
const Arena = preload("res://scripts/arena.gd")
const Skater = preload("res://scripts/skater.gd")
const Ribbon = preload("res://scripts/ribbon.gd")
# Purely a local presentation choice: skater.gd poses whichever glb this
# points at by bone name, so any entry here just needs to answer to the same
# eleven bones (see tools/build_skater.py and tools/build_berserker.py).
const CHARACTERS: Array[Dictionary] = [
	{"name": "Violet", "path": "res://assets/generated/skater.glb"},
	{"name": "Black Berserker", "path": "res://assets/generated/skater-berserker.glb"},
]
var link: Node
var arena: Node3D
var skater: Node3D
var camera: Camera3D
var music: AudioStreamPlayer
var blade_audio: AudioStreamPlayer
var generator: AudioStreamGeneratorPlayback
var audio_phase := 0.0
var rng := RandomNumberGenerator.new()
var ui: CanvasLayer
var root: Control
var overlay: ColorRect
var menu: VBoxContainer
var menu_scroll: ScrollContainer
var coach_title: Label
var coach_tip: Label
var coach_progress: Label
var hud_time: Label
var hud_move: Label
var hud_technical: Label
var notice: Label
var ribbon: Control
var catalog: Dictionary = {}
var frame: Dictionary = {}
var playing := false
var current_page := "home"
var active_mode := "free"
var event_index := 0
var sequence: Array = ["glide","edge","jump","spin","pose"]
var camera_mode := 0
var follow_direction := Vector3(1,0,0)
var music_enabled := true
var beginner := true
var scheme := 1
var track := 0
var profile := 0
var character := 0
var cruise := true
var push_pending := false
var toe_pending := false
var trick_pending := false
var previous_lt := false
var lt_time := 0.0
var last_result_tick := -1
var boot_test := false
var test_seconds := 0.0
var screenshot_test := false
var screenshot_saved := false
var tick_debt := 0.0
var test_stage := 0
var test_wait := 0.0
var settings_path := "user://preferences.json"

func _ready() -> void:
	boot_test = "--smoke-test" in OS.get_cmdline_user_args()
	screenshot_test = "--capture" in OS.get_cmdline_user_args()
	if not boot_test and not screenshot_test:
		load_preferences()
	arena = Arena.new()
	add_child(arena)
	skater = Skater.new()
	skater.model_path = CHARACTERS[character].path
	add_child(skater)
	camera = Camera3D.new()
	camera.fov = 43
	camera.near = .08
	camera.far = 170
	camera.position = Vector3(7,4.0,-11)
	add_child(camera)
	camera.look_at(Vector3(0,.8,-18))
	music = AudioStreamPlayer.new()
	music.volume_db = -12
	add_child(music)
	blade_audio = AudioStreamPlayer.new()
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = 22050
	stream.buffer_length = .12
	blade_audio.stream = stream
	blade_audio.volume_db = -22
	add_child(blade_audio)
	if DisplayServer.get_name() != "headless":
		blade_audio.play()
		generator = blade_audio.get_stream_playback()
	build_ui()
	link = EngineLink.new()
	link.received.connect(on_engine)
	link.failed.connect(on_error)
	add_child(link)
	get_window().focus_exited.connect(func():
		if playing and not boot_test:
			pause_game())
	show_page("home")

func label(text: String, size: int, color: Color = Color("e6edef")) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size",size)
	l.add_theme_color_override("font_color",color)
	return l

func paragraph(text: String, size: int = 16) -> Label:
	var l := label(text,size,Color("9eafb9"))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

func button(text: String, action: Callable, primary: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size.y = 43
	b.add_theme_font_size_override("font_size",16)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("cbd8dc") if primary else Color("15222f")
	normal.content_margin_left = 17
	normal.content_margin_right = 17
	normal.content_margin_top = 9
	normal.content_margin_bottom = 9
	normal.border_width_bottom = 1
	normal.border_color = Color("354653")
	b.add_theme_stylebox_override("normal",normal)
	var hover: StyleBoxFlat = normal.duplicate()
	hover.bg_color = Color("e2e9e7") if primary else Color("273b4b")
	b.add_theme_stylebox_override("hover",hover)
	b.add_theme_stylebox_override("pressed",hover)
	b.add_theme_color_override("font_color",Color("152430") if primary else Color("dce7e9"))
	b.add_theme_color_override("font_hover_color",Color("152430") if primary else Color("ffffff"))
	b.pressed.connect(action)
	return b

func build_ui() -> void:
	ui = CanvasLayer.new()
	add_child(ui)
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(root)
	# A soft exposure falloff keeps thin HUD type readable over bright ice.
	var shade := TextureRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0,0.32,0.72,1.0])
	gradient.colors = PackedColorArray([Color(.01,.02,.035,.64),Color(0,0,0,0),Color(0,0,0,0),Color(.01,.02,.035,.65)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2(.5,0)
	texture.fill_to = Vector2(.5,1)
	shade.texture = texture
	root.add_child(shade)
	var brand := label("E D G E W O R K",19)
	brand.position = Vector2(40,27)
	root.add_child(brand)
	var edition := label("ICE RUN     /     THE GODOT EDITION",10,Color("9aacb8"))
	edition.position = Vector2(42,57)
	root.add_child(edition)
	var top_buttons := HBoxContainer.new()
	top_buttons.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	top_buttons.position = Vector2(-360,25)
	top_buttons.size = Vector2(320,43)
	top_buttons.add_theme_constant_override("separation",8)
	top_buttons.add_child(button("Camera · V",cycle_camera))
	top_buttons.add_child(button("Menu · Esc",pause_game))
	root.add_child(top_buttons)
	coach_title = label("",23)
	coach_title.position = Vector2(42,130)
	root.add_child(coach_title)
	coach_tip = paragraph("",14)
	coach_tip.position = Vector2(42,170)
	coach_tip.size = Vector2(350,95)
	root.add_child(coach_tip)
	coach_progress = label("",13,Color("c5b08e"))
	coach_progress.position = Vector2(42,275)
	root.add_child(coach_progress)
	hud_time = label("",20)
	hud_time.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	hud_time.position = Vector2(-240,95)
	hud_time.size = Vector2(200,30)
	hud_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	root.add_child(hud_time)
	hud_move = label("",13,Color("b5c6cf"))
	hud_move.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	hud_move.position = Vector2(42,-58)
	root.add_child(hud_move)
	# The live readouts the browser game's #technical/#spin-level already show
	# (game/main.ts) — engine.mjs now tracks a spin's level the same way it
	# already tracked jump TES; this just surfaces both here too.
	hud_technical = label("",11,Color("94b6be"))
	hud_technical.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	hud_technical.position = Vector2(42,-78)
	root.add_child(hud_technical)
	ribbon = Ribbon.new()
	ribbon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ribbon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ribbon)
	notice = label("",13,Color("e6c8a3"))
	notice.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	notice.position = Vector2(-620,-55)
	notice.size = Vector2(580,40)
	notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	root.add_child(notice)
	overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = Color(.017,.032,.049,.89)
	root.add_child(overlay)
	var layout := MarginContainer.new()
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("margin_left",70)
	layout.add_theme_constant_override("margin_right",70)
	layout.add_theme_constant_override("margin_top",65)
	layout.add_theme_constant_override("margin_bottom",40)
	overlay.add_child(layout)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation",70)
	layout.add_child(columns)
	var identity := VBoxContainer.new()
	identity.custom_minimum_size.x = 390
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity.add_theme_constant_override("separation",17)
	columns.add_child(identity)
	identity.add_child(label("EDGEWORK  /  SEASON 01",13,Color("c6b293")))
	var title := label("Grace is\nphysics,\nheld.",67)
	title.add_theme_font_override("font",load("res://assets/fonts/title.ttf"))
	identity.add_child(title)
	identity.add_child(paragraph("The ice remembers every line.\nBuild a program. Find your edge.\nMake the performance your own.",18))
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	identity.add_child(spacer)
	identity.add_child(paragraph("A / D   carve     Space   push\nShift   load & release     Y   spin\nB   turn     Z   twizzle     U   low pose\nC   open arms     X   brake\nJ   assisted jump (Beginner only)",13))
	identity.add_child(label("120 Hz skating · original Ice Lab simulation",11,Color("728b9d")))
	menu_scroll = ScrollContainer.new()
	menu_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	menu_scroll.custom_minimum_size.x = 450
	menu_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(menu_scroll)
	menu = VBoxContainer.new()
	menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu.add_theme_constant_override("separation",12)
	menu_scroll.add_child(menu)

func clear_menu(title: String, subtitle: String) -> void:
	for child in menu.get_children():
		menu.remove_child(child)
		child.queue_free()
	menu.add_child(label(title,30))
	menu.add_child(paragraph(subtitle,14))
	menu.add_child(HSeparator.new())
	menu_scroll.scroll_vertical = 0

func show_page(page: String) -> void:
	current_page = page
	overlay.show()
	playing = false
	music.stream_paused = true
	if page == "home":
		clear_menu("Your time on the ice", "One rink. Every edge. A season to make your own.")
		if not frame.is_empty() and not frame.finished and int(frame.state.tick)>0:
			menu.add_child(button("Continue skating →",resume_game,true))
		menu.add_child(button("The Season   /   Career →",func():show_page("career"),true))
		menu.add_child(button("The Composer   /   Author a program",func():show_page("composer")))
		menu.add_child(button("Free Skate   /   Quiet ice",func():start_game("free")))
		menu.add_child(button("Rookie course   /   Learn the line",func():start_game("rookie")))
		menu.add_child(button("Ice Run   /   90-second light course",func():start_game("timed")))
		menu.add_child(button("Controls, music & assists",func():show_page("settings")))
		menu.add_child(button("Quit",func():get_tree().quit()))
	elif page == "career":
		clear_menu("The Season", "Finish the choreography to advance. Gold: no falls. Silver: at most two. Bronze: finish. Each improved medal tier earns 150 XP.")
		if frame.is_empty():
			menu.add_child(paragraph("Connecting to Ice Lab…"))
		else:
			menu.add_child(label("%d training XP available" % int(frame.career.xp),16,Color("d5bd96")))
			for i in catalog.events.size():
				var event: Dictionary = catalog.events[i]
				var medal := str(catalog.medals[int(frame.career.medals[i])])
				var event_button := button("%02d   %s   /   %s" % [i+1,event.title,medal],func():start_game("career",i),i == int(frame.career.unlocked))
				event_button.disabled = i > int(frame.career.unlocked)
				menu.add_child(event_button)
				menu.add_child(paragraph("%ds · %s" % [int(event.seconds),routine_names(event.routine)],12))
			menu.add_child(HSeparator.new())
			menu.add_child(label("Training",21))
			for stat in ["strength","spring","edgeControl","balance"]:
				var cost := int(frame.career.costs[stat])
				var value := int(frame.career.stats[stat])
				var train_button := button("%s  %d → %d    /    %d XP" % [stat.capitalize(),value,value+1,cost],func():link.send("train",{"stat":stat}))
				train_button.disabled = int(frame.career.xp)<cost or value>=100
				menu.add_child(train_button)
		menu.add_child(button("← Back",func():show_page("home")))
	elif page == "composer":
		clear_menu("The Composer", "Author an ordered skating program. Add phrases, reorder them, then perform the sequence on the ice. A rehearsal lasts up to three minutes.")
		if catalog.is_empty():
			menu.add_child(paragraph("Preparing your skating program…"))
			menu.add_child(button("← Back",func():show_page("home")))
			return
		for i in sequence.size():
			var row := HBoxContainer.new()
			var name_label := label("%02d   %s" % [i+1,catalog.elements[sequence[i]].title],15)
			name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(name_label)
			row.add_child(button("↑",func():
				if i>0:
					var previous_id = sequence[i-1]
					sequence[i-1] = sequence[i]
					sequence[i] = previous_id
					save_preferences()
					show_page("composer")))
			row.add_child(button("×",func():
				sequence.remove_at(i)
				save_preferences()
				show_page("composer")))
			menu.add_child(row)
		var chooser := OptionButton.new()
		for id in catalog.elements:
			chooser.add_item(catalog.elements[id].title)
		menu.add_child(chooser)
		var add := button("+ Add phrase",func():
			sequence.append(catalog.elements.keys()[chooser.selected])
			save_preferences()
			show_page("composer"))
		add.disabled = sequence.size()>=16
		menu.add_child(add)
		var skate := button("Skate this program →",func():start_game("composer"),true)
		skate.disabled = sequence.is_empty()
		menu.add_child(skate)
		menu.add_child(button("← Back",func():show_page("home")))
	elif page == "settings":
		clear_menu("Your skating setup", "Changes apply to your next skate. Keyboard and analog controller are supported. Face buttons request moves; the physics decides what is possible.")
		menu.add_child(button("Assist: "+("Beginner" if beginner else "Simulation"),func():beginner=not beginner;show_page("settings")))
		menu.add_child(button("Control: "+["Lean & load","Assisted steering","Two-foot control"][scheme],func():scheme=(scheme+1)%3;show_page("settings")))
		menu.add_child(button("Cruise: "+("On" if cruise else "Off"),func():cruise=not cruise;show_page("settings")))
		menu.add_child(button("Music: "+("On" if music_enabled else "Off"),func():music_enabled=not music_enabled;show_page("settings")))
		menu.add_child(label("Skater",16))
		var character_picker := OptionButton.new()
		for entry in CHARACTERS:
			character_picker.add_item(str(entry.name))
		character_picker.selected = character
		character_picker.item_selected.connect(func(index: int):character=index)
		menu.add_child(character_picker)
		if not catalog.is_empty():
			menu.add_child(label("Soundtrack",16))
			var track_picker := OptionButton.new()
			for song in catalog.tracks:
				track_picker.add_item(str(song.title))
			track_picker.selected = track
			track_picker.item_selected.connect(func(index: int):track=index)
			menu.add_child(track_picker)
			menu.add_child(label("Free skate profile",16))
			var profile_picker := OptionButton.new()
			for name in catalog.profiles:
				profile_picker.add_item(str(name))
			profile_picker.selected = profile
			profile_picker.item_selected.connect(func(index: int):profile=index)
			menu.add_child(profile_picker)
		menu.add_child(paragraph("Controller: left stick steers; RT loads the knee; A pushes; Y spins; B turns; X twizzles; LT taps the toe, holds the brake; bumpers choose the foot; right stick opens the arms. D-pad up requests the Beginner jump; down holds the low pose.\n\nKeyboard: Q/E choose the foot; W/S move the rocker; F plants the toe; comma winds up a jump; I holds Ina Bauer; N requests a bracket. R restarts. Esc pauses.",14))
		menu.add_child(button("Save this skate's replay",func():link.send("export")))
		menu.add_child(button("Watch saved replay",func():link.send("replay")))
		menu.add_child(button("Export session measurements",func():link.send("metrics")))
		menu.add_child(button("Save settings & back",func():save_preferences();show_page("home")))
	elif page == "result":
		clear_menu(str(frame.result.title),str(frame.result.detail))
		if frame.result.has("xp"):
			menu.add_child(label("+%d training XP" % int(frame.result.xp),22,Color("d5bd96")))
		menu.add_child(paragraph("Your lines remain on the ice. Take another run, or carry what you learned into the next program."))
		menu.add_child(button("Continue your career →",func():show_page("career"),true))
		menu.add_child(button("Skate again",func():start_game(active_mode,event_index)))
		menu.add_child(button("Save performance replay",func():link.send("export")))
		menu.add_child(button("Return to the rink menu",func():show_page("home")))

func routine_names(ids: Array) -> String:
	var names := PackedStringArray()
	for id in ids:
		names.append(catalog.elements[id].title)
	return " → ".join(names)

func start_game(mode: String, index: int = 0) -> void:
	if not link.operational:
		on_error("The skating engine is still starting.")
		return
	active_mode = mode
	event_index = index
	playing = false
	skater.load_model(CHARACTERS[character].path)
	link.send("configure",{"options":{"scheme":scheme,"beginner":beginner,"cruise":cruise,"track":track,"profile":profile}})
	link.send("start",{"options":{"mode":mode,"event":index,"sequence":sequence if mode=="composer" else null}})

func on_engine(op: String, data: Dictionary) -> void:
	if op == "hello":
		catalog = data.catalog
		frame = data.frame
		skater.apply_frame(frame,true)
		show_page(current_page)
		if boot_test:
			for page in ["career","composer","settings","home"]:
				show_page(page)
		if boot_test or screenshot_test:
			start_game("career")
		return
	if op == "export" or op == "metrics":
		notice.text = "Saved: "+str(data.path)
		return
	frame = data
	if op == "train":
		show_page("career")
		return
	if op == "configure":
		return
	if op == "start" or op == "replay":
		push_pending = false
		toe_pending = false
		trick_pending = false
		tick_debt = 0.0
		arena.clear_traces()
		arena.set_course(str(frame.mode),catalog)
		skater.apply_frame(frame,true)
		last_result_tick = -1
		music.stream = load("res://assets/generated/audio/"+str(catalog.tracks[int(frame.track)].file))
		if DisplayServer.get_name() != "headless":
			music.play()
		music.stream_paused = not music_enabled
		playing = true
		overlay.hide()
		notice.text = ""
	else:
		skater.apply_frame(frame)
	arena.add_traces(frame.trace)
	arena.update_course(frame)
	ribbon.update_state(frame)
	update_hud()
	if frame.finished and last_result_tick != int(frame.state.tick):
		last_result_tick = int(frame.state.tick)
		show_page("result")

func on_error(message: String) -> void:
	notice.text = message
	push_warning(message)
	if link != null and link.faulted:
		playing = false
		show_page("home")
		menu.add_child(paragraph(message))
		if boot_test:
			get_tree().quit(1)

func pause_game() -> void:
	if overlay.visible:
		if not frame.is_empty() and not frame.finished:
			resume_game()
	else:
		show_page("home")

func resume_game() -> void:
	if frame.is_empty() or frame.finished:
		return
	overlay.hide()
	playing = true
	music.stream_paused = not music_enabled

func cycle_camera() -> void:
	if not frame.is_empty() and int(frame.state.jump.phase)==2:
		return
	camera_mode = (camera_mode+1)%3

func update_hud() -> void:
	var s: Dictionary = frame.state
	hud_move.text = "%s   ·   %.1f m/s" % [str(frame.move),Vector2(s.vel.x,s.vel.y).length()]
	var spin_level := int(frame.get("spinLevel",-1))
	hud_technical.text = "Jump TES %.2f" % float(frame.get("technical",0.0))
	if spin_level >= 0:
		hud_technical.text += "   ·   Last spin: level %s" % (str(spin_level) if spin_level > 0 else "B")
	hud_time.text = ""
	coach_title.text = ""
	coach_tip.text = ""
	coach_progress.text = ""
	if frame.routine != null:
		var r: Dictionary = frame.routine
		hud_time.text = "%02d:%02d" % [int(r.seconds)/60,int(r.seconds)%60]
		if int(r.index)<r.sequence.size():
			var element: Dictionary = catalog.elements[r.sequence[int(r.index)]]
			coach_title.text = element.title
			coach_tip.text = element.hint
			coach_progress.text = "%02d / %02d    ·    %s" % [int(r.index)+1,r.sequence.size(),r.title]
			if float(element.duration)>0:
				coach_progress.text += "\nHold %.1f / %.1f s" % [float(r.held),float(element.duration)]
	elif frame.mode == "rookie":
		coach_title.text = frame.rookie.title
		coach_tip.text = frame.rookie.hint
		coach_progress.text = "%d / 8 gates · %d clean" % [int(frame.rookie.index),int(frame.rookie.cleared)]
	elif frame.mode == "timed":
		coach_title.text = "Follow the lights"
		coach_tip.text = "Carve toward the next marker. Push through the curve and keep your line."
		coach_progress.text = "%d lights · %d points" % [int(frame.run.collected),int(frame.run.score)]
		hud_time.text = "%.1f s" % float(frame.run.seconds)
	if bool(s.fallen):
		coach_title.text = "Find your feet."
		coach_tip.text = "A fall is part of skating. Tap Space / A to get up and continue."

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.physical_keycode:
		KEY_ESCAPE, KEY_P: pause_game()
		KEY_V: cycle_camera()
		KEY_R:
			if not overlay.visible:
				start_game(active_mode,event_index)
		KEY_SPACE: push_pending = true
		KEY_F: toe_pending = true
		KEY_J: trick_pending = true

func pressed(key: Key) -> bool:
	return Input.is_physical_key_pressed(key)

func shaped_stick(raw: Vector2) -> Vector2:
	var length := minf(raw.length(),1.0)
	return Vector2.ZERO if length<.22 else raw.normalized()*pow((length-.22)/.78,1.35)

func controls(dt: float) -> Dictionary:
	var devices := Input.get_connected_joypads()
	var joy := int(devices[0]) if not devices.is_empty() else -1
	var left := Vector2.ZERO
	var right := Vector2.ZERO
	var rt := 0.0
	var lt := 0.0
	if joy >= 0:
		left = shaped_stick(Vector2(Input.get_joy_axis(joy,JOY_AXIS_LEFT_X),-Input.get_joy_axis(joy,JOY_AXIS_LEFT_Y)))
		right = shaped_stick(Vector2(Input.get_joy_axis(joy,JOY_AXIS_RIGHT_X),-Input.get_joy_axis(joy,JOY_AXIS_RIGHT_Y)))
		rt = maxf(0,Input.get_joy_axis(joy,JOY_AXIS_TRIGGER_RIGHT))
		lt = maxf(0,Input.get_joy_axis(joy,JOY_AXIS_TRIGGER_LEFT))
	var held_lt := lt>.35
	if held_lt and not previous_lt:
		toe_pending = true
	lt_time = lt_time+dt if held_lt else 0.0
	previous_lt = held_lt
	var raw_left := left
	if scheme == 1:
		var forward := -camera.global_basis.z
		forward.y = 0
		forward = forward.normalized()
		var aim := camera.global_basis.x*left.x+forward*left.y
		left = Vector2(aim.x,aim.z)
	var lb := pressed(KEY_Q) or pad(joy,JOY_BUTTON_LEFT_SHOULDER)
	var rb := pressed(KEY_E) or pad(joy,JOY_BUTTON_RIGHT_SHOULDER)
	var k1 := float(pressed(KEY_D))-float(pressed(KEY_A))
	var k2 := float(pressed(KEY_RIGHT))-float(pressed(KEY_LEFT))
	return {"lx":left.x,"ly":left.y,"rx":right.x,"ry":right.y,"lean":raw_left.x,"pitch":raw_left.y,"kx":clampf(k1+k2,-1,1),"ky":float(pressed(KEY_W) or pressed(KEY_UP))-float(pressed(KEY_S) or pressed(KEY_DOWN)),"kPrimaryX":k1,"kAltX":k2,"knee":maxf(.95 if pressed(KEY_SHIFT) else .35,rt),"weight":0.0 if lb and not rb else 1.0 if rb and not lb else .5,"carriage":1.0 if pressed(KEY_C) else right.length(),"windup":1.0 if pressed(KEY_COMMA) else 0.0,"push":push_pending,"pushHeld":pressed(KEY_SPACE) or pad(joy,JOY_BUTTON_A),"brake":pressed(KEY_X) or lt_time>.15,"toe":toe_pending,"turn":pressed(KEY_B) or pad(joy,JOY_BUTTON_B),"bracket":pressed(KEY_N) or pad(joy,JOY_BUTTON_RIGHT_STICK),"twizzle":pressed(KEY_Z) or pad(joy,JOY_BUTTON_X),"spin":pressed(KEY_Y) or pad(joy,JOY_BUTTON_Y),"inaBauer":pressed(KEY_I) or (lb and rb),"cycleJump":trick_pending}

func pad(joy: int, code: JoyButton) -> bool:
	return joy>=0 and Input.is_joy_button_pressed(joy,code)

func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton and event.pressed:
		match event.button_index:
			JOY_BUTTON_A: push_pending = true
			JOY_BUTTON_DPAD_UP: trick_pending = true
			JOY_BUTTON_START: pause_game()
			JOY_BUTTON_BACK:
				if playing:
					start_game(active_mode,event_index)

func _physics_process(dt: float) -> void:
	if not playing or link == null or not link.operational:
		tick_debt = 0.0
		return
	tick_debt = minf(12.0,tick_debt+dt*120.0)
	if link.busy():
		return
	var ticks := mini(12,int(tick_debt))
	if ticks<1:
		return
	tick_debt -= ticks
	var c := controls(dt)
	var devices := Input.get_connected_joypads()
	var low := pressed(KEY_U) or (not devices.is_empty() and pad(int(devices[0]),JOY_BUTTON_DPAD_DOWN))
	if boot_test and not frame.is_empty():
		var index := int(frame.routine.index) if frame.routine != null else 0
		c.kx = -1.0 if index==1 else 0.0
		low = index==2
	link.send("frame",{"controls":c,"ticks":ticks,"low":low})
	push_pending = false
	toe_pending = false
	trick_pending = false

func _process(dt: float) -> void:
	if not frame.is_empty():
		update_camera(dt)
		fill_audio()
	if boot_test:
		test_seconds += dt
		if not frame.is_empty() and frame.finished:
			if frame.routine != null and int(frame.routine.index)==3:
				print("GODOT_SMOKE_PASS: live Ice Lab completed the three-element career routine; traces=",arena.trace_count)
				get_tree().quit(0)
			else:
				push_error("Career smoke test did not finish the routine")
				get_tree().quit(1)
		elif test_seconds>60:
			push_error("Godot smoke test timed out")
			get_tree().quit(1)
	if screenshot_test and not frame.is_empty():
		test_seconds += dt
		if test_seconds>2.5 and not screenshot_saved:
			screenshot_saved = true
			capture()

func capture() -> void:
	playing = false
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	image.save_png("/tmp/edgework-godot-rink.png")
	for page in ["home","career","composer","settings"]:
		show_page(page)
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-%s.png" % ("menu" if page == "home" else page))
	print("GODOT_CAPTURE_PASS")
	get_tree().quit()

func update_camera(dt: float) -> void:
	var s: Dictionary = frame.state
	var velocity := Vector3(float(s.vel.x),0,float(s.vel.y))
	if velocity.length()>.5 and int(s.jump.phase)!=2:
		follow_direction = follow_direction.lerp(velocity.normalized(),1-exp(-dt*1.8)).normalized()
	var focus: Vector3 = skater.position+Vector3(0,.9,0)
	var desired := focus-follow_direction*6.8+Vector3(0,2.0,0)+follow_direction.cross(Vector3.UP)*1.5
	if camera_mode == 1:
		desired = Vector3(33,23,30)
	elif camera_mode == 2:
		desired = focus+Vector3(0,24,.01)
	if overlay.visible:
		desired = focus+Vector3(4.7,2.2,5.0)
	camera.position = camera.position.lerp(desired,1-exp(-dt*3.0))
	camera.look_at(focus+follow_direction*.7)

func fill_audio() -> void:
	if generator == null:
		return
	var s: Dictionary = frame.state
	var speed := Vector2(s.vel.x,s.vel.y).length()
	var level := clampf(speed/12.0,0,.55) if playing and int(s.jump.phase)!=2 and not bool(s.fallen) else 0.0
	for i in mini(generator.get_frames_available(),4096):
		audio_phase += .045+speed*.0008
		var sample := (rng.randf_range(-1,1)*.55+sin(audio_phase)*.08)*level
		generator.push_frame(Vector2(sample,sample))

func _exit_tree() -> void:
	if music:
		music.stop()
		music.stream = null
	if blade_audio:
		blade_audio.stop()
		blade_audio.stream = null
	generator = null

func load_preferences() -> void:
	if not FileAccess.file_exists(settings_path):
		return
	var saved = JSON.parse_string(FileAccess.get_file_as_string(settings_path))
	if not saved is Dictionary:
		return
	beginner = bool(saved.get("beginner",true))
	scheme = clampi(int(saved.get("scheme",1)),0,2)
	track = clampi(int(saved.get("track",0)),0,4)
	profile = clampi(int(saved.get("profile",0)),0,3)
	character = clampi(int(saved.get("character",0)),0,CHARACTERS.size()-1)
	cruise = bool(saved.get("cruise",true))
	music_enabled = bool(saved.get("music",true))
	var ids = saved.get("sequence",[])
	if ids is Array and ids.size()>0 and ids.size()<=16:
		var valid := true
		for id in ids:
			valid = valid and id in ["glide","edge","crossover","jump","spin","pose"]
		if valid:
			sequence = ids

func save_preferences() -> void:
	if boot_test or screenshot_test:
		return
	var file := FileAccess.open(settings_path,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"beginner":beginner,"scheme":scheme,"track":track,"profile":profile,"character":character,"cruise":cruise,"music":music_enabled,"sequence":sequence}))
	else:
		on_error("Preferences could not be saved.")
