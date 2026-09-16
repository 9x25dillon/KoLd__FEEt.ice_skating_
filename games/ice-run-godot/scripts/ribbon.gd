extends Control
var lean := 0.0
var knee := 0.0
var edge := ""

func _draw() -> void:
	var center := Vector2(size.x*.5,size.y-32)
	var points := PackedVector2Array()
	for i in range(61):
		var x := (float(i)/60.0-.5)*210
		points.append(center+Vector2(x,-lean*x*x*.009))
	draw_polyline(points,Color("b1cbd3"),1.8+absf(lean)*2,true)
	draw_circle(center+Vector2((knee-.5)*210,-lean*pow((knee-.5)*210,2)*.009),3,Color("e0c6a0"))
	var font := ThemeDB.fallback_font
	draw_string(font,center+Vector2(-60,23),edge,HORIZONTAL_ALIGNMENT_CENTER,120,11,Color("99acb8"))

func update_state(frame: Dictionary) -> void:
	lean = float(frame.state.lean)
	knee = float(frame.state.knee)
	edge = "  /  ".join(frame.edge)
	queue_redraw()
