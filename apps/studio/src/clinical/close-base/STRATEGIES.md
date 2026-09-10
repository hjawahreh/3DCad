# Strategies

Close Base does not invent kernel operations. Each strategy maps to a certified Geometry Services contract:

## Plane-based (`plane`)

- Family: `offset`
- Operation: `uniform`
- Payload: height, thickness, margin, planeNormal, orientation
- Meaning: offset a planar slab under the model

## Surface-derived (`surface`)

- Family: `repair`
- Operation: `fill-holes`
- Payload: thickness, margin, smoothing
- Meaning: close open scan surface as a base

Smoothing is passed as payload policy only. Sequential remesh after fill-holes would require a second Operation Runtime session; CLN-007 commits **one** Geometry Services call per accept.
