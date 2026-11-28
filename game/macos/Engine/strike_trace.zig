const std = @import("std");
const st = @import("state.zig");
const engine = @import("engine.zig");
const chakram = @import("chakram_trace.zig");
const gaze = @import("petrification_trace.zig");

pub const Health = struct {
    id: u8,
    name_id: u16,
    team: u8,
    hp: f64,
    amount: f64,
    anchor: st.Cell,
    borrowed_grace: bool,
    absolving_arrow: bool,
    abilities: st.AbilityMask,
    buffs: st.SpellList,
    debuffs: st.SpellListN(st.MAX_DEBUFFS),
    effects: st.SpellListN(st.MAX_EFFECTS),
};

pub const Snapshot = struct {
    entries: [st.MAX_UNITS]Health = undefined,
    count: usize = 0,

    pub fn capture(state: *const st.State) Snapshot {
        var snapshot: Snapshot = .{};
        snapshot.fill(state);
        return snapshot;
    }

    fn fill(snapshot: *Snapshot, state: *const st.State) void {
        snapshot.count = 0;
        for (state.holderOrder()) |slot| {
            const unit = &state.units[slot];
            if (unit.isDead()) continue;
            snapshot.entries[snapshot.count] = .{
                .id = unit.uid,
                .name_id = unit.name_id,
                .team = unit.team,
                .hp = engine.cumulativeHp(unit),
                .amount = unit.amount_alive,
                .anchor = engine.baseCell(unit),
                .borrowed_grace = unit.has(.borrowed_grace),
                .absolving_arrow = unit.has(.absolving_arrow),
                .abilities = unit.ability_mask,
                .buffs = unit.buffs,
                .debuffs = unit.debuffs,
                .effects = unit.effects,
            };
            snapshot.count += 1;
        }
    }

    pub fn find(snapshot: *const Snapshot, id: u8) ?*const Health {
        for (snapshot.entries[0..snapshot.count]) |*unit| if (unit.id == id) return unit;
        return null;
    }
};

pub fn hasResponded(state: *const st.State, slot: u8) bool {
    return state.units[slot].responded or state.fight.replied & engine.unitBit(slot) != 0;
}

pub const Kind = enum { melee, shot, obstacle_melee, obstacle_shot };
pub const Splash = struct { center: st.Cell, single: bool = false };
pub const Aim = struct {
    cell: ?st.Cell = null,
    target: ?u8 = null, // slot in a shot or swing, converted to a UID at launch
    end: ?[2]f64 = null,
    splash: ?Splash = null,
    piercing: bool = false,
};
pub const Reply = struct { actor: u8, target: u8, spent: bool };
pub const Miss = struct { actor: u8, target: u8 };
pub const RayContact = struct { target: u8, progress: f64 };

pub const Strike = struct {
    kind: Kind,
    target: ?u8,
    aim: Aim,
    misses: [st.MAX_UNITS]Miss = undefined,
    miss_count: usize = 0,
    ray_contacts: [st.MAX_UNITS]RayContact = undefined,
    ray_contact_count: usize = 0,
    reply: ?Reply = null,
    flight_start: usize,
    gaze_start: usize,
    end: ?*const Snapshot = null,
};

pub const max_strikes = 5;

pub const Capture = struct {
    state: *const st.State,
    boundaries: std.heap.ArenaAllocator,
    // Two opening stones, followed by a regular/echo volley, or three obstacle projectiles.
    strikes: [max_strikes]Strike = undefined,
    count: usize = 0,
    incomplete: bool = false,

    pub fn init(state: *const st.State, allocator: std.mem.Allocator) Capture {
        return .{ .state = state, .boundaries = std.heap.ArenaAllocator.init(allocator) };
    }

    pub fn clear(self: *Capture) void {
        self.count = 0;
        self.incomplete = false;
        _ = self.boundaries.reset(.retain_capacity);
    }

    pub fn slice(self: *const Capture) ?[]const Strike {
        if (self.incomplete) return null;
        return self.strikes[0..self.count];
    }
};

// Only collect strikes on the accepted action's state. AI search and forecasts use their own copies.
pub threadlocal var current: ?*Capture = null;

fn captureFor(state: *const st.State) ?*Capture {
    const capture = current orelse return null;
    return if (capture.state == state and !capture.incomplete) capture else null;
}

pub fn active(state: *const st.State) bool {
    return captureFor(state) != null;
}

pub fn begin(state: *const st.State, kind: Kind, aim: Aim) void {
    const capture = captureFor(state) orelse return;
    if (capture.count == capture.strikes.len) {
        capture.incomplete = true;
        return;
    }
    if (capture.count > 0) {
        const boundary = capture.boundaries.allocator().create(Snapshot) catch {
            capture.incomplete = true;
            return;
        };
        boundary.fill(state);
        capture.strikes[capture.count - 1].end = boundary;
    }
    capture.strikes[capture.count] = .{
        .kind = kind,
        .target = if (aim.target) |slot| state.units[slot].uid else null,
        .aim = aim,
        .flight_start = if (chakram.current) |trace| trace.flights.count else 0,
        .gaze_start = gaze.pending(state).len,
    };
    capture.count += 1;
}

pub fn reply(state: *const st.State, actor: u8, target: u8, missed: bool) void {
    const capture = captureFor(state) orelse return;
    if (capture.count == 0) return;
    capture.strikes[capture.count - 1].reply = .{
        .actor = state.units[actor].uid,
        .target = state.units[target].uid,
        .spent = false,
    };
    if (missed) miss(state, actor, target);
}

pub fn spendReply(state: *const st.State, actor: u8) void {
    const capture = captureFor(state) orelse return;
    if (capture.count == 0) return;
    if (capture.strikes[capture.count - 1].reply) |*response| {
        if (response.actor == state.units[actor].uid) response.spent = true;
    }
}

pub fn miss(state: *const st.State, actor: u8, target: u8) void {
    const capture = captureFor(state) orelse return;
    if (capture.count == 0) return;
    const strike = &capture.strikes[capture.count - 1];
    if (strike.miss_count == strike.misses.len) return;
    strike.misses[strike.miss_count] = .{ .actor = state.units[actor].uid, .target = state.units[target].uid };
    strike.miss_count += 1;
}

pub fn rayContact(state: *const st.State, target: u8, progress: f64) void {
    const capture = captureFor(state) orelse return;
    if (capture.count == 0) return;
    const strike = &capture.strikes[capture.count - 1];
    if (strike.ray_contact_count == strike.ray_contacts.len) return;
    strike.ray_contacts[strike.ray_contact_count] = .{ .target = state.units[target].uid, .progress = progress };
    strike.ray_contact_count += 1;
}
