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
    });
    const root = sources.addCopyFile(b.path("Engine/skirmish.zig"), "skirmish.zig");
    _ = sources.addCopyFile(b.path("Engine/tactics.zig"), "tactics.zig");
    const module = b.createModule(.{
        .root_source_file = root,
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    module.addOptions("build_options", options);
    b.installArtifact(b.addLibrary(.{ .name = "hoc_macos", .linkage = .static, .root_module = module }));
}
