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
    const code = instrumentedSource(b, "combat.zig", &.{
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
    });
    // Keep previews on the same bounce selection, terrain checks and falloff as an accepted shot.
    return std.mem.concat(b.allocator, u8, &.{
        code,
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
    }) catch @panic("out of memory");
}
