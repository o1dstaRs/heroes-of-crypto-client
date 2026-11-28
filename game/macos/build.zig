const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const options = b.addOptions();
    options.addOption([]const u8, "common_sha", b.option([]const u8, "common-sha", "Common revision") orelse "unknown");

    // Compile in the same Zig module as the battle engine. The files come from the workspace's common submodule.
    const sources = b.addWriteFiles();
    _ = sources.addCopyDirectory(b.path("../heroes-of-crypto-common/zig/src"), "common", .{
        .include_extensions = &.{ ".zig", ".json" },
        .exclude_extensions = &.{ "combat.zig", "abilities.zig" },
    });
    _ = sources.add("common/combat.zig", nativeCombat(b));
    _ = sources.add("common/abilities.zig", nativeAbilities(b));
    _ = sources.addCopyFile(b.path("Engine/chakram_trace.zig"), "common/chakram_trace.zig");
    _ = sources.addCopyFile(b.path("Engine/petrification_trace.zig"), "common/petrification_trace.zig");
    _ = sources.addCopyFile(b.path("Engine/strike_trace.zig"), "common/strike_trace.zig");
    const root = sources.addCopyFile(b.path("Engine/skirmish.zig"), "skirmish.zig");
    _ = sources.addCopyFile(b.path("Engine/tactics.zig"), "tactics.zig");
    _ = sources.addCopyFile(b.path("Engine/projectile_aim.zig"), "projectile_aim.zig");
    _ = sources.addCopyFile(b.path("Engine/battle_log.zig"), "battle_log.zig");
    const module = b.createModule(.{
        .root_source_file = root,
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    module.addOptions("build_options", options);
    b.installArtifact(b.addLibrary(.{ .name = "hoc_macos", .linkage = .static, .root_module = module }));
}

// The pinned engine's headless event stream omits projectile paths. Instrument the Mac's copy at
// the existing geometry, miss and damage boundaries, leaving the combat rules and server sources intact.
const Hook = struct { seam: []const u8, replacement: []const u8 };

fn before(comptime seam: []const u8, comptime code: []const u8) Hook {
    return .{ .seam = seam, .replacement = code ++ "\n" ++ seam };
}

fn after(comptime seam: []const u8, comptime code: []const u8) Hook {
    return .{ .seam = seam, .replacement = seam ++ "\n" ++ code };
}

fn instrumentedSource(b: *std.Build, file: []const u8, hooks: []const Hook) []const u8 {
    const path = b.path(b.fmt("../heroes-of-crypto-common/zig/src/{s}", .{file})).getPath(b);
    var code = std.fs.cwd().readFileAlloc(b.allocator, path, 2 * 1024 * 1024) catch |err|
        std.debug.panic("Cannot read common {s}: {s}", .{ file, @errorName(err) });
    for (hooks) |hook| {
        if (std.mem.count(u8, code, hook.seam) != 1)
            std.debug.panic("Update the Mac combat trace for common's changed {s} seam: {s}", .{ file, hook.seam });
        code = std.mem.replaceOwned(u8, b.allocator, code, hook.seam, hook.replacement) catch @panic("out of memory");
    }
    return code;
}

fn nativeAbilities(b: *std.Build) []const u8 {
    return instrumentedSource(b, "abilities.zig", &.{.{
        .seam = "const dealt = engine.applyDamageBreak(s, to_i, dmg, 0, false);",
        .replacement = "const gaze_amount_before = to.amount_alive;\n" ++
            "        const dealt = engine.applyDamageBreak(s, to_i, dmg, 0, false);\n" ++
            "        @import(\"petrification_trace.zig\").record(s, from_i, to_i, dealt, gaze_amount_before - to.amount_alive);",
    }});
}

fn nativeCombat(b: *std.Build) []const u8 {
    const code = instrumentedSource(b, "combat.zig", &([_]Hook{
        .{
            .seam = "fn chakramFlight(s: *State, thrower_i: u8, primary_i: u8, missed: bool, flight: *Flight) void {",
            .replacement = "fn chakramFlight(s: *State, thrower_i: u8, primary_i: u8, missed: bool, flight: *Flight) void {\n" ++
                "    defer @import(\"chakram_trace.zig\").recordFlight(s, thrower_i, primary_i, flight);",
        },
        .{
            .seam = "if (Box.touches(b_cells, first)) return true;",
            .replacement = "if (Box.touches(b_cells, first)) {\n" ++
                "                    @import(\"chakram_trace.zig\").noteBridge(s, a.uid, b.uid, ac_, &.{first}, b_cells);\n" ++
                "                    return true;\n                }",
        },
        .{
            .seam = "if (Box.touches(b_cells, second)) return true;",
            .replacement = "if (Box.touches(b_cells, second)) {\n" ++
                "                    @import(\"chakram_trace.zig\").noteBridge(s, a.uid, b.uid, ac_, &.{ first, second }, b_cells);\n" ++
                "                    return true;\n                }",
        },
        .{
            .seam = "if (wingshieldOwner(&s.units[n])) break;",
            .replacement = "if (wingshieldOwner(&s.units[n])) {\n" ++
                "            @import(\"chakram_trace.zig\").noteShield(s, from.uid, s.units[n].uid);\n" ++
                "            break;\n        }",
        },
        .{
            .seam = "fn aoeTail(s: *State, thrower_i: u8, flight: *const Flight, divisor: f64, active_i: u8, died: *Died, hits: ?*SwordHits) f64 {",
            .replacement = "fn aoeTail(s: *State, thrower_i: u8, flight: *const Flight, divisor: f64, active_i: u8, died: *Died, hits: ?*SwordHits) f64 {\n" ++
                "    defer @import(\"chakram_trace.zig\").finishImpact(s, thrower_i, flight);",
        },
        .{
            .seam = "fn pierceSweepCells(",
            .replacement = "pub fn pierceSweepCells(",
        },
        .{
            .seam = "fn pierceCellBehind(",
            .replacement = "pub fn pierceCellBehind(",
        },
        .{
            .seam = "inline fn fireImmune(",
            .replacement = "pub inline fn fireImmune(",
        },
    } ++ strike_hooks));
    // Keep previews on the same bounce selection, terrain checks and falloff as an accepted shot.
    return std.mem.concat(b.allocator, u8, &.{
        nativeFleshShield(b, code),
        @embedFile("Engine/combat_strike_hooks.inc"),
        \\
        \\pub const MacChakramPlan = struct {
        \\    slots: [5]u8 = undefined,
        \\    factors: [5]f64 = undefined,
        \\    len: usize = 0,
        \\};
        \\pub fn macChakramPlan(state: *const State, actor: u8, primary: u8) MacChakramPlan {
        \\    var scratch = state.*;
        \\    var path: Flight = .{};
        \\    planChakram(&scratch, actor, primary, &path);
        \\    var result: MacChakramPlan = .{ .len = @min(5, path.len) };
        \\    @memcpy(result.slots[0..result.len], path.slots[0..result.len]);
        \\    @memcpy(result.factors[0..result.len], path.factors[0..result.len]);
        \\    return result;
        \\}
        \\
        \\pub const MacFireforged = struct {
        \\    power: f64,
        \\    heavy: f64,
        \\    element: f64,
        \\    resist: f64,
        \\
        \\    pub fn burn(self: MacFireforged, base: f64) f64 {
        \\        return @max(0, @floor(@floor(((base * self.power) / 100) * self.heavy * self.element) * (1 - self.resist / 100)));
        \\    }
        \\};
        \\
        \\pub fn macFireforged(s: *const State, from: *const Unit, to: *const Unit) ?MacFireforged {
        \\    if (!holdsSword(s, from) or abilities.absorbsHit(to)) return null;
        \\    const power = from.buffs.get(.fireforged_sword).?.power;
        \\    const element = spells.elementMultiplier(st.Element.FIRE, to);
        \\    const resist = engine.getMagicResist(to);
        \\    if (!std.math.isFinite(power) or power <= 0 or resist >= 100 or element <= 0) return null;
        \\    return .{ .power = power, .heavy = spells.magicDamageTakenMultiplier(to), .element = element, .resist = @max(0, resist) };
        \\}
        \\
    }) catch @panic("out of memory");
}

// Put a boundary at a committed swing or launch, after the engine's eligibility checks. The
// second-arrow miss is still a launch. Echo and Through Shot use the same launch boundaries.
const strike_hooks = [_]Hook{
    after("    const missed = missRoll(s, att, tgt); // M1",
        \\    mac_strikes.begin(s, .melee, .{ .target = ti });
        \\    if (missed) mac_strikes.miss(s, ai, ti);
    ),
    after("    } else if (punch.applied) {",
        \\        mac_strikes.begin(s, .melee, .{ .target = ti });
        \\        if (punch.missed) mac_strikes.miss(s, ai, ti);
    ),
    after("    const missed = missRoll(s, tgt, att); // M3",
        \\    mac_strikes.reply(s, ti, ai, missed);
    ),
    before("    s.fight.replied |= engine.unitBit(ui);",
        \\    mac_strikes.spendReply(s, ui);
    ),
    before("        spendShot(att); // decreaseNumberOfShots: no refresh",
        \\        macTraceThroughShot(s, ai, &g, to);
    ),
    .{
        .seam = "                if (terrain.clearScatteredMountainAt(s, c)) cleared += 1;",
        .replacement =
        \\                if (terrain.clearScatteredMountainAt(s, c)) {
        \\                    macTraceObstacle(s, ai, c, to);
        \\                    cleared += 1;
        \\                }
        ,
    },
    .{
        .seam = "    if (g.n == 0) return true; // an area throw that caught no unit: completed, nothing rolled, spent or refreshed",
        .replacement =
        \\    if (g.n == 0) {
        \\        macTraceShot(s, ai, null, engine.cellForPosition(to[0], to[1]), to, true);
        \\        return true; // an area throw that caught no unit: completed, nothing rolled, spent or refreshed
        \\    }
        ,
    },
    after("    const missed = missRoll(s, att, tgt); // attack_handler.ts:1343",
        \\    macTraceShot(s, ai, target_ui, g.entry[0], to, is_aoe);
        \\    if (missed and aoeAbility(att) == null) mac_strikes.miss(s, ai, target_ui);
    ),
    after("        out.response_thrown = true;",
        \\        mac_strikes.reply(s, target_ui, r, response_missed and aoeAbility(tgt) == null);
    ),
    .{
        .seam = "second = doubleShot(s, ai, target_ui, g.group(group), divisor, is_aoe, died, &decrease, swordList(s, att, &second_hits));",
        .replacement = "second = doubleShot(s, ai, target_ui, g.group(group), divisor, is_aoe, died, &decrease, swordList(s, att, &second_hits), g.entry[group], to);",
    },
    .{
        .seam = "hits: ?*SwordHits) Second {",
        .replacement = "hits: ?*SwordHits, cell: Cell, aim: [2]f64) Second {",
    },
    after("    const missed = missRoll(s, att, to); // double_shot_ability.ts:122",
        \\    macTraceShot(s, ai, to_ui, cell, aim, is_aoe);
        \\    if (missed and !has_chakram) mac_strikes.miss(s, ai, to_ui);
    ),
    .{
        .seam = "throughShot(s, ai, g, true, 1, died, through_list)",
        .replacement = "throughShot(s, ai, g, true, 1, died, through_list, to)",
    },
    .{
        .seam = "throughShot(s, ai, g, false, m, died, through_list)",
        .replacement = "throughShot(s, ai, g, false, m, died, through_list, to)",
    },
    .{
        .seam = "fn throughShot(s: *State, ai: u8, g: *const Groups, decrease_shots: bool, factor: f64, died: *Died, hits: ?*SwordHits) bool {",
        .replacement = "fn throughShot(s: *State, ai: u8, g: *const Groups, decrease_shots: bool, factor: f64, died: *Died, hits: ?*SwordHits, aim: [2]f64) bool {",
    },
    after("    if (!any_live) return false;",
        \\    macTraceThroughShot(s, ai, g, aim);
    ),
    before("        // An Arrows Wingshield owner stops the bolt, hit or missed (through_shot_ability.ts:263).",
        \\        else mac_strikes.miss(s, ai, c);
    ),
    .{
        .seam = "        if (missed) continue;\n        var ability_multiplier = abilities.abilityMultiplier(thrower, a);",
        .replacement =
        \\        if (missed) {
        \\            if (!thrower.has(.chakram)) mac_strikes.miss(s, thrower_i, v);
        \\            continue;
        \\        }
        \\        var ability_multiplier = abilities.abilityMultiplier(thrower, a);
        ,
    },
    .{
        .seam = "        for (stones[0..n]) |c| terrain.spendObstacleHit(s, c, c.x >= st.GRID >> 1);",
        .replacement =
        \\        for (stones[0..n]) |c| {
        \\            macTraceObstacle(s, ai, c, .{ tx, ty });
        \\            terrain.spendObstacleHit(s, c, c.x >= st.GRID >> 1);
        \\        }
        ,
    },
    before("        terrain.spendObstacleHit(s, c, c.x >= st.GRID >> 1);\n        landed = true;",
        \\        mac_strikes.begin(s, .obstacle_shot, .{ .cell = c, .end = .{ tx, ty } });
    ),
    before("    terrain.spendObstacleHit(s, cell, right);\n    att.range_shots -= 1;",
        \\    if (scattered) macTraceObstacle(s, ai, cell, .{ tx, ty }) else
        \\        mac_strikes.begin(s, .obstacle_shot, .{ .cell = cell, .end = .{ tx, ty } });
    ),
    before("    terrain.spendObstacleHit(s, target, is_right);\n    pierceStoneBehind",
        \\    mac_strikes.begin(s, .obstacle_melee, .{ .cell = target });
    ),
    .{
        .seam = "    if (terrain.obstacleStillStands(s) and (att.has(.double_punch) or att.has(.crafted_double_punch))) terrain.spendObstacleHit(s, target, is_right);",
        .replacement =
        \\    if (terrain.obstacleStillStands(s) and (att.has(.double_punch) or att.has(.crafted_double_punch))) {
        \\        mac_strikes.begin(s, .obstacle_melee, .{ .cell = target });
        \\        terrain.spendObstacleHit(s, target, is_right);
        \\    }
        ,
    },
};

fn nativeFleshShield(b: *std.Build, code: []const u8) []const u8 {
    const start = std.mem.indexOf(u8, code, "noinline fn fleshShieldSlow(") orelse @panic("Missing Flesh Shield");
    const end = std.mem.indexOfPos(u8, code, start, "\n/// processFireShieldAbility") orelse @panic("Missing Fire Shield");
    const scan = std.mem.indexOfPos(u8, code, start, "    const att = &s.units[att_i];") orelse @panic("Missing Flesh Shield owner search");
    const limits = std.mem.indexOfPos(u8, code, scan, "    const requested = ") orelse @panic("Missing Flesh Shield cap");
    std.debug.assert(scan < limits and limits < end);
    const selection = std.mem.replaceOwned(u8, b.allocator, code[scan..limits], "return damage;", "return null;") catch @panic("out of memory");
    return std.mem.concat(b.allocator, u8, &.{
        code[0..start],
        \\noinline fn fleshShieldSlow(s: *State, att_i: u8, tgt_i: u8, damage: f64, is_range: bool, died: *Died, plus: *f64, decrease: *MoraleDecrease) f64 {
        \\    if (damage <= 0) return damage;
        \\    const guard = macFleshGuard(s, att_i, tgt_i, is_range) orelse return damage;
        \\    const split = guard.split(damage);
        \\    if (split.cost <= 0) return damage;
        \\    const own = &s.units[guard.owner];
        \\    const dealt = engine.applyDamageFrom(s, guard.owner, split.cost, 0, false, st.Element.UNSET, null);
        \\    engine.markDamageLap(s, dealt);
        \\    if (own.isDead()) {
        \\        if (s.artifacts) artifacts.recordFatal(s, guard.owner, dealt, att_i);
        \\        died.push(guard.owner);
        \\        plus.* += engine.MORALE_CHANGE_FOR_KILL;
        \\        decrease.add(own, engine.MORALE_CHANGE_FOR_KILL);
        \\    }
        \\    return split.remaining;
        \\}
        \\
        \\pub const MacFleshGuard = struct {
        \\    owner: u8,
        \\    percent: f64,
        \\    targetCap: f64,
        \\    ownerCap: f64,
        \\    targetArmor: f64,
        \\    ownerArmor: f64,
        \\    pub const Split = struct { remaining: f64, cost: f64 };
        \\
        \\    fn cost(self: MacFleshGuard, share: f64) f64 {
        \\        if (share <= 0) return 0;
        \\        return if (self.ownerArmor > 0) @max(1, @ceil((share * self.targetArmor) / self.ownerArmor)) else share;
        \\    }
        \\
        \\    pub fn split(self: MacFleshGuard, damage: f64) Split {
        \\        const cap = @min(self.targetCap, self.ownerCap);
        \\        var lo: f64 = 0;
        \\        var hi = @min(@floor(self.targetCap), @floor((damage * self.percent) / 100));
        \\        while (lo < hi) {
        \\            const mid = @ceil((lo + hi) / 2);
        \\            if (self.cost(mid) <= cap) lo = mid else hi = mid - 1;
        \\        }
        \\        return .{ .remaining = damage - lo, .cost = self.cost(lo) };
        \\    }
        \\};
        \\
        \\pub fn macFleshGuard(s: *const State, att_i: u8, tgt_i: u8, is_range: bool) ?MacFleshGuard {
        \\    if (!s.flesh) return null;
        \\
        ,
        selection,
        \\    const syn = s.setup[att.team].ability_power;
        \\    return .{ .owner = own_i, .percent = best_p, .targetCap = t_cap, .ownerCap = engine.cumulativeHp(own),
        \\        .targetArmor = enemyArmor(att, tgt, is_range, syn), .ownerArmor = enemyArmor(att, own, is_range, syn) };
        \\}
        \\
        ,
        code[end..],
    }) catch @panic("out of memory");
}
