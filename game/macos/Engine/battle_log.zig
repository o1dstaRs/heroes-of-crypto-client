const rec = @import("common/recording.zig");
const st = @import("common/state.zig");

/// An accepted native engine call, with the same inputs and random stream the web engine uses.
pub const Step = struct {
    kind: Kind,
    seed: u32,
    nextSeed: u32,
    active: ?u8,
    lap: u32,
    actor: ?u8 = null,
    target: ?u8 = null,
    cell: ?rec.Cell = null,
    from: ?rec.Cell = null,
    point: ?Point = null,
    path: []const rec.Cell = &.{},
    cells: []const rec.Cell = &.{},
    side: ?u8 = null,
    mode: ?u8 = null,
    spell: ?[]const u8 = null,
    orientation: ?u8 = null,
    reason: ?rec.EndReason = null,
    lava: bool = false,
    damage: bool = false,
    events: []const rec.Event = &.{},

    const Kind = @typeInfo(rec.Action).@"union".tag_type.?;
    const Point = struct { x: f64, y: f64 };
};

pub const Journal = struct {
    const capacity = 2 * st.MAX_UNITS + 16;
    const Cells = struct {
        path: [64]rec.Cell = undefined,
        targets: [4]rec.Cell = undefined,
        events: [st.MAX_UNITS + 8]rec.Event = undefined,
    };
    rows: [capacity]Step = undefined,
    routes: [capacity]Cells = undefined,
    len: usize = 0,
    incomplete: bool = false,

    pub fn push(self: *Journal, action: rec.Action, seed: u32, state: *const st.State, events: []const rec.Event) void {
        if (self.len == self.rows.len) {
            self.incomplete = true;
            return;
        }
        var step = Step{
            .kind = action,
            .seed = seed,
            .nextSeed = state.rng.state,
            .active = if (state.active >= 0) state.units[@intCast(state.active)].uid else null,
            .lap = @intCast(state.fight.lap),
        };
        switch (action) {
            .start_fight => {},
            .advance => |advance| step.damage = advance.damage_dealt_this_lap,
            .end_turn => |end| {
                step.actor = end.unit;
                step.reason = end.reason;
            },
            .wait_turn => |turn| step.actor = turn.unit,
            .defend_turn => |turn| step.actor = turn.unit,
            .select_attack_type => |select| {
                step.actor = select.unit;
                step.mode = select.attack_type;
            },
            .move_unit => |move| {
                step.actor = move.unit;
                step.path = move.path;
                step.cells = move.target_cells;
                step.lava = move.has_lava;
            },
            .melee_attack => |strike| {
                step.actor = strike.attacker;
                step.target = strike.target;
                step.from = strike.attack_from;
                step.path = strike.path;
                step.lava = strike.has_lava;
            },
            .range_attack => |shot| {
                step.actor = shot.attacker;
                step.target = if (shot.free) null else shot.target;
                step.point = if (shot.free) .{ .x = shot.tx, .y = shot.ty } else null;
                step.cell = shot.aim_cell;
                step.side = if (shot.aim_cell != null) shot.aim_side else null;
            },
            .obstacle_attack => |strike| {
                step.actor = strike.attacker;
                step.point = .{ .x = strike.target_x, .y = strike.target_y };
                step.from = if (strike.has_from) strike.attack_from else null;
                step.path = strike.path;
                step.lava = strike.has_lava;
            },
            .area_throw_attack => |shot| {
                step.actor = shot.attacker;
                step.cell = shot.target_cell;
            },
            .cast_spell => |cast| {
                step.actor = cast.caster;
                step.target = if (cast.has_target) cast.target else null;
                step.cell = if (cast.has_cell) cast.cell else null;
                step.spell = @as(st.CastSpell, @enumFromInt(cast.spell)).name();
                step.orientation = cast.orientation;
            },
            .decide => return,
        }

        const storage = &self.routes[self.len];
        if (step.path.len > storage.path.len or step.cells.len > storage.targets.len or events.len > storage.events.len) {
            self.incomplete = true;
            return;
        }
        @memcpy(storage.path[0..step.path.len], step.path);
        @memcpy(storage.targets[0..step.cells.len], step.cells);
        @memcpy(storage.events[0..events.len], events);
        step.path = storage.path[0..step.path.len];
        step.cells = storage.targets[0..step.cells.len];
        step.events = storage.events[0..events.len];
        self.rows[self.len] = step;
        self.len += 1;
    }

    pub fn slice(self: *const Journal) []const Step {
        return self.rows[0..self.len];
    }
};
