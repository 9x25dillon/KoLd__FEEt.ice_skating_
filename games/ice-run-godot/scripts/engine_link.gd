extends Node
signal received(op: String, data: Dictionary)
signal failed(message: String)
var pipe: FileAccess
var error_pipe: FileAccess
var process_id := -1
var serial := 0
var pending: Dictionary = {}
var buffer := PackedByteArray()
var last_reply := 0
var operational := false
var faulted := false

func _ready() -> void:
	var node_path := OS.get_environment("ICE_RUN_NODE")
	if node_path.is_empty():
		node_path = "node"
	var host := ProjectSettings.globalize_path("res://bridge/host.mjs")
	if not OS.has_feature("editor"):
		host = OS.get_executable_path().get_base_dir().path_join("bridge/host.mjs")
	if not FileAccess.file_exists(host):
		fail("Game runtime is missing. Run tools/prepare.mjs before starting.")
		return
	var save_dir := OS.get_user_data_dir()
	if "--smoke-test" in OS.get_cmdline_user_args() or "--capture" in OS.get_cmdline_user_args():
		save_dir = save_dir.path_join("test-runs/%d" % OS.get_process_id())
	var task := OS.execute_with_pipe(node_path, [host, save_dir], false)
	if task.is_empty():
		fail("Ice Lab could not start. Install Node 26 or set ICE_RUN_NODE to its executable.")
		return
	pipe = task.stdio
	error_pipe = task.stderr
	process_id = task.pid
	last_reply = Time.get_ticks_msec()
	send("hello")

func send(op: String, payload: Dictionary = {}) -> void:
	if pipe == null or faulted:
		return
	serial += 1
	payload = payload.duplicate()
	payload.op = op
	payload.id = serial
	pending[serial] = op
	pipe.store_buffer((JSON.stringify(payload) + "\n").to_utf8_buffer())
	if pipe.get_error() != OK:
		fail("The skating engine stopped accepting input. Restart the game.")

func busy() -> bool:
	return not pending.is_empty()

func _process(_dt: float) -> void:
	if pipe == null or faulted:
		return
	var chunk := pipe.get_buffer(65536)
	if not chunk.is_empty():
		buffer.append_array(chunk)
		while true:
			var end := buffer.find(10)
			if end < 0:
				break
			var line := buffer.slice(0, end).get_string_from_utf8()
			buffer = buffer.slice(end + 1)
			var value = JSON.parse_string(line)
			if not value is Dictionary:
				fail("Invalid engine response.")
				return
			var op: String = pending.get(int(value.get("id", 0)), "")
			pending.erase(int(value.get("id", 0)))
			last_reply = Time.get_ticks_msec()
			if not value.get("ok", false):
				failed.emit(str(value.get("error", "Engine command failed")))
				continue
			operational = true
			if value.get("saveError") != null:
				failed.emit(str(value.saveError))
			received.emit(op, value.data)
	if buffer.size() > 1048576:
		fail("Engine response exceeded its limit.")
	elif busy() and Time.get_ticks_msec() - last_reply > 10000:
		var details := error_pipe.get_buffer(4096).get_string_from_utf8()
		fail("Ice Lab did not respond. " + details.left(400))

func fail(message: String) -> void:
	faulted = true
	operational = false
	failed.emit(message)

func _exit_tree() -> void:
	if pipe:
		pipe.close()
		pipe = null
	if error_pipe:
		error_pipe.close()
		error_pipe = null
	if process_id > 0 and OS.is_process_running(process_id):
		OS.kill(process_id)
