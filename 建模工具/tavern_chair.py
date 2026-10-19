"""Shared tavern-hall chair geometry.

Both the tavern and the upstairs rooms use this builder so the guest-room
writing chair is the same chair players already see in the hall.
"""


def tavern_chair(box, x, z, face="north", high=False):
    def b(dx, y, dz, w, h, d, color):
        corners = [(dx, dz), (dx + w, dz), (dx + w, dz + d), (dx, dz + d)]

        def rotate(a, e):
            if face == "east":
                return -e, a
            if face == "west":
                return e, -a
            if face == "south":
                return -a, -e
            return a, e

        pts = [rotate(*point) for point in corners]
        xs = [point[0] for point in pts]
        zs = [point[1] for point in pts]
        box(x + min(xs), y, z + min(zs), max(xs) - min(xs), h, max(zs) - min(zs), color)

    seat = 0.64 if high else 0.36
    for dx, dz in [(-0.2, -0.2), (0.16, -0.2), (-0.2, 0.16), (0.16, 0.16)]:
        b(dx, 0, dz, 0.08, seat, 0.08, "walnut")
    b(-0.24, seat, -0.24, 0.48, 0.08, 0.48, "oakLight")
    b(-0.2, seat + 0.08, -0.2, 0.4, 0.04, 0.4, "oak")
    for xx in [-0.12, 0, 0.12]:
        b(xx, seat + 0.08, -0.16, 0.04, 0.04, 0.32, "oakGrain")
    for dz in [-0.16, 0.12]:
        b(-0.2, 0.2, dz, 0.4, 0.04, 0.04, "walnut")
    if not high:
        for dx in [-0.24, 0.16]:
            b(dx, seat + 0.08, 0.16, 0.08, 0.44, 0.08, "walnut")
        for yy in [seat + 0.16, seat + 0.32, seat + 0.48]:
            b(-0.16, yy, 0.16, 0.32, 0.08, 0.08, "oak")
