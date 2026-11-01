extends RefCounted
# Ice Lab's plan view has +y to the left of +x, anticlockwise positive; Godot's
# ground plane has +z to the right of +x. Every sim position and direction
# reaches the world through here, so left stays left: a left blade under the
# left leg, a left stick curving left on screen, and rotation.y following
# the sim's anticlockwise angles. The sheet's centre is at sim y = 18.
const RINK_CENTRE_Y := 18.0

static func point(x, y, height := 0.0) -> Vector3:
	return Vector3(float(x),height,RINK_CENTRE_Y-float(y))

static func direction(x, y) -> Vector3:
	return Vector3(float(x),0,-float(y))

# The rotation.y that points an actor's -Z along a sim direction.
static func yaw(x, y) -> float:
	return atan2(-float(x),float(y))
