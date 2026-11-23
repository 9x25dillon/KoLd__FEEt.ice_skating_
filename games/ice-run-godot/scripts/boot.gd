extends Control
## A 2D boot screen that draws before the 3D game exists.
## On a graphics card's first launch Godot builds its Vulkan pipelines (measured 2026-11-23 on the
## RTX 2080 SUPER: ~10 s to the menu with a cold cache, ~3 s warm). That cache is per GPU and driver,
## so it can't ship with the game. This screen is what stays on screen while it builds, instead of a
## black or frozen window.

const MAIN := "res://scenes/main.tscn"

const WARM_MARKER := "user://pipelines-warm.txt"

## Godot makes user://vulkan and writes ~3 MB of its own pipelines before any script runs, so the
## cache folder says nothing. main.gd writes this marker once the menu is up; it names the GPU and
## driver, so a new card or driver counts as a first launch again.
static func warm_key() -> String:
	return "%s|%s|%s" % [RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_api_version(), ProjectSettings.get_setting("rendering/renderer/rendering_method")]

static func pipelines_cached() -> bool:
	return FileAccess.file_exists(WARM_MARKER) and FileAccess.get_file_as_string(WARM_MARKER).strip_edges() == warm_key()

static func mark_pipelines_warm() -> void:
	if DisplayServer.get_name() == "headless" or pipelines_cached(): return
	var f := FileAccess.open(WARM_MARKER, FileAccess.WRITE)
	if f != null: f.store_string(warm_key() + "\n")

func _ready() -> void:
	var first_launch := not pipelines_cached()
	var cover := CanvasLayer.new()
	cover.layer = 120
	add_child(cover)
	var bg := ColorRect.new()
	bg.color = Color(.035,.06,.09)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	cover.add_child(bg)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.grow_horizontal = Control.GROW_DIRECTION_BOTH
	box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	cover.add_child(box)
	var title := Label.new()
	title.text = "EDGEWORK"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_override("font", load("res://assets/fonts/title.ttf"))
	title.add_theme_font_size_override("font_size", 64)
	title.add_theme_color_override("font_color", Color("d5c29a"))
	box.add_child(title)
	var status := Label.new()
	# ASCII only: the UI font fallback is set up later by main.gd, and a missing glyph here
	# would send Godot on a system font scan before the first frame.
	status.text = ("Preparing the ice for this graphics card.\nThe first launch takes about ten seconds; after that it starts in a few."
		if first_launch else "Loading the rink...")
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.add_theme_font_size_override("font_size", 20)
	status.add_theme_color_override("font_color", Color("c5b08e"))
	box.add_child(status)
	# Present the boot frame (twice, for a swapchain that is double-buffered) before the heavy load.
	# Headless never draws, so frame_post_draw would never fire there.
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
	else:
		await get_tree().process_frame
	if "--startup-probe" in OS.get_cmdline_user_args():
		print("BOOT_PROBE first_frame_ms=%d first_launch=%s" % [Time.get_ticks_msec(), first_launch])
		if DisplayServer.get_name() != "headless":
			get_viewport().get_texture().get_image().save_png("user://boot-probe.png")
	# The game goes in beside this screen rather than replacing it: on a cold cache its first menu
	# frame compiles for ~3 s more (2026-11-23), and the cover stays up until that frame has drawn.
	var game: Node = load(MAIN).instantiate()
	get_tree().root.add_child(game)
	get_tree().current_scene = game
	if DisplayServer.get_name() != "headless":
		var started := Time.get_ticks_msec()
		while (game.get("frame") as Dictionary).is_empty() and Time.get_ticks_msec() - started < 60000:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
	queue_free()

# While the cover is up, presses must not reach a menu the player cannot see yet.
func _input(event: InputEvent) -> void:
	if not (event is InputEventMouseMotion):
		get_viewport().set_input_as_handled()
