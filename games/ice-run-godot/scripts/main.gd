extends Node3D
const EngineLink = preload("res://scripts/engine_link.gd")
const Arena = preload("res://scripts/arena.gd")
const Skater = preload("res://scripts/skater.gd")
const Podium = preload("res://scripts/podium.gd")
const KissCry = preload("res://scripts/kiss_cry.gd")
const SimSpace = preload("res://scripts/sim_space.gd")
const Shot = preload("res://scripts/shot.gd")
const Ribbon = preload("res://scripts/ribbon.gd")
const Broadcast = preload("res://scripts/broadcast.gd")
const PadOverlay = preload("res://scripts/pad_overlay.gd")
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
# scripts/podium.gd: the top three after a career result.
var podium: Node3D
# scripts/kiss_cry.gd: the bench after a career program, before the podium (game/kisscry.ts).
var kiss_cry: Node3D
var kiss_cry_done := false
# game/warmup.ts: the event's field on the ice before a career program, by name.
var warmup_skaters := {}
var partner: Node3D
var ghost_skater: Node3D
var ghost_label: Label3D
var ghost_enabled := false
var last_ghost_id := ""
var last_ghost_t := 999.0
var pair_hold_pending := false
var pair_lift_pending := false
var camera: Camera3D
var music: AudioStreamPlayer
# game/motion/intro.ts: the music waits while she stands at her start spot before a program.
var music_waiting := false
var blade_audio: AudioStreamPlayer
var generator: AudioStreamGeneratorPlayback
var audio_phase := 0.0
var rng := RandomNumberGenerator.new()
var ui: CanvasLayer
var root: Control
var hud_brand: Label
var hud_edition: Label
var top_buttons: HBoxContainer
var overlay: ColorRect
var menu: VBoxContainer
var menu_scroll: ScrollContainer
var coach_box: VBoxContainer
var coach_title: Label
var coach_tip: Label
var coach_progress: Label
var _style_btn_normal: StyleBoxFlat
var _style_btn_hover: StyleBoxFlat
var _style_btn_primary: StyleBoxFlat
var _style_btn_primary_hover: StyleBoxFlat
var _style_focus_normal: StyleBoxFlat
var _style_focus_primary: StyleBoxFlat
var hud_time: Label
var hud_move: Label
var hud_technical: Label
var notice: Label
var ribbon: Control
## The demonstration's on-screen controller (scripts/pad_overlay.gd): the computer's hands in a showcase.
var pad_overlay: Control
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
## The control a page wants focused first, if not its first one.
var preferred_focus: Control
var controller_dirty := false
var startup_controller_sync := false
var paused_by_disconnect := false
var active_joy := -1
var session_active := false
var benchmark_hardware: Dictionary = {}
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
# game/motion/dance.ts: the style whose arms dress a run, "" for none (presentation only).
var dance_style := ""
var controller_profile: Dictionary = {}
var saved_controller_profile: Dictionary = {}
var track := 0
var profile := 0
var character := 0
var costume := 3
# game/skates.ts: the chosen skates (ids from the catalogue); empty is today's look. Cosmetic only.
var skates: Dictionary = {}
# The Composer's music preview and the atelier's design in hand (game/composer.ts, game/atelier.ts).
var preview: AudioStreamPlayer
var design_slot := -1
var design: Dictionary = {}
# game/creator.ts and game/modes.ts pages (2026-11-11): who skates, which program, which dance, and the sheet's slot.
var sheet_slot := -1
var sheet_from := "stamina"
var pick_character := "career"
var pick_program := -1
var pick_dance := -1
var dance_draft: Dictionary = {}
var dance_slot := -1
var program_name := "My program"
const MODE_PAGES := ["arcade","exhibition","creation","create","cast","showcase","dance","newcareer"]
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
# The debt clamp, counted. The game owes the solver 120 ticks a second and asks for at most 12 at
# once, so when the bridge is late by more than 100 ms the ticks past 12 are discarded: the program
# clock, and the music set to it, fall behind the wall clock. That was silent. These are per run.
var debt_dropped := 0.0   # sim ticks the clamp discarded
var debt_frames := 0      # physics frames on which it discarded any
var debt_high := 0.0      # the highest debt reached, in ticks
var debt_episode := 0.0   # ticks discarded by the saturation still going on
var test_stage := 0
var test_wait := 0.0
var settings_path := "user://preferences.json"
# Every costume slot on Violet's model (skater.gd SKIN_SLOTS), each one surface.
const SKIN_SURFACES := 7

# --startup-probe: measures cold start (engine start -> first menu, and the longest frame on the way)
# for docs/performance-visual-review.md, then quits. Off unless the flag is passed.
var probe_on := false
var probe_last_us := 0
var probe_max_before_ms := 0.0
var probe_max_after_ms := 0.0
var probe_menu_ms := -1
var probe_frames_after := 0
var probe_max_after_at := 0

func probe_tick() -> void:
	var now := Time.get_ticks_usec()
	if probe_last_us > 0:
		var ms := (now - probe_last_us) / 1000.0
		if probe_menu_ms < 0: probe_max_before_ms = maxf(probe_max_before_ms, ms)
		elif ms > probe_max_after_ms:
			probe_max_after_ms = ms
			probe_max_after_at = probe_frames_after
	probe_last_us = now
	if probe_menu_ms >= 0:
		probe_frames_after += 1
		if probe_frames_after in [2, 179] and DisplayServer.get_name() != "headless":
			get_viewport().get_texture().get_image().save_png("user://probe-frame-%d.png" % probe_frames_after)
		if probe_frames_after >= 180:
			print("STARTUP_PROBE menu_ms=%d max_frame_before_menu_ms=%.1f max_frame_after_menu_ms=%.1f at_frame=%d" % [probe_menu_ms, probe_max_before_ms, probe_max_after_ms, probe_max_after_at])
			get_tree().quit()

func _ready() -> void:
	boot_test = "--smoke-test" in OS.get_cmdline_user_args()
	probe_on = "--startup-probe" in OS.get_cmdline_user_args()
	init_ui_font_fallback()
	accept_with_pad()
	cancel_with_pad()
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
	if not boot_test and not screenshot_test and not ("--no-relaunch" in OS.get_cmdline_user_args()) and DisplayServer.get_name() != "headless":
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
		if skating_setup in ["simulation","experimental","diggate"]:
			cruise = false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--costume="):
			costume = maxi(int(arg.trim_prefix("--costume=")),0)
	arena = Arena.new()
	add_child(arena)
	skater = Skater.new()
	skater.model_path = CHARACTERS[character].path
	add_child(skater)
	podium = Podium.new()
	add_child(podium)
	kiss_cry = KissCry.new()
	add_child(kiss_cry)
	partner = Skater.new()
	partner.model_path = CHARACTERS[2].path
	partner.visible = false
	add_child(partner)
	ghost_skater = Skater.new()
	ghost_skater.model_path = CHARACTERS[0].path
	ghost_skater.ghost_mode = true
	ghost_skater.effects_active = false
	ghost_skater.visible = false
	add_child(ghost_skater)
	ghost_skater.set_ghost_mode(true, 1.0)
	ghost_label = Label3D.new()
	ghost_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	ghost_label.font_size = 44
	ghost_label.pixel_size = 0.0028
	ghost_label.modulate = Color(0.87, 0.96, 1.0, 1.0)
	ghost_label.outline_size = 10
	ghost_label.outline_modulate = Color(0.03, 0.08, 0.14, 0.92)
	ghost_label.layers = 1
	ghost_label.visible = false
	add_child(ghost_label)
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
	Input.joy_connection_changed.connect(on_joy_connection_changed)
	link = EngineLink.new()
	link.received.connect(on_engine)
	link.failed.connect(on_error)
	add_child(link)
	get_window().focus_exited.connect(func():
		if playing and not boot_test:
			pause_game())
	show_page("home")

# Pre-load one local sans FontFile carrying UI arrows/bullets/symbols (→ · ● ♪ ✓)
# onto ThemeDB.fallback_font so Linux TextServer resolves them from RAM instead of
# rescanning fontconfig on every menu rebuild (cuts Career transition ~347 ms -> <25 ms).
func init_ui_font_fallback() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var base: Font = ThemeDB.fallback_font
	if base == null or not base.fallbacks.is_empty():
		return
	var fallbacks: Array[Font] = []
	var has_arrow := false
	var has_bullet := false
	for family in ["DejaVu Sans", "Liberation Sans", "FreeSans", "Noto Sans Symbols", "Noto Sans Symbols 2"]:
		var font_path := OS.get_system_font_path(family)
		if font_path.is_empty() or not FileAccess.file_exists(font_path):
			continue
		var ff := FontFile.new()
		if ff.load_dynamic_font(font_path) != OK:
			continue
		ff.allow_system_fallback = false
		fallbacks.append(ff)
		has_arrow = has_arrow or ff.has_char(0x2192)
		has_bullet = has_bullet or ff.has_char(0x25cf)
		if has_arrow and has_bullet:
			break
	if has_arrow and has_bullet:
		if base is FontFile:
			(base as FontFile).allow_system_fallback = false
		base.fallbacks = fallbacks

func _init_button_styles() -> void:
	_style_btn_normal = StyleBoxFlat.new()
	_style_btn_normal.bg_color = Color(.06,.10,.15,.86)
	_style_btn_normal.content_margin_left = 17
	_style_btn_normal.content_margin_right = 17
	_style_btn_normal.content_margin_top = 9
	_style_btn_normal.content_margin_bottom = 9
	_style_btn_normal.border_width_bottom = 1
	_style_btn_normal.border_color = Color("354653")
	_style_btn_hover = _style_btn_normal.duplicate() as StyleBoxFlat
	_style_btn_hover.bg_color = Color("273f52")
	_style_btn_primary = _style_btn_normal.duplicate() as StyleBoxFlat
	_style_btn_primary.bg_color = Color("d5c29a")
	_style_btn_primary_hover = _style_btn_normal.duplicate() as StyleBoxFlat
	_style_btn_primary_hover.bg_color = Color("f0dfbd")
	_style_focus_normal = StyleBoxFlat.new()
	_style_focus_normal.draw_center = false
	_style_focus_normal.bg_color = Color(0,0,0,0)
	_style_focus_normal.border_width_left = 4
	_style_focus_normal.border_width_top = 2
	_style_focus_normal.border_width_right = 2
	_style_focus_normal.border_width_bottom = 2
	_style_focus_normal.border_color = Color("f0d494")
	_style_focus_primary = _style_focus_normal.duplicate() as StyleBoxFlat
	_style_focus_primary.border_color = Color("ffffff")

func label(text: String, size: int, color: Color = Color("e6edef")) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size",size)
	l.add_theme_color_override("font_color",color)
	# Bright ice runs behind much of this type.
	l.add_theme_color_override("font_shadow_color",Color(.02,.05,.09,.85))
	l.add_theme_constant_override("shadow_offset_x",1)
	l.add_theme_constant_override("shadow_offset_y",1)
	l.text = text
	return l

func paragraph(text: String, size: int = 16) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size",size)
	l.add_theme_color_override("font_color",Color("9eafb9"))
	l.add_theme_color_override("font_shadow_color",Color(.02,.05,.09,.85))
	l.add_theme_constant_override("shadow_offset_x",1)
	l.add_theme_constant_override("shadow_offset_y",1)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.text = text
	return l

func button(text: String, action: Callable, primary: bool = false) -> Button:
	if _style_btn_normal == null:
		_init_button_styles()
	var b := Button.new()
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size.y = 48
	b.add_theme_font_size_override("font_size",16)
	b.add_theme_stylebox_override("normal",_style_btn_primary if primary else _style_btn_normal)
	var hover := _style_btn_primary_hover if primary else _style_btn_hover
	b.add_theme_stylebox_override("hover",hover)
	b.add_theme_stylebox_override("pressed",hover)
	b.add_theme_color_override("font_color",Color("152430") if primary else Color("dce7e9"))
	b.add_theme_color_override("font_hover_color",Color("152430") if primary else Color("ffffff"))
	b.add_theme_color_override("font_focus_color",Color("152430") if primary else Color("ffffff"))
	apply_focus_box(b,primary)
	b.text = text
	b.pressed.connect(action)
	return b

func apply_focus_box(control: Control, primary: bool = false) -> void:
	if _style_focus_normal == null:
		_init_button_styles()
	control.add_theme_stylebox_override("focus",_style_focus_primary if primary else _style_focus_normal)

func style_picker(picker: OptionButton) -> OptionButton:
	picker.custom_minimum_size.y = 44
	picker.add_theme_font_size_override("font_size",15)
	apply_focus_box(picker,false)
	return picker

func bind_slider_focus(slider: HSlider, title_label: Label) -> void:
	slider.focus_entered.connect(func():
		title_label.add_theme_color_override("font_color",Color("f0d494")))
	slider.focus_exited.connect(func():
		title_label.add_theme_color_override("font_color",Color("e6edef")))

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
	hud_brand = label("E D G E W O R K",19)
	hud_brand.position = Vector2(40,27)
	root.add_child(hud_brand)
	hud_edition = label("GRAND PRIX     /     FIGURE SKATING",10,Color("d5c29a"))
	hud_edition.position = Vector2(42,57)
	root.add_child(hud_edition)
	# Mouse-only HUD shortcuts; FOCUS_NONE prevents D-pad/A gameplay input from hijacking camera or pause.
	top_buttons = HBoxContainer.new()
	top_buttons.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	top_buttons.position = Vector2(-360,25)
	top_buttons.size = Vector2(320,43)
	top_buttons.add_theme_constant_override("separation",8)
	var cam_button := button("Camera · V",cycle_camera)
	cam_button.focus_mode = Control.FOCUS_NONE
	var menu_button := button("Menu · Esc",pause_game)
	menu_button.focus_mode = Control.FOCUS_NONE
	top_buttons.add_child(cam_button)
	top_buttons.add_child(menu_button)
	root.add_child(top_buttons)
	coach_box = VBoxContainer.new()
	coach_box.position = Vector2(42,126)
	coach_box.custom_minimum_size.x = 370
	coach_box.size = Vector2(370,220)
	coach_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_box.add_theme_constant_override("separation",6)
	root.add_child(coach_box)
	coach_title = label("",23)
	coach_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_box.add_child(coach_title)
	coach_tip = paragraph("",14)
	coach_tip.custom_minimum_size.x = 370
	coach_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_box.add_child(coach_tip)
	coach_progress = label("",13,Color("c5b08e"))
	coach_progress.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	coach_progress.custom_minimum_size.x = 370
	coach_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	coach_box.add_child(coach_progress)
	# Lessons are read while skating, over a busy crowd.
	for coach_label in [coach_title,coach_tip,coach_progress]:
		coach_label.add_theme_color_override("font_outline_color",Color(0.03,0.06,0.1,.9))
		coach_label.add_theme_constant_override("outline_size",7)
	hud_time = label("",20)
	hud_time.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	hud_time.position = Vector2(-240,95)
	hud_time.size = Vector2(200,30)
	hud_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hud_time.add_theme_color_override("font_outline_color",Color(0.03,0.06,0.1,.92))
	hud_time.add_theme_constant_override("outline_size",5)
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
	# Bottom right, opaque, above the ice and under the menus.
	pad_overlay = PadOverlay.new()
	pad_overlay.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	pad_overlay.offset_left = -560
	pad_overlay.offset_top = -400
	pad_overlay.offset_right = -24
	pad_overlay.offset_bottom = -24
	root.add_child(pad_overlay)
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

func primary_joypad() -> int:
	var devices := Input.get_connected_joypads()
	if devices.is_empty():
		return -1
	for d in devices:
		if PadMap.wired_elite(int(d)):
			return int(d)
	for d in devices:
		if Input.is_joy_known(int(d)):
			return int(d)
	return int(devices[0])

func stop_all_vibration() -> void:
	for d in Input.get_connected_joypads():
		Input.stop_joy_vibration(int(d))

func on_joy_connection_changed(device: int, connected: bool) -> void:
	if not connected and playing:
		if active_joy >= 0 and device == active_joy:
			var remaining := primary_joypad()
			paused_by_disconnect = true
			pause_game()
			if remaining >= 0:
				active_joy = remaining
				var fallback_name := Input.get_joy_name(remaining)
				notice.text = "Controller disconnected — game paused. Using %s; press Continue or Menu." % (fallback_name if not fallback_name.is_empty() else "secondary gamepad")
			else:
				active_joy = -1
				notice.text = "Controller disconnected — game paused. Reconnect or use keyboard to continue."
	elif connected:
		var pad_name := Input.get_joy_name(device)
		if active_joy < 0 or PadMap.wired_elite(device):
			active_joy = primary_joypad()
		if paused_by_disconnect:
			paused_by_disconnect = false
			notice.text = "Controller connected (%s) — press Continue or Menu to resume." % (pad_name if not pad_name.is_empty() else "gamepad")
		if overlay != null and overlay.visible:
			call_deferred("focus_menu")
	update_controller_status()

func update_controller_status() -> void:
	if controller_status == null: return
	var joy := primary_joypad()
	if joy >= 0:
		var pad_name := Input.get_joy_name(joy)
		var header := ("CONTROLLER (%s)" % pad_name) if not pad_name.is_empty() else "XBOX CONTROLS"
		controller_status.text = header+"  /  A select · B back · Menu pause\nD-pad navigate · View change camera"
		if PadMap.wired_elite(joy):
			controller_status.text += "\nElite 2  /  "+("paddles ready" if PadMap.paddles_mapped() else "paddles off until the game restarts")
	else:
		controller_status.text = "KEYBOARD  /  Enter select · Esc pause\nA / D carve · Space push · Shift load / release"

func can_resume() -> bool:
	return session_active and not frame.is_empty() and not frame.finished

func clear_pending_inputs() -> void:
	push_pending = false
	toe_pending = false
	trick_pending = false
	pair_hold_pending = false
	pair_lift_pending = false
	previous_lt = false
	lt_time = 0.0

func setup_title(id: String) -> String:
	for entry in catalog.get("setups",[]):
		if str(entry.id) == id:
			return str(entry.name)
	return id.capitalize()

func ghost_setup_supported(setup_id: String) -> bool:
	return setup_id in ["experimental", "simulation", "diggate"]

func ghost_setup_note() -> String:
	if ghost_setup_supported(skating_setup):
		return "Free Skate and Lessons only. Runs a second skater through the real 120 Hz physics with live pad prompts; never alters your score, save, or replay. Press / during skating to toggle."
	var current_name := setup_title(skating_setup) if not skating_setup.is_empty() else "Legacy controls"
	return "Unsupported on %s in Free Skate (no authored routines for this setup yet). Switch to Experimental, Simulation, or Dig Gate, or use in Lessons where a step has a demonstration." % current_name

func toggle_ghost(from_menu: bool = false) -> void:
	ghost_enabled = not ghost_enabled
	save_preferences()
	if link != null and link.operational:
		link.send("ghost", {"enabled": ghost_enabled})
	else:
		if not ghost_enabled:
			apply_ghost(true)
		if from_menu and overlay != null and overlay.visible and current_page in ["home", "settings"]:
			show_page(current_page)

func clear_menu(title: String, subtitle: String, keep_scroll: bool = false) -> void:
	preferred_focus = null
	for child in menu.get_children():
		menu.remove_child(child)
		child.queue_free()
	menu.add_child(label(title,30))
	menu.add_child(paragraph(subtitle,14))
	menu.add_child(HSeparator.new())
	if not keep_scroll:
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

# Ensure B also acts as ui_cancel so OptionButton popups and dialogs dismiss cleanly on a pad.
static func cancel_with_pad() -> void:
	for e in InputMap.action_get_events("ui_cancel"):
		if e is InputEventJoypadButton and e.button_index == JOY_BUTTON_B: return
	var b := InputEventJoypadButton.new()
	b.button_index = JOY_BUTTON_B
	b.device = -1
	InputMap.action_add_event("ui_cancel",b)

func unfocus_disabled(node: Node) -> void:
	for child in node.get_children():
		# D4: never promote a deliberate FOCUS_NONE (mouse-only shortcuts). Only buttons this
		# function demoted are restored when they become enabled again.
		if child is BaseButton:
			if child.disabled:
				if child.focus_mode != Control.FOCUS_NONE:
					child.set_meta("_auto_unfocused", true)
					child.focus_mode = Control.FOCUS_NONE
			elif child.has_meta("_auto_unfocused"):
				child.remove_meta("_auto_unfocused")
				child.focus_mode = Control.FOCUS_ALL
		unfocus_disabled(child)

func _first_focusable(node: Node) -> Control:
	for child in node.get_children():
		if child is BaseButton:
			var btn := child as BaseButton
			if btn.is_visible_in_tree() and not btn.disabled and btn.focus_mode != Control.FOCUS_NONE:
				return btn
		if child is Slider:
			var sld := child as Slider
			if sld.is_visible_in_tree() and sld.editable and sld.focus_mode != Control.FOCUS_NONE:
				return sld
		var nested := _first_focusable(child)
		if nested != null:
			return nested
	return null

func focus_menu() -> void:
	if not overlay.visible: return
	unfocus_disabled(menu)
	if is_instance_valid(preferred_focus) and preferred_focus.is_inside_tree() and preferred_focus.is_visible_in_tree() and preferred_focus.focus_mode != Control.FOCUS_NONE:
		if not (preferred_focus is BaseButton and (preferred_focus as BaseButton).disabled):
			preferred_focus.grab_focus()
			return
	var first := _first_focusable(menu)
	if first != null:
		first.grab_focus()

func _close_open_popup(node: Node = self) -> bool:
	if node is FileDialog:
		var dlg := node as FileDialog
		if dlg.visible:
			dlg.hide()
			dlg.queue_free()
			return true
	if node is OptionButton:
		var picker := node as OptionButton
		var popup: PopupMenu = picker.get_popup()
		if popup != null and popup.visible:
			popup.hide()
			picker.grab_focus()
			return true
	for child in node.get_children():
		if _close_open_popup(child):
			return true
	return false

func _has_open_file_dialog(node: Node = self) -> bool:
	if node is FileDialog and (node as FileDialog).visible:
		return true
	for child in node.get_children():
		if _has_open_file_dialog(child):
			return true
	return false

func show_page(page: String) -> void:
	# The demonstration's controller belongs to the ice, never over a menu.
	if pad_overlay: pad_overlay.update_pad(null)
	if page != "result" and podium and podium.visible:
		podium.clear()
		skater.visible = true
	if page != "result" and kiss_cry and kiss_cry.visible:
		kiss_cry.clear()
		skater.visible = true
	var same_page := overlay.visible and current_page == page
	var prev_scroll := menu_scroll.scroll_vertical if same_page else 0
	if not same_page:
		focus_key = ""
	current_page = page
	if page != "music" and preview: preview.stop()
	if top_buttons: top_buttons.hide()
	if hud_brand: hud_brand.hide()
	if hud_edition: hud_edition.hide()
	if ghost_skater: ghost_skater.visible = false
	if ghost_label: ghost_label.visible = false
	overlay.show()
	playing = false
	music.stream_paused = true
	broadcast.hide()
	# D3 fix: focus_menu MUST flush before deferred scroll restoration so ScrollContainer.follow_focus
	# on unsorted VBox children does not clobber prev_scroll back to 0.
	call_deferred("focus_menu")
	if same_page and prev_scroll > 0:
		menu_scroll.set_deferred("scroll_vertical",prev_scroll)
	else:
		menu_scroll.scroll_vertical = 0
		menu_scroll.set_deferred("scroll_vertical",0)
	if page == "home":
		clear_menu("Your time on the ice", "One rink. Every edge. A season to make your own.")
		var resumable := can_resume()
		if resumable:
			menu.add_child(button("Continue skating →",resume_game,true))
			var running_setup := str(frame.get("setup","")) if frame.get("setup") != null else ""
			if not skating_setup.is_empty() and running_setup != skating_setup:
				menu.add_child(button("Restart with %s →" % setup_title(skating_setup),func():start_game(active_mode,event_index)))
			if active_mode in ["free", "lesson"]:
				var gs = frame.get("ghostStatus")
				var can_ghost := true if active_mode == "lesson" else ghost_setup_supported(running_setup)
				if can_ghost:
					menu.add_child(keyed(button("AI Ghost: " + ("On" if ghost_enabled else "Off"), func(): toggle_ghost(true)), "home-ghost"))
				else:
					var why := str(gs.get("reason", "")) if gs is Dictionary and not str(gs.get("reason", "")).is_empty() else "AI Ghost is unavailable on this setup (switch to Experimental, Simulation, or Dig Gate)."
					menu.add_child(paragraph(why, 12))
			if frame.get("tutorial") != null:
				menu.add_child(button("Skip this step   /   earns no XP",func():link.send("skipStep")))
			if frame.get("warmup") != null:
				menu.add_child(button("Skip the warm-up   /   start the program",func():link.send("endWarmup");resume_game()))
		# game/modes.ts MODES: the career first, as the main game; then Arcade, Exhibition and Creation.
		for m in catalog.get("modes",[{"id":"career","title":"The Season   /   Career","tagline":""}]):
			var id := str(m.id)
			var target := "career" if id == "career" else id
			menu.add_child(button("%s   /   %s →" % [str(m.title),str(m.get("tagline",""))],func():show_page(target),id == "career" and not resumable))
		menu.add_child(button("Watch a demonstration   /   the computer skates, the controls on screen",func():start_game("showcase",0,false,{"character":"career","program":["glide","crossover","edge","jump","spin","pose"]})))
		menu.add_child(button("Learn your controls   /   A course for each setup",func():show_page("learn")))
		menu.add_child(button("The skaters   /   Where they come from",func():show_page("cast")))
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
			# game/creator.ts: whose career this is, and the way to begin another.
			var me = frame.career.get("skater")
			if me != null:
				menu.add_child(label("%s   /   %s" % [str(me.name),origin_title(str(me.origin))],18))
			menu.add_child(button("Create a skater for a new career →",func():sheet_slot=-1;link.send("sheet",{"options":{"action":"drop"}});show_page("create")))
			# game/story.ts: each season's opening until a medal is won in it, then the coach's word on what is next.
			var story: Dictionary = catalog.get("story",{})
			var season_now := int(frame.career.get("seasonNumber",1))
			var won := false
			for i in frame.career.medals.size():
				if int(catalog.events[i].get("season",1)) == season_now:
					won = won or int(frame.career.medals[i]) > 0
			var seasons: Array = story.get("seasons",[story.get("season",{})])
			if not won and season_now-1 < seasons.size() and seasons[season_now-1].has("opening"):
				menu.add_child(label(str(seasons[season_now-1].get("title","")),21))
				menu.add_child(paragraph(str(seasons[season_now-1].opening),14))
			for line in frame.career.get("advice",[]):
				menu.add_child(paragraph("%s: %s" % [str(story.get("coach",{}).get("name","Your coach")),str(line)],13))
			menu.add_child(button("Learn your controls   /   each new step +%d XP" % int(catalog.lessonXp),func():show_page("learn")))
			for i in catalog.events.size():
				var event: Dictionary = catalog.events[i]
				# A heading where each season starts: game/career.ts SEASONS.
				if i == 0 or int(event.get("season",1)) != int(catalog.events[i-1].get("season",1)):
					var season_title := "Season %d" % int(event.get("season",1))
					var n := int(event.get("season",1))
					if n-1 < seasons.size(): season_title += "   /   " + str(seasons[n-1].get("title",""))
					menu.add_child(label(season_title,18,Color("d5bd96")))
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
			show_style_row()
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
			menu.add_child(label("Season %d standings" % season_now,21))
			show_table(frame.career.season,"points")
		menu.add_child(button("← Back",func():show_page("home")))
	elif page == "event":
		var event: Dictionary = catalog.events[focus_event]
		clear_menu(str(event.title),"%s · %ds. Your program must hold everything this event asks for, in any order, and up to %d more of your own. More to skate is more to score, and more to fall on." % [str(event.venue),int(event.seconds),int(catalog.planExtra)])
		var chapters: Array = catalog.get("story",{}).get("chapters",[])
		if focus_event < chapters.size():
			menu.add_child(paragraph(str(chapters[focus_event].before),14))
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
		show_event_dance()
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
				# A course for several setups (Program elements: all five) starts on yours; otherwise on its own.
				var course_setup: String = skating_setup if mine else str(course.setups[0])
				menu.add_child(button("%s%s" % ["● " if mine else "",str(course.title)],func():start_lesson(str(course.id),course_setup),mine))
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
		# game/creator.ts: keep it on Creation's shelf, to watch the computer skate it or skate it in an exhibition.
		var name_edit := LineEdit.new()
		name_edit.text = program_name
		name_edit.max_length = int(catalog.get("creator",{}).get("limits",{}).get("name",24))
		name_edit.text_changed.connect(func(t: String):program_name=t)
		menu.add_child(name_edit)
		var keep := button("Keep it in Creation   /   %s" % ("a new slot" if first_empty("programs") >= 0 else "the shelf is full"),func():
			link.send("studio",{"options":{"action":"program","slot":first_empty("programs"),"value":{"name":program_name,"elements":sequence}}}))
		keep.disabled = sequence.is_empty() or first_empty("programs") < 0
		menu.add_child(keep)
		menu.add_child(button("← Creation",func():show_page("creation")))
		menu.add_child(button("← Back",func():show_page("home")))
	elif page in MODE_PAGES:
		show_mode_page(page)
	elif page == "music":
		show_music_page()
	elif page == "atelier":
		show_atelier_page()
	elif page == "design":
		show_design_page()
	elif page == "skates":
		show_skates_page()
	elif page == "settings":
		clear_menu("Your skating setup", "Setup changes save immediately and apply to your next skate. Keyboard and analog controller are supported. Face buttons request moves; the physics decides what is possible.",same_page)
		if can_resume():
			var running_setup := str(frame.get("setup","")) if frame.get("setup") != null else ""
			if not skating_setup.is_empty() and running_setup != skating_setup:
				menu.add_child(label("Pending setup: %s  /  applies to your next skate or Restart" % setup_title(skating_setup),14,Color("d5bd96")))
		for entry in catalog.get("setups",[]):
			var setup_id: String = entry.id
			menu.add_child(keyed(button(("• " if skating_setup == setup_id else "")+str(entry.name),func():
				skating_setup=setup_id;scheme=3;beginner=setup_id=="repertoire";cruise=false;save_preferences();show_page("settings")),"setup-%s" % setup_id))
			if skating_setup == setup_id:
				menu.add_child(paragraph(str(entry.description),14))
		if skating_setup == "explorer":
			var assist_label := label("Balance & lean assistance: %d%%" % roundi(assistance*100),14)
			menu.add_child(assist_label)
			var assist_slider := HSlider.new()
			assist_slider.min_value=.5;assist_slider.max_value=1;assist_slider.step=.05;assist_slider.value=assistance
			assist_slider.value_changed.connect(func(value: float):assistance=value;assist_label.text="Balance & lean assistance: %d%%" % roundi(value*100);save_preferences())
			bind_slider_focus(assist_slider,assist_label)
			menu.add_child(keyed(assist_slider,"settings-assist"))
		if skating_setup.is_empty() or skating_setup == "repertoire":
			menu.add_child(keyed(button("Landing coach: "+("On" if beginner else "Off"),func():beginner=not beginner;save_preferences();show_page("settings")),"settings-coach"))
		var steady_default := str(catalog.get("steady",{}).get("defaults",{}).get(skating_setup,"light"))
		var steady_names := {"":"Setup default (%s)" % steady_default.capitalize(),"off":"Off","light":"Light","firm":"Firm"}
		menu.add_child(keyed(button("Steadying hand: "+str(steady_names[steady_choice]),func():
			var order := ["","off","light","firm"]
			steady_choice=order[(order.find(steady_choice)+1)%order.size()];save_preferences();show_page("settings")),"settings-steady"))
		menu.add_child(paragraph("A hand on your stick, never the physics: it keeps the lean you ask for to what your speed can carry. Off by default where a setup promises minimal assistance.",12))
		menu.add_child(keyed(button("AI Ghost: "+("On" if ghost_enabled else "Off"),func():toggle_ghost(true)),"settings-ghost"))
		menu.add_child(paragraph(ghost_setup_note(),12))
		# game/motion/dance.ts: cycle the dance styles; their arms dress a run while hers are free.
		var styles: Array = catalog.get("motion",{}).get("styles",[])
		var style_ids: Array = [""]
		for st in styles: style_ids.append(str(st.id))
		var style_name := "None"
		for st in styles:
			if str(st.id) == dance_style: style_name = str(st.name)
		menu.add_child(keyed(button("Dance style: "+style_name,func():
			dance_style = str(style_ids[(style_ids.find(dance_style)+1)%style_ids.size()]);save_preferences();show_page("settings")),"settings-dance"))
		for st in styles:
			if str(st.id) == dance_style:
				menu.add_child(paragraph("%s  ·  %d–%d bpm  ·  %s" % [str(st.blurb),int(st.tempo.min),int(st.tempo.max),str(st.music)],12))
		menu.add_child(keyed(button("Legacy override: "+["Lean & load","Assisted steering","Two-foot control","Full repertoire"][scheme],func():skating_setup="";scheme=(scheme+1)%4;save_preferences();show_page("settings")),"settings-legacy"))
		menu.add_child(keyed(button("Controller tuning & bindings",func():show_page("controller")),"settings-controller"))
		if skating_setup not in ["simulation","experimental","diggate"]:
			menu.add_child(keyed(button("Cruise: "+("On" if cruise else "Off"),func():cruise=not cruise;save_preferences();show_page("settings")),"settings-cruise"))
		menu.add_child(keyed(button("Music: "+("On" if music_enabled else "Off"),func():music_enabled=not music_enabled;save_preferences();show_page("settings")),"settings-music"))
		menu.add_child(keyed(button("Controller vibration: "+("On" if rumble_enabled else "Off"),func():
			rumble_enabled=not rumble_enabled
			if not rumble_enabled: stop_all_vibration()
			save_preferences();show_page("settings")),"settings-rumble"))
		menu.add_child(keyed(button("Elite paddles: "+["Controller's own profile","Footwork · LB / RB / A / R3","Moves · X / B / A / Y","Game layer · feet, free leg or weight"][paddle_layout],func():paddle_layout=(paddle_layout+1)%4;save_preferences();show_page("settings")),"settings-paddles"))
		menu.add_child(paragraph("Presets and the game layer need the Elite on its default profile, profile LEDs off: a stored profile sends the paddles as ordinary buttons, which Controller's own profile uses as they are. View changes camera; Menu pauses.",12))
		menu.add_child(keyed(button("Display: "+("Fullscreen" if DisplayServer.window_get_mode()==DisplayServer.WINDOW_MODE_FULLSCREEN else "Windowed")+" · F11",func():toggle_fullscreen();show_page("settings")),"settings-display"))
		menu.add_child(label("Skater",16))
		var character_picker := style_picker(OptionButton.new())
		for entry in CHARACTERS:
			character_picker.add_item(str(entry.name))
		character_picker.selected = character
		character_picker.item_selected.connect(func(index: int):
			character=index
			skater.load_model(CHARACTERS[character].path)
			skater.apply_skin(current_skin())
			save_preferences()
			show_page("settings"))
		menu.add_child(keyed(character_picker,"settings-character"))
		if not catalog.is_empty() and character != 1:
			menu.add_child(label("Costume",16))
			var worn := costume_skins()
			# Presets are grouped by game/appearance.ts COLLECTIONS; the kept designs are "Yours".
			var groups: Array = []
			for w in worn:
				if w != null and not groups.has(str(w.get("collection","Yours"))): groups.append(str(w.get("collection","Yours")))
			var now_group := str(worn[costume].get("collection","Yours")) if costume >= 0 and costume < worn.size() and worn[costume] != null else str(groups[0])
			var group_picker := style_picker(OptionButton.new())
			for g in groups: group_picker.add_item(g)
			group_picker.selected = maxi(groups.find(now_group),0)
			var costume_picker := style_picker(OptionButton.new())
			for i in worn.size():
				if worn[i] != null and str(worn[i].get("collection","Yours")) == str(groups[group_picker.selected]):
					costume_picker.add_item("%s — %s" % [worn[i].name, worn[i].description],i)
			costume_picker.select(costume_picker.get_item_index(costume) if costume_picker.get_item_index(costume) >= 0 else 0)
			group_picker.item_selected.connect(func(index: int):
				for i in worn.size():
					if worn[i] != null and str(worn[i].get("collection","Yours")) == str(groups[index]):
						costume = i
						break
				skater.apply_skin(current_skin());save_preferences();show_page("settings"))
			costume_picker.item_selected.connect(func(index: int):costume=costume_picker.get_item_id(index);skater.apply_skin(current_skin());save_preferences())
			menu.add_child(keyed(group_picker,"settings-costume-group"))
			menu.add_child(keyed(costume_picker,"settings-costume"))
			menu.add_child(button("Atelier  /  make your own costume →",func():show_page("atelier")))
		if not catalog.is_empty() and character != 1:
			menu.add_child(button("Skates  /  boots, blades and laces →",func():show_page("skates")))
		if not catalog.is_empty():
			menu.add_child(label("Soundtrack",16))
			var track_picker := style_picker(OptionButton.new())
			for song in catalog.tracks:
				track_picker.add_item(str(song.title))
			track_picker.selected = track
			track_picker.item_selected.connect(func(index: int):track=index;save_preferences())
			menu.add_child(keyed(track_picker,"settings-track"))
			menu.add_child(label("Free skate profile",16))
			var profile_picker := style_picker(OptionButton.new())
			for name in catalog.profiles:
				profile_picker.add_item(str(name))
			profile_picker.selected = profile
			profile_picker.item_selected.connect(func(index: int):profile=index;save_preferences())
			menu.add_child(keyed(profile_picker,"settings-profile"))
		if skating_setup in ["experimental","diggate"]:
			menu.add_child(paragraph("Experimental / Dig Gate: one trigger per leg. Pump to push, load and release the skating leg to jump. Sticks shape each blade. X/B shift weight; L3/R3 toe pick. A requests turns; Y requests rotation; bumpers change the move family (hold LB+RB in Dig Gate to dig). D-pad adjusts the feet.",14))
		elif skating_setup in ["simulation","explorer"]:
			menu.add_child(paragraph("Manual turns: tap B for three-turn; transfer foot for mohawk; hold B for loop; reverse lean for rocker. Transfer and reverse for choctaw. D-pad down requests bracket; hold and reverse lean for counter. X twizzles; Y spins; R3 plants the toe. RT loads/releases; LT brakes. LB/RB retain foot selection. Modifier + X/Y/A: Ina Bauer/spiral/cantilever. Simulation uses one stick per blade; hold the modifier for right-stick arms. Explorer uses left-stick lean and pressure, right-stick arms.",14))
		else:
			menu.add_child(paragraph("Full repertoire: dedicated turns and glides. Open Controller tuning & bindings for your current layout. RT loads/releases jumps; LT only brakes. Bumpers retain the chosen foot.\n\n" if scheme == 3 else "Controller: left stick steers; RT loads the knee; A pushes; Y spins; B turns; X twizzles; LT taps the toe, holds the brake; bumpers choose the foot; right stick opens the arms. D-pad up requests the Beginner jump; down holds the low pose.\n\nKeyboard: Q/E choose the foot; W/S move the rocker; F plants the toe; comma winds up a jump; I holds Ina Bauer; N requests a bracket. R restarts. Esc pauses.",14))
		menu.add_child(button("Save this skate's replay",func():link.send("export")))
		menu.add_child(button("Watch saved replay",func():link.send("replay")))
		menu.add_child(button("Export session measurements",func():link.send("metrics")))
		menu.add_child(button("Save settings & back",func():save_preferences();show_page("home")))
	elif page == "controller":
		clear_menu("Controller tuning", "Sensitivity, deadzones and feet layout apply to all setups. Move shortcuts apply to Full Repertoire; Simulation, Explorer, Experimental and Dig Gate use manual turn gestures.",same_page)
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
					controller_dirty=true
					title.text=str(setting.label)+": %.2f" % value)
				bind_slider_focus(slider,title)
				menu.add_child(keyed(slider,"ctrl-%s" % str(setting.key)))
			var mapping := ""
			for action in catalog.controller.actions:
				var binding: Dictionary = controller_profile.bindings[action.id]
				mapping += str(action.name)+": "+(str(catalog.controller.buttons[int(controller_profile.modifier)])+" + " if binding.modified else "")+str(catalog.controller.buttons[int(binding.button)])+"\n"
			menu.add_child(paragraph(mapping,13))
			menu.add_child(paragraph("Left stick leans; RT loads/releases a jump; LT brakes. LB/RB retain a foot; both share weight. Right stick opens the arms and selects camel in a spin. RT selects sit. Turns need speed and an edge.\n\nBrowser workshop: run node tools/ice-lab/app/serve.mjs, then open localhost:8123/game/controller.html.",13))
			var feet_now := str(controller_profile.get("feet","dpad"))
			var feet_names := {"dpad":"D-pad","stickY":"Sticks up and down","modifier":"Modifier + left stick"}
			menu.add_child(keyed(button("Feet layout: "+str(feet_names[feet_now]),func():
				controller_profile["feet"]={"dpad":"stickY","stickY":"modifier","modifier":"dpad"}[feet_now]
				apply_controller_profile()),"ctrl-feet"))
			menu.add_child(paragraph("Where the feet live in Simulation, Experimental and Dig Gate. Sticks up and down leaves the paddles nothing to turn. The lessons' words follow this.",12))
			menu.add_child(keyed(button("Save controller tuning",func():apply_controller_profile(),true),"ctrl-save"))
			menu.add_child(keyed(button("Switch to Full Repertoire & save",func():skating_setup="repertoire";scheme=3;beginner=true;cruise=false;apply_controller_profile()),"ctrl-repertoire"))
			menu.add_child(keyed(button("Import controller profile",func():controller_file(false)),"ctrl-import"))
			menu.add_child(keyed(button("Export controller profile",func():controller_file(true)),"ctrl-export"))
			menu.add_child(keyed(button("Restore controller defaults",func():controller_profile=catalog.controller.profile.duplicate(true);apply_controller_profile()),"ctrl-defaults"))
		menu.add_child(button("← Settings",leave_controller_page))
	elif page == "result":
		clear_menu(str(frame.result.title),str(frame.result.detail))
		# game/kisscry.ts: the bench and the marks first, then (present_podium, when it has run) the podium.
		if frame.result.get("kissAndCry") != null and not kiss_cry_done:
			if not kiss_cry.running:
				for id in kiss_cry.present(CHARACTERS[character].path,current_skin(),frame.result.kissAndCry):
					link.send("motionTrack",{"options":{"id":id}})
				skater.visible = false
		else:
			present_podium()
		# game/story.ts: the chapter's ending for a career run, and the season's after the championship.
		if not str(frame.result.get("story","")).is_empty():
			menu.add_child(paragraph(str(frame.result.story),16))
		if not str(frame.result.get("finale","")).is_empty():
			menu.add_child(paragraph(str(frame.result.finale),16))
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
		# game/modes.ts: an arcade round, an exhibition and a showcase go back to their own pages.
		var arcade = frame.get("arcade")
		if active_mode == "arcade" and arcade != null:
			if not bool(arcade.over):
				menu.add_child(button("Round %d of %d   /   %s →" % [int(arcade.round)+1,arcade.rounds.size(),str(arcade.rounds[int(arcade.round)].rival)],func():start_game("arcade"),true))
			menu.add_child(button("The arcade",func():show_page("arcade"),bool(arcade.over)))
			menu.add_child(button("Return to the rink menu",func():show_page("home")))
			return
		if active_mode in ["exhibition","showcase"]:
			menu.add_child(button("Again",func():start_mode_run(active_mode),true))
			menu.add_child(button("← Creation" if active_mode == "showcase" else "← Exhibition",func():show_page("creation" if active_mode == "showcase" else "exhibition")))
			menu.add_child(button("Return to the rink menu",func():show_page("home")))
			return
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

func keyed(c: Control, key: String) -> Control:
	if key == focus_key: preferred_focus = c
	c.focus_entered.connect(func():focus_key=key)
	return c

func apply_controller_profile() -> void:
	startup_controller_sync = false
	controller_dirty = false
	if link != null and link.operational and not controller_profile.is_empty():
		link.send("controller",{"profile":controller_profile})
	else:
		save_preferences()
		if overlay != null and overlay.visible and current_page == "controller":
			show_page("controller")

func leave_controller_page() -> void:
	if controller_dirty and not controller_profile.is_empty():
		apply_controller_profile()
	show_page("settings")

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

# ---- Skates (game/skates.ts, through the bridge) ----

const SKATE_LISTS := {"boot":"boots","finish":"finishes","blade":"blades","laces":"laces","heel":"heels"}

func current_skates() -> Dictionary:
	return skates if not skates.is_empty() else catalog.skates.default

func pick_skates(next: Dictionary) -> void:
	skates = next
	link.send("skates",{"choice":skates})

func show_skates_page() -> void:
	var cat: Dictionary = catalog.skates
	var now := current_skates()
	var look: Dictionary = frame.get("skates",{})
	clear_menu("Skates","Boots, blade and laces from a list. They change how the skates look and nothing else: the physics, the scores and the replays are the same in any pair.")
	menu.add_child(paragraph("Wearing: %s  /  %s" % [str(look.get("name","Competition white")),str(look.get("description",""))],14))
	var named := OptionButton.new()
	named.add_item("Named skates…")
	for preset in cat.presets:
		named.add_item("%s  /  %s" % [str(preset.name),str(preset.description)])
	named.item_selected.connect(func(index: int):
		if index > 0: pick_skates(cat.presets[index-1].choice.duplicate()))
	menu.add_child(named)
	for part in cat.parts:
		var list: Array = cat[SKATE_LISTS[part.id]]
		var at := 0
		for i in list.size():
			if list[i].id == now[part.id]: at = i
		var row := HBoxContainer.new()
		var title := label(str(part.title),15)
		title.custom_minimum_size.x = 170
		row.add_child(title)
		row.add_child(keyed(button("◀",func():pick_skates(cycled_skates(now,part.id,list,-1))),"skates-%s-" % part.id))
		var hex = list[at].get("hex")
		if hex == null and part.id == "finish":
			hex = cat.boots.filter(func(b):return b.id == now.boot)[0].hex
		if hex != null:
			var chip := ColorRect.new()
			chip.color = Color.html(str(hex))
			chip.custom_minimum_size = Vector2(36,36)
			chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(chip)
		var chosen := label("  %s" % str(list[at].name),15)
		chosen.custom_minimum_size.x = 190
		row.add_child(chosen)
		row.add_child(keyed(button("▶",func():pick_skates(cycled_skates(now,part.id,list,1))),"skates-%s+" % part.id))
		menu.add_child(row)
	menu.add_child(paragraph("The athlete models draw laces and a separate heel; the first skater model has no laces of its own, and the Berserker keeps his own boots.",12))
	menu.add_child(button("← Back to settings",func():save_preferences();show_page("settings")))

func cycled_skates(now: Dictionary, part: String, list: Array, by: int) -> Dictionary:
	var next := now.duplicate()
	var at := 0
	for i in list.size():
		if list[i].id == now[part]: at = i
	next[part] = list[(at+by+list.size())%list.size()].id
	return next

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

# ---- Modes, created skaters and Creation (game/modes.ts, game/creator.ts, game/backstories.ts) ----

func origin_title(id: String) -> String:
	for o in catalog.get("creator",{}).get("origins",[]):
		if str(o.id) == id: return str(o.origin)
	return ""

func first_empty(shelf: String) -> int:
	if frame.is_empty() or not frame.has("studio"): return -1
	var list: Array = frame.studio[shelf]
	for i in list.size():
		if list[i] == null: return i
	return -1

func stat_line(stats: Dictionary) -> String:
	var titles: Dictionary = catalog.get("story",{}).get("statTitles",{})
	var parts := PackedStringArray()
	for n in ["strength","spring","edgeControl","balance","stamina"]:
		parts.append("%s %d" % [str(titles.get(n,n)),int(stats[n])])
	return "   ·   ".join(parts)

func style_title(i: int) -> String:
	var styles: Array = catalog.get("styles",[])
	return str(styles[i].title) if i >= 0 and i < styles.size() else "No style"

## The briefing's dance row (CareerState.dances): this event's style, cycled best fit for its music first.
## Presentation only, like the Settings style it overrides.
func show_event_dance() -> void:
	var dances: Array = frame.career.get("dances",[])
	var tracks_of: Array = frame.career.get("eventTracks",[])
	var fits: Array = catalog.get("danceFits",[])
	if focus_event >= dances.size() or focus_event >= tracks_of.size() or int(tracks_of[focus_event]) >= fits.size(): return
	var ranked: Array = fits[int(tracks_of[focus_event])]
	var ids: Array = [""]
	for x in ranked: ids.append(str(x.id))
	var now := "" if dances[focus_event] == null else str(dances[focus_event])
	var shown := "Settings (%s)" % dance_name(dance_style) if now.is_empty() else dance_name(now)
	var fit := ""
	for x in ranked:
		if str(x.id) == (dance_style if now.is_empty() else now): fit = "   ·   suits the music %d%%" % roundi(float(x.fit)*100)
	menu.add_child(keyed(button("Dance: %s%s" % [shown,fit],func():
		var next = cycled(ids,now)
		link.send("careerDance",{"event":focus_event,"style":null if str(next).is_empty() else next})),"event-dance"))
	var best: Array = []
	for x in ranked.slice(0,3): best.append("%s %d%%" % [dance_name(str(x.id)),roundi(float(x.fit)*100)])
	menu.add_child(paragraph("The arms between elements; never in the air or a spin. Shown, not scored. Best for %s: %s." % [str(catalog.tracks[int(tracks_of[focus_event])].title),", ".join(best)],12))

func dance_name(id: String) -> String:
	for st in catalog.get("motion",{}).get("styles",[]):
		if str(st.id) == id: return str(st.name)
	return "None"

func character_name(id: String) -> String:
	for c in frame.get("characters",[]):
		if str(c.id) == id: return str(c.name)
	return "Your career skater"

## Cycle one id through a list of ids, by `by`.
func cycled(list: Array, now, by: int = 1):
	var at := list.find(now)
	return list[(at+by+list.size()) % list.size()] if not list.is_empty() else now

## The skater on the ice wears whoever skates: a rival's model and costume, or a created skater's costume.
func apply_who() -> void:
	var who = frame.get("who")
	if who == null or who.get("costume") == null: return
	var c := str(who.costume)
	if c.begins_with("rival:"):
		for entry in catalog.get("story",{}).get("cast",[]):
			if str(entry.name) == c.substr(6) and entry.get("look") != null:
				var model = entry.look.get("model")
				var path := "res://assets/generated/%s.glb" % model if model != null else ""
				if not path.is_empty() and ResourceLoader.exists(path): skater.load_model(path)
				skater.apply_skin(entry.look.costume)
	else:
		# game/creator.ts buildModel: a created skater's build wears its own body; Athletic (none)
		# is the athlete, so the player's own model, not whatever body the last skater wore.
		var built = who.get("model")
		var body := "res://assets/generated/%s.glb" % built if built != null else str(CHARACTERS[character].path)
		if ResourceLoader.exists(body): skater.load_model(body)
	if c.begins_with("preset:"):
		for k in catalog.skins:
			if str(k.id) == c.substr(7): skater.apply_skin(k)
	elif c.begins_with("design:"):
		var slot := int(c.substr(7))
		var skins: Array = frame.wardrobe.skins
		if slot < skins.size() and skins[slot] != null: skater.apply_skin(skins[slot])

## A created skater's costume choices: the presets, then the atelier's kept designs.
func costume_ids() -> Array:
	var ids: Array = []
	for k in catalog.skins: ids.append("preset:"+str(k.id))
	for i in frame.wardrobe.skins.size():
		if frame.wardrobe.skins[i] != null: ids.append("design:%d" % i)
	return ids

func costume_title(id: String) -> String:
	if id.begins_with("preset:"):
		for k in catalog.skins:
			if "preset:"+str(k.id) == id: return str(k.name)
	elif id.begins_with("design:"):
		var slot := int(id.substr(7))
		var d = frame.wardrobe.designs[slot] if slot < frame.wardrobe.designs.size() else null
		if d != null: return str(d.name)
	return id

func show_style_row() -> void:
	menu.add_child(label("Your style",21))
	var now := int(frame.career.get("style",-1))
	var mastery: Array = frame.career.get("styleMastery",[])
	menu.add_child(paragraph("How you skate: each style gives and costs (game/styles.ts). Choosing is free; a week of drills brings more of its benefit. A style you put down keeps what you drilled, but rusts.",13))
	for i in range(-1,catalog.get("styles",[]).size()):
		var chosen := i == now
		var m := "" if i < 0 else "   /   drilled %d%%" % roundi(float(mastery[i] if i < mastery.size() else 0)*100)
		menu.add_child(keyed(button("%s%s%s" % ["● " if chosen else "",style_title(i),m],func():link.send("careerStyle",{"options":{"style":i}}),chosen),"style-%d" % i))
		if i >= 0: menu.add_child(paragraph(str(catalog.styles[i].blurb),12))
	if now >= 0 and now < catalog.get("styles",[]).size():
		var drill := button("Drill %s   /   1 week" % style_title(now),func():link.send("careerStyle",{"options":{"drill":true}}))
		drill.disabled = int(frame.career.weeks) < 1 or float(mastery[now]) >= 1.0
		menu.add_child(drill)

## A run in a mode that has a skater, a program and a dance to pick.
func start_mode_run(mode: String) -> void:
	var extra := {"character":pick_character}
	if pick_program >= 0 and frame.studio.programs[pick_program] != null:
		extra.program = frame.studio.programs[pick_program].elements
	elif mode == "showcase":
		extra.program = sequence
	if pick_dance >= 0 and frame.studio.dances[pick_dance] != null:
		var d: Dictionary = frame.studio.dances[pick_dance]
		extra.dance = {"style":d.style,"track":int(d.track),"seed":int(d.seed)}
	start_game(mode,0,false,extra)

## The three pickers Exhibition and the showcase share.
func show_pickers(default_program: String) -> void:
	var ids: Array = []
	for c in frame.get("characters",[]): ids.append(str(c.id))
	menu.add_child(button("Skater: %s" % character_name(pick_character),func():pick_character=cycled(ids,pick_character);show_page(current_page)))
	var programs: Array = [-1]
	for i in frame.studio.programs.size():
		if frame.studio.programs[i] != null: programs.append(i)
	var ptitle: String = default_program if pick_program < 0 or frame.studio.programs[pick_program] == null else str(frame.studio.programs[pick_program].name)
	menu.add_child(button("Program: %s" % ptitle,func():pick_program=cycled(programs,pick_program);show_page(current_page)))
	var dances: Array = [-1]
	for i in frame.studio.dances.size():
		if frame.studio.dances[i] != null: dances.append(i)
	var dtitle: String = "The skater's own" if pick_dance < 0 or frame.studio.dances[pick_dance] == null else str(frame.studio.dances[pick_dance].name)
	menu.add_child(button("Dance: %s" % dtitle,func():pick_dance=cycled(dances,pick_dance);show_page(current_page)))

func show_mode_page(page: String) -> void:
	if catalog.is_empty() or frame.is_empty() or not frame.has("studio"):
		clear_menu("One moment","Connecting to Ice Lab…")
		menu.add_child(button("← Back",func():show_page("home")))
		return
	var creator: Dictionary = catalog.creator
	if page == "arcade":
		clear_menu("Arcade","Six programs from the career, a rival to beat at each, three lives. Beat their score with the program skated to the end. No XP, no wear: just the ladder.")
		var a = frame.get("arcade")
		if a != null and not bool(a.over):
			menu.add_child(label("%s   /   round %d of %d   /   %d lives   /   %d points" % [character_name(str(a.character)),int(a.round)+1,a.rounds.size(),int(a.lives),int(a.points)],16,Color("d5bd96")))
			menu.add_child(button("Continue: %s →" % str(a.rounds[int(a.round)].rival),func():start_game("arcade"),true))
		menu.add_child(label("Pick your skater",21))
		for c in frame.characters:
			var id := str(c.id)
			menu.add_child(button("%s   /   %s" % [str(c.name),str(c.origin)],func():start_game("arcade",0,false,{"character":id}),id == "career" and (a == null or bool(a.over))))
		menu.add_child(HSeparator.new())
		menu.add_child(label("The ladder",21))
		for r in catalog.arcade.ladder:
			menu.add_child(paragraph("%s   /   %s   /   beat %.2f" % [str(r.title),str(r.rival),float(r.target)],13))
		menu.add_child(label("High scores",21))
		if frame.board.is_empty(): menu.add_child(paragraph("Nobody yet.",13))
		for i in frame.board.size():
			var e: Dictionary = frame.board[i]
			menu.add_child(paragraph("%d.   %s   /   %d points   /   %s" % [i+1,str(e.name),int(e.points),"the whole ladder" if bool(e.cleared) else "%d rounds" % int(e.rounds)],14))
	elif page == "exhibition":
		clear_menu("Exhibition & Free skate","A gala under the lights: no required elements, a crowd that stayed, a protocol nobody counts. Or quiet ice with nothing on it but you.")
		menu.add_child(button("Free skate   /   Quiet ice",func():start_game("free"),true))
		menu.add_child(HSeparator.new())
		menu.add_child(label("Exhibition",21))
		show_pickers("The gala's own")
		menu.add_child(button("Take the spotlight →",func():start_mode_run("exhibition")))
	elif page == "creation":
		clear_menu("Creation","Make skaters, costumes, programs and dance sequences. Then watch the computer skate them, through the same pad and physics you skate with.")
		menu.add_child(button("Watch it skated   /   the showcase →",func():show_page("showcase"),true))
		menu.add_child(label("Skaters",21))
		for i in frame.studio.skaters.size():
			var k = frame.studio.skaters[i]
			if k == null: continue
			menu.add_child(button("%s   /   %s   /   edit" % [str(k.name),origin_title(str(k.origin))],func():sheet_slot=i;link.send("sheet",{"options":{"action":"load","slot":i}})))
		var add_skater := button("+ Create a skater",func():sheet_slot=-1;link.send("sheet",{"options":{"action":"drop"}});show_page("create"))
		add_skater.disabled = first_empty("skaters") < 0
		menu.add_child(add_skater)
		menu.add_child(label("Costumes",21))
		menu.add_child(button("Atelier   /   make your own costume →",func():show_page("atelier")))
		menu.add_child(label("Programs",21))
		for i in frame.studio.programs.size():
			var pr = frame.studio.programs[i]
			if pr == null: continue
			var row := HBoxContainer.new()
			var l := label("%s   /   %s" % [str(pr.name),routine_names(pr.elements)],14)
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			row.add_child(l)
			row.add_child(button("Edit",func():sequence=pr.elements.duplicate();program_name=str(pr.name);show_page("composer")))
			row.add_child(button("×",func():link.send("studio",{"options":{"action":"clear","shelf":"programs","slot":i}})))
			menu.add_child(row)
		menu.add_child(button("+ Compose a program →",func():show_page("composer")))
		menu.add_child(label("Dance sequences",21))
		for i in frame.studio.dances.size():
			var d = frame.studio.dances[i]
			if d == null: continue
			menu.add_child(button("%s   /   %s   /   %s   /   edit" % [str(d.name),dance_name(str(d.style)),str(catalog.tracks[int(d.track)].title)],func():dance_slot=i;dance_draft=d.duplicate();show_page("dance")))
		var add_dance := button("+ A dance sequence",func():
			dance_slot=-1
			var first: Array = catalog.get("motion",{}).get("styles",[])
			dance_draft={"name":"My dance","style":str(first[0].id) if not first.is_empty() else "","track":track,"seed":1}
			show_page("dance"))
		add_dance.disabled = first_empty("dances") < 0
		menu.add_child(add_dance)
	elif page == "dance":
		clear_menu("A dance sequence","A dance style laid over a track's bars: the arms and upper body it dances while hers are free. Roll it again for another arrangement of the same style.")
		var styles: Array = catalog.get("motion",{}).get("styles",[])
		var ids: Array = []
		for st in styles: ids.append(str(st.id))
		var name_edit := LineEdit.new()
		name_edit.text = str(dance_draft.get("name","My dance"))
		name_edit.text_changed.connect(func(t: String):dance_draft.name=t)
		menu.add_child(name_edit)
		menu.add_child(button("Style: %s" % dance_name(str(dance_draft.style)),func():dance_draft.style=cycled(ids,str(dance_draft.style));show_page("dance")))
		for st in styles:
			if str(st.id) == str(dance_draft.style):
				menu.add_child(paragraph("%s  ·  %d–%d bpm  ·  %s" % [str(st.blurb),int(st.tempo.min),int(st.tempo.max),str(st.music)],12))
		var tracks_n: int = catalog.tracks.size()
		menu.add_child(button("Music: %s" % str(catalog.tracks[int(dance_draft.track)].title),func():dance_draft.track=(int(dance_draft.track)+1)%tracks_n;show_page("dance")))
		menu.add_child(button("Arrangement %d   /   roll again" % int(dance_draft.seed),func():dance_draft.seed=int(dance_draft.seed)%999+1;show_page("dance")))
		var slot := dance_slot if dance_slot >= 0 else first_empty("dances")
		var keep := button("Keep it",func():link.send("studio",{"options":{"action":"dance","slot":slot,"value":dance_draft}}),true)
		keep.disabled = slot < 0
		menu.add_child(keep)
		if dance_slot >= 0:
			menu.add_child(button("Take it off the shelf",func():link.send("studio",{"options":{"action":"clear","shelf":"dances","slot":dance_slot}});dance_slot=-1))
		menu.add_child(button("← Creation",func():show_page("creation")))
		return
	elif page == "showcase":
		clear_menu("The showcase","The computer skates your program, through Simulation's pad and the same physics you skate with. It falls when the physics says so. It can skate glides, edges, crossovers, jumps, spins and poses; anything else in the program it leaves out and tells you.")
		show_pickers("The Composer's (%s)" % routine_names(sequence))
		menu.add_child(button("Watch →",func():start_mode_run("showcase"),true))
		menu.add_child(button("← Creation",func():show_page("creation")))
		return
	elif page == "cast":
		clear_menu("The skaters","Where everyone in the field comes from, and what it made of them. A rival's stats are who they are when you pick them in Arcade, Exhibition or a showcase. Their scores in your career are measured, not these.")
		for name in catalog.get("backstories",{}):
			var b: Dictionary = catalog.backstories[name]
			menu.add_child(label("%s   /   %s" % [str(name),str(b.origin)],19))
			menu.add_child(paragraph(str(b.story),14))
			menu.add_child(paragraph("%s   %s   ·   Dance: %s" % [str(b.shaped),"Style: "+str(b.style).capitalize() if b.style != null else "",dance_name(str(b.dance))],13))
			menu.add_child(paragraph(stat_line(b.stats),12))
	elif page == "create":
		var sh = frame.get("sheet")
		if sh == null:
			clear_menu("Create a skater","Where do they come from? An origin shapes the five stats (it trades points, never adds them), a style and a dance. Everything after that, the season gives.")
			for o in creator.origins:
				var id := str(o.id)
				menu.add_child(button(str(o.origin),func():link.send("sheet",{"options":{"action":"new","origin":id}})))
				menu.add_child(paragraph(str(o.shaped),12))
			menu.add_child(button("← Back",func():show_page("creation")))
			return
		clear_menu(str(sh.name),"%s. Overall %.2f, the same ask as every new skater." % [str(sh.originTitle),float(sh.overall)])
		var name_edit := LineEdit.new()
		name_edit.text = str(sh.name)
		name_edit.max_length = int(creator.limits.name)
		name_edit.text_submitted.connect(func(t: String):link.send("sheet",{"options":{"action":"set","field":"name","value":t}}))
		var sheet_name := str(sh.name)
		name_edit.focus_exited.connect(func():
			if name_edit.text != sheet_name:
				link.send("sheet",{"options":{"action":"set","field":"name","value":name_edit.text}}))
		menu.add_child(name_edit)
		menu.add_child(paragraph(str(sh.story),14))
		menu.add_child(paragraph("Mara: "+str(sh.coach),13))
		var origin_ids: Array = []
		for o in creator.origins: origin_ids.append(str(o.id))
		menu.add_child(button("Origin: %s   /   change" % str(sh.originTitle),func():link.send("sheet",{"options":{"action":"new","origin":cycled(origin_ids,str(sh.origin))}})))
		menu.add_child(label("Stats",21))
		var titles: Dictionary = catalog.story.statTitles
		menu.add_child(button("Points come from: %s" % str(titles[sheet_from]),func():sheet_from=cycled(["strength","spring","edgeControl","balance","stamina"],sheet_from);show_page("create")))
		for n in ["strength","spring","edgeControl","balance","stamina"]:
			var row := HBoxContainer.new()
			var l := label("%s   %d" % [str(titles[n]),int(sh.stats[n])],16)
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(l)
			if n != sheet_from:
				var why := str(sh.blocks.get("%s>%s" % [sheet_from,n],""))
				var plus := button("+1 from %s" % str(titles[sheet_from]),func():link.send("sheet",{"options":{"action":"trade","from":sheet_from,"to":n}}))
				plus.disabled = not why.is_empty()
				plus.tooltip_text = why
				row.add_child(plus)
			menu.add_child(row)
		menu.add_child(paragraph(str(sh.shaped),12))
		menu.add_child(label("Body",21))
		var h_label := label("Height %.2f m" % float(sh.heightM),15)
		menu.add_child(h_label)
		var h := HSlider.new()
		h.min_value = float(creator.height.min); h.max_value = float(creator.height.max); h.step = float(creator.height.step); h.value = float(sh.heightM)
		var initial_height := float(sh.heightM)
		h.value_changed.connect(func(v: float):h_label.text = "Height %.2f m" % v)
		h.drag_ended.connect(func(_changed: bool):initial_height = h.value; link.send("sheet",{"options":{"action":"set","field":"heightM","value":h.value}}))
		h.focus_exited.connect(func():
			if absf(h.value - initial_height) > 0.001:
				initial_height = h.value
				link.send("sheet",{"options":{"action":"set","field":"heightM","value":h.value}}))
		bind_slider_focus(h,h_label)
		menu.add_child(h)
		var builds: Array = []
		for b in creator.builds: builds.append(str(b.id))
		for b in creator.builds:
			if str(b.id) == str(sh.build):
				menu.add_child(button("Build: %s   /   %s" % [str(b.name),str(b.blurb)],func():link.send("sheet",{"options":{"action":"set","field":"build","value":cycled(builds,str(sh.build))}})))
		menu.add_child(label("Look and style",21))
		var style_ids: Array = range(-1,catalog.styles.size())
		menu.add_child(button("Skating style: %s" % style_title(int(sh.style)),func():link.send("sheet",{"options":{"action":"set","field":"style","value":cycled(style_ids,int(sh.style))}})))
		var dance_ids: Array = [""]
		for st in catalog.get("motion",{}).get("styles",[]): dance_ids.append(str(st.id))
		menu.add_child(button("Dance: %s" % dance_name(str(sh.dance)),func():link.send("sheet",{"options":{"action":"set","field":"dance","value":cycled(dance_ids,str(sh.dance))}})))
		menu.add_child(button("Costume: %s" % costume_title(str(sh.costume)),func():link.send("sheet",{"options":{"action":"set","field":"costume","value":cycled(costume_ids(),str(sh.costume))}})))
		menu.add_child(HSeparator.new())
		var slot := sheet_slot if sheet_slot >= 0 else first_empty("skaters")
		var keep := button("Keep %s" % str(sh.name),func():sheet_slot=slot;link.send("sheet",{"options":{"action":"save","slot":slot}}),true)
		keep.disabled = slot < 0
		menu.add_child(keep)
		if sheet_slot >= 0:
			menu.add_child(button("Begin a new career as %s →" % str(sh.name),func():show_page("newcareer")))
		menu.add_child(button("← Creation",func():show_page("creation")))
		return
	elif page == "newcareer":
		var k = frame.studio.skaters[sheet_slot] if sheet_slot >= 0 else null
		if k == null:
			show_page("create")
			return
		clear_menu("A new career","%s starts at the community rink with a new coach's notebook: medals, XP, weeks and wear all begin again. Your current career is not lost: it is kept beside the save in a dated file." % str(k.name))
		menu.add_child(button("Begin as %s →" % str(k.name),func():link.send("newCareer",{"slot":sheet_slot}),true))
		menu.add_child(button("← Not yet",func():show_page("create")))
		return
	menu.add_child(button("← Back",func():show_page("home")))

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

func start_game(mode: String, index: int = 0, challenge: bool = false, extra: Dictionary = {}) -> void:
	focus_key = ""
	if not link.operational:
		on_error("The skating engine is still starting.")
		return
	active_mode = mode
	event_index = index
	playing = false
	podium.clear()
	kiss_cry.clear()
	kiss_cry_done = false
	skater.visible = true
	skater.load_model(CHARACTERS[character].path)
	skater.apply_skin(current_skin())
	partner.visible = false
	if ghost_skater: ghost_skater.visible = false
	if ghost_label: ghost_label.visible = false
	link.send("configure",{"options":{"setup":skating_setup if not skating_setup.is_empty() else null,"assistance":assistance,"scheme":scheme,"beginner":beginner,"cruise":cruise,"track":track,"profile":profile,"controllerProfile":controller_profile,"steady":steady_choice if not steady_choice.is_empty() else null,"danceStyle":dance_style if not dance_style.is_empty() else null,"ghost":false if boot_test else ghost_enabled}})
	# A career program opens with its warm-up group (game/warmup.ts); the tests skate straight in.
	var warm := mode == "career" and not boot_test and (not screenshot_test or "--capture-warmup" in OS.get_cmdline_user_args())
	# The moment before the music (game/motion/intro.ts): she stands at her start spot. The tests skate straight in.
	var intro := not boot_test and (not screenshot_test or "--capture-intro" in OS.get_cmdline_user_args())
	var options := {"mode":mode,"event":index,"sequence":sequence if mode=="composer" else null,"pairsChallenge":challenge,"course":lesson_course if mode=="lesson" else null,"warmup":warm,"intro":intro}
	options.merge(extra,true)
	if mode == "arcade" and extra.has("character"):
		link.send("arcade",{"character":extra.character})
	else:
		link.send("start",{"options":options})

func on_engine(op: String, data: Dictionary) -> void:
	if op == "hello":
		session_active = false
		catalog = data.catalog
		frame = data.frame
		if not skates.is_empty():
			link.send("skates",{"choice":skates})
		var worn: int = skater.apply_skin(current_skin())
		if boot_test and worn < SKIN_SURFACES:
			push_error("Costume reached %d of %d surfaces" % [worn, SKIN_SURFACES])
			get_tree().quit(1)
		controller_profile = catalog.controller.profile.duplicate(true)
		if not saved_controller_profile.is_empty():
			startup_controller_sync = true
			link.send("controller",{"profile":saved_controller_profile})
		if not boot_test and not screenshot_test:
			link.send("configure",{"options":{"setup":skating_setup if not skating_setup.is_empty() else null,"assistance":assistance,"scheme":scheme,"beginner":beginner,"cruise":cruise,"track":track,"profile":profile,"steady":steady_choice if not steady_choice.is_empty() else null,"danceStyle":dance_style if not dance_style.is_empty() else null,"ghost":ghost_enabled}})
		skater.apply_frame(frame,true)
		show_page(current_page)
		if probe_on and probe_menu_ms < 0:
			probe_menu_ms = Time.get_ticks_msec()
		# The menu has drawn behind the overlay: this GPU's pipelines are cached (scripts/boot.gd).
		preload("res://scripts/boot.gd").mark_pipelines_warm.call_deferred()
		if boot_test:
			for page in ["career","composer","settings","atelier","skates","controller","home"]:
				show_page(page)
		if boot_test:
			start_game("career")
		elif screenshot_test:
			start_game("career" if "--capture-warmup" in OS.get_cmdline_user_args() else "free")
		return
	if op == "controller":
		controller_profile = data.profile
		controller_dirty = false
		if startup_controller_sync:
			startup_controller_sync = false
			return
		save_preferences()
		notice.text = "Controller tuning saved."
		if overlay.visible and current_page == "controller":
			show_page("controller")
		return
	# game/motion/track.ts: a baked clip, for the podium. Not a frame.
	if op == "motionTrack":
		podium.play_track(data)
		kiss_cry.play_track(data)
		return
	if op == "dress":
		skater.apply_skin(data.skin)
		return
	if op == "skates":
		frame = data
		skater.apply_skates(frame.skates)
		save_preferences()
		if overlay.visible and current_page == "skates":
			show_page("skates")
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
	if op == "ghost":
		apply_ghost(true)
		var g_setup := str(frame.get("setup","")) if frame.get("setup") != null else ""
		broadcast.update_state(frame,g_setup if not g_setup.is_empty() else "custom",["TRACKING","BROADCAST","RINK","BLADE"][camera_mode])
		var gs = frame.get("ghostStatus")
		if overlay.visible and current_page in ["home", "settings"]:
			show_page(current_page)
		elif not ghost_enabled:
			notice.text = "AI Ghost off."
		elif gs is Dictionary and not bool(gs.get("active", false)):
			var why := str(gs.get("reason", ""))
			notice.text = why if not why.is_empty() else "AI Ghost enabled (waiting for a supported step)."
		else:
			notice.text = "AI Ghost on — skating beside you."
		return
	# game/creator.ts and game/modes.ts menus: back to the page that asked.
	if op == "sheet":
		show_page("create")
		return
	if op == "studio":
		notice.text = "Kept."
		show_page(current_page if current_page in MODE_PAGES or current_page == "composer" else "creation")
		return
	if op == "careerStyle":
		show_page("career")
		return
	if op == "careerDance":
		focus_key = "event-dance"
		show_page("event")
		return
	if op == "newCareer":
		session_active = false
		notice.text = "A new career begins. Your last one is kept beside the save, dated."
		show_page("career")
		return
	if op == "start" or op == "replay" or op == "endWarmup" or op == "arcade":
		session_active = true
		active_joy = primary_joypad()
		clear_pending_inputs()
		paused_by_disconnect = false
		tick_debt = 0.0
		reset_debt()
		arena.clear_traces()
		arena.set_course(str(frame.mode),catalog)
		apply_who()
		skater.apply_frame(frame,true)
		apply_partner(true)
		apply_warmup(true)
		apply_ghost(true)
		last_result_tick = -1
		last_landing_tick = -1
		music.stream = load("res://assets/generated/audio/"+str(catalog.tracks[int(frame.track)].file))
		music_waiting = frame.get("intro") != null
		if DisplayServer.get_name() != "headless" and not music_waiting:
			music.play()
		music.stream_paused = not music_enabled
		playing = true
		overlay.hide()
		if top_buttons: top_buttons.show()
		if hud_brand: hud_brand.show()
		if hud_edition: hud_edition.show()
		get_viewport().gui_release_focus()
		broadcast.show()
		if not music_waiting:
			broadcast.announce("TAKE THE ICE", "Northlight Arena  /  "+active_mode.capitalize())
		notice.text = ""
	else:
		# The warm-up ended inside this batch: the program starts fresh, from its own start.
		var program_begins: bool = frame.get("warmup") == null and not warmup_skaters.is_empty()
		skater.apply_frame(frame,program_begins)
		if program_begins:
			arena.clear_traces()
			broadcast.announce("THE GROUP LEAVES THE ICE","Your program  /  "+str(frame.routine.title) if frame.routine != null else "Your program")
		apply_partner(false)
		apply_warmup(false)
		apply_ghost(false)
		# Out of a warm-up the program's intro begins inside a batch: the music starts again after it.
		if frame.get("intro") != null and not music_waiting:
			music_waiting = true
			music.stop()
		elif frame.get("intro") == null and music_waiting:
			music_waiting = false
			broadcast.announce_time = 0.0
			if DisplayServer.get_name() != "headless":
				music.play()
	arena.trace_lifted = skater.lifted_blade()
	arena.add_traces(frame.trace)
	arena.update_course(frame)
	ribbon.update_state(frame)
	var active_setup := str(frame.get("setup","")) if frame.get("setup") != null else ""
	broadcast.update_state(frame,active_setup if not active_setup.is_empty() else "custom",["TRACKING","BROADCAST","RINK","BLADE"][camera_mode])
	var landed: Dictionary = frame.state.landed
	if int(landed.tick)>last_landing_tick and int(landed.tick)>=0:
		last_landing_tick = int(landed.tick)
		var clean := not bool(landed.fall) and not bool(landed.stepOut)
		landing_envelope = .32
		crowd_swell = 1.0 if clean else .35
		arena.react(1.0 if clean else .12)
		broadcast.announce("CLEAN LANDING" if clean else "FIND YOUR EDGE", "%.2f rotations   /   Jump TES %.2f" % [float(landed.turned),float(frame.get("technical",0))])
		var joy := primary_joypad()
		if rumble_enabled and joy >= 0:
			Input.start_joy_vibration(joy,.18 if clean else .48,.30 if clean else .7,.16 if clean else .28)
	update_hud()
	pad_overlay.update_pad(null if overlay.visible else frame.get("pilotPad"))
	if frame.finished and last_result_tick != int(frame.state.tick):
		session_active = false
		last_result_tick = int(frame.state.tick)
		show_page("result")

# game/warmup.ts: each rival in their own model and costume (game/cast.ts), posed from their own sim state.
func apply_warmup(snap: bool) -> void:
	var group = frame.get("warmup")
	if group == null:
		for k in warmup_skaters.values():
			k.queue_free()
		warmup_skaters.clear()
		return
	var looks := {}
	for c in catalog.get("story",{}).get("cast",[]):
		if c.get("look") != null: looks[str(c.name)] = c.look
	for k in group.skaters:
		var name := str(k.name)
		var fresh := not warmup_skaters.has(name)
		if fresh:
			var look: Dictionary = looks.get(name,{})
			var model = look.get("model")
			var r := Skater.new()
			var path := "res://assets/generated/%s.glb" % model if model != null else ""
			r.model_path = path if not path.is_empty() and ResourceLoader.exists(path) else CHARACTERS[0].path
			add_child(r)
			r.apply_skin(look.get("costume",{}))
			warmup_skaters[name] = r
		warmup_skaters[name].apply_frame(k,snap or fresh)

func apply_partner(snap: bool) -> void:
	var pairs = frame.get("pairs")
	partner.visible = pairs != null
	if pairs == null:
		return
	partner.lift_height = float(pairs.lift.height)
	partner.apply_frame(pairs,snap)

func apply_ghost(snap: bool) -> void:
	if ghost_skater == null or ghost_label == null:
		return
	var g = frame.get("ghost") if not frame.is_empty() else null
	if g == null or not (g is Dictionary) or not ghost_enabled or overlay.visible or (podium != null and podium.visible) or (kiss_cry != null and kiss_cry.visible):
		ghost_skater.visible = false
		ghost_label.visible = false
		last_ghost_id = ""
		last_ghost_t = 999.0
		return
	var alpha := clampf(float(g.get("alpha", 1.0)), 0.0, 1.0)
	var g_id := str(g.get("id", ""))
	var g_t := float(g.get("t", 0.0))
	var respawned := snap or g_id != last_ghost_id or g_t < last_ghost_t - 0.05
	last_ghost_id = g_id
	last_ghost_t = g_t
	ghost_skater.visible = alpha > 0.02
	ghost_skater.update_ghost_alpha(alpha)
	ghost_skater.apply_frame(g, respawned)
	ghost_label.visible = alpha > 0.05
	ghost_label.text = "GHOST · %s" % str(g.get("name", ""))
	ghost_label.modulate = Color(0.87, 0.96, 1.0, alpha)
	ghost_label.outline_modulate = Color(0.03, 0.08, 0.14, 0.92 * alpha)
	ghost_label.position = ghost_skater.position + Vector3(0.0, 2.22, 0.0)

func on_error(message: String) -> void:
	startup_controller_sync = false
	notice.text = message
	push_warning(message)
	if link != null and link.faulted:
		session_active = false
		playing = false
		show_page("home")
		menu.add_child(paragraph(message))
		if boot_test:
			get_tree().quit(1)

func pause_game() -> void:
	if overlay.visible:
		if can_resume():
			resume_game()
	else:
		stop_all_vibration()
		clear_pending_inputs()
		show_page("home")

func resume_game() -> void:
	if not can_resume():
		return
	_close_open_popup()
	if preview: preview.stop()
	if current_page == "design":
		skater.apply_skin(current_skin())
	if current_page == "controller" and controller_dirty and not controller_profile.is_empty():
		apply_controller_profile()
	elif current_page == "settings":
		save_preferences()
	if link != null and link.operational:
		link.send("configure",{"options":{"steady":steady_choice if not steady_choice.is_empty() else null,"danceStyle":dance_style if not dance_style.is_empty() else null,"ghost":ghost_enabled}})
	clear_pending_inputs()
	paused_by_disconnect = false
	overlay.hide()
	if top_buttons: top_buttons.show()
	if hud_brand: hud_brand.show()
	if hud_edition: hud_edition.show()
	get_viewport().gui_release_focus()
	playing = true
	broadcast.show()
	apply_ghost(true)
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
	if frame.get("warmup") != null:
		var w: Dictionary = frame.warmup
		coach_title.text = "Warm-up"
		coach_tip.text = "Your group shares the ice before the program: %d skaters, each on their own line. Find your edges and your speed. The program starts when the warm-up ends." % w.skaters.size()
		coach_progress.text = "Pause to skip the warm-up"
		hud_time.text = "%02d:%02d" % [int(w.seconds)/60,int(w.seconds)%60]
	elif frame.routine != null:
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
		KEY_SLASH:
			if not overlay.visible:
				toggle_ghost(false)
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
	var joy := primary_joypad()
	active_joy = joy
	if not benchmark_hardware.is_empty() and scheme == 3:
		return {"hardware":benchmark_hardware}
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

func navigate_back() -> void:
	if current_page == "home":
		if can_resume(): resume_game()
	elif current_page == "music":
		timeline_edit({"action":"close"})
	elif current_page == "design":
		skater.apply_skin(current_skin())
		show_page("atelier")
	elif current_page == "atelier" or current_page == "skates":
		save_preferences()
		show_page("settings")
	elif current_page == "controller":
		leave_controller_page()
	elif current_page == "settings":
		save_preferences()
		show_page("home")
	elif current_page == "event":
		show_page("career")
	elif current_page in ["dance","showcase","create"]:
		show_page("creation")
	elif current_page == "newcareer":
		show_page("create")
	else:
		show_page("home")

func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton and event.pressed:
		if overlay.visible:
			if event.button_index == JOY_BUTTON_B:
				if not _close_open_popup():
					navigate_back()
				get_viewport().set_input_as_handled()
			elif event.button_index == JOY_BUTTON_START:
				if _has_open_file_dialog():
					_close_open_popup()
				elif can_resume():
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

# IceRunGameMode.cpp CountDebt: the same counters, the same log lines.
func count_debt(lost: float) -> void:
	debt_high = maxf(debt_high,tick_debt)
	if lost>0.0:
		debt_dropped += lost
		debt_frames += 1
		debt_episode += lost
	elif debt_episode>0.0:
		print("Tick debt: the clamp dropped %.1f sim ticks (%.0f ms of the program); %.1f this run, on %d frames." % [debt_episode,debt_episode*1000.0/120.0,debt_dropped,debt_frames])
		debt_episode = 0.0

func reset_debt() -> void:
	if debt_dropped>0.0:
		print("Tick debt: the last run lost %.1f sim ticks (%.0f ms of the program) on %d frames; highest debt %.1f of 12." % [debt_dropped,debt_dropped*1000.0/120.0,debt_frames,debt_high])
	debt_dropped = 0.0
	debt_frames = 0
	debt_high = 0.0
	debt_episode = 0.0

func _physics_process(dt: float) -> void:
	if not playing or link == null or not link.operational:
		tick_debt = 0.0
		return
	var owed := tick_debt+dt*120.0
	tick_debt = minf(12.0,owed)
	count_debt(owed-tick_debt)
	if link.busy():
		return
	var ticks := mini(12,int(tick_debt))
	if ticks<1:
		return
	tick_debt -= ticks
	var c := controls(dt)
	var joy := primary_joypad()
	var low := scheme != 3 and (pressed(KEY_U) or (joy >= 0 and pad(joy,JOY_BUTTON_DPAD_DOWN)))
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
	if probe_on: probe_tick()
	presentation_clock += dt
	# The kiss-and-cry has run its sequence: off the bench, onto the podium.
	if kiss_cry.finished:
		kiss_cry.clear()
		kiss_cry_done = true
		present_podium()
	skater.effects_active = playing
	if not frame.is_empty():
		wear_venue()
		update_camera(dt)
		if ghost_skater != null and ghost_skater.visible and ghost_label != null and ghost_label.visible:
			ghost_label.position = ghost_skater.position + Vector3(0.0, 2.22, 0.0)
		fill_audio()
		if coach_box: coach_box.visible = not overlay.visible
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
				# scripts/kiss_cry.gd: the bench first, its sequence played through, then the podium.
				if not kiss_cry.running or not kiss_cry.visible or skater.visible:
					push_error("Kiss-and-cry smoke test: running %s, visible %s" % [kiss_cry.running,kiss_cry.visible])
					get_tree().quit(1)
					return
				var reaction := str(frame.result.kissAndCry.reaction)
				var waited := 0.0
				while not kiss_cry_done and waited < 30.0:
					await get_tree().create_timer(.25).timeout
					waited += .25
				if not kiss_cry_done or kiss_cry.tracks.size() > 0:
					push_error("Kiss-and-cry smoke test: done %s after %.1f s" % [kiss_cry_done,waited])
					get_tree().quit(1)
					return
				print("GODOT_KISSCRY_PASS: on the bench, %s, then off after %.1f s" % [reaction,waited])
				# scripts/podium.gd: the event's top three, each in a model that loaded.
				if podium.places.size() != 3 or not podium.visible or skater.visible:
					push_error("Podium smoke test: %d on the podium, visible %s" % [podium.places.size(),podium.visible])
					get_tree().quit(1)
					return
				print("GODOT_PODIUM_PASS: ",", ".join(podium.places.map(func(p): return "%d %s (%s)" % [p.place,p.name,str(p.model).get_file()])))
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
	# A menu with requests still in flight is not idle. The kiss-and-cry and podium clips are baked on
	# request (motionTrack), and winding the clock back while they are out made THEM 20 s late, so the
	# link failed on the spot. That was this check, not the link: the host answers in ~90 ms. Let them land.
	var settle := Time.get_ticks_msec()
	while link.busy() and not link.faulted and Time.get_ticks_msec() - settle < 5000:
		OS.delay_msec(10)
		link._process(0.0)
	if link.busy():
		push_error("Link: replies still outstanding after 5 s: %s" % str(link.pending.values()))
		return false
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

## The event's top three on the podium, while the result is up: game/rivals.ts standings.
func present_podium() -> void:
	if frame.is_empty() or frame.get("result") == null or frame.result.get("standings") == null or not podium.places.is_empty():
		return
	var looks := {}
	for c in catalog.get("story",{}).get("cast",[]):
		if c.get("look") != null: looks[str(c.name)] = c.look
	if podium.present(frame.result.standings,looks,CHARACTERS[character].path,current_skin()) > 0:
		skater.visible = false
		# game/podium.ts: each place's clip, baked once by the bridge (motionTrack).
		for id in podium.wanted(frame.result.get("podium",[])):
			link.send("motionTrack",{"options":{"id":id}})

# scripts/podium.gd, with the menu out of the way: the champion, Remi, and you in third.
func capture_podium() -> void:
	var looks := {}
	for c in catalog.get("story",{}).get("cast",[]):
		if c.get("look") != null: looks[str(c.name)] = c.look
	var rows := [{"place":1,"name":"Teodora Wynn","you":false},{"place":2,"name":"Remi Castellan","you":false},{"place":3,"name":"You","you":true}]
	podium.present(rows,looks,CHARACTERS[character].path,current_skin())
	# game/podium.ts PODIUM_CLIPS, as a result's podium names them.
	for id in podium.wanted([{"place":1,"clip":"podium.wave"},{"place":2,"clip":"podium.flowers.mirror"},{"place":3,"clip":"podium.medal"}]):
		link.send("motionTrack",{"options":{"id":id}})
	skater.visible = false
	overlay.visible = false
	await get_tree().create_timer(3.0).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-podium.png")
	podium.clear()
	skater.visible = true
	overlay.visible = true

# tools/ice-lab/game/venues.ts: the arena wears the run's venue (the bridge's snapshot.venue).
# A string compare a frame; the room is rebuilt only when the venue changes.
var venue_hold := false   # set while the stills are taken, so live frames don't re-dress the arena
func wear_venue() -> void:
	if venue_hold:
		return
	var id := str(frame.get("venue","grand-prix"))
	if id == arena.venue_id:
		return
	for v in catalog.get("venues",[]):
		if str(v.id) == id:
			arena.apply_venue(v)
			return

func capture() -> void:
	if "--capture-venues" in OS.get_cmdline_user_args():
		# Every venue from the high camera and from the ice: docs/presentation/venues/.
		var dir := ProjectSettings.globalize_path("res://").path_join("../../docs/presentation/venues")
		DirAccess.make_dir_recursive_absolute(dir)
		overlay.visible = false
		ui.visible = false        # a clean still: no HUD
		playing = false           # and the skater held where she is, still gliding upright
		venue_hold = true
		for v in catalog.get("venues",[]):
			arena.apply_venue(v)
			for view in [1,3]:
				camera_mode = view
				await get_tree().create_timer(1.6).timeout
				await RenderingServer.frame_post_draw
				get_viewport().get_texture().get_image().save_png(dir.path_join("%s-%s.png" % [v.id,"high" if view == 1 else "ice"]))
			print("GODOT_VENUE_CAPTURE: ",v.id)
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	if "--capture-warmup" in OS.get_cmdline_user_args():
		# The group a few seconds in, from the follow camera and from the high one.
		await get_tree().create_timer(6.0).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-warmup.png")
		camera_mode = 1
		await get_tree().create_timer(2.0).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-warmup-high.png")
		print("GODOT_WARMUP_CAPTURE: %d in the group" % warmup_skaters.size())
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	if "--capture-telemetry" in OS.get_cmdline_user_args():
		# The computer skates a jump and a spin; a still when each element's card is up.
		start_game("showcase",0,false,{"character":"career","program":["glide","spin","jump","pose"]})
		var shown := {}
		for k in 150:
			await get_tree().create_timer(.5).timeout
			var card = frame.get("elementCard")
			if card != null and not shown.has(card.kind) and broadcast.card_time>1.0:
				shown[card.kind] = true
				await RenderingServer.frame_post_draw
				get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-card-%s.png" % card.kind)
				print("GODOT_CARD: %s %s" % [card.kind,card.name])
			if shown.size()>=2: break
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	if "--capture-pose" in OS.get_cmdline_user_args():
		# The closing pose as the demonstration skates it: the computer glides, then holds the pose; stills from three cameras.
		start_game("showcase",0,false,{"character":"career","program":["glide","pose"]})
		for k in 14:
			await get_tree().create_timer(1.0).timeout
			if frame.get("low",false): break
		await get_tree().create_timer(1.2).timeout
		for view in [0,1,3]:
			camera_mode = view
			await get_tree().create_timer(.8).timeout
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png("/tmp/edgework-godot-pose-%d.png" % view)
		print("GODOT_POSE_CAPTURE: low %s" % str(frame.get("low",false)))
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	playing = false
	if "--capture-intro" in OS.get_cmdline_user_args():
		# Career program with the intro before the music: mid-intro (with card & hint) and 1 s into the program.
		var dir := ProjectSettings.globalize_path("res://").path_join("../../docs/presentation/intro")
		DirAccess.make_dir_recursive_absolute(dir)
		start_game("career",0,false,{"warmup":false,"intro":true})
		for k in 30:
			await get_tree().create_timer(.1).timeout
			if frame.get("intro") != null: break
		await get_tree().create_timer(1.8).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(dir.path_join("mid-intro.png"))
		for k in 60:
			await get_tree().create_timer(.1).timeout
			if frame.get("intro") == null: break
		await get_tree().create_timer(1.0).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(dir.path_join("program-1s.png"))
		print("GODOT_INTRO_CAPTURE")
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	if "--capture-stepclips" in OS.get_cmdline_user_args():
		# Composer ['step'] in the real game: arms-only step.swing-roll over the skating.
		var dir := ProjectSettings.globalize_path("res://").path_join("../../docs/presentation/stepclips")
		DirAccess.make_dir_recursive_absolute(dir)
		start_game("composer",0,false,{"sequence":["step"],"intro":false})
		for k in 30:
			await get_tree().create_timer(.1).timeout
			if frame.get("motion") != null: break
		await get_tree().create_timer(.6).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(dir.path_join("step-swing-roll-1.png"))
		var m = frame.get("motion")
		var clip_id := str(m.get("clip","")) if m is Dictionary else ""
		await get_tree().create_timer(.9).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(dir.path_join("step-swing-roll-2.png"))
		print("GODOT_STEPCLIPS_CAPTURE: %s" % clip_id)
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
	if "--capture-podium" in OS.get_cmdline_user_args():
		await capture_podium()
		print("GODOT_CAPTURE_PASS")
		get_tree().quit()
		return
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
	await capture_podium()
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
	if podium.visible:
		# The podium, from the ice in front of it, drifting slowly side to side.
		desired = Vector3(sin(presentation_clock*.12)*1.1,1.45,6.4)
		look = Vector3(0,1.15,0)
		fov = 34
	elif overlay.visible:
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
	stop_all_vibration()
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
	if skating_setup not in ["simulation","explorer","experimental","diggate","repertoire"]:
		skating_setup = ""
	assistance = clampf(float(saved.get("assistance",.75)),.5,1)
	steady_choice = str(saved.get("steady",""))
	dance_style = str(saved.get("danceStyle",""))
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
	# Optional: a save from before skates has none, and the engine reads anything off the lists as today's look.
	if saved.get("skates") is Dictionary:
		skates = saved.skates
	cruise = bool(saved.get("cruise",true))
	ghost_enabled = bool(saved.get("ghost",false))
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
	var persisted_profile := controller_profile if not controller_profile.is_empty() else saved_controller_profile
	var file := FileAccess.open(settings_path,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"setup":skating_setup,"assistance":assistance,"steady":steady_choice,"danceStyle":dance_style,"beginner":beginner,"scheme":scheme,"controllerProfile":persisted_profile,"track":track,"profile":profile,"character":character,"costume":costume,"skates":skates,"cruise":cruise,"ghost":ghost_enabled,"music":music_enabled,"rumble":rumble_enabled,"paddles":paddle_layout,"sequence":sequence}))
	else:
		on_error("Preferences could not be saved.")
