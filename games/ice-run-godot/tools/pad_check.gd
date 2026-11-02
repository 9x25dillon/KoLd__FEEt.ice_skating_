## Which physical control reaches Godot as what. Windowed, because joypads need a real display server:
##   godot4 --path games/ice-run-godot --script res://tools/pad_check.gd -- --out=/tmp/pad-check.jsonl
## Asks for each control in turn, and logs every joypad event with what it was asked for.
extends SceneTree

const ASK := ["A, to begin","TOP-RIGHT paddle","BOTTOM-RIGHT paddle","TOP-LEFT paddle","BOTTOM-LEFT paddle","LB","RB"]
const WAIT := 25.0
const NAMED_PADDLES := [JOY_BUTTON_PADDLE1,JOY_BUTTON_PADDLE2,JOY_BUTTON_PADDLE3,JOY_BUTTON_PADDLE4]
var out: FileAccess
var label: Label
var index := 0
var left := WAIT
var seen := false

func _initialize() -> void:
	var path := "/tmp/pad-check.jsonl"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="): path = arg.substr(6)
	out = FileAccess.open(path,FileAccess.WRITE)
	for j in Input.get_connected_joypads():
		write({"sdlConfig":OS.get_environment("SDL_GAMECONTROLLERCONFIG").length()>0})
		write({"joy":j,"name":Input.get_joy_name(j),"guid":Input.get_joy_guid(j),"known":Input.is_joy_known(j)})
	label = Label.new()
	label.add_theme_font_size_override("font_size",34)
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(label)
	root.gui_embed_subwindows = true
	Input.joy_connection_changed.connect(func(d,c):write({"connection":c,"joy":d}))
	root.window_input.connect(on_input)
	show_prompt()

func write(entry: Dictionary) -> void:
	entry["asked"] = ASK[index] if index<ASK.size() else "done"
	out.store_line(JSON.stringify(entry))
	out.flush()

func show_prompt() -> void:
	label.text = "Done. You can close this." if index>=ASK.size() else "Press and release:\n%s\n\n(%d of %d, moves on by itself)" % [ASK[index],index+1,ASK.size()]

func on_input(event: InputEvent) -> void:
	if event is InputEventJoypadButton:
		write({"button":event.button_index,"pressed":event.pressed})
		# A paddle prompt waits for a paddle, so a stray button does not lose it.
		var wanted: bool = event.button_index in NAMED_PADDLES if ASK[mini(index,ASK.size()-1)].contains("paddle") else true
		if not event.pressed and seen and wanted: advance()
		elif event.pressed and wanted: seen = true
		elif event.pressed: label.text = "That was not a paddle (button %d).\n\n%s" % [event.button_index,ASK[index]]

func advance() -> void:
	index += 1; left = WAIT; seen = false
	show_prompt()
	if index>=ASK.size():
		create_timer(1.5).timeout.connect(quit)

func _process(dt: float) -> bool:
	if index>=ASK.size(): return false
	left -= dt
	if left<=0:
		write({"timeout":true})
		advance()
	return false
