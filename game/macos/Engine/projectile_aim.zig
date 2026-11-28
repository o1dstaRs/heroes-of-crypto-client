const std = @import("std");
const abilities = @import("common/abilities.zig");
const ai = @import("common/ai.zig");
const artifacts = @import("common/artifacts.zig");
const combat = @import("common/combat.zig");
const engine = @import("common/engine.zig");
const js = @import("common/jsnum.zig");
const rec = @import("common/recording.zig");
const spells = @import("common/spells.zig");
const st = @import("common/state.zig");
const terrain = @import("common/terrain.zig");
const util = @import("common/v08/util.zig");

const Cell = st.Cell;
const State = st.State;
const side_offsets = [4][2]i32{ .{ -1, 0 }, .{ 1, 0 }, .{ 0, -1 }, .{ 0, 1 } };

pub const Point = struct {
    x: f64,
    y: f64,

    pub fn fromWorld(p: [2]f64) Point {
        return .{ .x = (p[0] - engine.MIN_X) / engine.CELL, .y = (p[1] - engine.MIN_Y) / engine.CELL };
    }

    pub fn world(p: Point) ?[2]f64 {
        if (!(p.x >= 0 and p.x < st.GRID and p.y >= 0 and p.y < st.GRID)) return null;
        return .{ engine.MIN_X + p.x * engine.CELL, engine.MIN_Y + p.y * engine.CELL };
    }
};

pub const Range = struct {
    aim: Point,
    obstacle: ?Point,
    interception: ?Point,
    primary: ?u8,
    hit: ?ShotHit,
    hits: []const ShotHit = &.{},
    divisor: f64,
    clean: bool,
    stops_at_obstacle: bool,
};

pub const ShotHit = struct {
    target: u8,
    divisor: f64,
    min: f64,
    max: f64,
    gaze: ?Gaze,
    redirect: ?Redirect = null,
};

const DamageBand = struct {
    min: f64 = 0,
    max: f64 = 0,
};
const Redirect = struct { target: u8, min: f64, max: f64 };
const Gaze = struct {
    min: f64,
    max: f64,
    percentageMax: f64,
    procChance: f64,
    hp: f64,
    totalHp: f64,
    immune: bool,
    multipleHits: bool,
    flesh: ?combat.MacFleshGuard,
    burn: ?combat.MacFireforged,
};

const Contact = enum { swing, rider, breath };

fn damageBand(state: *const State, from: *const st.Unit, to: *const st.Unit, ranged: bool, divisor: f64, multiplier: f64, area_factor: ?f64, contact: Contact) DamageBand {
    const first_roll = combat.damageBound(from, to, from.attack_damage_min, ranged, divisor);
    const top_roll = @max(first_roll, combat.damageBound(from, to, from.attack_damage_max, ranged, divisor) - 1);
    const type_multiplier: f64 = if (!ranged and from.attack_type == st.AttackType.RANGE and !from.has(.handyman)) 0.5 else 1;
    const wounds = 1 + abilities.activeDeepWounds(from, to) / 100;
    const element = if (state.elements) combat.physicalElement(from, to) else 1;
    const lucky = if (contact == .swing and from.ability(.lucky_strike) != null)
        abilities.abilityMultiplier(from, from.ability(.lucky_strike).?)
    else
        1;
    const bite = if (ranged or contact != .swing) 0 else abilities.penetratingBite(from, to);
    const low = @floor(first_roll * type_multiplier * multiplier * wounds * element) + bite;
    const high = @floor(@floor(top_roll * type_multiplier * multiplier * wounds * element) * lucky) + bite;
    const factor = area_factor orelse return .{ .min = low, .max = high };
    const defense = combat.physicalAoeMultiplier(state, to);
    return .{
        .min = @floor(artifacts.giantsMaul(from, @floor(low * factor)) * defense),
        .max = @floor(artifacts.giantsMaul(from, @floor(high * factor)) * defense),
    };
}

fn gazeForecast(state: *const State, from: *const st.Unit, to: *const st.Unit, divisor: f64, first: DamageBand, multiple: bool, guard: ?combat.MacFleshGuard, burn: ?combat.MacFireforged) ?Gaze {
    const ability = from.ability(.petrifying_gaze) orelse return null;
    if (first.max <= 0) return null;
    const is_mind = ability.ty == st.AbilityKind.MIND;
    const percentage = @floor(abilities.applyChance(from, ability));
    const level: f64 = @floatFromInt(to.level);
    const base = @min(35, js.round(percentage * 0.25) + 4 * (level - 1));
    const range = std.math.pow(f64, 0.75, std.math.log2(@max(1, divisor)));
    const resistance = if (is_mind) artifacts.statusResist(state, to) else 0;
    return .{
        .min = first.min,
        .max = first.max,
        .percentageMax = percentage,
        .procChance = @max(0, js.round(base * range * (1 - resistance / 100))),
        .hp = to.max_hp,
        .totalHp = engine.cumulativeHp(to),
        .immune = is_mind and abilities.mindResistant(to),
        .multipleHits = multiple,
        .flesh = guard,
        .burn = burn,
    };
}

const Volleys = struct {
    first: DamageBand,
    later: DamageBand = .{},
    bonus: f64 = 0,
    ranged: bool,
    divisor: f64,
    contact: Contact = .swing,
    sweep: bool = false,
};

fn forecastHit(state: *const State, slot: u8, victim: u8, volleys: Volleys) ShotHit {
    const from = &state.units[slot];
    const to = &state.units[victim];
    const physical = volleys.contact != .breath;
    const absorbed = if (physical) abilities.absorbsBy(state, to, from) else abilities.absorbsHit(to);
    const guard = if (physical) combat.macFleshGuard(state, slot, victim, volleys.ranged) else null;
    const burn = combat.macFireforged(state, from, to);
    const protector_absorbs = if (guard) |g| abilities.absorbsBy(state, &state.units[g.owner], null) else false;
    const low = projectVolleys(.{ volleys.first.min, volleys.later.min, 0 }, guard, burn, absorbed, protector_absorbs, volleys.sweep);
    const high = projectVolleys(.{ volleys.first.max, volleys.later.max, volleys.bonus }, guard, burn, absorbed, protector_absorbs, volleys.sweep);
    return .{
        .target = to.uid,
        .divisor = volleys.divisor,
        .min = low.damage,
        .max = high.damage,
        .gaze = if (absorbed or !physical) null else gazeForecast(state, from, to, volleys.divisor, volleys.first, volleys.later.max > 0 or volleys.bonus > 0, guard, burn),
        .redirect = if (guard != null and high.redirect > 0)
            .{ .target = state.units[guard.?.owner].uid, .min = low.redirect, .max = high.redirect }
        else
            null,
    };
}

fn projectVolleys(hits: [3]f64, initial_guard: ?combat.MacFleshGuard, burn: ?combat.MacFireforged, absorbed: bool, protector_absorbs: bool, sweep: bool) struct { damage: f64, redirect: f64 } {
    var guard = initial_guard;
    var damage: f64 = 0;
    var redirect: f64 = 0;
    var shield = absorbed;
    var guard_shield = protector_absorbs;
    var burned = false;
    for (hits) |raw| {
        if (raw <= 0) continue;
        const split: combat.MacFleshGuard.Split = if (guard) |g| g.split(raw) else .{ .remaining = raw, .cost = 0 };
        var dealt = if (shield) 0 else split.remaining;
        if (burn) |f| {
            if (!sweep or !burned) {
                dealt += f.burn(if (shield) raw else split.remaining);
                burned = true;
            }
        }
        var shared = split.cost;
        if (shared > 0 and guard_shield) {
            shared = 0;
            guard_shield = false;
        }
        if (guard) |*g| {
            g.ownerCap = @max(0, g.ownerCap - shared);
            g.targetCap = @max(0, g.targetCap - dealt);
        }
        shield = false;
        damage += dealt;
        redirect += shared;
    }
    return .{ .damage = damage, .redirect = redirect };
}

fn shotHit(state: *const State, slot: u8, victim: u8, divisor: f64, through: bool) ShotHit {
    const from = &state.units[slot];
    const to = &state.units[victim];
    const wave = if (through) from.ability(.through_shot) else null;
    const paralysis = abilities.paralysisFactor(from) orelse 1;
    const multiplier = if (wave) |ability| abilities.abilityMultiplier(from, ability) else 1;
    const first = damageBand(state, from, to, true, divisor, multiplier * paralysis, if (through) 1 else null, .swing);
    var later: DamageBand = .{};
    const cost = if (from.has(.endless_quiver)) 0 else if (!through and state.dense and to.ability(.dense_flesh) != null)
        @max(1, @floor(to.ability(.dense_flesh).?.power))
    else
        1;
    const shots = engine.getRangeShots(from);
    const remaining = from.range_shots_mod != 0 or shots > cost;
    if (remaining) {
        if (combat.doubleShotAbility(from)) |ability| {
            const second = artifacts.dualStrikeIn(state, from, abilities.abilityMultiplier(from, ability));
            later = damageBand(state, from, to, true, divisor, multiplier * second * paralysis, if (through) 1 else null, .swing);
        }
    }
    const spent = cost * (1 + @as(f64, if (later.max > 0) 1 else 0));
    const echo = !through and artifacts.echoChance(state, from) > 0 and (from.range_shots_mod != 0 or shots > spent);
    return forecastHit(state, slot, victim, .{
        .divisor = divisor,
        .first = first,
        .later = later,
        .bonus = if (echo) first.max else 0,
        .ranged = true,
        .sweep = through,
    });
}

fn chargedCells(from: *const st.Unit, route_length: usize) f64 {
    return if (route_length == 1 and from.moved_this_turn and from.moved_route_cells > 0)
        from.moved_route_cells
    else
        @floatFromInt(route_length);
}

pub fn meleeHit(state: *const State, slot: u8, target: u8, landing: Cell, route_length: usize) ?ShotHit {
    const from = &state.units[slot];
    const to = &state.units[target];
    if (from.has(.lightning_spin)) return null;
    const cells = chargedCells(from, route_length);
    const paralysis = abilities.paralysisFactor(from) orelse 1;
    const position = abilities.positionMultiplierOn(from, landing, engine.baseCell(to), to.fw, to.fh, state.fight.side_oriented);
    const multiplier = abilities.rapidCharge(from, cells) * paralysis * position;
    const first = damageBand(state, from, to, false, 1, multiplier, null, .swing);
    const punch = from.ability(.double_punch) orelse from.ability(.crafted_double_punch);
    const later = if (punch) |ability|
        damageBand(state, from, to, false, 1, artifacts.dualStrikeIn(state, from, abilities.abilityMultiplier(from, ability)) * paralysis, null, .swing)
    else
        DamageBand{};
    return forecastHit(state, slot, target, .{ .first = first, .later = later, .divisor = 1, .ranged = false });
}

pub fn meleeRiders(state: *const State, slot: u8, primary: u8, landing: Cell, route_length: usize, storage: std.mem.Allocator) []const ShotHit {
    const from = &state.units[slot];
    const target = &state.units[primary];
    var hits: [st.MAX_UNITS + 5]ShotHit = undefined;
    var count: usize = 0;
    if (from.ability(.lightning_spin)) |spin| {
        const common = abilities.abilityMultiplier(from, spin) * abilities.rapidCharge(from, chargedCells(from, route_length)) *
            (abilities.paralysisFactor(from) orelse 1);
        var enemies: engine.UnitList = undefined;
        combat.enemiesAround(state, slot, landing, &enemies);
        for (enemies.slice()) |victim| {
            const enemy = &state.units[victim];
            if (enemy.isDead() or state.forbids(from, enemy.uid) or engine.cowardBarred(state, from, enemy)) continue;
            // The engine folds Deep Wounds into both the spin multiplier and the common damage chain.
            const multiplier = common * (1 + abilities.activeDeepWounds(from, enemy) / 100);
            const first = damageBand(state, from, enemy, false, 1, multiplier, 1, .swing);
            hits[count] = forecastHit(state, slot, victim, .{ .first = first, .ranged = false, .divisor = 1, .sweep = true });
            count += 1;
        }
    }
    if (from.ability(.fire_breath)) |breath| {
        var band: engine.Cells = undefined;
        combat.pierceSweepCells(from, target, landing, &band);
        var seen = engine.unitBit(slot) | engine.unitBit(primary);
        for (band.slice()) |cell| {
            const victim = ai.occupant(state, cell) orelse continue;
            const bit = engine.unitBit(victim);
            if (seen & bit != 0) continue;
            seen |= bit;
            const enemy = &state.units[victim];
            if (enemy.isDead()) continue;
            if (combat.fireImmune(enemy)) break;
            const physical = damageBand(state, from, enemy, false, 1, abilities.abilityMultiplier(from, breath), null, .breath);
            const magic = (1 - engine.getMagicResist(enemy) / 100) * spells.magicDamageTakenMultiplier(enemy);
            const first = DamageBand{ .min = @floor(physical.min * magic), .max = @floor(physical.max * magic) };
            hits[count] = forecastHit(state, slot, victim, .{ .first = first, .ranged = false, .divisor = 1, .contact = .breath, .sweep = true });
            count += 1;
        }
    }
    if (from.ability(.skewer_strike)) |skewer| {
        if (engine.isSmall(target)) {
            if (combat.pierceCellBehind(from, landing, engine.baseCell(target))) |rear| {
                if (ai.occupant(state, rear)) |victim| {
                    const enemy = &state.units[victim];
                    if (enemy.team != from.team and !enemy.isDead()) {
                        const first = damageBand(state, from, enemy, false, 1, abilities.abilityMultiplier(from, skewer), 1, .rider);
                        hits[count] = forecastHit(state, slot, victim, .{ .first = first, .ranged = false, .divisor = 1, .contact = .rider, .sweep = true });
                        count += 1;
                    }
                }
            }
        }
    }
    return storage.dupe(ShotHit, hits[0..count]) catch &.{};
}

fn splashHit(state: *const State, slot: u8, victim: u8, divisor: f64, factor: f64, multiplier: f64, next_multiplier: f64, echo: bool) ShotHit {
    const from = &state.units[slot];
    const target = &state.units[victim];
    const first = damageBand(state, from, target, true, divisor, multiplier, factor, .swing);
    const later = if (next_multiplier > 0) damageBand(state, from, target, true, divisor, multiplier, factor * next_multiplier, .swing) else DamageBand{};
    return forecastHit(state, slot, victim, .{
        .first = first,
        .later = later,
        .bonus = if (echo) first.max else 0,
        .ranged = true,
        .divisor = divisor,
    });
}

pub fn splashHits(state: *const State, slot: u8, members: []const u8, divisor: f64, storage: std.mem.Allocator) []const ShotHit {
    if (members.len == 0) return &.{};
    const from = &state.units[slot];
    const card = from.ability(.area_throw) orelse from.ability(.large_caliber) orelse from.ability(.chakram) orelse return &.{};
    const multiplier = abilities.abilityMultiplier(from, card) * (abilities.paralysisFactor(from) orelse 1);
    const first = &state.units[members[0]];
    const cost = if (from.has(.endless_quiver)) 0 else if (state.dense and first.ability(.dense_flesh) != null)
        @max(1, @floor(first.ability(.dense_flesh).?.power))
    else
        1;
    const shots = engine.getRangeShots(from);
    const remaining = from.range_shots_mod != 0 or shots > cost;
    const extra = if (remaining) combat.doubleShotAbility(from) else null;
    const next_multiplier = if (extra) |ability|
        artifacts.dualStrikeIn(state, from, if (from.has(.chakram)) abilities.abilityMultiplier(from, ability) else 1)
    else
        0;
    const spent = cost * (1 + @as(f64, if (extra != null) 1 else 0));
    const echo = artifacts.echoChance(state, from) > 0 and (from.range_shots_mod != 0 or shots > spent);
    var hits: [st.MAX_UNITS]ShotHit = undefined;
    var count: usize = 0;
    for (members) |member| {
        const target = &state.units[member];
        if (target.isDead()) continue;
        hits[count] = splashHit(state, slot, member, divisor, 1, multiplier, next_multiplier, echo);
        count += 1;
    }
    if (from.has(.chakram)) {
        const path = combat.macChakramPlan(state, slot, members[0]);
        for (path.slots[0..path.len], path.factors[0..path.len]) |victim, factor| {
            if (std.mem.indexOfScalar(u8, members, victim) != null or count == hits.len) continue;
            hits[count] = splashHit(state, slot, victim, divisor, factor, multiplier, next_multiplier, echo);
            count += 1;
        }
    }
    return storage.dupe(ShotHit, hits[0..count]) catch &.{};
}

pub const Spell = struct {
    target: u8,
    primary: u8,
    end: ?Point,
    positive: bool,
    spared: bool,
    damage: ?f64,
    splash: ?Cell,
    footprint: []const Cell,
    secondary: []const SpellDamage,
};

pub const SpellDamage = struct { target: u8, damage: f64 };

pub const SpellTargetStorage = struct {
    cells: spells.Cells = .{},
    hits: [st.MAX_UNITS]SpellDamage = undefined,
};

pub const MeteorCells = struct {
    items: [9]Cell = undefined,
    len: usize = 0,

    pub fn slice(self: *const MeteorCells) []const Cell {
        return self.items[0..self.len];
    }
};

pub const MeteorAim = struct { anchor: Cell, footprint: []const Cell, hits: []const SpellDamage };

pub fn meteorCells(spell: st.CastSpell, anchor: Cell) ?MeteorCells {
    const offsets: []const i32 = switch (spell) {
        .meteor_shower => &.{ -1, 0, 1 },
        .meteorite => &.{ 0, 1 },
        else => return null,
    };
    // The Zig cast validates the entire block before this geometry is shown or recorded.
    var result: MeteorCells = .{};
    for (offsets) |dx| for (offsets) |dy| {
        result.items[result.len] = .{ .x = anchor.x + dx, .y = anchor.y + dy };
        result.len += 1;
    };
    return result;
}

fn neighbor(cell: Cell, side: u8) Cell {
    const offset = side_offsets[side];
    return .{ .x = cell.x + offset[0], .y = cell.y + offset[1] };
}

fn facesShooter(from: *const st.Unit, to: *const st.Unit, side: u8) bool {
    // GridMath's closest-side geometry. Only the exterior faces toward the shooter can be chosen.
    const horizontal = side < 2;
    const sign: f64 = if (side == 0 or side == 2) -1 else 1;
    const delta = sign * if (horizontal) from.pos_x - to.pos_x else from.pos_y - to.pos_y;
    const from_small = from.fw == 1 and from.fh == 1;
    const to_small = to.fw == 1 and to.fh == 1;
    return if (from_small == to_small) delta > 0 else delta > engine.HALF;
}

fn legalPrimary(state: *const State, slot: u8, groups: *const combat.Groups) bool {
    if (groups.n == 0) return combat.forcedTarget(state, &state.units[slot]) == null;
    const from = &state.units[slot];
    const hit = groups.first(0);
    const target = &state.units[hit];
    if ((state.disguise and groups.n == 1 and target.isHidden()) or state.forbids(from, target.uid)) return false;
    if (combat.forcedTarget(state, from)) |forced| {
        if (forced != hit) return false;
    }
    return from.has(.through_shot) or !engine.cowardBarred(state, from, target);
}

fn rangeContact(from: *const st.Unit, aim: [2]f64, cell: Cell) ?Point {
    var ray: combat.Ray = undefined;
    combat.traceRayInto(&ray, from.pos_x, from.pos_y, aim[0], aim[1]);
    for (ray.items[0..ray.len]) |hit| {
        if (ai.sameCell(hit.cell, cell)) return Point.fromWorld(.{ hit.x, hit.y });
    }
    return null;
}

pub fn rangeEdge(state: *const State, slot: u8, target: u8, cell: Cell, side: u8, storage: ?std.mem.Allocator) ?Range {
    const from = &state.units[slot];
    const to = &state.units[target];
    if (side >= 4 or to.isDead() or to.team == from.team or from.moved_this_turn or !engine.canLandRangeAttack(state, from) or
        (state.disguise and to.isHidden()) or state.forbids(from, to.uid) or ai.occupant(state, cell) != target or
        ai.occupant(state, neighbor(cell, side)) == target or !facesShooter(from, to, side)) return null;
    const splash = combat.isSplashShooter(from);
    const through = from.has(.through_shot);
    if (!combat.sideObservableEx(state, cell, side, from.team, through, splash)) return null;
    const aim = combat.sideCenter(cell, side, from.pos_x, from.pos_y);
    var groups: combat.Groups = undefined;
    combat.evaluateGroups(&groups, state, slot, from.pos_x, from.pos_y, aim[0], aim[1], through, splash);
    const double = combat.doubleShotAbility(from) != null;
    const canClearScreen = groups.obstacle != null and double and terrain.hasScatteredMountains(state);
    const stops_at_obstacle = groups.obstacle != null and !canClearScreen;
    const clean = groups.obstacle == null and if (splash or through)
        std.mem.indexOfScalar(u8, groups.members[0..groups.n_members], target) != null
    else
        groups.n > 0 and groups.first(0) == target;
    if (!clean and !double and !stops_at_obstacle) return null;
    if (stops_at_obstacle) {
        if (combat.forcedTarget(state, from) != null) return null;
    } else if (canClearScreen) {
        // Double Shot can remove a tombstone before evaluating the next volley.
        var scratch = state.*;
        var events: engine.Events = .{};
        if (!engine.apply(&scratch, shotAction(slot, target, cell, side), &events)) return null;
    } else if (groups.n == 0 or !legalPrimary(state, slot, &groups)) return null;

    var divisor = util.rangeDivisorAt(from, aim[0], aim[1], from.pos_x, from.pos_y);
    for (0..groups.n) |index| {
        if (std.mem.indexOfScalar(u8, groups.group(index), target) == null) continue;
        divisor = groups.divisors[index];
        break;
    }
    return .{
        .aim = Point.fromWorld(aim),
        .obstacle = if (groups.obstacle) |stone| Point.fromWorld(stone) else null,
        .interception = if (groups.obstacle == null and groups.n > 0 and groups.first(0) != target)
            rangeContact(from, aim, groups.entry[0])
        else
            null,
        .primary = if (!stops_at_obstacle and groups.n > 0) state.units[groups.first(0)].uid else null,
        .hit = if (storage != null and groups.n > 0 and groups.obstacle == null and !splash and !from.has(.chakram))
            shotHit(state, slot, groups.first(0), groups.divisors[0], false)
        else
            null,
        .hits = if (groups.n > 0 and groups.obstacle == null and (splash or from.has(.chakram)) and storage != null)
            splashHits(state, slot, groups.group(0), groups.divisors[0], storage.?)
        else
            &.{},
        .divisor = divisor,
        .clean = clean,
        .stops_at_obstacle = stops_at_obstacle,
    };
}

pub fn shotAction(slot: u8, target: u8, cell: Cell, side: u8) rec.Action {
    return .{ .range_attack = .{ .attacker = slot, .target = target, .aim_cell = cell, .aim_side = side } };
}

pub fn canAimThrough(state: *const State, slot: u8) bool {
    const from = &state.units[slot];
    return from.attack_type_selected == st.AttackType.RANGE and from.has(.through_shot) and
        !from.moved_this_turn and engine.canLandRangeAttack(state, from);
}

pub const Through = struct {
    end: Point,
    obstacle: bool,
    valid: bool,
    hits: []const ShotHit,
};

pub fn throughShot(state: *const State, slot: u8, aim: [2]f64, hits: *[st.MAX_UNITS]ShotHit) Through {
    const from = &state.units[slot];
    var groups: combat.Groups = undefined;
    combat.evaluateGroups(&groups, state, slot, from.pos_x, from.pos_y, aim[0], aim[1], true, false);
    var end = groups.obstacle orelse combat.projectLineToFieldEdge(from.pos_x, from.pos_y, aim[0], aim[1]);
    for (0..groups.n) |index| {
        const hit = &state.units[groups.first(index)];
        hits[index] = shotHit(state, slot, groups.first(index), groups.divisors[index], true);
        if (combat.wingshieldOwner(hit)) {
            // The shield is the last object on this ray, including when the pointer is beyond it.
            const c = groups.entry[index];
            end = engine.positionForCell(@floatFromInt(c.x), @floatFromInt(c.y));
        }
    }
    return .{
        .end = Point.fromWorld(end),
        .obstacle = groups.obstacle != null,
        .valid = legalPrimary(state, slot, &groups),
        .hits = hits[0..groups.n],
    };
}

fn thrownContact(state: *const State, slot: u8, target: u8, trajectory: spells.Trajectory) ?Point {
    const caster = &state.units[slot];
    const body = engine.unitCells(&state.units[target]);
    const victim = if (trajectory.obstruction == 1) trajectory.blocker else target;
    var result: ?Point = null;
    var shortest: f64 = std.math.inf(f64);
    for (body.slice()) |cell| {
        for (0..4) |index| {
            const side: u8 = @intCast(index);
            const across = neighbor(cell, side);
            if (engine.cellWithinGrid(across)) {
                const code = state.grid.board[@intCast(across.x)][@intCast(across.y)];
                if (code == st.BLOCK or code == st.HOLE) continue;
                if (st.isUnitCode(code) and state.units[code - 1].team != caster.team) continue;
            }
            const aim = combat.sideCenter(cell, side, caster.pos_x, caster.pos_y);
            const dx = aim[0] - caster.pos_x;
            const dy = aim[1] - caster.pos_y;
            const distance = dx * dx + dy * dy;
            if (distance >= shortest) continue;
            var ray: combat.Ray = undefined;
            combat.traceRayInto(&ray, caster.pos_x, caster.pos_y, aim[0], aim[1]);
            for (ray.items[0..ray.len]) |hit| {
                if (!engine.cellWithinGrid(hit.cell)) continue;
                const code = state.grid.board[@intCast(hit.cell.x)][@intCast(hit.cell.y)];
                if (code == st.BLOCK or code == st.HOLE) break;
                if (!st.isUnitCode(code) or state.units[code - 1].team == caster.team) continue;
                if (code - 1 == victim and ai.sameCell(hit.cell, trajectory.impact)) {
                    shortest = distance;
                    result = Point.fromWorld(.{ hit.x, hit.y });
                }
                break;
            }
        }
    }
    return result;
}

fn closestSpellEdge(state: *const State, caster: *const st.Unit, victim: *const st.Unit, requires_sight: bool) Point {
    const body = engine.unitCells(victim);
    var best: [2]f64 = .{ victim.pos_x, victim.pos_y };
    var shortest: f64 = std.math.inf(f64);
    for (body.slice()) |cell| {
        for (0..4) |index| {
            const side: u8 = @intCast(index);
            const across = neighbor(cell, side);
            if (ai.occupant(state, across) == state.slotOf(victim.uid).?) continue;
            if (requires_sight and !combat.sideObservableEx(state, cell, side, caster.team, false, false)) continue;
            const point = combat.sideCenter(cell, side, caster.pos_x, caster.pos_y);
            const dx = point[0] - caster.pos_x;
            const dy = point[1] - caster.pos_y;
            const distance = dx * dx + dy * dy;
            if (distance < shortest) {
                shortest = distance;
                best = point;
            }
        }
    }
    return Point.fromWorld(best);
}

fn spellDamage(state: *const State, caster: *const st.Unit, victim: *const st.Unit, raw: f64, element: u8) f64 {
    const landed = spells.damageAgainst(raw, element, victim);
    return util.projectSpell(state, caster, victim, landed, element).damage;
}

fn areaSpellDamage(state: *const State, slot: u8, spell: st.CastSpell, cells: []const Cell, primary: ?u8, enemies_only: bool, output: []SpellDamage) []const SpellDamage {
    const caster = &state.units[slot];
    const cfg = &state.spell_cfg[@intFromEnum(spell)];
    const raw = spells.rawDamage(caster, spell, cfg);
    var seen = engine.unitBit(slot);
    if (primary) |index| seen |= engine.unitBit(index);
    var count: usize = 0;
    for (cells) |cell| {
        const index = ai.occupant(state, cell) orelse continue;
        const unit = &state.units[index];
        const bit = engine.unitBit(index);
        if (seen & bit != 0 or unit.isDead() or (enemies_only and unit.team == caster.team)) continue;
        seen |= bit;
        output[count] = .{ .target = unit.uid, .damage = spellDamage(state, caster, unit, raw, cfg.element) };
        count += 1;
    }
    return output[0..count];
}

pub fn meteorAim(state: *const State, slot: u8, spell: st.CastSpell, anchor: Cell, cells: *const MeteorCells, hits: *[9]SpellDamage) MeteorAim {
    const footprint = cells.slice();
    return .{ .anchor = anchor, .footprint = footprint, .hits = areaSpellDamage(state, slot, spell, footprint, null, true, hits) };
}

pub fn spellTarget(state: *const State, slot: u8, target: u8, spell_id: u8, storage: ?*SpellTargetStorage) Spell {
    const caster = &state.units[slot];
    const spell: st.CastSpell = @enumFromInt(spell_id);
    const cfg = &state.spell_cfg[spell_id];
    const damaging = cfg.multiplier == st.SpellMultiplier.UNIT_AMOUNT_DAMAGE;
    const swap = cfg.target == st.SpellTarget.ENEMY_WITHIN_MOVEMENT_RANGE;
    const thrown = spell == .fire_strike or spell == .fireball;
    const trajectory = if (thrown) spells.trajectory(state, slot, target) else null;
    const hit = if (trajectory != null and trajectory.?.obstruction == 1) trajectory.?.blocker else target;
    const victim = &state.units[hit];
    const end = if (swap)
        Point.fromWorld(.{ victim.pos_x, victim.pos_y })
    else if (trajectory) |flight|
        thrownContact(state, slot, target, flight) orelse closestSpellEdge(state, caster, victim, true)
    else if (damaging or spell == .vine_throw)
        closestSpellEdge(state, caster, victim, spell == .ring_of_fire or spell == .vine_throw)
    else
        null;
    const blast = if (spell == .fireball and trajectory != null) trajectory.?.impact else null;
    const damage = if (damaging and spell != .ring_of_fire) spellDamage(state, caster, victim, spells.rawDamage(caster, spell, cfg), cfg.element) else null;
    var footprint: []const Cell = &.{};
    var secondary: []const SpellDamage = &.{};
    if (storage) |data| {
        data.cells.len = 0;
        if (blast) |center| {
            spells.cellsAroundCell(center, &data.cells);
            data.cells.push(center);
        } else if (spell == .ring_of_fire) {
            const body = engine.unitCells(victim);
            spells.cellsAroundFootprint(body.slice(), &data.cells);
        }
        footprint = data.cells.slice();
        if (footprint.len > 0) secondary = areaSpellDamage(state, slot, spell, footprint, hit, false, &data.hits);
    }
    return .{
        .target = state.units[target].uid,
        .primary = victim.uid,
        .end = end,
        .positive = cfg.is_buff or swap,
        .spared = spell == .ring_of_fire,
        .damage = damage,
        .splash = blast,
        .footprint = footprint,
        .secondary = secondary,
    };
}

const SpellFeedback = struct { reflections: usize = 0, absorbs: usize = 0 };

pub fn spellFeedback(state: *const State, cast: @FieldType(rec.Action, "cast_spell"), mirrors: *[st.MAX_UNITS]u16, absorbs: *[st.MAX_UNITS]u16) SpellFeedback {
    const spell: st.CastSpell = @enumFromInt(cast.spell);
    const cfg = &state.spell_cfg[cast.spell];
    if (cfg.multiplier != st.SpellMultiplier.UNIT_AMOUNT_DAMAGE) return .{};
    var targets: [st.MAX_UNITS]u8 = undefined;
    var count: usize = 0;
    var storage: SpellTargetStorage = .{};
    const affected = if (cast.has_target) blk: {
        const aim = spellTarget(state, cast.caster, cast.target, cast.spell, &storage);
        if (!aim.spared) {
            targets[0] = state.slotOf(aim.primary).?;
            count = 1;
        }
        break :blk aim.secondary;
    } else if (cast.has_cell) blk: {
        const cells = meteorCells(spell, cast.cell) orelse return .{};
        break :blk areaSpellDamage(state, cast.caster, spell, cells.slice(), null, true, &storage.hits);
    } else return .{};
    for (affected) |hit| {
        targets[count] = state.slotOf(hit.target).?;
        count += 1;
    }
    if (for (targets[0..count]) |target| {
        if (spells.mirroredShare(&state.units[target]) > 0 or state.units[target].buffs.get(.ember_covenant_blessing) != null)
            break false;
    } else true) return .{};

    // The shared resolver orders each rebound directly after its holder's hit. Apply the rows to
    // scratch in that order so a caster already killed by the first return cannot display more hits.
    var victims: spells.Victims = .{};
    const raw = spells.rawDamage(&state.units[cast.caster], spell, cfg);
    spells.resolveVictims(state, cast.caster, cfg.element, raw, targets[0..count], &victims);
    var scratch = state.*;
    var source: ?u8 = null;
    var feedback: SpellFeedback = .{};
    for (victims.items[0..victims.len]) |victim| {
        const recipient = &scratch.units[victim.slot];
        const id = recipient.uid;
        if (!victim.rebounded) source = id;
        if (recipient.isDead()) continue;
        const covenant = recipient.buffs.get(.ember_covenant_blessing) != null;
        const dealt = engine.applyDamageFrom(&scratch, victim.slot, victim.damage, 0, false, cfg.element, cast.caster);
        if (covenant and cfg.element != st.Element.WATER and victim.damage > 0 and dealt == 0 and
            std.mem.indexOfScalar(u16, absorbs[0..feedback.absorbs], id) == null)
        {
            absorbs[feedback.absorbs] = id;
            feedback.absorbs += 1;
        }
        if (victim.rebounded and source != null) {
            mirrors[feedback.reflections] = source.?;
            feedback.reflections += 1;
        }
    }
    return feedback;
}
