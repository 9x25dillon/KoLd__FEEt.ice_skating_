extends RefCounted
# How the tracking camera frames what the skater is doing: a judge has to be
# able to read the blade, so these change the distance and aim, and never add a
# flourish. Eased by whoever uses them, so moves do not cut between framings.
const NONE := {"away":4.7,"height":.9,"aim":.9,"lead":.6}
const AIR := {"away":5.8,"height":1.2,"aim":1.15,"lead":.3} # headroom, and the ice still in frame
const LOAD := {"away":4.5,"height":.8,"aim":.8,"lead":.5}
const FOOTWORK := {"away":3.7,"height":.5,"aim":.55,"lead":.35} # low, for blade placement
const SPIN := {"away":4.1,"height":.7,"aim":.95,"lead":0.0} # steady, with room for the arms and skirt
const LINE := {"away":4.4,"height":.7,"aim":.8,"lead":.4} # spiral and Ina Bauer: the whole body's line

static func framing(state: Dictionary) -> Dictionary:
	var phase := int(state.jump.phase)
	if phase == 2: return AIR
	if phase == 1: return LOAD
	match int(state.move):
		1,2: return FOOTWORK
		3: return SPIN
		4,5: return LINE
	return NONE

static func blend(from: Dictionary, to: Dictionary, amount: float) -> Dictionary:
	var out := {}
	for key in from:
		out[key] = lerpf(from[key],to[key],amount)
	return out
