const mac_strikes = @import("strike_trace.zig");

fn macRayContact(actor: *const Unit, aim: [2]f64, cell: Cell) ?[2]f64 {
    var ray: Ray = undefined;
    traceRayInto(&ray, actor.pos_x, actor.pos_y, aim[0], aim[1]);
    for (ray.items[0..ray.len]) |crossing| {
        if (crossing.cell.x == cell.x and crossing.cell.y == cell.y) return .{ crossing.x, crossing.y };
    }
    return null;
}

fn macTraceShot(s: *const State, ai: u8, target: ?u8, cell: Cell, aim: [2]f64, area: bool) void {
    if (!mac_strikes.active(s)) return;
    const actor = &s.units[ai];
    const splash: ?mac_strikes.Splash = if (area or isSplashShooter(actor))
        .{ .center = cell, .single = !area and wingshieldOwner(&s.units[target.?]) }
    else
        null;
    mac_strikes.begin(s, .shot, .{
        .target = target,
        .end = if (splash == null) macRayContact(actor, aim, cell) orelse aim else null,
        .splash = splash,
    });
}

fn macTraceThroughShot(s: *const State, ai: u8, g: *const Groups, aim: [2]f64) void {
    if (!mac_strikes.active(s)) return;
    const actor = &s.units[ai];
    var end = g.obstacle orelse projectLineToFieldEdge(actor.pos_x, actor.pos_y, aim[0], aim[1]);
    var primary: ?u8 = null;
    for (0..g.n) |index| {
        const slot = g.first(index);
        const target = &s.units[slot];
        if (target.isDead()) continue;
        if (primary == null) primary = slot;
        if (wingshieldOwner(target)) {
            const cell = g.entry[index];
            end = engine.positionForCell(@floatFromInt(cell.x), @floatFromInt(cell.y));
            break;
        }
    }
    mac_strikes.begin(s, .shot, .{ .target = primary, .end = end, .piercing = true });
    const dx = end[0] - actor.pos_x;
    const dy = end[1] - actor.pos_y;
    const distance_squared = dx * dx + dy * dy;
    if (distance_squared == 0 or primary == null) return;
    var ray: Ray = undefined;
    traceRayInto(&ray, actor.pos_x, actor.pos_y, end[0], end[1]);
    for (0..g.n) |index| {
        const slot = g.first(index);
        if (s.units[slot].isDead()) continue;
        const cell = g.entry[index];
        for (ray.items[0..ray.len]) |crossing| {
            if (crossing.cell.x != cell.x or crossing.cell.y != cell.y) continue;
            const distance = (crossing.x - actor.pos_x) * dx + (crossing.y - actor.pos_y) * dy;
            mac_strikes.rayContact(s, slot, std.math.clamp(distance / distance_squared, 0, 1));
            break;
        }
        if (wingshieldOwner(&s.units[slot])) break;
    }
}

fn macTraceObstacle(s: *const State, ai: u8, cell: Cell, aim: [2]f64) void {
    if (!mac_strikes.active(s)) return;
    const end = macRayContact(&s.units[ai], aim, cell) orelse
        engine.positionForCell(@floatFromInt(cell.x), @floatFromInt(cell.y));
    mac_strikes.begin(s, .obstacle_shot, .{ .cell = cell, .end = end });
}
