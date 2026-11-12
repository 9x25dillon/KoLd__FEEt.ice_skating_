extends Control
## The demonstration's controller (2026-11-12, the owner's ask): an opaque pad on screen showing
## what the computer's hands are doing while it skates, through the same Simulation mapping a
## player uses (game/pilot.ts, sent as frame.pilotPad). Draws what it is handed; decides nothing.

const PANEL := Color(0.035, 0.06, 0.095, 0.97)
const BODY := Color(0.10, 0.15, 0.21, 1.0)
const WELL := Color(0.05, 0.08, 0.12, 1.0)
const EDGE := Color(0.40, 0.82, 0.77, 1.0)
const DIM := Color(0.38, 0.46, 0.53, 1.0)
const INK := Color(0.90, 0.94, 0.96, 1.0)
const FACE := {0: Color("4fd47a"), 1: Color("f0645a"), 2: Color("5aa0f0"), 3: Color("f2c84b")}
## What each control does in Simulation (game/setups.ts, the pilot's mapping), for the legend.
const ROLE := {0: "A  push · get up", 1: "B  three-turn", 3: "Y  spin", 6: "LT  left knee", 7: "RT  right knee", 10: "L3  toe · load", 11: "R3", 4: "LB", 5: "RB"}

var pad: Dictionary = {}
var font: Font

func _ready() -> void:
	font = ThemeDB.fallback_font
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

## The frame's pilotPad, or null: shows and hides itself.
func update_pad(next) -> void:
	visible = next != null
	pad = next if next != null else {}
	queue_redraw()

func _b(i: int) -> float:
	var buttons: Array = pad.get("buttons",[])
	return float(buttons[i]) if i < buttons.size() else 0.0

func _ax(i: int) -> float:
	var axes: Array = pad.get("axes",[])
	return float(axes[i]) if i < axes.size() else 0.0

func _text(pos: Vector2, text: String, size: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(font, pos, text, align, width, size, color)

func _stick(c: Vector2, x: float, y: float, clicked: bool, name: String) -> void:
	draw_circle(c, 40.0, WELL)
	draw_arc(c, 40.0, 0.0, TAU, 48, EDGE if clicked else DIM, 3.0 if clicked else 1.5)
	var moved := Vector2(x, y).length() > 0.05
	var dot := c + Vector2(x, y) * 26.0
	if moved:
		draw_line(c, dot, Color(EDGE, 0.6), 3.0)
	draw_circle(dot, 15.0, EDGE if moved or clicked else Color(0.55, 0.62, 0.68))
	_text(c + Vector2(-40, 62), name, 13, INK if moved or clicked else DIM, HORIZONTAL_ALIGNMENT_CENTER, 80.0)

func _trigger(r: Rect2, value: float, name: String) -> void:
	draw_rect(r, WELL)
	draw_rect(Rect2(r.position + Vector2(0, r.size.y * (1.0 - value)), Vector2(r.size.x, r.size.y * value)), EDGE)
	draw_rect(r, EDGE if value > 0.05 else DIM, false, 1.5)
	_text(r.position + Vector2(0, -6), "%s %d%%" % [name, roundi(value * 100)], 13, INK if value > 0.05 else DIM)

func _face(c: Vector2, i: int, label: String) -> void:
	var on := _b(i) > 0.5
	var col: Color = FACE[i]
	if on:
		draw_circle(c, 22.0, Color(col, 0.35))
	draw_circle(c, 16.0, col if on else Color(col, 0.22))
	draw_arc(c, 16.0, 0.0, TAU, 32, col, 2.0)
	_text(c + Vector2(-16, 6), label, 16, Color(0.05, 0.08, 0.1) if on else col, HORIZONTAL_ALIGNMENT_CENTER, 32.0)

func _draw() -> void:
	if pad.is_empty():
		return
	var w := size.x
	var h := size.y
	# The opaque card, with the mode's teal along its top.
	draw_rect(Rect2(Vector2.ZERO, size), PANEL)
	draw_rect(Rect2(0, 0, w, 4), EDGE)
	_text(Vector2(18, 30), "THE COMPUTER'S HANDS  ·  SIMULATION", 13, EDGE)
	_text(Vector2(18, 58), str(pad.get("doing","")), 18, INK, HORIZONTAL_ALIGNMENT_LEFT, w - 36.0)
	# The controller body.
	var top := 96.0
	var body := Rect2(40, top + 24, w - 80, h - top - 92)
	draw_rect(body, BODY)
	draw_circle(body.position + Vector2(10, body.size.y - 10), 46.0, BODY)
	draw_circle(body.position + Vector2(body.size.x - 10, body.size.y - 10), 46.0, BODY)
	# Triggers and bumpers over its shoulders.
	_trigger(Rect2(body.position.x + 14, top - 4, 34, 26), _b(6), "LT")
	_trigger(Rect2(body.end.x - 48, top - 4, 34, 26), _b(7), "RT")
	draw_rect(Rect2(body.position.x + 56, top + 8, 70, 12), EDGE if _b(4) > 0.5 else DIM)
	draw_rect(Rect2(body.end.x - 126, top + 8, 70, 12), EDGE if _b(5) > 0.5 else DIM)
	var mid := body.position.y + body.size.y * 0.42
	# Left stick and the face buttons on the upper row; D-pad and right stick below, as an Xbox pad lays them.
	_stick(Vector2(body.position.x + 70, mid), _ax(0), _ax(1), _b(10) > 0.5, "L stick · L3")
	var fx := body.end.x - 70
	_face(Vector2(fx, mid + 30), 0, "A")
	_face(Vector2(fx + 30, mid), 1, "B")
	_face(Vector2(fx - 30, mid), 2, "X")
	_face(Vector2(fx, mid - 30), 3, "Y")
	var d := Vector2(body.position.x + body.size.x * 0.36, mid + 52)
	for dir in [[12, Vector2(0, -16)], [13, Vector2(0, 16)], [14, Vector2(-16, 0)], [15, Vector2(16, 0)]]:
		draw_rect(Rect2(d + dir[1] - Vector2(8, 8), Vector2(16, 16)), EDGE if _b(dir[0]) > 0.5 else DIM)
	_stick(Vector2(body.position.x + body.size.x * 0.64, mid + 52), _ax(2), _ax(3), _b(11) > 0.5, "R stick · R3")
	# The legend: every control in use this moment, and what it does.
	var used := PackedStringArray()
	for i in [0, 1, 3, 6, 7, 10, 4, 5, 11]:
		if _b(i) > 0.05: used.append(str(ROLE[i]))
	if absf(_ax(0)) > 0.05 or absf(_ax(2)) > 0.05:
		used.insert(0, "Sticks  lean · %s" % ("right" if _ax(0) > 0 else "left"))
	_text(Vector2(18, h - 22), "   ·   ".join(used) if not used.is_empty() else "Hands off: the skater glides", 14, INK if not used.is_empty() else DIM, HORIZONTAL_ALIGNMENT_LEFT, w - 36.0)
