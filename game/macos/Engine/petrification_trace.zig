const st = @import("state.zig");

pub const Impact = struct {
    actor: u8,
    target: u8,
    damage: f64,
    casualties: f64,
    lethal: bool,
};

pub const Capture = struct {
    state: *const st.State,
    impacts: [st.MAX_UNITS * 3]Impact = undefined,
    count: usize = 0,

    pub fn drain(self: *Capture) []const Impact {
        const slice = self.impacts[0..self.count];
        self.count = 0;
        return slice;
    }
};

/// The view consumes each accepted action's trace before the next one starts on this thread.
pub threadlocal var current: ?*Capture = null;

pub fn pending(state: *const st.State) []const Impact {
    const capture = current orelse return &.{};
    return if (capture.state == state) capture.impacts[0..capture.count] else &.{};
}

pub fn record(state: *const st.State, actor: u8, target: u8, damage: f64, casualties: f64) void {
    const capture = current orelse return;
    if (capture.state != state or damage <= 0 or capture.count == capture.impacts.len) return;
    const victim = &state.units[target];
    capture.impacts[capture.count] = .{
        .actor = state.units[actor].uid,
        .target = victim.uid,
        .damage = damage,
        .casualties = casualties,
        .lethal = victim.isDead(),
    };
    capture.count += 1;
}
