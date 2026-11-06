extends Node3D
const EngineLink = preload("res://scripts/engine_link.gd")
const Arena = preload("res://scripts/arena.gd")
const Skater = preload("res://scripts/skater.gd")
const SimSpace = preload("res://scripts/sim_space.gd")
const Shot = preload("res://scripts/shot.gd")
const Ribbon = preload("res://scripts/ribbon.gd")
const Broadcast = preload("res://scripts/broadcast.gd")
# Purely a local presentation choice: skater.gd poses whichever glb this
# points at by bone name, so any entry here just needs to answer to the same
# eleven bones (see tools/build_skater.py and tools/build_berserker.py).
const CHARACTERS: Array[Dictionary] = [
	{"name": "Athlete", "path": "res://assets/generated/skater-athlete.glb"},
	{"name": "Competition athlete", "path": "res://assets/generated/skater-competition.glb"},
	{"name": "Black Berserker", "path": "res://assets/generated/skater-berserker.glb"},
	{"name": "Original Violet", "path": "res://assets/generated/skater.glb"},
]
var link: Node
var arena: Node3D
var skater: Node3D
var partner: Node3D
var pair_hold_pending := false
var pair_lift_pending := false
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
var broadcast: Control
var presentation_clock := 0.0
var last_landing_tick := -1
var controller_status: Label
var rumble_enabled := true
var paddle_layout := 0
## paddle_layout's last value: paddles reach the sim as buttons 18-21, its own layer (game/full-controls.ts).
const PADDLE_LAYER := 3
var lesson_course := "trust"
## The event the briefing page shows, and the layout being edited there.
var focus_event := 0
## The button a page wants focused first, if not its first one.
var preferred_focus: Button
var blade_filter := 0.0
var crowd_filter := 0.0
var crowd_swell := 0.0
var landing_envelope := 0.0
var catalog: Dictionary = {}
var frame: Dictionary = {}
var playing := false
var current_page := "home"
var active_mode := "free"
var event_index := 0
var sequence: Array = ["glide","edge","jump","spin","pose"]
var camera_mode := 0
var follow_direction := Vector3(1,0,0)
var shot: Dictionary = Shot.NONE
var music_enabled := true
var beginner := false
var scheme := 3
var skating_setup := "explorer"
var assistance := 0.75
## game/steady.ts: "" follows the setup's default (off in Simulation, Experimental and Dig Gate, light elsewhere).
var steady_choice := ""
var controller_profile: Dictionary = {}
var saved_controller_profile: Dictionary = {}
var track := 0
var profile := 0
var character := 0
var costume := 3
# The Composer's music preview and the atelier's design in hand (game/composer.ts, game/atelier.ts).
var preview: AudioStreamPlayer
var design_slot := -1
var design: Dictionary = {}
var focus_key := ""
var cruise := false
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
# Every costume slot on Violet's model (skater.gd SKIN_SLOTS), each one surface.
const SKIN_SURFACES := 7

func _ready() -> void:
	boot_test = "--smoke-test" in OS.get_cmdline_user_args()
	accept_with_pad()
	if boot_test:
		var a := InputEventJoypadButton.new()
		a.button_index = JOY_BUTTON_A
		a.pressed = true
		if not a.is_action("ui_accept"):
			push_error("Pad A does not select in menus")
			get_tree().quit(1)
	if boot_test:
		skating_setup = ""
		scheme = 1
		beginner = true
		cruise = true
	screenshot_test = "--capture" in OS.get_cmdline_user_args()
	if not boot_test and not screenshot_test and DisplayServer.get_name() != "headless":
		# A wired Elite's paddles need SDL configured at launch: scripts/pad_map.gd. Joypads list after the first frames.
		get_tree().create_timer(.25).timeout.connect(func():
			if PadMap.relaunch_for_paddles(): get_tree().quit())
	if boot_test and "--full-controls" in OS.get_cmdline_user_args():
		scheme = 3
	if not boot_test and not screenshot_test:
		load_preferences()
	if not skating_setup.is_empty():
		scheme = 3
		if skating_setup != "repertoire":
			beginner = false
		if skating_setup in ["simulation","experimental"]:
			cruise = false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--costume="):
			costume = maxi(int(arg.trim_prefix("--costume=")),0)
	arena = Arena.new()
	add_child(arena)
	skater = Skater.new()
	skater.model_path = CHARACTERS[character].path
	add_child(skater)
	partner = Skater.new()
	partner.model_path = CHARACTERS[2].path
	partner.visible = false
	add_child(partner)
	camera = Camera3D.new()
	camera.fov = 40
	camera.near = .08
	camera.far = 170
	camera.position = Vector3(7,4.0,-11)
	add_child(camera)
	camera.look_at(Vector3(0,.8,-18))
	music = AudioStreamPlayer.new()
	music.volume_db = -12
	add_child(music)
	preview = AudioStreamPlayer.new()
	preview.volume_db = -12
	add_child(preview)
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
	Input.joy_connection_changed.connect(func(_device: int, connected: bool):
		if not connected and playing: pause_game()
		update_controller_status())
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
	# Bright ice runs behind much of this type.
	l.add_theme_color_override("font_shadow_color",Color(.02,.05,.09,.85))
	l.add_theme_constant_override("shadow_offset_x",1)
	l.add_theme_constant_override("shadow_offset_y",1)
	return l

func paragraph(text: String, size: int = 16) -> Label:
	var l := label(text,size,Color("9eafb9"))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l

func button(text: String, action: Callable, primary: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size.y = 48
	b.add_theme_font_size_override("font_size",16)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("d5c29a") if primary else Color(.06,.10,.15,.86)
	normal.content_margin_left = 17
	normal.content_margin_right = 17
	normal.content_margin_top = 9
	normal.content_margin_bottom = 9
	normal.border_width_bottom = 1
	normal.border_color = Color("354653")
	b.add_theme_stylebox_override("normal",normal)
	var hover: StyleBoxFlat = normal.duplicate()
	hover.bg_color = Color("f0dfbd") if primary else Color("273f52")
	b.add_theme_stylebox_override("hover",hover)
	b.add_theme_stylebox_override("pressed",hover)
	b.add_theme_color_override("font_color",Color("152430") if primary else Color("dce7e9"))
	b.add_theme_color_override("font_hover_color",Color("152430") if primary else Color("ffffff"))
	b.add_theme_color_override("font_focus_color",Color("152430") if primary else Color("ffffff"))
	var focused := StyleBoxFlat.new()
	focused.bg_color = Color(0,0,0,0)
	focused.border_width_left = 3
	focused.border_color = Color("d9bc84")
	b.add_theme_stylebox_override("focus",focused)
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
	var edition := label("GRAND PRIX     /     FIGURE SKATING",10,Color("d5c29a"))
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
	# Lessons are read while skating, over a busy crowd.
	for coach_label in [coach_title,coach_tip,coach_progress]:
		coach_label.add_theme_color_override("font_outline_color",Color(0.03,0.06,0.1,.9))
		coach_label.add_theme_constant_override("outline_size",7)
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
	hud_move.hide()
	hud_technical.hide()
	broadcast = Broadcast.new()
	broadcast.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(broadcast)
	ribbon = Ribbon.new()
	ribbon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ribbon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(ribbon)
	ribbon.hide()
	notice = label("",13,Color("e6c8a3"))
	notice.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	notice.position = Vector2(-620,-55)
	notice.size = Vector2(580,40)
	notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	root.add_child(notice)
	overlay = ColorRect.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var menu_material := ShaderMaterial.new()
	menu_material.shader = load("res://shaders/menu.gdshader")
	overlay.material = menu_material
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
	identity.add_child(label("THE GRAND PRIX COLLECTION    /    01",12,Color("c6b293")))
	var title := label("EDGEWORK",67)
	title.add_theme_font_override("font",load("res://assets/fonts/title.ttf"))
	identity.add_child(title)
	identity.add_child(label("FIGURE SKATING",19,Color("d5c29a")))
	identity.add_child(paragraph("Precision. Presence. A perfect edge.\nThe ice remembers every line.",17))
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	identity.add_child(spacer)
	identity.add_child(label("N O R T H L I G H T   A R E N A",13,Color("d5c29a")))
	identity.add_child(paragraph("A season on the edge of possibility.\nChoose your discipline. Compose your signature.",14))
	controller_status = paragraph("",12)
	identity.add_child(controller_status)
	update_controller_status()
	menu_scroll = ScrollContainer.new()
	menu_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	menu_scroll.follow_focus = true
	menu_scroll.custom_minimum_size.x = 450
	menu_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(menu_scroll)
	menu = VBoxContainer.new()
	menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu.add_theme_constant_override("separation",12)
	menu_scroll.add_child(menu)

func update_controller_status() -> void:
	if controller_status == null: return
	var devices := Input.get_connected_joypads()
	controller_status.text = "XBOX CONTROLS  /  A select · B back · Menu pause\nD-pad navigate · View change camera" if not devices.is_empty() else "KEYBOARD  /  Enter select · Esc pause\nA / D carve · Space push · Shift load / release"
	if not devices.is_empty() and PadMap.wired_elite(devices[0]):
		controller_status.text += "\nElite 2  /  "+("paddles ready" if PadMap.paddles_mapped() else "paddles off until the game restarts")

func clear_menu(title: String, subtitle: String) -> void:
	for child in menu.get_children():
		menu.remove_child(child)
		child.queue_free()
	menu.add_child(label(title,30))
	menu.add_child(paragraph(subtitle,14))
	menu.add_child(HSeparator.new())
	menu_scroll.scroll_vertical = 0

# Godot 4.7's default ui_accept is Enter, Kp Enter and Space only: the D-pad moved focus
# but A pressed nothing (found in play, 2026-11-02). A joins it, for buttons and popups alike.
static func accept_with_pad() -> void:
	for e in InputMap.action_get_events("ui_accept"):
		if e is InputEventJoypadButton and e.button_index == JOY_BUTTON_A: return
	var a := InputEventJoypadButton.new()
	a.button_index = JOY_BUTTON_A
	a.device = -1
	InputMap.action_add_event("ui_accept",a)

func unfocus_disabled(node: Node) -> void:
	for child in node.get_children():
		if child is BaseButton:
			child.focus_mode = Control.FOCUS_NONE if child.disabled else Control.FOCUS_ALL
		unfocus_disabled(child)

func focus_menu() -> void:
	if not overlay.visible: return
	unfocus_disabled(menu)
	if is_instance_valid(preferred_focus) and preferred_focus.is_inside_tree() and not preferred_focus.disabled:
		preferred_focus.grab_focus()
		return
	for child in menu.get_children():
		if child is Button and not child.disabled:
			child.grab_focus()
			return

func show_page(page: String) -> void:
	current_page = page
	if page != "music" and preview: preview.stop()
	overlay.show()
	playing = false
	music.stream_paused = true
	broadcast.hide()
	get_tree().create_timer(.05).timeout.connect(focus_menu)
	if page == "home":
		clear_menu("Your time on the ice", "One rink. Every edge. A season to make your own.")
		if not frame.is_empty() and not frame.finished and int(frame.state.tick)>0:
			menu.add_child(button("Continue skating →",resume_game,true))
			if frame.get("tutorial") != null:
				menu.add_child(button("Skip this step   /   earns no XP",func():link.send("skipStep")))
		menu.add_child(button("The Season   /   Career →",func():show_page("career"),true))
		menu.add_child(button("Learn your controls   /   A course for each setup",func():show_page("learn")))
		menu.add_child(button("The Composer   /   Author a program",func():show_page("composer")))
		menu.add_child(button("Free Skate   /   Quiet ice",func():start_game("free")))
		menu.add_child(button("Pairs   /   Skate with a partner",func():start_game("pairs")))
		menu.add_child(button("Pairs challenge   /   90 seconds",func():start_game("pairs",0,true)))
		menu.add_child(button("Rookie course   /   Learn the line",func():start_game("rookie")))
		menu.add_child(button("Ice Run   /   90-second light course",func():start_game("timed")))
		menu.add_child(button("Controls, music & assists",func():show_page("settings")))
		menu.add_child(button("Quit",func():get_tree().quit()))
	elif page == "career":
		clear_menu("The Season", "Finish the program to advance. Gold: no falls. Silver: at most two. Bronze: finish. Each improved medal tier earns 150 XP and 2 training weeks.")
		if frame.is_empty():
			menu.add_child(paragraph("Connecting to Ice Lab…"))
		else:
			menu.add_child(label("%d XP   ·   %d training weeks   ·   overall %.1f" % [int(frame.career.xp),int(frame.career.weeks),float(frame.career.overall)],16,Color("d5bd96")))
			menu.add_child(button("Learn your controls   /   each new step +%d XP" % int(catalog.lessonXp),func():show_page("learn")))
			for i in catalog.events.size():
				var event: Dictionary = catalog.events[i]
				var medal := str(catalog.medals[int(frame.career.medals[i])])
				var event_button := button("%02d   %s   /   %s" % [i+1,event.title,medal],func():focus_event=i;show_page("event"),i == int(frame.career.unlocked))
				event_button.disabled = i > int(frame.career.unlocked)
				if i == int(frame.career.unlocked): preferred_focus = event_button
				menu.add_child(keyed(event_button,"event-%d" % i))
				var planned = frame.career.plans[i]
				menu.add_child(paragraph("%ds · %s" % [int(event.seconds),routine_names(event.routine if planned == null else planned)],12))
				if not str(frame.career.locks[i]).is_empty():
					menu.add_child(paragraph(str(frame.career.locks[i]),12))
			menu.add_child(HSeparator.new())
			menu.add_child(label("Your arms",21))
			menu.add_child(paragraph("What your arms do most in competition. Drills shrink the trade-off for the tier you drill. Other modes need no choice: full balance, full line.",13))
			for i in catalog.armFocus.size():
				var tier: Dictionary = catalog.armFocus[i]
				var chosen: bool = i == int(frame.career.armFocus)
				menu.add_child(keyed(button("%s%s   /   drill best %d" % ["● " if chosen else "",tier.title,int(frame.career.armBest[i])],func():link.send("armFocus",{"focus":i}),chosen),"arm-%d" % i))
				menu.add_child(paragraph(str(tier.blurb),12))
			var drill_tier := str(catalog.armFocus[int(frame.career.armFocus)].title)
			menu.add_child(button("Drill %s   /   45 seconds" % drill_tier,func():start_game("armdrill")))
			menu.add_child(HSeparator.new())
			menu.add_child(label("Training   /   %d weeks left" % int(frame.career.weeks),21))
			menu.add_child(paragraph("Each costs a week. A jump family you don't drill between events goes rusty, and a rusty jump is harder to land. Drilling wins it back.",13))
			for family in catalog.families:
				var rust := float(frame.career.rust[family.id])
				var drill_button := button("%s   /   rust %d%%   /   1 week" % [str(family.title),roundi(rust*100)],func():link.send("drill",{"family":family.id}))
				drill_button.disabled = int(frame.career.weeks)<1
				menu.add_child(keyed(drill_button,"drill-%s" % family.id))
				menu.add_child(paragraph(str(family.blurb),12))
			for stat in ["edgeControl","balance","spring","strength","stamina"]:
				var cost := int(frame.career.costs[stat])
				var value := int(frame.career.stats[stat])
				var train_button := button("%s  %d → %d    /    %d XP, 1 week" % [stat.capitalize(),value,value+1,cost],func():link.send("train",{"stat":stat}))
				train_button.disabled = int(frame.career.xp)<cost or value>=100 or int(frame.career.weeks)<1
				menu.add_child(keyed(train_button,"train-%s" % stat))
			menu.add_child(HSeparator.new())
			menu.add_child(label("Your body",21))
			menu.add_child(paragraph("Every fall costs something, and it builds. Wear lowers what you skate with, not what you have trained; enough of it becomes an injury. A week's rest wins it back.",13))
			for region in catalog.bodyRegions:
				var wear := float(frame.career.wear[region.id])
				var injured: bool = frame.career.injured[region.id]
				var rest_button := button("%s   /   %s   /   rest 1 week" % [str(region.injury) if injured else str(region.title),"injured" if injured else "wear %d%%" % roundi(wear*100)],func():link.send("rest",{"region":region.id}))
				rest_button.disabled = int(frame.career.weeks)<1 or wear<=0.0
				menu.add_child(keyed(rest_button,"rest-%s" % region.id))
				menu.add_child(paragraph(str(region.blurb),12))
			menu.add_child(HSeparator.new())
			menu.add_child(label("Season standings",21))
			show_table(frame.career.season,"points")
		menu.add_child(button("← Back",func():show_page("home")))
	elif page == "event":
		var event: Dictionary = catalog.events[focus_event]
		clear_menu(str(event.title),"%s · %ds. Your program must hold everything this event asks for, in any order, and up to %d more of your own. More to skate is more to score, and more to fall on." % [str(event.venue),int(event.seconds),int(catalog.planExtra)])
		var saved_plan = frame.career.plans[focus_event]
		var plan: Array = (event.routine if saved_plan == null else saved_plan).duplicate()
		var required: Array = event.routine.duplicate()
		for i in plan.size():
			var row := HBoxContainer.new()
			var is_required: bool = required.has(plan[i])
			if is_required: required.erase(plan[i])
			var name_label := label("%02d   %s%s" % [i+1,catalog.elements[plan[i]].title,"" if is_required else "   (yours)"],15)
			name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(name_label)
			if i > 0:
				row.add_child(keyed(button("↑",func():
					var moved = plan[i]
					plan[i] = plan[i-1]
					plan[i-1] = moved
					focus_key = "up-%d" % (i-1) if i > 1 else "down-0"
					link.send("plan",{"event":focus_event,"plan":plan})),"up-%d" % i))
			if i < plan.size()-1:
				row.add_child(keyed(button("↓",func():
					var moved = plan[i]
					plan[i] = plan[i+1]
					plan[i+1] = moved
					focus_key = "down-%d" % (i+1) if i+1 < plan.size()-1 else "up-%d" % (i+1)
					link.send("plan",{"event":focus_event,"plan":plan})),"down-%d" % i))
			if not is_required:
				row.add_child(button("×",func():
					plan.remove_at(i)
					link.send("plan",{"event":focus_event,"plan":plan})))
			menu.add_child(row)
		if plan.size()<event.routine.size()+int(catalog.planExtra):
			var chooser := OptionButton.new()
			for id in catalog.elements:
				chooser.add_item(catalog.elements[id].title)
			menu.add_child(chooser)
			menu.add_child(button("+ Add before the closing pose" if plan.size()>0 and plan[plan.size()-1]=="pose" else "+ Add at the end",func():
				# game/programplan.ts insertAt: before a closing pose, which ends the program.
				plan.insert(plan.size()-1 if plan.size()>0 and plan[plan.size()-1]=="pose" else plan.size(),catalog.elements.keys()[chooser.selected])
				link.send("plan",{"event":focus_event,"plan":plan})))
		if saved_plan != null:
			menu.add_child(button("Use the event's own program",func():link.send("plan",{"event":focus_event,"plan":null})))
		var laid = frame.career.timelines[focus_event] if frame.career.has("timelines") else null
		if laid != null:
			menu.add_child(paragraph("On its music: %s. It runs the full %d s, and each element has its bar. Changing the order above takes it off the music." % [str(catalog.tracks[int(laid.track)].title),int(event.seconds)],13))
		menu.add_child(button("♪  Edit it on the music →" if laid != null else "♪  Lay it on the music →",func():timeline_edit({"action":"open"},focus_event)))
		var lock := str(frame.career.locks[focus_event])
		if not lock.is_empty():
			menu.add_child(paragraph(lock,14))
		var skate := button("Skate this program →",func():start_game("career",focus_event),true)
		skate.disabled = not lock.is_empty()
		menu.add_child(skate)
		menu.add_child(HSeparator.new())
		menu.add_child(label("The field",21))
		menu.add_child(paragraph("They don't decide your medal. They are who you're measured against.",12))
		show_table(frame.career.field[focus_event],"score")
		menu.add_child(button("← The Season",func():show_page("career")))
		preferred_focus = skate
	elif page == "learn":
		clear_menu("Learn your controls", "A short course for each setup: what your hands do on that pad, on the ice, in your own bindings. Pick one from another setup and it becomes your setup.")
		if catalog.is_empty():
			menu.add_child(paragraph("Preparing your lessons…"))
		else:
			menu.add_child(button("Trust the ice   /   Balance to air, %d steps" % int(catalog.trustSteps),func():start_lesson("trust",skating_setup),true))
			menu.add_child(paragraph("Skating itself, in your current setup's words: stand still on something that moves, then edges, getting where you mean to go, stops, and only then the air.",12))
			for course in catalog.courses:
				if str(course.id) == "paddles": continue
				var mine: bool = skating_setup in course.setups
				menu.add_child(button("%s%s" % ["● " if mine else "",str(course.title)],func():start_lesson(str(course.id),str(course.setups[0])),mine))
				menu.add_child(paragraph(str(course.blurb),12))
			for course in catalog.courses:
				if str(course.id) != "paddles": continue
				var target: String = skating_setup if skating_setup in course.setups else "experimental"
				menu.add_child(HSeparator.new())
				menu.add_child(button("%s   /   on %s" % [str(course.title),target.capitalize()],func():
					paddle_layout = PADDLE_LAYER
					save_preferences()
					start_lesson(str(course.id),target)))
				menu.add_child(paragraph(str(course.blurb)+" Starting it sets Elite paddles to the game's layer.",12))
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
	elif page == "music":
		show_music_page()
	elif page == "atelier":
		show_atelier_page()
	elif page == "design":
		show_design_page()
	elif page == "settings":
		clear_menu("Your skating setup", "Changes apply to your next skate. Keyboard and analog controller are supported. Face buttons request moves; the physics decides what is possible.")
		for entry in catalog.get("setups",[]):
			var setup_id: String = entry.id
			menu.add_child(button(("• " if skating_setup == setup_id else "")+str(entry.name),func():
				skating_setup=setup_id;scheme=3;beginner=setup_id=="repertoire";cruise=false;show_page("settings")))
			if skating_setup == setup_id:
				menu.add_child(paragraph(str(entry.description),14))
		if skating_setup == "explorer":
			var assist_label := label("Balance & lean assistance: %d%%" % roundi(assistance*100),14)
			menu.add_child(assist_label)
			var assist_slider := HSlider.new()
			assist_slider.min_value=.5;assist_slider.max_value=1;assist_slider.step=.05;assist_slider.value=assistance
			assist_slider.value_changed.connect(func(value: float):assistance=value;assist_label.text="Balance & lean assistance: %d%%" % roundi(value*100))
			menu.add_child(assist_slider)
		if skating_setup.is_empty() or skating_setup == "repertoire":
			menu.add_child(button("Landing coach: "+("On" if beginner else "Off"),func():beginner=not beginner;show_page("settings")))
		var steady_default := str(catalog.get("steady",{}).get("defaults",{}).get(skating_setup,"light"))
		var steady_names := {"":"Setup default (%s)" % steady_default.capitalize(),"off":"Off","light":"Light","firm":"Firm"}
		menu.add_child(button("Steadying hand: "+str(steady_names[steady_choice]),func():
			var order := ["","off","light","firm"]
			steady_choice=order[(order.find(steady_choice)+1)%order.size()];save_preferences();show_page("settings")))
		menu.add_child(paragraph("A hand on your stick, never the physics: it keeps the lean you ask for to what your speed can carry. Off by default where a setup promises minimal assistance.",12))
		menu.add_child(button("Legacy override: "+["Lean & load","Assisted steering","Two-foot control","Full repertoire"][scheme],func():skating_setup="";scheme=(scheme+1)%4;show_page("settings")))
		menu.add_child(button("Controller tuning & bindings",func():show_page("controller")))
		if skating_setup not in ["simulation","experimental"]:
			menu.add_child(button("Cruise: "+("On" if cruise else "Off"),func():cruise=not cruise;show_page("settings")))
		menu.add_child(button("Music: "+("On" if music_enabled else "Off"),func():music_enabled=not music_enabled;show_page("settings")))
		menu.add_child(button("Controller vibration: "+("On" if rumble_enabled else "Off"),func():rumble_enabled=not rumble_enabled;show_page("settings")))
		menu.add_child(button("Elite paddles: "+["Controller's own profile","Footwork · LB / RB / A / R3","Moves · X / B / A / Y","Game layer · feet, free leg or weight"][paddle_layout],func():paddle_layout=(paddle_layout+1)%4;show_page("settings")))
		menu.add_child(paragraph("Presets and the game layer need the Elite on its default profile, profile LEDs off: a stored profile sends the paddles as ordinary buttons, which Controller's own profile uses as they are. View changes camera; Menu pauses.",12))
		menu.add_child(button("Display: "+("Fullscreen" if DisplayServer.window_get_mode()==DisplayServer.WINDOW_MODE_FULLSCREEN else "Windowed")+" · F11",toggle_fullscreen))
		menu.add_child(label("Skater",16))
		var character_picker := OptionButton.new()
		for entry in CHARACTERS:
			character_picker.add_item(str(entry.name))
		character_picker.selected = character
		character_picker.item_selected.connect(func(index: int):character=index;show_page("settings"))
		menu.add_child(character_picker)
		if not catalog.is_empty() and character != 1:
			menu.add_child(label("Costume",16))
			var costume_picker := OptionButton.new()
			var worn := costume_skins()
			for i in worn.size():
				if worn[i] != null:
					costume_picker.add_item("%s — %s" % [worn[i].name, worn[i].description],i)
			costume_picker.select(costume_picker.get_item_index(costume) if costume_picker.get_item_index(costume) >= 0 else 0)
			costume_picker.item_selected.connect(func(index: int):costume=costume_picker.get_item_id(index);skater.apply_skin(current_skin());save_preferences())
			menu.add_child(costume_picker)
			menu.add_child(button("Atelier  /  make your own costume →",func():show_page("atelier")))
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
		if skating_setup == "experimental":
			menu.add_child(paragraph("Experimental: one trigger per leg. Pump to push, load and release the skating leg to jump. Sticks shape each blade. X/B shift weight; L3/R3 toe pick. A requests turns; Y requests rotation; bumpers change the move family. D-pad adjusts the feet.",14))
		elif skating_setup in ["simulation","explorer"]:
			menu.add_child(paragraph("Manual turns: tap B for three-turn; transfer foot for mohawk; hold B for loop; reverse lean for rocker. Transfer and reverse for choctaw. D-pad down requests bracket; hold and reverse lean for counter. X twizzles; Y spins; R3 plants the toe. RT loads/releases; LT brakes. LB/RB retain foot selection. Modifier + X/Y/A: Ina Bauer/spiral/cantilever. Simulation uses one stick per blade; hold the modifier for right-stick arms. Explorer uses left-stick lean and pressure, right-stick arms.",14))
		else:
			menu.add_child(paragraph("Full repertoire: dedicated turns and glides. Open Controller tuning & bindings for your current layout. RT loads/releases jumps; LT only brakes. Bumpers retain the chosen foot.\n\n" if scheme == 3 else "Controller: left stick steers; RT loads the knee; A pushes; Y spins; B turns; X twizzles; LT taps the toe, holds the brake; bumpers choose the foot; right stick opens the arms. D-pad up requests the Beginner jump; down holds the low pose.\n\nKeyboard: Q/E choose the foot; W/S move the rocker; F plants the toe; comma winds up a jump; I holds Ina Bauer; N requests a bracket. R restarts. Esc pauses.",14))
		menu.add_child(button("Save this skate's replay",func():link.send("export")))
		menu.add_child(button("Watch saved replay",func():link.send("replay")))
		menu.add_child(button("Export session measurements",func():link.send("metrics")))
		menu.add_child(button("Save settings & back",func():save_preferences();show_page("home")))
	elif page == "controller":
		clear_menu("Controller tuning", "Sensitivity applies to all three setups. Move shortcuts apply to Full Repertoire; Simulation and Explorer use manual turn gestures.")
		if controller_profile.is_empty():
			menu.add_child(paragraph("Waiting for the skating engine."))
		else:
			for setting in catalog.controller.tuning:
				var title := label(str(setting.label)+": %.2f" % float(controller_profile[setting.key]),14)
				menu.add_child(title)
				var slider := HSlider.new()
				slider.min_value = float(setting.min)
				slider.max_value = float(setting.max)
				slider.step = float(setting.step)
				slider.value = float(controller_profile[setting.key])
				slider.value_changed.connect(func(value: float):
					controller_profile[setting.key]=value
					title.text=str(setting.label)+": %.2f" % value)
				menu.add_child(slider)
			var mapping := ""
			for action in catalog.controller.actions:
				var binding: Dictionary = controller_profile.bindings[action.id]
				mapping += str(action.name)+": "+(str(catalog.controller.buttons[int(controller_profile.modifier)])+" + " if binding.modified else "")+str(catalog.controller.buttons[int(binding.button)])+"\n"
			menu.add_child(paragraph(mapping,13))
			menu.add_child(paragraph("Left stick leans; RT loads/releases a jump; LT brakes. LB/RB retain a foot; both share weight. Right stick opens the arms and selects camel in a spin. RT selects sit. Turns need speed and an edge.\n\nBrowser workshop: run node tools/ice-lab/app/serve.mjs, then open localhost:8123/game/controller.html.",13))
			var feet_now := str(controller_profile.get("feet","dpad"))
			var feet_names := {"dpad":"D-pad","stickY":"Sticks up and down","modifier":"Modifier + left stick"}
			menu.add_child(button("Feet layout: "+str(feet_names[feet_now]),func():
				controller_profile["feet"]={"dpad":"stickY","stickY":"modifier","modifier":"dpad"}[feet_now]
				save_preferences()
				show_page("controller")))
			menu.add_child(paragraph("Where the feet live in Simulation, Experimental and Dig Gate. Sticks up and down leaves the paddles nothing to turn. The lessons' words follow this.",12))
			menu.add_child(button("Import controller profile",func():controller_file(false)))
			menu.add_child(button("Export controller profile",func():controller_file(true)))
			menu.add_child(button("Restore controller defaults",func():controller_profile=catalog.controller.profile.duplicate(true);show_page("controller")))
			menu.add_child(button("Use Full repertoire & save",func():skating_setup="repertoire";scheme=3;beginner=true;cruise=false;link.send("controller",{"profile":controller_profile})))
		menu.add_child(button("← Settings",func():show_page("settings")))
	elif page == "result":
		clear_menu(str(frame.result.title),str(frame.result.detail))
		if frame.result.get("protocol") != null:
			show_protocol(frame.result.protocol)
		if frame.result.has("xp"):
			menu.add_child(label("+%d training XP" % int(frame.result.xp),22,Color("d5bd96")))
		if not str(frame.result.get("body","")).is_empty():
			menu.add_child(paragraph(str(frame.result.body),15))
		if frame.result.get("standings") != null:
			menu.add_child(label("The field",21))
			show_table(frame.result.standings,"score")
		if frame.result.get("stopped") != null:
			menu.add_child(label("Time ran out on: "+str(frame.result.stopped.element),17))
			menu.add_child(paragraph(str(frame.result.stopped.how),14))
		menu.add_child(paragraph("Your lines remain on the ice. Take another run, or carry what you learned into the next program."))
		if frame.result.get("lesson",false):
			menu.add_child(button("More lessons →",func():show_page("learn"),true))
		menu.add_child(button("Continue your career →",func():show_page("career"),not frame.result.get("lesson",false)))
		menu.add_child(button("Skate again",func():start_game(active_mode,event_index)))
		menu.add_child(button("Save performance replay",func():link.send("export")))
		menu.add_child(button("Return to the rink menu",func():show_page("home")))

## A place, a name and a number, one row each; your own row in gold.
func show_table(rows: Array, column: String) -> void:
	for row in rows:
		var line := HBoxContainer.new()
		var colour := Color("d5bd96") if bool(row.you) else Color("9eafb9")
		line.add_child(label("%d" % int(row.place),15,colour))
		var who := label(str(row.name),15,colour)
		who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(who)
		line.add_child(label("%d" % int(row.points) if column == "points" else "%.2f" % float(row.score),15,colour))
		menu.add_child(line)

func show_protocol(protocol: Dictionary) -> void:
	menu.add_child(label("Jump protocol",21))
	var elements := VBoxContainer.new()
	elements.name = "ProtocolElements"
	elements.add_theme_constant_override("separation",10)
	menu.add_child(elements)
	if protocol.lines.is_empty():
		elements.add_child(paragraph("No scored jump elements.",14))
	else:
		for i in protocol.lines.size():
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation",16)
			row.add_child(label("%02d" % (i+1),15,Color("9eafb9")))
			var element := paragraph(str(protocol.lines[i]),16)
			element.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(element)
			elements.add_child(row)
		menu.add_child(paragraph("+ links jumps in one element. * marks a repeat that scores zero.",12))
	menu.add_child(HSeparator.new())
	protocol_total("TES", "%.2f" % float(protocol.tes))
	protocol_total("PCS", "Not available" if protocol.pcs == null else "%.2f" % float(protocol.pcs))
	protocol_total("Fall deduction", "−%.2f" % float(protocol.deductions))
	protocol_total("Segment total", "%.2f" % float(protocol.total),true)
	menu.add_child(HSeparator.new())

func protocol_total(title: String, value: String, emphasis: bool = false) -> void:
	var row := HBoxContainer.new()
	var color := Color("d5bd96") if emphasis else Color("e6edef")
	var caption := label(title,18 if emphasis else 15,color)
	caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(caption)
	row.add_child(label(value,18 if emphasis else 15,color))
	menu.add_child(row)

# ---- The Composer on the music (game/composer.ts, through the bridge) ----

func clock(seconds: float) -> String:
	return "%d:%02d" % [int(seconds)/60,int(seconds)%60]

func timeline_edit(options: Dictionary, event: int = -1) -> void:
	var draft = frame.get("draft")
	options["event"] = event if event >= 0 else (int(draft.event) if draft != null else event_index)
	link.send("timeline",{"options":options})

func cue_line(r: Dictionary) -> String:
	var cues: Array = r.cues
	var i := int(r.index)
	var words := {"on":"on the music","early":"early","late":"late"}
	var line := ""
	if i < cues.size():
		var wait := float(cues[i].at) - float(r.elapsed)
		line = "\n♪  " + ("Your bar in %d s" % ceili(wait) if wait > .5 else "Your bar is now" if float(r.elapsed) <= float(cues[i].late) else "Past your bar")
	if i > 0 and cues[i-1].result != null:
		line += "   ·   last: " + str(words.get(str(cues[i-1].result),""))
	return line

func preview_music(track_index: int, at: float) -> void:
	preview.stream = load("res://assets/generated/audio/"+str(catalog.tracks[track_index].file))
	if DisplayServer.get_name() != "headless":
		preview.play(maxf(0.0,at-.5))

func keyed(b: Button, key: String) -> Button:
	if key == focus_key: preferred_focus = b
	b.focus_entered.connect(func():focus_key=key)
	return b

func timeline_strip(d: Dictionary) -> Control:
	var strip := Control.new()
	strip.custom_minimum_size = Vector2(0,70)
	strip.draw.connect(func():
		var w := strip.size.x
		var bars := int(d.bars)
		var font := ThemeDB.fallback_font
		strip.draw_rect(Rect2(0,10,w,40),Color(.04,.08,.12,.9))
		var span := float(d.seconds)
		var x_of := func(t: float) -> float: return clampf(t/span,0,1)*w
		strip.draw_line(Vector2(x_of.call(span/2),6),Vector2(x_of.call(span/2),54),Color("d5c29a",.5),1)
		for b in bars+1:
			var t: float = float(d.offset) + b*float(d.barSeconds)
			var phrase: bool = b % int(d.barsPerPhrase) == 0
			strip.draw_line(Vector2(x_of.call(t),10 if phrase else 34),Vector2(x_of.call(t),50),Color(1,1,1,.35 if phrase else .12),2 if phrase else 1)
		var colour := Color("9fd8c5") if bool(d.check.ok) else Color("f08a7a")
		for cue in d.cues:
			var x: float = x_of.call(float(cue.at))
			strip.draw_rect(Rect2(x,14,maxf(4,x_of.call(float(d.barSeconds))-2),32),colour if cue.required else Color("d5c29a"))
			strip.draw_string(font,Vector2(x+3,66),str(cue.title).left(10),HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("e6edef")))
	return strip

func show_music_page() -> void:
	var d = frame.get("draft")
	if d == null:
		show_page("event")
		return
	var event: Dictionary = catalog.events[int(d.event)]
	clear_menu("%s  ·  on the music" % str(event.title),"Anchor each element to a bar of your music. The program then runs the full %d s, and the cue tells you when each bar comes round. Hitting your bar is shown, not scored. Gold bars are your own elements; the line marks half time." % int(event.seconds))
	var track_picker := OptionButton.new()
	for song in catalog.tracks:
		track_picker.add_item("%s   ·   %.0f bpm" % [str(song.title),float(song.bpm)])
	track_picker.selected = int(d.track)
	track_picker.item_selected.connect(func(i: int):timeline_edit({"action":"track","track":i}))
	menu.add_child(track_picker)
	menu.add_child(timeline_strip(d))
	for i in d.cues.size():
		var cue: Dictionary = d.cues[i]
		var row := HBoxContainer.new()
		var name_label := label("Bar %02d   %s   %s%s" % [int(cue.bar)+1,clock(float(cue.at)),str(cue.title),"" if cue.required else "   (yours)"],15)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(name_label)
		row.add_child(keyed(button("◀",func():timeline_edit({"action":"nudge","index":i,"by":-1})),"early-%d" % i))
		row.add_child(keyed(button("▶",func():timeline_edit({"action":"nudge","index":i,"by":1})),"late-%d" % i))
		row.add_child(button("♪",func():preview_music(int(d.track),float(cue.at))))
		if not bool(cue.required):
			row.add_child(button("×",func():timeline_edit({"action":"remove","index":i})))
		menu.add_child(row)
	if d.cues.size() < event.routine.size()+int(catalog.planExtra):
		var chooser := OptionButton.new()
		for id in catalog.elements:
			chooser.add_item(catalog.elements[id].title)
		menu.add_child(chooser)
		menu.add_child(button("+ Add after the last element",func():timeline_edit({"action":"add","id":catalog.elements.keys()[chooser.selected]})))
	for problem in d.check.problems:
		menu.add_child(label("✕  "+str(problem),14,Color("f08a7a")))
	for note in d.check.notes:
		menu.add_child(paragraph("·  "+str(note),13))
	menu.add_child(button("Spread them evenly over the music",func():timeline_edit({"action":"spread"})))
	var save := button("Saved ✓" if bool(d.saved) else "Save this program on its music",func():timeline_edit({"action":"save"}),true)
	save.disabled = bool(d.saved) or not bool(d.check.ok)
	menu.add_child(save)
	if frame.career.timelines[int(d.event)] != null:
		menu.add_child(button("Take it off the music  /  the order stays",func():timeline_edit({"action":"clear"})))
	menu.add_child(button("← Back to the event",func():timeline_edit({"action":"close"})))

# ---- The atelier (game/atelier.ts, through the bridge) ----

func costume_skins() -> Array:
	var worn: Array = catalog.get("skins",[]).duplicate()
	if not frame.is_empty() and frame.has("wardrobe"):
		worn.append_array(frame.wardrobe.skins)
	return worn

func current_skin() -> Dictionary:
	var worn := costume_skins()
	if costume >= 0 and costume < worn.size() and worn[costume] != null:
		return worn[costume]
	costume = clampi(3,0,catalog.skins.size()-1)
	return catalog.skins[costume]

func show_atelier_page() -> void:
	var atelier: Dictionary = catalog.atelier
	clear_menu("Atelier","Make up to %d costumes of your own. Every choice is a swatch from the list; the four presets are always there." % int(atelier.maxDesigns))
	for slot in int(atelier.maxDesigns):
		var skin = frame.wardrobe.skins[slot]
		if skin == null:
			menu.add_child(label("Slot %d  ·  empty" % (slot+1),18))
			var start := OptionButton.new()
			for preset in catalog.skins:
				start.add_item("Start from %s" % str(preset.name))
			menu.add_child(start)
			menu.add_child(button("Make it →",func():
				design_slot = slot
				design = atelier.starts[start.selected].duplicate(true)
				focus_key = ""
				show_page("design")
				link.send("dress",{"design":design})))
		else:
			var wearing: bool = costume == catalog.skins.size()+slot
			menu.add_child(label("Slot %d  ·  %s%s" % [slot+1,str(skin.name),"   (wearing)" if wearing else ""],18))
			menu.add_child(paragraph(str(skin.description),13))
			var row := HBoxContainer.new()
			row.add_child(button("Wear it",func():
				costume = catalog.skins.size()+slot
				skater.apply_skin(current_skin())
				save_preferences()
				show_page("atelier")))
			row.add_child(button("Change it →",func():
				design_slot = slot
				design = frame.wardrobe.designs[slot].duplicate(true)
				focus_key = ""
				show_page("design")
				link.send("dress",{"design":design})))
			menu.add_child(row)
		menu.add_child(HSeparator.new())
	menu.add_child(button("← Back to settings",func():show_page("settings")))

func cycle_design(key: String, list: Array, by: int, field: String = "id") -> void:
	var at := 0
	for i in list.size():
		if list[i][field] == design[key]: at = i
	design[key] = list[(at+by+list.size())%list.size()][field]
	show_page("design")
	link.send("dress",{"design":design})

func show_design_page() -> void:
	var atelier: Dictionary = catalog.atelier
	clear_menu("Atelier  ·  slot %d" % (design_slot+1),"The skater behind this menu wears each change as you make it. B leaves without keeping it.")
	var name_edit := LineEdit.new()
	name_edit.text = str(design.name)
	name_edit.max_length = int(atelier.nameLimit)
	name_edit.custom_minimum_size.y = 44
	name_edit.text_changed.connect(func(text: String):design.name = text)
	menu.add_child(name_edit)
	for part in atelier.parts:
		var at := 0
		for i in part.swatches.size():
			if part.swatches[i].id == design[part.id]: at = i
		var row := HBoxContainer.new()
		var title := label(str(part.title),15)
		title.custom_minimum_size.x = 170
		row.add_child(title)
		row.add_child(keyed(button("◀",func():cycle_design(part.id,part.swatches,-1)),"%s-" % part.id))
		var chip := ColorRect.new()
		chip.color = Color.html(str(part.swatches[at].hex))
		chip.custom_minimum_size = Vector2(36,36)
		chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(chip)
		var swatch_name := label("  %s" % str(part.swatches[at].name),15)
		swatch_name.custom_minimum_size.x = 150
		row.add_child(swatch_name)
		row.add_child(keyed(button("▶",func():cycle_design(part.id,part.swatches,1)),"%s+" % part.id))
		menu.add_child(row)
	var fabric: Dictionary = atelier.fabrics.filter(func(f):return f.id == design.fabric)[0]
	menu.add_child(keyed(button("Fabric: %s  /  %s" % [str(fabric.name),str(fabric.description)],func():cycle_design("fabric",atelier.fabrics,1)),"fabric"))
	var crystals: Dictionary = atelier.crystals.filter(func(c):return c.id == design.crystals)[0]
	menu.add_child(keyed(button("Crystals: %s" % str(crystals.name),func():cycle_design("crystals",atelier.crystals,1)),"crystals"))
	menu.add_child(keyed(button("Hair: %s  /  the browser's skater; this one keeps her own" % ("bun" if bool(design.bun) else "ponytail"),func():
		design.bun = not bool(design.bun)
		show_page("design")),"bun"))
	menu.add_child(button("Keep it in slot %d and wear it" % (design_slot+1),func():link.send("design",{"slot":design_slot,"design":design}),true))
	menu.add_child(button("← Leave without keeping it",func():
		skater.apply_skin(current_skin())
		show_page("atelier")))

func routine_names(ids: Array) -> String:
	var names := PackedStringArray()
	for id in ids:
		names.append(catalog.elements[id].title)
	return " → ".join(names)

## A lesson needs its setup in force before it starts: the course and its words are that pad's.
func start_lesson(course: String, setup: String) -> void:
	if skating_setup != setup:
		skating_setup = setup
		scheme = 3
		beginner = setup == "repertoire"
		cruise = false
		save_preferences()
	lesson_course = course
	start_game("lesson")

func start_game(mode: String, index: int = 0, challenge: bool = false) -> void:
	focus_key = ""
	if not link.operational:
		on_error("The skating engine is still starting.")
		return
	active_mode = mode
	event_index = index
	playing = false
	skater.load_model(CHARACTERS[character].path)
	partner.visible = false
	link.send("configure",{"options":{"setup":skating_setup if not skating_setup.is_empty() else null,"assistance":assistance,"scheme":scheme,"beginner":beginner,"cruise":cruise,"track":track,"profile":profile,"controllerProfile":controller_profile,"steady":steady_choice if not steady_choice.is_empty() else null}})
	link.send("start",{"options":{"mode":mode,"event":index,"sequence":sequence if mode=="composer" else null,"pairsChallenge":challenge,"course":lesson_course if mode=="lesson" else null}})

func on_engine(op: String, data: Dictionary) -> void:
	if op == "hello":
		catalog = data.catalog
		frame = data.frame
		var worn: int = skater.apply_skin(current_skin())
		if boot_test and worn < SKIN_SURFACES:
			push_error("Costume reached %d of %d surfaces" % [worn, SKIN_SURFACES])
			get_tree().quit(1)
		controller_profile = catalog.controller.profile.duplicate(true)
		if not saved_controller_profile.is_empty():
			link.send("controller",{"profile":saved_controller_profile})
		frame = data.frame
		skater.apply_frame(frame,true)
		show_page(current_page)
		if boot_test:
			for page in ["career","composer","settings","atelier","controller","home"]:
				show_page(page)
		if boot_test:
			start_game("career")
		elif screenshot_test:
			start_game("free")
		return
	if op == "controller":
		controller_profile = data.profile
		save_preferences()
		notice.text = "Controller profile saved. Full repertoire uses these settings."
		if overlay.visible and current_page == "controller":
			show_page("controller")
		return
	if op == "dress":
		skater.apply_skin(data.skin)
		return
	if op == "export" or op == "metrics":
		notice.text = "Saved: "+str(data.path)
		return
	frame = data
	if op == "train" or op == "armFocus" or op == "drill" or op == "rest":
		show_page("career")
		return
	if op == "plan":
		show_page("event")
		return
	if op == "timeline":
		show_page("music" if frame.get("draft") != null else "event")
		return
	if op == "design":
		costume = catalog.skins.size()+design_slot
		skater.apply_skin(current_skin())
		save_preferences()
		notice.text = "Saved to slot %d, and wearing it." % (design_slot+1)
		show_page("atelier")
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
		apply_partner(true)
		last_result_tick = -1
		last_landing_tick = -1
		music.stream = load("res://assets/generated/audio/"+str(catalog.tracks[int(frame.track)].file))
		if DisplayServer.get_name() != "headless":
			music.play()
		music.stream_paused = not music_enabled
		playing = true
		overlay.hide()
		broadcast.show()
		broadcast.announce("TAKE THE ICE", "Northlight Arena  /  "+active_mode.capitalize())
		notice.text = ""
	else:
		skater.apply_frame(frame)
		apply_partner(false)
	arena.trace_lifted = skater.lifted_blade()
	arena.add_traces(frame.trace)
	arena.update_course(frame)
	ribbon.update_state(frame)
	broadcast.update_state(frame,skating_setup if not skating_setup.is_empty() else "custom",["TRACKING","BROADCAST","RINK","BLADE"][camera_mode])
	var landed: Dictionary = frame.state.landed
	if int(landed.tick)>last_landing_tick and int(landed.tick)>=0:
		last_landing_tick = int(landed.tick)
		var clean := not bool(landed.fall) and not bool(landed.stepOut)
		landing_envelope = .32
		crowd_swell = 1.0 if clean else .35
		arena.react(1.0 if clean else .12)
		broadcast.announce("CLEAN LANDING" if clean else "FIND YOUR EDGE", "%.2f rotations   /   Jump TES %.2f" % [float(landed.turned),float(frame.get("technical",0))])
		var pads := Input.get_connected_joypads()
		if rumble_enabled and not pads.is_empty():
			Input.start_joy_vibration(pads[0],.18 if clean else .48,.30 if clean else .7,.16 if clean else .28)
	update_hud()
	if frame.finished and last_result_tick != int(frame.state.tick):
		last_result_tick = int(frame.state.tick)
		show_page("result")

func apply_partner(snap: bool) -> void:
	var pairs = frame.get("pairs")
	partner.visible = pairs != null
	if pairs == null:
		return
	partner.lift_height = float(pairs.lift.height)
	partner.apply_frame(pairs,snap)

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
	broadcast.show()
	music.stream_paused = not music_enabled

func cycle_camera() -> void:
	if not frame.is_empty() and int(frame.state.jump.phase)==2:
		return
	camera_mode = (camera_mode+1)%4

func update_hud() -> void:
	var s: Dictionary = frame.state
	var lesson = frame.get("tutorial")
	if lesson is Dictionary and lesson.get("targets") is Array:
		var next := -1
		var list: Array = lesson.targets
		if lesson.get("target") is Dictionary:
			for i in list.size():
				if float(list[i].x) == float(lesson.target.x) and float(list[i].y) == float(lesson.target.y):
					next = i
		arena.set_lesson_targets(list,next)
	else:
		arena.set_lesson_targets([],-1)
	hud_move.text = "%s   ·   %.1f m/s" % [str(frame.move),Vector2(s.vel.x,s.vel.y).length()]
	# sim/moves.ts spinTick's foot change, never surfaced here before: a brief
	# flash beside the move name, the same decaying-flash idiom game/main.ts's
	# own #hint already uses for its equivalent toast.
	if bool(frame.get("footChange",false)):
		hud_move.text += "   ·   FOOT CHANGE!"
	if str(frame.get("combo","")) != "":
		hud_move.text += "   ·   COMBINATION %s" % str(frame.combo)
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
		# sim/pcs.ts's own score, never shown here before — silently absent
		# (not a misleading "0.00") whenever finalizePcs left it null.
		if r.get("pcsScore") != null:
			var pcs: Dictionary = r.pcsScore
			hud_technical.text += "   ·   PCS %.2f" % float(pcs.total)
		if int(r.index)<r.sequence.size():
			var element: Dictionary = catalog.elements[r.sequence[int(r.index)]]
			coach_title.text = element.title
			coach_tip.text = str(r.get("how",element.hint))
			coach_progress.text = "%02d / %02d    ·    %s" % [int(r.index)+1,r.sequence.size(),r.title]
			if float(element.duration)>0:
				coach_progress.text += "\nHold %.1f / %.1f s" % [float(r.held),float(element.duration)]
		else:
			coach_title.text = "Program skated"
			coach_tip.text = "Skate it out to the end of the music."
		if r.get("cues") != null:
			coach_progress.text += cue_line(r)
	elif frame.get("tutorial") != null:
		var l: Dictionary = frame.tutorial
		coach_title.text = str(l.title)
		coach_tip.text = str(l.how) if str(l.message).is_empty() else "✓ "+str(l.message)+"\n\n"+str(l.how)
		if not str(l.unproven).is_empty():
			coach_tip.text += "\n\n"+str(l.unproven)
		if not str(l.get("offer","")).is_empty():
			coach_tip.text += "\n\n"+str(l.offer)
		var stage := str(l.get("stage",""))
		coach_progress.text = "Step %d of %d%s    ·    %s\nPause to skip" % [mini(int(l.index)+1,int(l.total)),int(l.total),("  ·  "+stage) if not stage.is_empty() else "",str(l.status)]
		hud_time.text = "%02d:%02d" % [int(frame.elapsed)/60,int(frame.elapsed)%60]
	elif frame.mode == "armdrill" and frame.get("drill") != null:
		coach_title.text = str(frame.drill.title)
		coach_tip.text = str(frame.drill.hint)
		coach_progress.text = "%d s left    ·    %d / 100" % [ceili(float(frame.drill.seconds)),int(frame.drill.score)]
	elif frame.mode == "rookie":
		coach_title.text = frame.rookie.title
		coach_tip.text = frame.rookie.hint
		coach_progress.text = "%d / 8 gates · %d clean" % [int(frame.rookie.index),int(frame.rookie.cleared)]
	elif frame.mode == "pairs" and frame.get("pairs") != null:
		var pr: Dictionary = frame.pairs
		coach_title.text = str(pr.title)
		coach_tip.text = str(pr.hint)
		coach_progress.text = "%s   ·   phrase %d / %d\n%s" % [str(pr.status),mini(int(pr.phrase)+1,int(pr.phrases)),int(pr.phrases),str(pr.message)]
		hud_time.text = "%.0f s" % float(pr.seconds) if bool(pr.challenge) else "%02d:%02d" % [int(frame.elapsed)/60,int(frame.elapsed)%60]
		hud_technical.text = "Pairs %d   ·   unison %.0f%%" % [int(pr.score),float(pr.sync)*100.0]
	elif frame.mode == "timed":
		coach_title.text = "Follow the lights"
		coach_tip.text = "Carve toward the next marker. Push through the curve and keep your line."
		coach_progress.text = "%d lights · %d points" % [int(frame.run.collected),int(frame.run.score)]
		hud_time.text = "%.1f s" % float(frame.run.seconds)
	elif frame.mode == "free":
		coach_title.text = str(frame.lesson.title)
		coach_tip.text = str(frame.lesson.hint)
		var learned := 0
		for done in frame.lesson.done:
			if done: learned += 1
		coach_progress.text = "%02d / 07  practice elements" % learned
		hud_time.text = "%02d:%02d" % [int(frame.elapsed)/60,int(frame.elapsed)%60]
	if bool(s.fallen):
		coach_title.text = "Find your feet."
		coach_tip.text = "A fall is part of skating. "+str(frame.get("recover","Tap Space / A to get up."))

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	match event.physical_keycode:
		KEY_F11: toggle_fullscreen()
		KEY_ESCAPE, KEY_P: pause_game()
		KEY_V: cycle_camera()
		KEY_R:
			if not overlay.visible:
				start_game(active_mode,event_index)
		KEY_SPACE: push_pending = true
		KEY_F: toe_pending = true
		KEY_G: pair_hold_pending = true
		KEY_T: pair_lift_pending = true
		KEY_J:
			if scheme != 3: trick_pending = true

func pressed(key: Key) -> bool:
	return Input.is_physical_key_pressed(key)

func toggle_fullscreen() -> void:
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode()==DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)

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
	if scheme == 3:
		return {"hardware":full_hardware(joy)}
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
		left = Vector2(aim.x,-aim.z)
	var lb := pressed(KEY_Q) or pad(joy,JOY_BUTTON_LEFT_SHOULDER)
	var rb := pressed(KEY_E) or pad(joy,JOY_BUTTON_RIGHT_SHOULDER)
	var k1 := float(pressed(KEY_D))-float(pressed(KEY_A))
	var k2 := float(pressed(KEY_RIGHT))-float(pressed(KEY_LEFT))
	return {"lx":left.x,"ly":left.y,"rx":right.x,"ry":right.y,"lean":raw_left.x,"pitch":raw_left.y,"kx":clampf(k1+k2,-1,1),"ky":float(pressed(KEY_W) or pressed(KEY_UP))-float(pressed(KEY_S) or pressed(KEY_DOWN)),"kPrimaryX":k1,"kAltX":k2,"knee":maxf(.95 if pressed(KEY_SHIFT) else .35,rt),"weight":0.0 if lb and not rb else 1.0 if rb and not lb else .5,"carriage":1.0 if pressed(KEY_C) else right.length(),"windup":1.0 if pressed(KEY_COMMA) else 0.0,"push":push_pending,"pushHeld":pressed(KEY_SPACE) or pad(joy,JOY_BUTTON_A),"brake":pressed(KEY_X) or lt_time>.15,"toe":toe_pending,"turn":pressed(KEY_B) or pad(joy,JOY_BUTTON_B),"bracket":pressed(KEY_N) or pad(joy,JOY_BUTTON_RIGHT_STICK),"twizzle":pressed(KEY_Z) or pad(joy,JOY_BUTTON_X),"spin":pressed(KEY_Y) or pad(joy,JOY_BUTTON_Y),"inaBauer":pressed(KEY_I) or (lb and rb),"cycleJump":trick_pending}

func full_hardware(joy: int) -> Dictionary:
	var axes := [0.0,0.0,0.0,0.0]
	var buttons: Array = []
	buttons.resize(16)
	buttons.fill(0.0)
	if joy >= 0:
		axes = [Input.get_joy_axis(joy,JOY_AXIS_LEFT_X),Input.get_joy_axis(joy,JOY_AXIS_LEFT_Y),Input.get_joy_axis(joy,JOY_AXIS_RIGHT_X),Input.get_joy_axis(joy,JOY_AXIS_RIGHT_Y)]
		var codes := [JOY_BUTTON_A,JOY_BUTTON_B,JOY_BUTTON_X,JOY_BUTTON_Y,JOY_BUTTON_LEFT_SHOULDER,JOY_BUTTON_RIGHT_SHOULDER,-1,-1,JOY_BUTTON_BACK,JOY_BUTTON_START,JOY_BUTTON_LEFT_STICK,JOY_BUTTON_RIGHT_STICK,JOY_BUTTON_DPAD_UP,JOY_BUTTON_DPAD_DOWN,JOY_BUTTON_DPAD_LEFT,JOY_BUTTON_DPAD_RIGHT]
		for i in codes.size():
			if codes[i]>=0:
				buttons[i]=1.0 if pad(joy,codes[i]) else 0.0
		buttons[6]=maxf(0,Input.get_joy_axis(joy,JOY_AXIS_TRIGGER_LEFT))
		buttons[7]=maxf(0,Input.get_joy_axis(joy,JOY_AXIS_TRIGGER_RIGHT))
		if paddle_layout>0:
			var paddles := [JOY_BUTTON_PADDLE1,JOY_BUTTON_PADDLE2,JOY_BUTTON_PADDLE3,JOY_BUTTON_PADDLE4]
			if paddle_layout==PADDLE_LAYER:
				buttons.resize(22)
				for i in range(16,22):
					buttons[i]=0.0
			var destinations: Array = [4,5,0,11] if paddle_layout==1 else [2,1,0,3]
			for i in 4:
				if Input.is_joy_button_pressed(joy,paddles[i]):
					buttons[PadMap.LAYER_BUTTON[paddles[i]] if paddle_layout==PADDLE_LAYER else destinations[i]]=1.0
	var keys: Array = []
	var mapping := {KEY_A:"a",KEY_D:"d",KEY_W:"w",KEY_S:"s",KEY_Q:"q",KEY_E:"e",KEY_SHIFT:"shift",KEY_SPACE:" ",KEY_X:"x",KEY_C:"c",KEY_COMMA:",",KEY_B:"b",KEY_N:"n",KEY_Z:"z",KEY_Y:"y",KEY_F:"f",KEY_J:"j",KEY_K:"k",KEY_L:"l",KEY_H:"h",KEY_I:"i",KEY_O:"o",KEY_U:"u",KEY_LEFT:"arrowleft",KEY_RIGHT:"arrowright",KEY_UP:"arrowup",KEY_DOWN:"arrowdown"}
	for code in mapping:
		if pressed(code):
			keys.append(mapping[code])
	return {"axes":axes,"buttons":buttons,"keys":keys,"connected":joy>=0}

func controller_file(exporting: bool) -> void:
	var picker := FileDialog.new()
	picker.access = FileDialog.ACCESS_FILESYSTEM
	picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE if exporting else FileDialog.FILE_MODE_OPEN_FILE
	picker.filters = PackedStringArray(["*.json ; Controller profile"])
	picker.current_file = "edgework-controller.json" if exporting else ""
	picker.file_selected.connect(func(path: String):
		if exporting:
			var file := FileAccess.open(path,FileAccess.WRITE)
			if file: file.store_string(JSON.stringify(controller_profile,"  "))
			else: on_error("Could not export the controller profile.")
		else:
			var file := FileAccess.open(path,FileAccess.READ)
			if file == null or file.get_length()>65536:
				on_error("Could not read profile (64 KiB maximum).")
			else:
				var candidate = JSON.parse_string(file.get_as_text())
				if candidate is Dictionary: link.send("controller",{"profile":candidate})
				else: on_error("Expected a controller profile JSON object.")
		picker.queue_free())
	picker.canceled.connect(picker.queue_free)
	add_child(picker)
	picker.popup_centered_ratio(.7)

func pad(joy: int, code: JoyButton) -> bool:
	return joy>=0 and Input.is_joy_button_pressed(joy,code)

func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton and event.pressed:
		if overlay.visible:
			if event.button_index == JOY_BUTTON_B:
				if current_page == "home": resume_game()
				elif current_page == "music": timeline_edit({"action":"close"})
				elif current_page == "design": skater.apply_skin(current_skin()); show_page("atelier")
				elif current_page == "atelier": show_page("settings")
				else: show_page("career" if current_page == "event" else "home")
				get_viewport().set_input_as_handled()
			elif event.button_index == JOY_BUTTON_START:
				resume_game()
				get_viewport().set_input_as_handled()
			return
		match event.button_index:
			JOY_BUTTON_A: push_pending = true
			JOY_BUTTON_DPAD_UP:
				if scheme != 3: trick_pending = true
			JOY_BUTTON_DPAD_LEFT: pair_hold_pending = true
			JOY_BUTTON_DPAD_RIGHT: pair_lift_pending = true
			JOY_BUTTON_START: pause_game()
			JOY_BUTTON_BACK:
				cycle_camera()

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
	var low := scheme != 3 and (pressed(KEY_U) or (not devices.is_empty() and pad(int(devices[0]),JOY_BUTTON_DPAD_DOWN)))
	if boot_test and not frame.is_empty():
		var index := int(frame.routine.index) if frame.routine != null else 0
		if scheme == 3:
			c.hardware.keys = ["a"] if index==1 else ["u"] if index==2 else []
		else:
			c.kx = -1.0 if index==1 else 0.0
			low = index==2
	if screenshot_test:
		c = {"hardware":{"axes":[.28,0.0,0.0,0.0],"buttons":[1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"keys":[],"connected":true}}
	c["pairHold"] = pair_hold_pending
	c["pairLift"] = pair_lift_pending
	link.send("frame",{"controls":c,"ticks":ticks,"low":low})
	push_pending = false
	toe_pending = false
	trick_pending = false
	pair_hold_pending = false
	pair_lift_pending = false

func _process(dt: float) -> void:
	presentation_clock += dt
	skater.effects_active = playing
	if not frame.is_empty():
		update_camera(dt)
		fill_audio()
		coach_title.visible = not overlay.visible
		coach_tip.visible = not overlay.visible
		coach_progress.visible = not overlay.visible
		hud_time.visible = not overlay.visible
	if boot_test:
		test_seconds += dt
		if not frame.is_empty() and frame.finished and test_stage == 0:
			test_stage = 1
			if frame.routine != null and int(frame.routine.index)==3:
				if not await smoke_protocol_ui():
					get_tree().quit(1)
					return
				print("GODOT_SMOKE_PASS: live Ice Lab completed the three-element career routine; traces=",arena.trace_count)
				# Second stage: the same live engine, in pairs mode.
				test_stage = 2
				test_seconds = 0.0
				start_game("pairs")
			else:
				push_error("Career smoke test did not finish the routine")
				get_tree().quit(1)
		elif test_stage == 2 and not frame.is_empty() and frame.mode == "pairs":
			var pairs = frame.get("pairs")
			if pairs == null or not partner.visible:
				push_error("Pairs smoke test: no partner was presented")
				get_tree().quit(1)
			elif test_seconds > 1.0 and not pair_hold_pending and not bool(pairs.holdRequested):
				pair_hold_pending = true
			elif bool(pairs.holdRequested):
				print("GODOT_PAIRS_PASS: partner presented, hand offered through the live bridge; distance=%.2f m" % float(pairs.distance))
				get_tree().quit(0)
			elif test_seconds > 10.0:
				push_error("Pairs smoke test: the hand offer never reached the partner")
				get_tree().quit(1)
		# First ice runs its full 75 s since 2026-11-02, so each stage gets 100.
		elif test_seconds>100:
			push_error("Godot smoke test timed out")
			get_tree().quit(1)
	if screenshot_test and not frame.is_empty():
		test_seconds += dt
		if test_seconds>2.5 and not screenshot_saved:
			screenshot_saved = true
			capture()

# The briefing page's real buttons through the live bridge: add an element, then back to the event's own.
func smoke_planning_ui() -> bool:
	var result: Dictionary = frame.result
	focus_event = 0
	show_page("event")
	# As if the player read this page for a while, then a request whose reply has not had time to arrive:
	# a quiet spell in a menu is not a late reply.
	link.last_reply -= 20000
	link.send("configure",{"options":{}})
	link._process(0.0)
	if link.faulted:
		push_error("Link: a request after an idle menu was called dead: %s" % notice.text)
		return false
	for child in menu.get_children():
		if child is Button and child.text.begins_with("+ Add"):
			child.pressed.emit()
			break
	var waited := 0.0
	while frame.career.plans[0] == null and waited < 12.0 and not link.faulted:
		await get_tree().create_timer(.1).timeout
		waited += .1
	if frame.career.plans[0] == null:
		push_error("Planning: + Add did not store a program. %s" % notice.text)
		return false
	for child in menu.get_children():
		if child is Button and child.text.begins_with("Use the event"):
			child.pressed.emit()
			break
	waited = 0.0
	while frame.career.plans[0] != null and waited < 12.0 and not link.faulted:
		await get_tree().create_timer(.1).timeout
		waited += .1
	if frame.career.plans[0] != null:
		push_error("Planning: the event's own program did not come back. %s" % notice.text)
		return false
	print("GODOT_PLANNING_PASS: briefing page stored and cleared a program through the live bridge")
	frame.result = result
	show_page("result")
	await get_tree().process_frame
	return true

# Exercise real controls and layout at the end of the existing live smoke run.
# Synthetic long sheets test scrolling only; bridge tests cover physical scoring.
func smoke_protocol_ui() -> bool:
	if not await smoke_planning_ui():
		return false
	var result: Dictionary = frame.result
	var elements := menu.get_node_or_null("ProtocolElements")
	if elements == null or elements.get_child_count() != 1 or not elements.get_child(0) is Label:
		push_error("Finished empty protocol did not render its placeholder")
		return false
	frame.result = result.duplicate(true)
	frame.result.protocol.lines = []
	for i in 32:
		frame.result.protocol.lines.append("3Lz+3T<*" if i == 31 else "2A")
	show_page("result")
	await get_tree().process_frame
	await get_tree().process_frame
	elements = menu.get_node("ProtocolElements")
	var scroll := menu_scroll.get_v_scroll_bar()
	if elements.get_child_count() != 32 or scroll.max_value <= scroll.page:
		push_error("Long protocol did not render every element in a scrollable sheet")
		return false
	var last_row: HBoxContainer = elements.get_child(31)
	if last_row.get_child(0).text != "32" or last_row.get_child(1).text != "3Lz+3T<*":
		push_error("Protocol lost element numbering or scoring calls")
		return false
	var last_button: Button = menu.get_child(menu.get_child_count()-1)
	last_button.grab_focus()
	await get_tree().process_frame
	await get_tree().process_frame
	var viewport_rect := menu_scroll.get_global_rect()
	if menu_scroll.scroll_vertical <= 0 or not viewport_rect.encloses(last_button.get_global_rect()):
		push_error("Result controls are not reachable below a long protocol")
		return false
	frame.result = result
	show_page("result")
	print("GODOT_PROTOCOL_PASS: empty sheet, 32 numbered elements, calls, and focus scrolling")
	return true

func capture() -> void:
	playing = false
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	image.save_png("/tmp/edgework-godot-rink.png")
	for view in [1,2,3]:
		camera_mode = view
		await get_tree().create_timer(1.5).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-camera-%d.png" % view)
	for page in ["home","career","event","learn","composer","settings"]:
		show_page(page)
		await get_tree().create_timer(1.2).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-%s.png" % ("menu" if page == "home" else page))
	# The Composer on the music, then the atelier with a velvet, full-crystal design on the skater.
	timeline_edit({"action":"open"},0)
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-music.png")
	timeline_edit({"action":"close"})
	await get_tree().create_timer(.4).timeout
	show_page("atelier")
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-atelier.png")
	design_slot = 0
	design = catalog.atelier.starts[2].duplicate(true)
	design.fabric = "velvet"
	design.crystals = "full"
	design.tights = "black"
	design.skin = "brown"
	show_page("design")
	link.send("dress",{"design":design})
	await get_tree().create_timer(2.0).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-design.png")
	start_lesson("experimental","experimental")
	await get_tree().create_timer(2.0).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-lesson.png")
	print("GODOT_CAPTURE_PASS")
	get_tree().quit()

func update_camera(dt: float) -> void:
	camera.cull_mask = 1 if camera_mode==2 and not overlay.visible else 3
	var s: Dictionary = frame.state
	var velocity := SimSpace.direction(s.vel.x,s.vel.y)
	if velocity.length()>.5 and int(s.jump.phase)!=2:
		follow_direction = follow_direction.lerp(velocity.normalized(),1-exp(-dt*1.8)).normalized()
	shot = Shot.blend(shot,Shot.framing(s),1-exp(-dt*3.0))
	var focus: Vector3 = skater.position+Vector3(0,float(shot.aim),0)
	var desired := focus-follow_direction*float(shot.away)+Vector3(0,float(shot.height),0)+follow_direction.cross(Vector3.UP)*float(shot.away)*.245
	# It looks a little ahead of a moving skater, to where the program is going.
	var look := focus+follow_direction*float(shot.lead)*(1.0+velocity.length()*.14)
	var fov := 46.0
	if camera_mode == 1:
		desired = Vector3(clampf(focus.x*.45,-18,18),7.8,31.5)
		fov = clampf(160.0/desired.distance_to(focus)*10,28,48)
	elif camera_mode == 2:
		desired = Vector3(39,44,43)
		look = Vector3.ZERO
		fov = 58
	elif camera_mode == 3:
		desired = focus-follow_direction*3.5+follow_direction.cross(Vector3.UP)*1.8+Vector3(0,-.25,0)
		look = focus+Vector3(0,-.3,0)
		fov = 46
	if overlay.visible:
		var a := .38+sin(presentation_clock*.09)*.22
		var front := SimSpace.direction(s.heading.x,s.heading.y)
		var showcase := front.rotated(Vector3.UP,a)
		desired = skater.position+showcase*4.2+Vector3(0,1.35,0)
		look = skater.position+Vector3(0,1.1,0)-showcase.cross(Vector3.UP)*.85
		fov = 38
	camera.position = camera.position.lerp(desired,1-exp(-dt*3.0))
	camera.fov = lerpf(camera.fov,fov,1-exp(-dt*2.5))
	camera.look_at(look)
	arena.update_mirror(camera)
	arena.update_crowd(skater.position,dt)

func fill_audio() -> void:
	if generator == null:
		return
	var s: Dictionary = frame.state
	var speed := Vector2(s.vel.x,s.vel.y).length()
	var level := clampf(speed/12.0,0,.55) if playing and int(s.jump.phase)!=2 and not bool(s.fallen) else 0.0
	for i in mini(generator.get_frames_available(),4096):
		audio_phase += .045+speed*.0008
		var noise := rng.randf_range(-1,1)
		blade_filter = lerpf(blade_filter,noise,.25)
		crowd_filter = lerpf(crowd_filter,noise,.014)
		crowd_swell = maxf(0,crowd_swell-1.0/22050.0/4.0)
		landing_envelope = maxf(0,landing_envelope-1.0/22050.0)
		var scrape := clampf(float(s.blade[0].latSlipAccel)+float(s.blade[1].latSlipAccel),0,4)*.08
		var blade := (noise-blade_filter)*level*(.35+scrape)
		var crowd := crowd_filter*(.16+crowd_swell*2.3) if playing else 0.0
		var thud := sin(audio_phase*.7)*landing_envelope*1.5 if playing else 0.0
		generator.push_frame(Vector2(blade+crowd+thud,blade*.92+crowd+thud))

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
	skating_setup = str(saved.get("setup",""))
	if skating_setup not in ["simulation","explorer","experimental","repertoire"]:
		skating_setup = ""
	assistance = clampf(float(saved.get("assistance",.75)),.5,1)
	steady_choice = str(saved.get("steady",""))
	if steady_choice not in ["","off","light","firm"]:
		steady_choice = ""
	beginner = bool(saved.get("beginner",true))
	scheme = clampi(int(saved.get("scheme",1)),0,3)
	if saved.get("controllerProfile") is Dictionary:
		saved_controller_profile = saved.controllerProfile
	track = clampi(int(saved.get("track",0)),0,4)
	profile = clampi(int(saved.get("profile",0)),0,3)
	character = clampi(int(saved.get("character",0)),0,CHARACTERS.size()-1)
	costume = maxi(int(saved.get("costume",0)),0)
	cruise = bool(saved.get("cruise",true))
	music_enabled = bool(saved.get("music",true))
	rumble_enabled = bool(saved.get("rumble",true))
	paddle_layout = clampi(int(saved.get("paddles",0)),0,PADDLE_LAYER)
	var ids = saved.get("sequence",[])
	if ids is Array and ids.size()>0 and ids.size()<=16:
		var valid := true
		for id in ids:
			valid = valid and id in ["glide","edge","crossover","jump","spin","step","pose","spiral","combo"]
		if valid:
			sequence = ids

func save_preferences() -> void:
	if boot_test or screenshot_test:
		return
	var file := FileAccess.open(settings_path,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"setup":skating_setup,"assistance":assistance,"steady":steady_choice,"beginner":beginner,"scheme":scheme,"controllerProfile":controller_profile,"track":track,"profile":profile,"character":character,"costume":costume,"cruise":cruise,"music":music_enabled,"rumble":rumble_enabled,"paddles":paddle_layout,"sequence":sequence}))
	else:
		on_error("Preferences could not be saved.")
