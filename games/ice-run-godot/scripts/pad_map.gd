## Godot takes its gamepad buttons from SDL's gamepad layer, and SDL's mapping for a wired Elite 2 has no
## paddles, so they never reach the game though the kernel reports them (xpad: BTN_GRIPL, GRIPR, GRIPL2, GRIPR2).
## Input.add_joy_mapping is no help: it applies on top of SDL's output, and it scrambled the standard buttons.
## SDL reads its config only as it starts, so the game relaunches itself once with SDL_GAMECONTROLLERCONFIG set.
##
## Measured on the owner's pad 2026-11-01 (tools/pad_check.gd, default profile, Godot 4.7.2):
##   top-right  BTN_GRIPR   b12  JOY_BUTTON_PADDLE1
##   top-left   BTN_GRIPL   b11  JOY_BUTTON_PADDLE2
##   bottom-right BTN_GRIPR2 b14 JOY_BUTTON_PADDLE3
##   bottom-left  BTN_GRIPL2 b13 JOY_BUTTON_PADDLE4
## A stored Xbox Accessories profile remaps paddles on the controller: they then arrive as ordinary buttons.
class_name PadMap

const CONFIG_VAR := "SDL_GAMECONTROLLERCONFIG"
const ELITE_VENDOR := 1118
const ELITE_WIRED_PRODUCT := 2816
const ELITE_MAPPING := "a:b0,b:b1,x:b2,y:b3,back:b6,guide:b8,start:b7,leftstick:b9,rightstick:b10,leftshoulder:b4,rightshoulder:b5,dpup:h0.1,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,leftx:a0,lefty:a1,rightx:a3,righty:a4,lefttrigger:a2,righttrigger:a5,paddle1:b12,paddle2:b11,paddle3:b14,paddle4:b13,platform:Linux,"
## The sim's paddle layer (game/full-controls.ts PADDLE_POSITIONS) by Godot's paddle: 18 top-right, 19 bottom-right, 20 top-left, 21 bottom-left.
const LAYER_BUTTON := {JOY_BUTTON_PADDLE1:18,JOY_BUTTON_PADDLE2:20,JOY_BUTTON_PADDLE3:19,JOY_BUTTON_PADDLE4:21}

static func wired_elite(joy: int) -> bool:
	var info := Input.get_joy_info(joy)
	return int(info.get("vendor_id",0)) == ELITE_VENDOR and int(info.get("product_id",0)) == ELITE_WIRED_PRODUCT

static func paddles_mapped() -> bool:
	return OS.get_environment(CONFIG_VAR).contains("paddle1")

## Relaunches with the config for this pad's own GUID, so a new firmware version keeps its paddles.
## Returns true if a new process took over and this one should quit. Linux only: the raw numbers are evdev's.
static func relaunch_for_paddles() -> bool:
	if OS.get_name() != "Linux" or paddles_mapped():
		return false
	for joy in Input.get_connected_joypads():
		if wired_elite(joy):
			var line := "%s,%s,%s" % [Input.get_joy_guid(joy),Input.get_joy_name(joy),ELITE_MAPPING]
			var existing := OS.get_environment(CONFIG_VAR)
			OS.set_environment(CONFIG_VAR,line if existing.is_empty() else existing+"\n"+line)
			return OS.create_process(OS.get_executable_path(),OS.get_cmdline_args()) > 0
	return false
