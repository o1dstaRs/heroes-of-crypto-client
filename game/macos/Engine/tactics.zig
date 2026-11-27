const ai = @import("common/ai.zig");
const combat = @import("common/combat.zig");
const engine = @import("common/engine.zig");
const pathing = @import("common/path.zig");
const rec = @import("common/recording.zig");
const spells = @import("common/spells.zig");
const st = @import("common/state.zig");
const terrain = @import("common/terrain.zig");

const Cell = st.Cell;
const State = st.State;

// SideRectanglePlacement uses the approved augment's zone width and edge insets.
pub fn inDeployment(state: *const State, cell: Cell, team: u8) bool {
    if (team != st.Team.LEFT and team != st.Team.RIGHT) return false;
    const size: i32 = switch (state.setup[team].placement) {
        0 => 3,
        1 => 4,
        else => 6,
    };
    const inset: i32 = if (size == 3) 1 else 0;
    const edge: i32 = if (size == 6) 0 else 1;
    if (cell.y < inset or cell.y >= st.GRID - inset) return false;
    return switch (team) {
        st.Team.LEFT => cell.x >= edge and cell.x < edge + size,
        st.Team.RIGHT => cell.x >= st.GRID - edge - size and cell.x < st.GRID - edge,
        else => false,
    };
}

pub fn placement(state: *const State, slot: u8, anchor: Cell) ?engine.Cells {
    const unit = &state.units[slot];
    const cells = engine.cellsForAnchor(anchor, unit.fw, unit.fh);
    for (cells.slice()) |cell| if (!inDeployment(state, cell, unit.team)) return null;
    return if (engine.cellsFreeFor(state, slot, cells.slice())) cells else null;
}

pub fn movePath(ctx: *ai.Ctx) ?*const pathing.MovePath {
    const unit = ctx.unit();
    if (!unit.canMove() or unit.moved_this_turn) return null;
    const paths = ctx.actualPath();
    return if (paths.overflow) null else paths;
}

pub fn attack(ctx: *ai.Ctx, target: u8) ?rec.Action {
    const state = ctx.s;
    const unit = ctx.unit();
    if (unit.attack_type_selected == st.AttackType.RANGE) {
        if (unit.moved_this_turn or !engine.canLandRangeAttack(state, unit)) return null;
        const shot = ai.findLegalRangeAttack(ctx, target) orelse return null;
        return if (shot.range_attack.target == target) shot else null;
    }
    if (!canAimMelee(ctx, target)) return null;
    const from = engine.unitCells(unit);
    const to = engine.unitCells(&state.units[target]);
    if (ai.adjacent(from.slice(), to.slice())) {
        return .{ .melee_attack = .{ .attacker = ctx.ui, .target = target, .attack_from = engine.baseCell(unit), .path = &.{} } };
    }

    const approach = routeToContact(ctx, to.slice()) orelse return null;
    return meleeAction(ctx, target, approach);
}

// A contact ring around two footprints of up to 2 × 2 has at most sixteen landing
// anchors. A ranged target has at most four cells with four edges each.
pub const max_attack_angles = 16;
pub const Splash = struct { center: Cell, single: bool = false };
pub const RangedReply = struct { target: u8, splash: ?Splash };
pub const AreaAim = struct { aim: Cell, splash: Splash };
pub const AttackAngle = struct { cell: Cell, side: ?u8 = null, splash: ?Splash = null };

pub fn attackAngles(ctx: *ai.Ctx, target: u8, moves: []const Cell, output: *[max_attack_angles]AttackAngle) []const AttackAngle {
    const unit = ctx.unit();
    const target_cells = engine.unitCells(&ctx.s.units[target]);
    var count: usize = 0;
    if (unit.attack_type_selected == st.AttackType.RANGE) {
        for (target_cells.slice()) |cell| {
            for (0..4) |index| {
                const side: u8 = @intCast(index);
                if (aimedShot(ctx, target, cell, side) == null) continue;
                output[count] = .{ .cell = cell, .side = side, .splash = shotSplash(ctx.s, ctx.ui, target, cell, side) };
                count += 1;
            }
        }
    } else if (canAimMelee(ctx, target)) {
        const base = engine.baseCell(unit);
        if (ai.adjacent(engine.unitCells(unit).slice(), target_cells.slice())) {
            output[count] = .{ .cell = base };
            count += 1;
        }
        for (moves) |anchor| {
            if (ai.sameCell(anchor, base) or !ai.adjacent(ai.footprintForAnchor(unit, anchor).slice(), target_cells.slice())) continue;
            output[count] = .{ .cell = anchor };
            count += 1;
        }
    }
    return output[0..count];
}

pub fn aimedAttack(ctx: *ai.Ctx, target: u8, angle: AttackAngle) ?rec.Action {
    if (angle.side) |side| return aimedShot(ctx, target, angle.cell, side);
    if (!canAimMelee(ctx, target)) return null;
    const base = engine.baseCell(ctx.unit());
    const target_cells = engine.unitCells(&ctx.s.units[target]);
    const landing = ai.footprintForAnchor(ctx.unit(), angle.cell);
    if (!ai.adjacent(landing.slice(), target_cells.slice())) return null;
    if (ai.sameCell(angle.cell, base)) return meleeAction(ctx, target, .{ .cell = base, .steps = &.{}, .lava = false });
    const path = movePath(ctx) orelse return null;
    const route = path.get(pathing.key(angle.cell.x, angle.cell.y)) orelse return null;
    if (!ai.isLegalMoveRoute(ctx, angle.cell, path, route)) return null;
    return meleeAction(ctx, target, contactFromRoute(ctx, path, route));
}

fn canAimMelee(ctx: *const ai.Ctx, target: u8) bool {
    const unit = ctx.unit();
    return ai.isMeleeSelection(unit.attack_type_selected) and !unit.has(.no_melee) and ai.isLegalMeleeTarget(ctx.s, ctx.ui, target);
}

fn aimedShot(ctx: *const ai.Ctx, target: u8, cell: Cell, side: u8) ?rec.Action {
    const unit = ctx.unit();
    if (unit.attack_type_selected != st.AttackType.RANGE or unit.moved_this_turn or side >= 4 or
        ai.occupant(ctx.s, cell) != target) return null;
    if (!combat.sideObservableEx(ctx.s, cell, side, unit.team, unit.has(.through_shot), combat.isSplashShooter(unit)) or
        !ai.rangeShotLandable(ctx.s, ctx.ui, target, cell, side)) return null;
    return .{ .range_attack = .{ .attacker = ctx.ui, .target = target, .aim_cell = cell, .aim_side = side } };
}

pub fn canAimAreaThrow(state: *const State, slot: u8) bool {
    const unit = &state.units[slot];
    return unit.attack_type_selected == st.AttackType.RANGE and unit.has(.area_throw) and
        !unit.moved_this_turn and engine.canLandRangeAttack(state, unit);
}

pub fn areaAim(state: *const State, slot: u8, cell: Cell) ?AreaAim {
    const code = state.grid.board[@intCast(cell.x)][@intCast(cell.y)];
    if (code != st.EMPTY and code != st.LAVA and !(code == st.BLOCK and terrain.hasScatteredMountains(state))) return null;
    const splash = areaSplash(state, slot, cell);
    const attacker = &state.units[slot];
    var ring: spells.Cells = .{};
    spells.cellsAroundCell(splash.center, &ring);
    var first: ?u8 = null;
    var owner: ?u8 = null;
    for (0..ring.len + 1) |index| {
        const target = ai.occupant(state, if (index == ring.len) splash.center else ring.slice()[index]) orelse continue;
        if (first == null) first = target;
        if (owner == null and combat.wingshieldOwner(&state.units[target])) owner = target;
    }
    if (combat.forcedTarget(state, attacker)) |forced| {
        const cell_set = engine.unitCells(&state.units[forced]);
        var lands = false;
        for (cell_set.slice()) |part| {
            lands = lands or (@abs(part.x - splash.center.x) <= 1 and @abs(part.y - splash.center.y) <= 1);
        }
        if (!lands or (owner != null and !combat.wingshieldOwner(&state.units[forced]))) return null;
    }
    if (owner orelse first) |victim| {
        if (state.forbids(attacker, state.units[victim].uid)) return null;
    }
    return .{ .aim = cell, .splash = splash };
}

fn areaSplash(state: *const State, slot: u8, aim: Cell) Splash {
    const unit = &state.units[slot];
    const position = engine.positionForCell(@floatFromInt(aim.x), @floatFromInt(aim.y));
    var groups: combat.Groups = undefined;
    combat.evaluateGroups(&groups, state, slot, unit.pos_x, unit.pos_y, position[0], position[1], false, true);
    return .{ .center = if (groups.n > 0) groups.entry[0] else aim };
}

fn shotSplash(state: *const State, slot: u8, target: u8, cell: ?Cell, side: u8) ?Splash {
    const unit = &state.units[slot];
    if (!combat.isSplashShooter(unit)) return null;
    const aim = combat.aimEdge(state, unit, &state.units[target], cell, side) orelse return null;
    var groups: combat.Groups = undefined;
    combat.evaluateGroups(&groups, state, slot, unit.pos_x, unit.pos_y, aim[0], aim[1], unit.has(.through_shot), true);
    if (groups.n == 0) return null;
    return .{ .center = groups.entry[0], .single = combat.wingshieldOwner(&state.units[groups.first(0)]) };
}

pub fn actionSplash(state: *const State, action: rec.Action) ?Splash {
    return switch (action) {
        .area_throw_attack => |area| areaSplash(state, area.attacker, area.target_cell),
        .range_attack => |shot| if (!shot.free) shotSplash(state, shot.attacker, shot.target, shot.aim_cell, shot.aim_side) else null,
        .obstacle_attack => |hit| if (!hit.has_from and terrain.hasScatteredMountains(state) and
            combat.isSplashShooter(&state.units[hit.attacker]))
            areaSplash(state, hit.attacker, engine.cellForPosition(hit.target_x, hit.target_y))
        else
            null,
        else => null,
    };
}

pub fn rangedReply(state: *const State, responder: u8, attacker: u8) ?RangedReply {
    const slot = state.slotOf(responder) orelse return null;
    const target = state.slotOf(attacker) orelse return null;
    const unit = &state.units[slot];
    const other = &state.units[target];
    const is_splash = combat.isSplashShooter(unit);
    var groups: combat.Groups = undefined;
    combat.evaluateGroups(&groups, state, slot, unit.pos_x, unit.pos_y, other.pos_x, other.pos_y, unit.has(.through_shot), is_splash);
    if (groups.n == 0) return null;
    const victim = &state.units[groups.first(0)];
    return .{
        .target = victim.uid,
        .splash = if (is_splash) .{ .center = groups.entry[0], .single = combat.wingshieldOwner(victim) } else null,
    };
}

fn meleeAction(ctx: *const ai.Ctx, target: u8, approach: Contact) rec.Action {
    return .{ .melee_attack = .{
        .attacker = ctx.ui,
        .target = target,
        .attack_from = approach.cell,
        .path = approach.steps,
        .has_lava = approach.lava,
    } };
}

const Contact = struct { cell: Cell, steps: []const Cell, lava: bool };

fn routeToContact(ctx: *ai.Ctx, target: []const Cell) ?Contact {
    const paths = movePath(ctx) orelse return null;
    var best: ?*const pathing.Route = null;
    for (paths.known()) |*route| {
        if (best) |current| if (route.weight >= current.weight) continue;
        const landing = ai.footprintForAnchor(ctx.unit(), route.cell);
        if (!ai.adjacent(landing.slice(), target) or !ai.isLegalMoveRoute(ctx, route.cell, paths, route)) continue;
        best = route;
    }
    return contactFromRoute(ctx, paths, best orelse return null);
}

fn contactFromRoute(ctx: *ai.Ctx, paths: *const pathing.MovePath, route: *const pathing.Route) Contact {
    const length = paths.routeCells(route, &ctx.route_buf);
    return .{ .cell = route.cell, .steps = ctx.route_buf[0..length], .lava = route.has_lava };
}

pub fn obstacleAttack(ctx: *ai.Ctx, cell: Cell) ?rec.Action {
    const unit = ctx.unit();
    const point = engine.positionForCell(@floatFromInt(cell.x), @floatFromInt(cell.y));
    const from = engine.baseCell(unit);
    const shot = unit.attack_type_selected == st.AttackType.RANGE and engine.canLandRangeAttack(ctx.s, unit);
    var contact: Contact = .{ .cell = from, .steps = &.{}, .lava = false };
    if (!shot) {
        if (!ai.isMeleeSelection(unit.attack_type_selected) or unit.has(.no_melee)) return null;
        const footprint = engine.unitCells(unit);
        if (!ai.adjacent(footprint.slice(), &.{cell})) contact = routeToContact(ctx, &.{cell}) orelse return null;
    }
    const action: rec.Action = .{ .obstacle_attack = .{
        .attacker = ctx.ui,
        .target_x = point[0],
        .target_y = point[1],
        .attack_from = contact.cell,
        .has_from = !shot,
        .path = contact.steps,
        .has_lava = contact.lava,
    } };
    var trial = ctx.s.*;
    var events: engine.Events = .{};
    return if (engine.apply(&trial, action, &events) and !trial.overflow) action else null;
}

pub const SpellAim = enum { unit, cell, army };

pub fn spellAim(state: *const State, spell: u8) ?SpellAim {
    return switch (state.spell_cfg[spell].target) {
        st.SpellTarget.ANY_ALLY, st.SpellTarget.ANY_ENEMY, st.SpellTarget.ENEMY_WITHIN_MOVEMENT_RANGE => .unit,
        st.SpellTarget.FREE_CELL, st.SpellTarget.ALLIES_AREA => .cell,
        st.SpellTarget.ALL_ALLIES, st.SpellTarget.ALL_FLYING, st.SpellTarget.RANDOM_CLOSE_TO_CASTER => .army,
        else => null,
    };
}

pub fn canPrepareSpell(state: *const State, slot: u8, spell: u8) bool {
    if (spell >= st.N_CAST_SPELLS or spellAim(state, spell) == null) return false;
    const unit = &state.units[slot];
    if (unit.moved_this_turn) return false;
    const book = unit.bookSpell(spell) orelse return false;
    return spells.usable(unit, book, &state.spell_cfg[spell]);
}

pub fn spellAction(state: *const State, slot: u8, spell: u8, cell: ?Cell) ?rec.Action {
    if (!canPrepareSpell(state, slot, spell)) return null;
    const where = spellAim(state, spell) orelse return null;
    const target = if (where == .unit) ai.occupant(state, cell orelse return null) orelse return null else 0;
    if ((where == .army) != (cell == null)) return null;
    const action: rec.Action = .{ .cast_spell = .{
        .caster = slot,
        .spell = spell,
        .target = target,
        .has_target = where == .unit,
        .cell = cell orelse .{ .x = 0, .y = 0 },
        .has_cell = where == .cell,
    } };
    // Ask the actual Zig cast to validate the aim. Its RNG and state changes stay in the scratch board.
    var scratch = state.*;
    var events: engine.Events = .{};
    return if (engine.apply(&scratch, action, &events) and !scratch.overflow) action else null;
}
