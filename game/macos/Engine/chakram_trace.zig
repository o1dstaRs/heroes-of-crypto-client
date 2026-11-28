const std = @import("std");
const st = @import("state.zig");
const engine = @import("engine.zig");
const petrification = @import("petrification_trace.zig");

const max_contacts = 6; // Five targets plus a terminal shield.

const Route = struct {
    cells: [4]st.Cell = undefined,
    len: usize = 0,

    pub fn jsonStringify(self: *const Route, writer: anytype) !void {
        try writer.write(self.cells[0..self.len]);
    }
};

const Contact = struct {
    target: u8,
    kind: enum { hit, miss, shield },
    route: Route = .{},
    delta: f64 = 0,
    casualties: f64 = 0,
};

const Flight = struct {
    actor: u8,
    contacts: [max_contacts]Contact = undefined,
    count: usize = 0,
    gaze_start: usize = 0,

    pub fn jsonStringify(self: *const Flight, writer: anytype) !void {
        try writer.write(.{ .actor = self.actor, .contacts = self.contacts[0..self.count] });
    }
};

pub const Flights = struct {
    items: [8]Flight = undefined,
    count: usize = 0,

    pub fn jsonStringify(self: *const Flights, writer: anytype) !void {
        try writer.write(self.items[0..self.count]);
    }
};

const Bridge = struct { from: u8, to: u8, route: Route };

pub const Capture = struct {
    state: *const st.State,
    flights: Flights = .{},
    bridges: [5 * st.MAX_UNITS]Bridge = undefined,
    bridge_count: usize = 0,
    blocked: ?struct { from: u8, to: u8 } = null,

    pub fn drain(self: *Capture) Flights {
        const flights = self.flights;
        self.flights.count = 0;
        return flights;
    }

    fn route(self: *const Capture, from: u8, to: u8) Route {
        for (self.bridges[0..self.bridge_count]) |bridge| {
            if (bridge.from == from and bridge.to == to) return bridge.route;
        }
        return .{};
    }
};

// A native action and any counter or extra volley are synchronous. Keying by State also excludes AI rollouts.
pub threadlocal var current: ?*Capture = null;

fn captureFor(state: *const st.State) ?*Capture {
    const capture = current orelse return null;
    return if (capture.state == state) capture else null;
}

pub fn noteBridge(state: *const st.State, from: u8, to: u8, departure: st.Cell, gap: []const st.Cell, arrivals: []const st.Cell) void {
    const capture = captureFor(state) orelse return;
    if (capture.bridge_count == capture.bridges.len) return;
    const last = gap[gap.len - 1];
    for (arrivals) |arrival| {
        if (@max(@abs(arrival.x - last.x), @abs(arrival.y - last.y)) != 1) continue;
        var bridge = Bridge{ .from = from, .to = to, .route = .{} };
        bridge.route.cells[0] = departure;
        @memcpy(bridge.route.cells[1..][0..gap.len], gap);
        bridge.route.cells[gap.len + 1] = arrival;
        bridge.route.len = gap.len + 2;
        capture.bridges[capture.bridge_count] = bridge;
        capture.bridge_count += 1;
        return;
    }
}

pub fn noteShield(state: *const st.State, from: u8, to: u8) void {
    const capture = captureFor(state) orelse return;
    capture.blocked = .{ .from = from, .to = to };
}

pub fn recordFlight(state: *const st.State, thrower: u8, primary: u8, flight: anytype) void {
    const capture = captureFor(state) orelse return;
    defer {
        capture.bridge_count = 0;
        capture.blocked = null;
    }
    if (capture.flights.count == capture.flights.items.len) return;
    var result = Flight{ .actor = state.units[thrower].uid, .gaze_start = petrification.pending(state).len };
    var prior: ?u8 = null;
    var missed = false;
    for (flight.slots[0..flight.len], flight.pre[0..flight.len]) |slot, verdict| {
        if (verdict == .roll or (prior == null and slot != primary)) continue;
        if (result.count == max_contacts - 1) break;
        const target = &state.units[slot];
        missed = verdict == .miss;
        result.contacts[result.count] = .{
            .target = target.uid,
            .kind = if (missed) .miss else .hit,
            .route = if (prior) |from| capture.route(from, target.uid) else .{},
            .delta = -engine.cumulativeHp(target),
            .casualties = target.amount_alive,
        };
        result.count += 1;
        prior = target.uid;
        if (missed) break;
    }
    if (result.count == 0) return;
    if (capture.blocked) |shield| {
        if (!missed and prior == shield.from) {
            result.contacts[result.count] = .{ .target = shield.to, .kind = .shield, .route = capture.route(shield.from, shield.to) };
            result.count += 1;
        }
    }
    capture.flights.items[capture.flights.count] = result;
    capture.flights.count += 1;
}

pub fn finishImpact(state: *const st.State, thrower: u8, flight: anytype) void {
    const capture = captureFor(state) orelse return;
    if (capture.flights.count == 0 or flight.len == 0 or flight.pre[0] == .roll) return;
    const recorded = &capture.flights.items[capture.flights.count - 1];
    if (recorded.actor != state.units[thrower].uid or recorded.contacts[0].target != state.units[flight.slots[0]].uid) return;
    const gazes = petrification.pending(state);
    for (recorded.contacts[0..recorded.count]) |*contact| {
        if (contact.kind == .shield) continue;
        const unit = &state.units[state.slotOf(contact.target) orelse continue];
        contact.delta += engine.cumulativeHp(unit);
        contact.casualties -= unit.amount_alive;
        for (gazes[@min(gazes.len, recorded.gaze_start)..]) |gaze| {
            if (gaze.actor != recorded.actor or gaze.target != contact.target) continue;
            contact.delta += gaze.damage;
            contact.casualties -= gaze.casualties;
        }
    }
}
