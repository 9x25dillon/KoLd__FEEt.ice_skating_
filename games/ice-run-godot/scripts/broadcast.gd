extends Control
# The presentation reads the solver; none of these meters alters skating.
var data: Dictionary = {}
var setup_name := "BLADE EXPLORER"
var camera_name := "TRACKING"
var announcement := ""
var announcement_detail := ""
var announce_time := 0.0
var rink_path := PackedVector2Array()
var last_tick := -1
const INK := Color(.035,.065,.10,.9)
const WHITE := Color("e5edf0")
const MUTED := Color("9fb6c3")
const GOLD := Color("d9bc84")
var font: Font

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font = ThemeDB.fallback_font

func update_state(frame: Dictionary, setup: String, camera: String) -> void:
	data = frame
	setup_name = setup.replace("_"," ").to_upper()
	camera_name = camera
	var tick := int(frame.state.tick)
	if tick < last_tick: rink_path.clear()
	if tick != last_tick and tick%8<3:
		rink_path.append(Vector2(frame.state.pos.x,float(frame.state.pos.y)-18))
		if rink_path.size()>900: rink_path.remove_at(0)
	last_tick = tick
	queue_redraw()

func announce(title: String, detail: String) -> void:
	announcement = title
	announcement_detail = detail
	announce_time = 3.5

func _process(dt: float) -> void:
	if announce_time>0:
		announce_time = maxf(0,announce_time-dt)
		queue_redraw()

func text(at: Vector2, value: String, height: int = 14, color: Color = WHITE) -> void:
	draw_string(font,at,value,HORIZONTAL_ALIGNMENT_LEFT,-1,height,color)

func plate(rect: Rect2, accent: bool = false) -> void:
	draw_rect(rect,INK)
	draw_line(rect.position,rect.position+Vector2(rect.size.x,0),GOLD if accent else Color(.4,.6,.7,.35),2)

func _draw() -> void:
	if data.is_empty() or font == null: return
	var s: Dictionary = data.state
	var bottom := size.y-32
	var speed := Vector2(s.vel.x,s.vel.y).length()*3.6
	plate(Rect2(32,bottom-142,342,142),true)
	text(Vector2(48,bottom-121),"WIND",9,MUTED)
	draw_rect(Rect2(83,bottom-129,105,3),Color("30424f"))
	draw_rect(Rect2(83,bottom-129,105*clampf(float(s.get("wind",1)),0,1),3),WHITE)
	text(Vector2(210,bottom-121),"LEGS",9,MUTED)
	draw_rect(Rect2(245,bottom-129,110,3),Color("30424f"))
	draw_rect(Rect2(245,bottom-129,110*clampf(float(s.get("legs",1)),0,1),3),GOLD)
	text(Vector2(48,bottom-87),"EDGEWORK  /  "+str(data.mode).to_upper(),11,GOLD)
	text(Vector2(48,bottom-55),str(data.move).to_upper(),20)
	text(Vector2(48,bottom-28),"TES  %.2f" % float(data.get("technical",0)),16)
	text(Vector2(224,bottom-28),"%04.1f  KM/H" % speed,16,MUTED)
	text(Vector2(48,bottom-10),setup_name+"   /   "+camera_name,9,MUTED)
	# The two bars are actual left/right support loads; the needle is actual knee load.
	plate(Rect2(size.x*.5-143,bottom-70,286,70))
	for i in 2:
		var x := size.x*.5-126+i*142
		var weight := clampf(float(s.blade[i].weight),0,1)
		text(Vector2(x,bottom-47),("L  " if i==0 else "R  ")+str(data.edge[i]),11,MUTED)
		draw_rect(Rect2(x,bottom-35,120,3),Color("30424f"))
		draw_rect(Rect2(x,bottom-35,120*weight,3),GOLD)
	text(Vector2(size.x*.5-126,bottom-13),"KNEE",9,MUTED)
	draw_rect(Rect2(size.x*.5-86,bottom-21,206,3),Color("30424f"))
	draw_rect(Rect2(size.x*.5-86,bottom-21,206*clampf(float(s.knee),0,1),3),WHITE)
	# Rink navigator preserves the unusual rounded-square physical boundary.
	var map_pos := Vector2(size.x-118,bottom-81)
	plate(Rect2(size.x-210,bottom-182,178,182))
	text(Vector2(size.x-194,bottom-159),"YOUR LINE",10,GOLD)
	var outline := PackedVector2Array()
	for corner in 4:
		var center := Vector2(19 if corner in [0,3] else -19,19 if corner<2 else -19)
		for j in 25:
			var a := float(corner)*PI*.5+float(j)*PI/48
			outline.append(map_pos+(center+Vector2(cos(a),sin(a))*9)*2.12)
	outline.append(outline[0])
	draw_polyline(outline,Color("647e91"),1,true)
	if rink_path.size()>1:
		var points := PackedVector2Array()
		for p in rink_path: points.append(map_pos+p*2.12)
		draw_polyline(points,Color(.6,.77,.83,.4),1,true)
	var current := map_pos+Vector2(s.pos.x,float(s.pos.y)-18)*2.12
	draw_circle(current,3,GOLD)
	draw_line(current,current+Vector2(s.heading.x,s.heading.y)*9,WHITE,1.5,true)
	if int(data.get("spinLevel",-1))>=0:
		text(Vector2(48,bottom-157),"LAST SPIN  /  LEVEL "+("B" if int(data.spinLevel)==0 else str(data.spinLevel)),12,GOLD)
	if announce_time>0:
		var x := size.x*.5-190
		plate(Rect2(x,105,380,77),true)
		text(Vector2(x+20,135),announcement,22,GOLD)
		text(Vector2(x+20,163),announcement_detail,13)
