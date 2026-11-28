const std = @import("std");
const ffi = @import("common/ffi.zig");
const engine = @import("common/engine.zig");
const combat = @import("common/combat.zig");
const artifacts = @import("common/artifacts.zig");
const ai = @import("common/ai.zig");
const pathing = @import("common/path.zig");
const rec = @import("common/recording.zig");
const st = @import("common/state.zig");
const v08 = @import("common/v08/policy.zig");
const v08util = @import("common/v08/util.zig");
const tactics = @import("tactics.zig");
const projectile = @import("projectile_aim.zig");
const battle_log = @import("battle_log.zig");
const compare = @import("common/compare.zig");
const chakram = @import("common/chakram_trace.zig");
const gaze = @import("common/petrification_trace.zig");

const alloc = std.heap.smp_allocator;
const max_laps = 64;

const MomentKind = enum { place, move, melee, shot, obstacle, spell, wait, defend, end_turn };
const Counterattack = struct { actor: u8, target: u8, spent: bool, splash: ?tactics.Splash = null };
const HealthChange = struct { target: u8, delta: f64, casualties: f64 };
const StatusApplication = struct { target: u8, kind: StatusKind, name: []const u8, borrowedFrom: ?u8 = null, laps: ?f64 = null };
const max_status_applications = st.MAX_UNITS * (st.MAX_SPELLS + st.MAX_DEBUFFS + st.MAX_EFFECTS);
const Presentation = struct { flights: chakram.Flights = .{}, gazes: []const gaze.Impact = &.{} };
const Moment = struct {
    kind: MomentKind,
    actor: u8,
    target: ?u8 = null,
    aim: ?st.Cell = null,
    aim_side: ?u8 = null,
    projectile_end: ?projectile.Point = null,
    spell: ?[]const u8 = null,
    spell_area: ?projectile.MeteorCells = null,
    crossed_fire: engine.Swept = .{},
    mirror_sources: [st.MAX_UNITS]u16 = undefined,
    mirror_count: usize = 0,
    splash: ?tactics.Splash = null,
    counterattack: ?Counterattack = null,
    chakram_flights: chakram.Flights = .{},
    gaze_impacts: [st.MAX_UNITS * 3]gaze.Impact = undefined,
    gaze_len: usize = 0,
    hurt: [st.MAX_UNITS]u16 = undefined,
    hurt_len: usize = 0,
    health_changes: [st.MAX_UNITS]HealthChange = undefined,
    health_len: usize = 0,
    status_applications: [max_status_applications]StatusApplication = undefined,
    status_len: usize = 0,
    shield_breaks: [st.MAX_UNITS]u16 = undefined,
    shield_break_len: usize = 0,
    covenant_breaks: [st.MAX_UNITS]u16 = undefined,
    covenant_break_len: usize = 0,
    covenant_absorbs: [st.MAX_UNITS]u16 = undefined,
    covenant_absorb_len: usize = 0,
    route: [64]st.Cell = undefined,
    route_len: usize = 0,
};

const Health = struct {
    id: u8,
    name_id: u16,
    team: u8,
    hp: f64,
    amount: f64,
    anchor: st.Cell,
    responded: bool,
    unlimited_reply: bool,
    reflects_damage: bool,
    borrowed_grace: bool,
    absolving_arrow: bool,
    abilities: st.AbilityMask,
    buffs: st.SpellList,
    debuffs: st.SpellListN(st.MAX_DEBUFFS),
    effects: st.SpellListN(st.MAX_EFFECTS),
};

const HealthSnapshot = struct {
    entries: [st.MAX_UNITS]Health = undefined,
    count: usize = 0,

    fn capture(state: *const st.State) HealthSnapshot {
        var snapshot: HealthSnapshot = .{};
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
                .responded = hasResponded(state, slot),
                .unlimited_reply = unit.has(.one_in_the_field),
                .reflects_damage = unit.has(.fire_shield),
                .borrowed_grace = unit.has(.borrowed_grace),
                .absolving_arrow = unit.has(.absolving_arrow),
                .abilities = unit.ability_mask,
                .buffs = unit.buffs,
                .debuffs = unit.debuffs,
                .effects = unit.effects,
            };
            snapshot.count += 1;
        }
        return snapshot;
    }

    fn find(snapshot: *const HealthSnapshot, id: u8) ?*const Health {
        for (snapshot.entries[0..snapshot.count]) |*unit| if (unit.id == id) return unit;
        return null;
    }
};

fn hasResponded(state: *const st.State, slot: u8) bool {
    return state.units[slot].responded or state.fight.replied & engine.unitBit(slot) != 0;
}

const DamageTally = struct {
    name_id: u16,
    team: u8,
    amount: f64 = 0,
};

const Battle = struct {
    handle: *ffi.Handle,
    winner: ?u8 = null,
    stalled: bool = false,
    deploying: ?u8 = null,
    prepared_spell: ?u8 = null,
    fire_wall_orientation: u2 = 0,
    sandbox: bool = false,
    automated_teams: u8 = 1 << st.Team.RIGHT,
    revision: u32 = 0,
    moments: [8]Moment = undefined,
    n_moments: usize = 0,
    journal: battle_log.Journal = .{},
    damage: [st.MAX_UIDS]?DamageTally = .{null} ** st.MAX_UIDS,
    opponent_profile: v08util.Battle = .{},

    fn beginUpdate(self: *Battle) void {
        self.revision += 1;
        self.n_moments = 0;
        self.journal.len = 0;
        self.journal.incomplete = false;
    }

    fn recordAction(self: *Battle, action: rec.Action, before: *const HealthSnapshot, after: *const st.State, board: ?*const st.State, presentation: Presentation) void {
        if (self.n_moments == self.moments.len) return;
        var path: []const st.Cell = &.{};
        var moment: Moment = switch (action) {
            .move_unit => |move| blk: {
                path = move.path;
                break :blk .{ .kind = .move, .actor = move.unit };
            },
            .melee_attack => |strike| blk: {
                path = strike.path;
                break :blk .{ .kind = .melee, .actor = strike.attacker, .target = strike.target };
            },
            .range_attack => |shot| .{
                .kind = .shot,
                .actor = shot.attacker,
                .target = if (shot.free) null else shot.target,
                .aim = shot.aim_cell orelse if (shot.free) engine.cellForPosition(shot.tx, shot.ty) else null,
                .aim_side = if (shot.aim_cell != null) shot.aim_side else null,
            },
            .area_throw_attack => |area| .{ .kind = .shot, .actor = area.attacker, .aim = area.target_cell },
            .obstacle_attack => |hit| blk: {
                path = hit.path;
                break :blk .{ .kind = .obstacle, .actor = hit.attacker, .aim = engine.cellForPosition(hit.target_x, hit.target_y) };
            },
            .cast_spell => |cast| .{
                .kind = .spell,
                .actor = cast.caster,
                .target = if (cast.has_target) cast.target else null,
                .aim = if (cast.has_cell) cast.cell else null,
                .spell = @as(st.CastSpell, @enumFromInt(cast.spell)).name(),
            },
            .wait_turn => |turn| .{ .kind = .wait, .actor = turn.unit },
            .defend_turn => |turn| .{ .kind = .defend, .actor = turn.unit },
            .end_turn => |turn| .{ .kind = .end_turn, .actor = turn.unit },
            else => return,
        };
        if (board) |prior| {
            const slotted = engine.actionToSlots(prior, action);
            moment.splash = tactics.actionSplash(prior, slotted);
            switch (slotted) {
                .range_attack => |shot| if (shot.free) {
                    var hits: [st.MAX_UNITS]projectile.ShotHit = undefined;
                    const ray = projectile.throughShot(prior, shot.attacker, .{ shot.tx, shot.ty }, &hits);
                    moment.projectile_end = ray.end;
                    if (ray.hits.len > 0) moment.target = ray.hits[0].target;
                } else if (shot.aim_cell) |cell| {
                    if (projectile.rangeEdge(prior, shot.attacker, shot.target, cell, shot.aim_side, null)) |edge| {
                        moment.projectile_end = edge.obstacle;
                        if (moment.splash == null and edge.interception != null) {
                            moment.projectile_end = edge.interception;
                            moment.target = edge.primary;
                        }
                    }
                },
                .cast_spell => |cast| {
                    if (cast.has_target) {
                        const aim = projectile.spellTarget(prior, cast.caster, cast.target, cast.spell, null);
                        moment.projectile_end = aim.end;
                        moment.target = aim.primary;
                        if (aim.splash) |center| moment.splash = .{ .center = center };
                    }
                    if (cast.has_cell) moment.spell_area = projectile.meteorCells(@enumFromInt(cast.spell), cast.cell);
                    const feedback = projectile.spellFeedback(prior, cast, &moment.mirror_sources, &moment.covenant_absorbs);
                    moment.mirror_count = feedback.reflections;
                    moment.covenant_absorb_len = feedback.absorbs;
                },
                .obstacle_attack => |hit| if (!hit.has_from and moment.splash == null) {
                    moment.projectile_end = projectile.Point.fromWorld(.{ hit.target_x, hit.target_y });
                },
                else => {},
            }
        }
        const flights = presentation.flights;
        moment.chakram_flights = flights;
        moment.gaze_len = presentation.gazes.len;
        @memcpy(moment.gaze_impacts[0..moment.gaze_len], presentation.gazes);
        if (moment.kind == .shot and flights.count != 0) {
            const first = &flights.items[0];
            if (first.actor == moment.actor) moment.target = first.contacts[0].target;
        }
        moment.counterattack = counterattack(&moment, before, after, board);
        if (moment.kind == .shot) {
            for (flights.items[0..flights.count]) |*flight| {
                if (flight.actor == moment.actor) continue;
                moment.counterattack = .{ .actor = flight.actor, .target = flight.contacts[0].target, .spent = true };
                break;
            }
        }
        self.recordDamage(&moment, before, after);
        if (board) |prior| {
            if (path.len != 0 and prior.fight.n_fire != 0 and std.mem.indexOfScalar(u16, moment.hurt[0..moment.hurt_len], moment.actor) != null) {
                if (prior.slotOf(moment.actor)) |slot| {
                    const mover = &prior.units[slot];
                    const factors = engine.fireBurnFactors(mover);
                    if (factors.elem > 0 and factors.mr < 100) {
                        const origin = engine.unitCells(mover);
                        const landing = engine.cellsForAnchor(path[path.len - 1], mover.fw, mover.fh);
                        engine.burningCellsEntered(prior, slot, origin.slice(), path, landing.slice(), false, &moment.crossed_fire);
                    }
                }
            }
        }
        recordStatusApplications(&moment, before, after);
        if (path.len != 0) {
            if (before.find(moment.actor)) |actor| {
                if (!ai.sameCell(path[0], actor.anchor)) {
                    moment.route[0] = actor.anchor;
                    moment.route_len = 1;
                }
            }
            const steps = @min(path.len, moment.route.len - moment.route_len);
            @memcpy(moment.route[moment.route_len..][0..steps], path[0..steps]);
            moment.route_len += steps;
        }
        self.moments[self.n_moments] = moment;
        self.n_moments += 1;
    }

    fn counterattack(moment: *const Moment, before: *const HealthSnapshot, after: *const st.State, board: ?*const st.State) ?Counterattack {
        if (moment.kind != .melee and moment.kind != .shot) return null;
        const target = moment.target orelse return null;
        const actor = before.find(moment.actor) orelse return null;
        for (before.entries[0..before.count]) |*unit| {
            if (unit.team == actor.team or unit.responded or (moment.kind == .melee and unit.id != target)) continue;
            const slot = after.slotOf(unit.id) orelse continue;
            if (hasResponded(after, slot)) {
                if (moment.kind == .shot) {
                    if (board) |prior| {
                        if (tactics.rangedReply(prior, unit.id, actor.id)) |reply| {
                            return .{ .actor = unit.id, .target = reply.target, .spent = true, .splash = reply.splash };
                        }
                    }
                }
                return .{ .actor = unit.id, .target = actor.id, .spent = true };
            }
            if (unit.id == target and unit.unlimited_reply and !unit.reflects_damage) {
                // One in the Field answers without spending the lap's response. A wound still confirms contact.
                const remaining = if (after.slotOf(actor.id)) |a| engine.cumulativeHp(&after.units[a]) else 0;
                if (remaining < actor.hp) return .{ .actor = unit.id, .target = actor.id, .spent = false };
            }
        }
        return null;
    }

    fn recordDamage(self: *Battle, moment: *Moment, before: *const HealthSnapshot, after: *const st.State) void {
        const actor = before.find(moment.actor) orelse return;
        for (before.entries[0..before.count]) |*unit| {
            const survivor = if (after.slotOf(unit.id)) |slot| &after.units[slot] else null;
            const hp = if (survivor) |stack| engine.cumulativeHp(stack) else 0;
            const amount = if (survivor) |stack| @max(0, stack.amount_alive) else 0;
            const loss = unit.hp - hp;
            const casualties = unit.amount - amount;
            if (@abs(loss) > 0.001 or casualties != 0) {
                moment.health_changes[moment.health_len] = .{ .target = unit.id, .delta = -loss, .casualties = casualties };
                moment.health_len += 1;
            }
            if (loss <= 0) continue;
            moment.hurt[moment.hurt_len] = unit.id;
            moment.hurt_len += 1;
            switch (moment.kind) {
                .melee, .shot, .spell, .obstacle => {},
                else => continue,
            }
            // Capture net health removed during the action, before activation or narrowing can deal environmental damage.
            // A melee or ranged response hurts the attacking stack and belongs to the declared defender.
            const source = if (unit.team != actor.team)
                actor
            else if (unit.id == actor.id and (moment.kind == .melee or moment.kind == .shot))
                before.find(moment.target orelse continue) orelse continue
            else
                continue;
            if (self.damage[source.id] == null) self.damage[source.id] = .{ .name_id = source.name_id, .team = source.team };
            self.damage[source.id].?.amount += loss;
        }
    }

    fn recordEvents(self: *Battle, events: []const rec.Event) void {
        for (events) |event| {
            if (event.kind == .fight_finished) self.winner = @intCast(event.arg);
        }
    }

    fn findTurn(self: *Battle) void {
        const state = &self.handle.state;
        for (0..2) |pass| {
            for (0..@as(usize, state.n_holder) + 2) |_| {
                if (state.active >= 0 or state.fight.finished) return;
                var events: engine.Events = .{};
                const advance: rec.Action = .{ .advance = .{ .damage_dealt_this_lap = state.damage_lap == state.fight.lap } };
                const seed = state.rng.state;
                _ = engine.apply(state, advance, &events);
                self.journal.push(advance, seed, state, events.slice());
                self.recordEvents(events.slice());
            }
            if (state.active >= 0 or state.fight.finished) return;
            if (pass == 0) {
                if (!engine.forceStalledLap(state)) break;
                self.journal.incomplete = true;
            }
        }
        self.stalled = true;
    }

    fn player(self: *const Battle) ?u8 {
        const state = &self.handle.state;
        if (self.stalled or state.fight.finished or state.active < 0) return null;
        const slot: u8 = @intCast(state.active);
        return if (!self.automates(slot)) slot else null;
    }

    fn automates(self: *const Battle, slot: u8) bool {
        const unit = &self.handle.state.units[slot];
        return unit.has(.ai_driven) or self.automated_teams & (@as(u8, 1) << @as(u3, @intCast(unit.team))) != 0;
    }

    fn commit(self: *Battle, action: rec.Action) bool {
        // A refused command leaves the current board, attack mode and RNG intact.
        var next = self.handle.state;
        var events: engine.Events = .{};
        const before = HealthSnapshot.capture(&next);
        const named = engine.actionToUids(&next, action);
        var capture = chakram.Capture{ .state = &next };
        var gaze_capture = gaze.Capture{ .state = &next };
        const previous = chakram.current;
        const previous_gaze = gaze.current;
        chakram.current = &capture;
        gaze.current = &gaze_capture;
        defer chakram.current = previous;
        defer gaze.current = previous_gaze;
        if (!engine.apply(&next, action, &events)) return false;
        self.beginUpdate();
        self.journal.push(named, self.handle.state.rng.state, &next, events.slice());
        self.recordAction(named, &before, &next, &self.handle.state, .{
            .flights = capture.drain(),
            .gazes = gaze_capture.drain(),
        });
        self.prepared_spell = null;
        self.recordEvents(events.slice());
        // A plain movement ends a manual activation in the browser Sandbox. The AI's
        // scripted approach-and-strike sequence is driven separately by continueMatchWith.
        if (action == .move_unit and next.active == @as(i8, @intCast(action.move_unit.unit))) {
            const end: rec.Action = .{ .end_turn = .{ .unit = action.move_unit.unit, .reason = .manual } };
            const move_result = HealthSnapshot.capture(&next);
            const named_end = engine.actionToUids(&next, end);
            const seed = next.rng.state;
            var end_events: engine.Events = .{};
            if (engine.apply(&next, end, &end_events)) {
                self.journal.push(named_end, seed, &next, end_events.slice());
                self.recordAction(named_end, &move_result, &next, null, .{});
                self.recordEvents(end_events.slice());
            }
        }
        self.handle.state = next;
        self.findTurn();
        self.stalled = self.stalled or self.handle.state.overflow;
        return true;
    }
};

fn recordStatusApplications(moment: *Moment, before: *const HealthSnapshot, after: *const st.State) void {
    const actor = before.find(moment.actor);
    const shot_target = if (moment.kind == .shot) before.find(moment.target orelse st.NO_UID) else null;
    const replying = if (moment.counterattack) |reply| before.find(reply.actor) else null;
    for (after.holderOrder()) |slot| {
        const unit = &after.units[slot];
        if (unit.isDead()) continue;
        const previous = before.find(unit.uid) orelse continue;
        if (previous.buffs.get(.water_shield) != null and unit.buffs.get(.water_shield) == null) {
            moment.shield_breaks[moment.shield_break_len] = unit.uid;
            moment.shield_break_len += 1;
        }
        if (previous.buffs.get(.ember_covenant_blessing) != null and unit.buffs.get(.ember_covenant_blessing) == null) {
            moment.covenant_breaks[moment.covenant_break_len] = unit.uid;
            moment.covenant_break_len += 1;
        }
        const first_buff = moment.status_len;
        recordStatusList(moment, unit.uid, .buff, &previous.buffs, &unit.buffs);
        if (moment.kind == .shot and previous.borrowed_grace) {
            const source = if (unit.uid == moment.actor) shot_target else if (replying != null and unit.uid == replying.?.id) actor else null;
            if (source) |victim| {
                for (moment.status_applications[first_buff..moment.status_len]) |*application| {
                    const id = st.SpellId.fromName(application.name) orelse continue;
                    const original = victim.buffs.get(id) orelse continue;
                    const landed = unit.buffs.get(id) orelse continue;
                    if (landed.power == original.power and landed.src_x == original.src_x and landed.src_y == original.src_y and
                        @abs(landed.laps - original.laps) <= 1) application.borrowedFrom = victim.id;
                }
            }
        }
        recordStatusList(moment, unit.uid, .debuff, &previous.debuffs, &unit.debuffs);
        recordStatusList(moment, unit.uid, .effect, &previous.effects, &unit.effects);
        if (moment.kind == .spell and std.mem.eql(u8, moment.spell orelse "", "Craft")) {
            for ([_]st.AbilityId{ .crafted_double_punch, .crafted_double_shot, .crafted_frozen_sword, .crafted_frozen_bow }) |id| {
                if (unit.ability_mask & id.bit() != 0 and previous.abilities & id.bit() == 0) {
                    addStatusApplication(moment, .{ .target = unit.uid, .kind = .buff, .name = id.name() });
                }
            }
        }
        if (moment.kind == .shot) {
            const shooter = if (actor != null and actor.?.team == unit.team) actor else replying;
            if (shooter) |source| {
                if (source.absolving_arrow and source.team == unit.team and source.id != unit.uid and
                    (lostStatus(&previous.effects, &unit.effects) or lostStatus(&previous.debuffs, &unit.debuffs)))
                {
                    addStatusApplication(moment, .{ .target = unit.uid, .kind = .buff, .name = "Absolving Arrow" });
                }
            }
        }
    }
}

fn lostStatus(before: anytype, after: anytype) bool {
    for (before.items[0..before.len]) |status| {
        if (status.laps > 0 and status.laps < st.LAPS_AURA and !status.id.isArtifact() and
            status.id != .dismorale and status.id != .visible and after.get(status.id) == null) return true;
    }
    return false;
}

fn addStatusApplication(moment: *Moment, status: StatusApplication) void {
    if (moment.status_len == moment.status_applications.len) return;
    moment.status_applications[moment.status_len] = status;
    moment.status_len += 1;
}

fn recordStatusList(moment: *Moment, target: u8, kind: StatusKind, before: anytype, after: anytype) void {
    for (after.items[0..after.len]) |status| {
        if (status.id.isAugment() or status.id.isArtifact() or status.laps >= st.LAPS_AURA) continue;
        if (before.get(status.id)) |prior| {
            if (status.laps <= prior.laps and status.power == prior.power and
                status.src_x == prior.src_x and status.src_y == prior.src_y) continue;
        }
        addStatusApplication(moment, .{ .target = target, .kind = kind, .name = status.id.name(), .laps = status.shownLaps() });
    }
}

fn copyError(out: ?[*]u8, capacity: usize, message: []const u8) void {
    if (capacity == 0) return;
    const buffer = out orelse return;
    const length = @min(message.len, capacity - 1);
    @memcpy(buffer[0..length], message[0..length]);
    buffer[length] = 0;
}

export fn hoc_macos_create(json: ?[*]const u8, length: usize, err: ?[*]u8, capacity: usize) ?*Battle {
    const worker = ffi.hoc_engine_new() orelse {
        copyError(err, capacity, "Could not allocate the Zig engine.");
        return null;
    };
    defer ffi.hoc_engine_free(worker);
    const handle = ffi.hoc_state_load(worker, json, length) orelse {
        copyError(err, capacity, std.mem.span(ffi.hoc_last_error(worker)));
        return null;
    };
    const map = handle.state.fight.grid_type;
    if ((map != st.GridType.NORMAL and map != st.GridType.LAVA_CENTER and map != st.GridType.BLOCK_CENTER) or
        handle.state.fight.started or handle.state.fight.finished)
    {
        ffi.hoc_state_free(worker, handle);
        copyError(err, capacity, "Expected a fresh skirmish on a supported battlefield.");
        return null;
    }
    const battle = alloc.create(Battle) catch {
        ffi.hoc_state_free(worker, handle);
        copyError(err, capacity, "Could not allocate the skirmish.");
        return null;
    };
    battle.* = .{ .handle = handle };
    for (handle.state.holderOrder()) |slot| {
        if (handle.state.units[slot].team == st.Team.LEFT) {
            battle.deploying = slot;
            break;
        }
    }
    return battle;
}

export fn hoc_macos_destroy(battle: ?*Battle) void {
    const holder = battle orelse return;
    ffi.hoc_state_free(null, holder.handle);
    alloc.destroy(holder);
}

export fn hoc_macos_log_steps(battle: *const Battle, out: ?[*]u8, capacity: usize) usize {
    const json = std.json.Stringify.valueAlloc(alloc, .{
        .steps = battle.journal.slice(),
        .complete = !battle.journal.incomplete,
    }, .{}) catch return 0;
    defer alloc.free(json);
    if (out != null and json.len <= capacity) @memcpy(out.?[0..json.len], json);
    return json.len;
}

export fn hoc_macos_check_log_state(battle: *const Battle, json: [*]const u8, length: usize, out: ?[*]u8, capacity: usize) bool {
    const digest = std.json.parseFromSlice(std.json.Value, alloc, json[0..length], .{}) catch return false;
    defer digest.deinit();
    const units = rec.get(digest.value, "units");
    if (units != .array or rec.get(digest.value, "fight") != .object) return false;
    for (units.array.items) |unit| {
        if (unit != .array or unit.array.items.len < 35 or unit.array.items[0] != .string) return false;
    }
    var mismatch: compare.Mismatch = .{};
    if (compare.state(&battle.handle.state, battle.handle.ids, digest.value, &mismatch)) return true;
    copyError(out, capacity, mismatch.text());
    return false;
}

const DeploymentCell = extern struct { x: i32, y: i32 };

export fn hoc_macos_configure_sandbox(battle: *Battle, anchors: ?[*]const DeploymentCell, count: usize, automated: u8) bool {
    if (battle.handle.state.fight.started or count != battle.handle.state.n_holder) return false;
    if (count > 0 and anchors == null) return false;
    var next = battle.handle.state;
    for (next.holderOrder(), 0..) |slot, index| {
        const point = anchors.?[index];
        const cells = tactics.placement(&next, slot, .{ .x = point.x, .y = point.y }) orelse return false;
        var registered = true;
        for (cells.slice()) |cell| if (ai.occupant(&next, cell) != slot) {
            registered = false;
            break;
        };
        if (!registered) {
            if (!engine.occupyCells(&next, slot, cells.slice())) return false;
            engine.setPosition(&next.units[slot], engine.positionForCells(cells.slice()).?);
        }
    }
    engine.refreshStackPowerForAllUnits(&next);
    battle.handle.state = next;
    battle.sandbox = true;
    battle.automated_teams = automated;
    battle.deploying = null;
    return true;
}

export fn hoc_macos_set_automation(battle: *Battle, automated: u8) bool {
    const state = &battle.handle.state;
    const teams: u8 = (1 << st.Team.LEFT) | (1 << st.Team.RIGHT);
    if (battle.stalled or state.fight.finished or automated & ~teams != 0) return false;
    battle.automated_teams = automated;
    if (state.active >= 0 and battle.automates(@intCast(state.active))) battle.prepared_spell = null;
    return true;
}

const Stack = struct {
    id: u8,
    name: []const u8,
    team: u8,
    faction: u8,
    amount: f64,
    losses: f64,
    hp: f64,
    max_hp: f64,
    shots: ?f64,
    shot_distance: f64,
    full_damage_shot_cells: ?u8,
    selected_attack: u8,
    attack: f64,
    armor: f64,
    range_armor: f64,
    magic_resist: f64,
    initiative: f64,
    movement: f64,
    morale: f64,
    luck: f64,
    damage_min: f64,
    damage_max: f64,
    flies: bool,
    responded: bool,
    immobilized: bool,
    waiting: bool,
    skipping: bool,
    stack_power: f64,
    abilities: []const []const u8,
    book: []const BookEntry,
    statuses: []const Status,
    auras: []const AuraView,
    cells: []const st.Cell,
};

const AuraView = struct { name: []const u8, range: f64, positive: bool };
const BookEntry = struct { name: []const u8, charges: u8 };
const Spell = struct {
    id: u8,
    name: []const u8,
    charges: u8,
    available: bool,
    aim: tactics.SpellAim,
    requiredPower: f64,
    unavailableReason: ?[]const u8,
};
const MomentView = struct {
    kind: MomentKind,
    actor: u8,
    target: ?u8,
    aim: ?st.Cell,
    aimSide: ?u8,
    projectileEnd: ?projectile.Point,
    spell: ?[]const u8,
    spellArea: ?[]const st.Cell,
    crossedFire: []const st.Cell,
    mirrorSources: []const u16,
    splash: ?tactics.Splash,
    counterattack: ?Counterattack,
    chakramFlights: ?*const chakram.Flights,
    gazeImpacts: []const gaze.Impact,
    route: []const st.Cell,
    hurt: []const u16,
    healthChanges: []const HealthChange,
    statusApplications: []const StatusApplication,
    waterShieldBreaks: []const u16,
    covenantBreaks: []const u16,
    covenantAbsorbs: []const u16,
};
const StatusKind = enum { buff, debuff, effect };
const Status = struct {
    kind: StatusKind,
    name: []const u8,
    laps: f64,
    power: f64,
    first: ?i8,
    second: ?i8,
};

fn addStatuses(output: []Status, list: anytype, kind: StatusKind) usize {
    for (list.items[0..list.len], 0..) |row, i| {
        output[i] = .{
            .kind = kind,
            .name = row.id.name(),
            .laps = @max(0, row.shownLaps()),
            .power = row.power,
            .first = if (row.src_x >= 0) row.src_x else null,
            .second = if (row.src_y >= 0) row.src_y else null,
        };
    }
    return list.len;
}

export fn hoc_macos_view(battle: *Battle, output: ?[*]u8, capacity: usize) usize {
    // The path query's overflow flag belongs to the scratch copy, so reading a view never changes the battle.
    var state = battle.handle.state;
    var forecasts = std.heap.ArenaAllocator.init(alloc);
    defer forecasts.deinit();
    var stacks: [st.MAX_UNITS]Stack = undefined;
    var footprints: [st.MAX_UNITS]engine.Cells = undefined;
    var statuses: [st.MAX_UNITS][st.MAX_SPELLS + st.MAX_DEBUFFS + st.MAX_EFFECTS]Status = undefined;
    var auras: [st.MAX_UNITS][st.MAX_UNIT_AURAS]AuraView = undefined;
    var abilities: [st.MAX_UNITS][st.MAX_ABILITIES][]const u8 = undefined;
    var books: [st.MAX_UNITS][st.MAX_BOOK_SPELLS]BookEntry = undefined;
    var count: usize = 0;
    var attacks: [st.MAX_UNITS]u16 = undefined;
    const AttackView = struct { target: u8, angles: []const tactics.AttackAngle };
    var attack_views: [st.MAX_UNITS]AttackView = undefined;
    var attack_angles: [st.MAX_UNITS][tactics.max_attack_angles]tactics.AttackAngle = undefined;
    var n_attacks: usize = 0;
    var moves: [st.GRID * st.GRID]st.Cell = undefined;
    var n_moves: usize = 0;
    var area_aims: [st.GRID * st.GRID]tactics.AreaAim = undefined;
    var n_area_aims: usize = 0;
    var holes: [st.GRID * st.GRID]st.Cell = undefined;
    var n_holes: usize = 0;
    var stones: [st.GRID * st.GRID]st.Cell = undefined;
    var n_stones: usize = 0;
    var lava: [st.GRID * st.GRID]st.Cell = undefined;
    var n_lava: usize = 0;
    var obstacle_targets: [st.GRID * st.GRID]st.Cell = undefined;
    var n_obstacle_targets: usize = 0;
    var can_wait = false;
    var spells: [st.MAX_BOOK_SPELLS]Spell = undefined;
    var n_spells: usize = 0;
    var spell_cells: [st.GRID * st.GRID]st.Cell = undefined;
    var n_spell_cells: usize = 0;
    var spell_targets: [st.MAX_UNITS]projectile.Spell = undefined;
    var spell_target_storage: [st.MAX_UNITS]projectile.SpellTargetStorage = undefined;
    var n_spell_targets: usize = 0;
    var meteor_aims: [st.GRID * st.GRID]projectile.MeteorAim = undefined;
    var meteor_cells: [st.GRID * st.GRID]projectile.MeteorCells = undefined;
    var meteor_hits: [st.GRID * st.GRID][9]projectile.SpellDamage = undefined;
    var n_meteor_aims: usize = 0;
    const is_fire_wall = battle.prepared_spell == @intFromEnum(st.CastSpell.fire_wall);
    const FireWallAimView = struct { anchor: st.Cell, footprint: []const st.Cell, lit: []const st.Cell };
    var fire_wall_aims: [st.GRID * st.GRID]FireWallAimView = undefined;
    var fire_wall_footprints: [st.GRID * st.GRID]tactics.FireWallAim = undefined;
    const player = battle.player();
    const can_aim_through = player != null and battle.prepared_spell == null and projectile.canAimThrough(&state, player.?);
    var ctx: ai.Ctx = undefined;
    if (player) |slot| {
        ai.initCtxInto(&ctx, &state, slot);
        const unit = ctx.unit();
        can_wait = engine.canWaitOnHourglass(&state, slot);
        for (unit.spells[0..unit.n_spells]) |spell| {
            const aim = tactics.spellAim(&state, spell.spell) orelse continue;
            const can_prepare = tactics.canPrepareSpell(&state, slot, spell.spell);
            const available = can_prepare and (aim != .army or tactics.spellAction(&state, slot, spell.spell, null, 0) != null);
            const minimum = state.spell_cfg[spell.spell].min_stack_power;
            spells[n_spells] = .{
                .id = spell.spell,
                .name = @as(st.CastSpell, @enumFromInt(spell.spell)).name(),
                .charges = spell.amount,
                .available = available,
                .aim = aim,
                .requiredPower = minimum,
                .unavailableReason = if (available) null else if (unit.moved_this_turn)
                    "The caster has already moved this turn."
                else if (spell.amount == 0)
                    "No scrolls remaining."
                else if (minimum > engine.getStackPower(unit))
                    "This spell requires more stack power."
                else
                    "The caster cannot use this spell right now.",
            };
            n_spells += 1;
        }
        if (battle.prepared_spell) |spell| {
            switch (tactics.spellAim(&state, spell).?) {
                .army => {},
                .unit => {
                    for (state.holderOrder()) |target| {
                        const other = &state.units[target];
                        if (other.isDead()) continue;
                        if (tactics.spellAction(&state, slot, spell, engine.baseCell(other), 0) == null) continue;
                        spell_target_storage[n_spell_targets] = .{};
                        spell_targets[n_spell_targets] = projectile.spellTarget(&state, slot, target, spell, &spell_target_storage[n_spell_targets]);
                        n_spell_targets += 1;
                        const cells = engine.unitCells(other);
                        for (cells.slice()) |cell| {
                            spell_cells[n_spell_cells] = cell;
                            n_spell_cells += 1;
                        }
                    }
                },
                .cell => {
                    for (0..st.GRID) |x| for (0..st.GRID) |y| {
                        const cell: st.Cell = .{ .x = @intCast(x), .y = @intCast(y) };
                        if (is_fire_wall) {
                            const aim = &fire_wall_footprints[n_spell_cells];
                            aim.* = tactics.fireWallAim(&state, cell, battle.fire_wall_orientation);
                            if (aim.lit.len == 0) continue;
                            fire_wall_aims[n_spell_cells] = .{ .anchor = cell, .footprint = aim.footprint.slice(), .lit = aim.lit.slice() };
                        } else {
                            if (tactics.spellAction(&state, slot, spell, cell, 0) == null) continue;
                            const kind: st.CastSpell = @enumFromInt(spell);
                            if (projectile.meteorCells(kind, cell)) |footprint| {
                                meteor_cells[n_meteor_aims] = footprint;
                                meteor_aims[n_meteor_aims] = projectile.meteorAim(&state, slot, kind, cell, &meteor_cells[n_meteor_aims], &meteor_hits[n_meteor_aims]);
                                n_meteor_aims += 1;
                            }
                        }
                        spell_cells[n_spell_cells] = cell;
                        n_spell_cells += 1;
                    };
                },
            }
        } else if (tactics.canAimAreaThrow(&state, slot)) {
            for (0..st.GRID) |x| for (0..st.GRID) |y| {
                const cell: st.Cell = .{ .x = @intCast(x), .y = @intCast(y) };
                if (tactics.areaAim(&state, slot, cell, forecasts.allocator())) |aim| {
                    area_aims[n_area_aims] = aim;
                    n_area_aims += 1;
                }
            };
        } else if (!can_aim_through) if (tactics.movePath(&ctx)) |path| {
            for (path.known()) |*route| {
                if (ai.isLegalMoveRoute(&ctx, route.cell, path, route)) {
                    moves[n_moves] = route.cell;
                    n_moves += 1;
                }
            }
        };
    } else if (battle.deploying) |slot| {
        for (0..st.GRID) |x| for (0..st.GRID) |y| {
            const cell: st.Cell = .{ .x = @intCast(x), .y = @intCast(y) };
            if (ai.sameCell(cell, engine.baseCell(&state.units[slot])) or tactics.placement(&state, slot, cell) == null) continue;
            moves[n_moves] = cell;
            n_moves += 1;
        };
    }
    for (state.holderOrder()) |slot| {
        const unit = &state.units[slot];
        if (unit.isDead()) continue;
        footprints[count] = engine.unitCells(unit);
        var n_statuses = addStatuses(&statuses[count], &unit.buffs, .buff);
        n_statuses += addStatuses(statuses[count][n_statuses..], &unit.debuffs, .debuff);
        n_statuses += addStatuses(statuses[count][n_statuses..], &unit.effects, .effect);
        var n_auras: usize = 0;
        for (unit.auras[0..unit.auraCount()]) |id| {
            const aura = state.aura_defs[id];
            const range = aura.range + state.setup[unit.team].aura_range;
            if (aura.range <= 0 or range <= 0 or !std.math.isFinite(range)) continue;
            auras[count][n_auras] = .{ .name = aura.buff.name(), .range = range, .positive = aura.is_buff };
            n_auras += 1;
        }
        for (unit.abilities[0..unit.n_abilities], 0..) |ability, i| abilities[count][i] = ability.id.name();
        var book_count: usize = 0;
        for (unit.spells[0..unit.n_spells]) |card| {
            if (card.spell >= st.N_CAST_SPELLS or card.amount == 0) continue;
            books[count][book_count] = .{ .name = @as(st.CastSpell, @enumFromInt(card.spell)).name(), .charges = card.amount };
            book_count += 1;
        }
        const melee_ranged = unit.attack_type_selected == st.AttackType.MELEE and unit.attack_type == st.AttackType.RANGE and !unit.has(.handyman);
        const range_capable = engine.isRangeCapable(unit);
        const full_damage_distance = if (unit.has(.sniper) or artifacts.farsight(unit)) @as(f64, st.GRID) else unit.shot_distance;
        stacks[count] = .{
            .id = unit.uid,
            .name = battle.handle.names[unit.name_id],
            .team = unit.team,
            .faction = unit.faction,
            .amount = unit.amount_alive,
            .losses = unit.amount_died,
            .hp = unit.hp,
            .max_hp = unit.max_hp,
            .shots = if (range_capable) engine.getRangeShots(unit) else null,
            .shot_distance = unit.shot_distance,
            .full_damage_shot_cells = if (range_capable and full_damage_distance > 0 and std.math.isFinite(full_damage_distance))
                @intFromFloat(@min(st.GRID, @floor(full_damage_distance)))
            else
                null,
            .selected_attack = unit.attack_type_selected,
            .attack = engine.getAttack(unit) * unit.attack_multiplier / @as(f64, if (melee_ranged) 2 else 1),
            .armor = engine.getArmor(unit),
            .range_armor = engine.getRangeArmor(unit),
            .magic_resist = engine.getMagicResist(unit),
            .initiative = unit.initiative,
            .movement = engine.getSteps(unit),
            .morale = engine.getMorale(unit),
            .luck = engine.getLuck(unit),
            .damage_min = unit.attack_damage_min,
            .damage_max = unit.attack_damage_max,
            .flies = engine.canFly(unit),
            .responded = hasResponded(&state, slot),
            .immobilized = !unit.canMove(),
            .waiting = unit.on_hourglass and !unit.isSkipping() and !unit.whirlpooled(),
            .skipping = unit.isSkipping(),
            .stack_power = engine.getStackPower(unit),
            .abilities = abilities[count][0..unit.n_abilities],
            .book = books[count][0..book_count],
            .statuses = statuses[count][0..n_statuses],
            .auras = auras[count][0..n_auras],
            .cells = footprints[count].slice(),
        };
        count += 1;
        if (player != null and battle.prepared_spell == null and unit.team != ctx.unit().team) {
            const angles = tactics.attackAngles(&ctx, slot, moves[0..n_moves], &attack_angles[n_attacks], forecasts.allocator());
            if (angles.len == 0) continue;
            attacks[n_attacks] = unit.uid;
            attack_views[n_attacks] = .{
                .target = unit.uid,
                .angles = angles,
            };
            n_attacks += 1;
        }
    }
    for (state.grid.board, 0..) |column, x| {
        for (column, 0..) |cell, y| {
            const point: st.Cell = .{ .x = @intCast(x), .y = @intCast(y) };
            switch (cell) {
                st.HOLE => {
                    holes[n_holes] = point;
                    n_holes += 1;
                },
                st.LAVA => {
                    lava[n_lava] = point;
                    n_lava += 1;
                },
                st.BLOCK => {
                    stones[n_stones] = point;
                    n_stones += 1;
                    if (player != null and battle.prepared_spell == null and tactics.obstacleAttack(&ctx, point) != null) {
                        obstacle_targets[n_obstacle_targets] = point;
                        n_obstacle_targets += 1;
                    }
                },
                else => {},
            }
        }
    }
    var moments: [8]MomentView = undefined;
    for (battle.moments[0..battle.n_moments], 0..) |*moment, index| {
        moments[index] = .{
            .kind = moment.kind,
            .actor = moment.actor,
            .target = moment.target,
            .aim = moment.aim,
            .aimSide = moment.aim_side,
            .projectileEnd = moment.projectile_end,
            .spell = moment.spell,
            .spellArea = if (moment.spell_area) |*area| area.slice() else null,
            .crossedFire = moment.crossed_fire.slice(),
            .mirrorSources = moment.mirror_sources[0..moment.mirror_count],
            .splash = moment.splash,
            .counterattack = moment.counterattack,
            .chakramFlights = if (moment.chakram_flights.count > 0) &moment.chakram_flights else null,
            .gazeImpacts = moment.gaze_impacts[0..moment.gaze_len],
            .route = moment.route[0..moment.route_len],
            .hurt = moment.hurt[0..moment.hurt_len],
            .healthChanges = moment.health_changes[0..moment.health_len],
            .statusApplications = moment.status_applications[0..moment.status_len],
            .waterShieldBreaks = moment.shield_breaks[0..moment.shield_break_len],
            .covenantBreaks = moment.covenant_breaks[0..moment.covenant_break_len],
            .covenantAbsorbs = moment.covenant_absorbs[0..moment.covenant_absorb_len],
        };
    }
    var queue: [st.MAX_UNITS]u16 = undefined;
    const next = state.fight.up_next;
    for (next.items[0..next.len], 0..) |slot, i| queue[i] = state.units[slot].uid;
    const active = if (state.active >= 0) &state.units[@intCast(state.active)] else null;
    const aggr_target: ?u8 = if (active) |unit|
        if (combat.forcedTarget(&state, unit)) |slot| state.units[slot].uid else null
    else
        null;
    const gaze_target: ?u8 = if (active) |unit|
        if (state.forbids(unit, unit.forbidden)) unit.forbidden else null
    else
        null;
    var stacks_to_act: usize = 0;
    if (active) |unit| {
        for (state.holderOrder()) |slot| {
            const ally = &state.units[slot];
            if (!ally.isDead() and ally.team == unit.team and state.fight.made & engine.unitBit(slot) == 0) {
                stacks_to_act += 1;
            }
        }
    }
    var attack_modes: [@typeInfo(@FieldType(st.Unit, "possible")).array.len]u16 = undefined;
    if (active) |unit| {
        for (unit.possible[0..unit.n_possible], 0..) |mode, i| attack_modes[i] = mode;
    }
    const DamageView = struct { id: usize, name: []const u8, team: u8, amount: f64 };
    var damage: [st.MAX_UIDS]DamageView = undefined;
    var n_damage: usize = 0;
    for (battle.damage, 0..) |tally, uid| {
        const value = tally orelse continue;
        damage[n_damage] = .{ .id = uid, .name = battle.handle.names[value.name_id], .team = value.team, .amount = value.amount };
        n_damage += 1;
    }
    const TerrainTileView = struct { cell: st.Cell, laps: i16 };
    var fire_tiles: [st.MAX_FIRE]TerrainTileView = undefined;
    for (state.fight.fire[0..state.fight.n_fire], 0..) |fire, i| {
        fire_tiles[i] = .{ .cell = .{ .x = fire.x, .y = fire.y }, .laps = fire.laps };
    }
    var smoke_tiles: [st.MAX_SMOKE]TerrainTileView = undefined;
    for (state.fight.smoke[0..state.fight.n_smoke], 0..) |smoke, i| {
        smoke_tiles[i] = .{ .cell = .{ .x = smoke.x, .y = smoke.y }, .laps = smoke.laps };
    }
    const view = std.json.Stringify.valueAlloc(alloc, .{
        .size = st.GRID,
        .map = state.fight.grid_type,
        .lap = state.fight.lap,
        .active = if (active) |unit| @as(?u8, unit.uid) else null,
        .aggrTarget = aggr_target,
        .terrifyingGazeTarget = gaze_target,
        .activeTeamStacksToAct = stacks_to_act,
        .automatedTurn = state.active >= 0 and battle.automates(@intCast(state.active)),
        .mode = if (active) |unit| @as(?u8, unit.attack_type_selected) else null,
        .attackModes = attack_modes[0..if (active) |unit| unit.n_possible else 0],
        .canCycle = player != null and active.?.n_possible > 1,
        .deploying = if (battle.deploying) |slot| @as(?u8, state.units[slot].uid) else null,
        .started = state.fight.started,
        .winner = battle.winner,
        .stalled = battle.stalled,
        .stacks = stacks[0..count],
        .attacks = attacks[0..n_attacks],
        .attackOptions = attack_views[0..n_attacks],
        .canAimThrough = can_aim_through,
        .areaAims = area_aims[0..n_area_aims],
        .moves = moves[0..n_moves],
        .holes = holes[0..n_holes],
        .stones = stones[0..n_stones],
        .lava = lava[0..n_lava],
        .fireTiles = fire_tiles[0..state.fight.n_fire],
        .smokeTiles = smoke_tiles[0..state.fight.n_smoke],
        .obstacleTargets = obstacle_targets[0..n_obstacle_targets],
        .canWait = can_wait,
        .spells = spells[0..n_spells],
        .preparedSpell = battle.prepared_spell,
        .spellCells = spell_cells[0..n_spell_cells],
        .spellTargets = spell_targets[0..n_spell_targets],
        .meteorAims = meteor_aims[0..n_meteor_aims],
        .fireWallAims = if (is_fire_wall) fire_wall_aims[0..n_spell_cells] else @as(?[]const FireWallAimView, null),
        .queue = queue[0..next.len],
        .revision = battle.revision,
        .moments = moments[0..battle.n_moments],
        .damage = damage[0..n_damage],
    }, .{}) catch return 0;
    defer alloc.free(view);
    if (output) |buffer| {
        if (view.len <= capacity) @memcpy(buffer[0..view.len], view);
    }
    return view.len;
}

export fn hoc_macos_choose_cell(battle: *Battle, x: i32, y: i32) bool {
    const cell: st.Cell = .{ .x = x, .y = y };
    if (!engine.cellWithinGrid(cell)) return false;
    if (!battle.handle.state.fight.started) {
        const state = &battle.handle.state;
        if (ai.occupant(state, cell)) |target| {
            if ((battle.sandbox or state.units[target].team == st.Team.LEFT) and battle.deploying != target) {
                return hoc_macos_select_stack(battle, state.units[target].uid);
            }
        }
        const slot = battle.deploying orelse return false;
        const cells = tactics.placement(state, slot, cell) orelse return false;
        if (ai.sameCell(cell, engine.baseCell(&state.units[slot]))) return false;
        var next = state.*;
        engine.cleanupAll(&next, slot);
        if (!engine.occupyCells(&next, slot, cells.slice())) return false;
        engine.setPosition(&next.units[slot], engine.positionForCells(cells.slice()).?);
        state.* = next;
        battle.deploying = null;
        battle.beginUpdate();
        battle.moments[0] = .{ .kind = .place, .actor = state.units[slot].uid };
        battle.n_moments = 1;
        return true;
    }
    const slot = battle.player() orelse return false;
    if (battle.prepared_spell) |spell| {
        const action = tactics.spellAction(&battle.handle.state, slot, spell, cell, battle.fire_wall_orientation);
        return battle.commit(action orelse return false);
    }
    if (projectile.canAimThrough(&battle.handle.state, slot)) {
        const point = engine.positionForCell(@floatFromInt(x), @floatFromInt(y));
        return battle.commit(.{ .range_attack = .{ .attacker = slot, .target = 0, .free = true, .tx = point[0], .ty = point[1] } });
    }
    var scratch = battle.handle.state;
    var ctx: ai.Ctx = undefined;
    ai.initCtxInto(&ctx, &scratch, slot);
    const aiming_area = tactics.canAimAreaThrow(&scratch, slot);
    if (aiming_area and tactics.areaAim(&scratch, slot, cell, null) != null) {
        return battle.commit(.{ .area_throw_attack = .{ .attacker = slot, .target_cell = cell } });
    }
    if (scratch.grid.board[@intCast(x)][@intCast(y)] == st.BLOCK) {
        return battle.commit(tactics.obstacleAttack(&ctx, cell) orelse return false);
    }
    if (ai.occupant(&scratch, cell)) |target| {
        if (scratch.units[target].team != ctx.unit().team) return battle.commit(tactics.attack(&ctx, target) orelse return false);
    }
    if (aiming_area) return false;
    const path = tactics.movePath(&ctx) orelse return false;
    const route = path.get(pathing.key(x, y)) orelse return false;
    if (!ai.isLegalMoveRoute(&ctx, cell, path, route)) return false;
    var steps: [64]st.Cell = undefined;
    const length = path.routeCells(route, &steps);
    const cells = ai.footprintForAnchor(ctx.unit(), cell);
    return battle.commit(.{ .move_unit = .{
        .unit = slot,
        .path = steps[0..length],
        .target_cells = cells.slice(),
        .has_lava = route.has_lava,
    } });
}

export fn hoc_macos_preview_through(battle: *Battle, x: f64, y: f64, output: ?[*]u8, capacity: usize) usize {
    const slot = battle.player() orelse return 0;
    const state = &battle.handle.state;
    if (battle.prepared_spell != null or !projectile.canAimThrough(state, slot)) return 0;
    const point = (projectile.Point{ .x = x, .y = y }).world() orelse return 0;
    var hits: [st.MAX_UNITS]projectile.ShotHit = undefined;
    const ray = projectile.throughShot(state, slot, point, &hits);
    const json = std.json.Stringify.valueAlloc(alloc, ray, .{}) catch return 0;
    defer alloc.free(json);
    if (output) |buffer| {
        if (json.len <= capacity) @memcpy(buffer[0..json.len], json);
    }
    return json.len;
}

export fn hoc_macos_fire_through(battle: *Battle, x: f64, y: f64) bool {
    const slot = battle.player() orelse return false;
    const state = &battle.handle.state;
    if (battle.prepared_spell != null or !projectile.canAimThrough(state, slot)) return false;
    const point = (projectile.Point{ .x = x, .y = y }).world() orelse return false;
    return battle.commit(.{ .range_attack = .{ .attacker = slot, .target = 0, .free = true, .tx = point[0], .ty = point[1] } });
}

export fn hoc_macos_select_stack(battle: *Battle, id: u8) bool {
    const state = &battle.handle.state;
    if (state.fight.started) return false;
    const slot = state.slotOf(id) orelse return false;
    if ((!battle.sandbox and state.units[slot].team != st.Team.LEFT) or state.units[slot].isDead()) return false;
    battle.beginUpdate();
    battle.deploying = slot;
    return true;
}

export fn hoc_macos_attack_angle(battle: *Battle, target_id: u8, x: i32, y: i32, side: i32) bool {
    const cell: st.Cell = .{ .x = x, .y = y };
    if (battle.prepared_spell != null or side < -1 or side > 3 or !engine.cellWithinGrid(cell)) return false;
    const slot = battle.player() orelse return false;
    var scratch = battle.handle.state;
    const target = scratch.slotOf(target_id) orelse return false;
    var ctx: ai.Ctx = undefined;
    ai.initCtxInto(&ctx, &scratch, slot);
    return battle.commit(tactics.aimedAttack(&ctx, target, .{
        .cell = cell,
        .side = if (side < 0) null else @intCast(side),
    }) orelse return false);
}

export fn hoc_macos_ready(battle: *Battle) bool {
    if (battle.handle.state.fight.started) return false;
    for (battle.handle.state.holderOrder()) |slot| {
        const unit = &battle.handle.state.units[slot];
        const cells = engine.unitCells(unit);
        for (cells.slice()) |cell| if (!tactics.inDeployment(&battle.handle.state, cell, unit.team)) return false;
    }
    if (!battle.commit(.start_fight)) return false;
    battle.deploying = null;
    const state = &battle.handle.state;
    var names: [st.MAX_UNITS][]const u8 = undefined;
    for (state.units[0..state.n_units], 0..) |unit, i| names[i] = battle.handle.names[unit.name_id];
    battle.opponent_profile = v08util.Battle.fromUnits(names[0..state.n_units], battle.handle.ids, .{ 0, 0, 0 });
    battle.opponent_profile.primeProfile(state);
    return true;
}

const TurnCommand = enum(c_uint) { wait = 1, defend = 2, end_turn = 3, cycle_attack = 4, _ };

export fn hoc_macos_turn_command(battle: *Battle, command: TurnCommand) bool {
    const slot = battle.player() orelse return false;
    const action: rec.Action = switch (command) {
        .wait => .{ .wait_turn = .{ .unit = slot } },
        .defend => .{ .defend_turn = .{ .unit = slot } },
        .end_turn => .{ .end_turn = .{ .unit = slot, .reason = .manual } },
        .cycle_attack => blk: {
            const unit = &battle.handle.state.units[slot];
            if (unit.n_possible < 2) return false;
            const index = std.mem.indexOfScalar(u8, unit.possible[0..unit.n_possible], unit.attack_type_selected) orelse return false;
            break :blk .{ .select_attack_type = .{ .unit = slot, .attack_type = unit.possible[(index + 1) % unit.n_possible] } };
        },
        else => return false,
    };
    return battle.commit(action);
}

export fn hoc_macos_choose_spell(battle: *Battle, spell: i32) bool {
    const slot = battle.player() orelse return false;
    if (spell == -1) {
        battle.prepared_spell = null;
    } else {
        if (spell < 0 or spell >= st.N_CAST_SPELLS) return false;
        const id: u8 = @intCast(spell);
        const state = &battle.handle.state;
        if (!tactics.canPrepareSpell(state, slot, id)) return false;
        // Untargeted spells commit as one selection.
        if (tactics.spellAim(state, id) == .army) {
            return battle.commit(tactics.spellAction(state, slot, id, null, 0) orelse return false);
        }
        battle.prepared_spell = id;
    }
    battle.fire_wall_orientation = 0;
    battle.beginUpdate();
    return true;
}

export fn hoc_macos_rotate_fire_wall(battle: *Battle) bool {
    if (battle.player() == null or battle.prepared_spell != @intFromEnum(st.CastSpell.fire_wall)) return false;
    battle.fire_wall_orientation +%= 1;
    battle.beginUpdate();
    return true;
}

const OpponentTurn = struct {
    battle: *Battle,
    slot: i8,
    last_health: HealthSnapshot,
    last_board: *st.State,
    chakram_capture: chakram.Capture,
    gaze_capture: gaze.Capture,

    fn observe(context: *anyopaque, kind: ai.StepKind, action: rec.Action, seed: u32, state: *const st.State, accepted: bool, events: []const rec.Event) bool {
        const turn: *OpponentTurn = @ptrCast(@alignCast(context));
        const presentation: Presentation = .{ .flights = turn.chakram_capture.drain(), .gazes = turn.gaze_capture.drain() };
        if (accepted and kind != .decide) turn.battle.journal.push(action, seed, state, events);
        if (accepted and kind == .apply) turn.battle.recordAction(action, &turn.last_health, state, turn.last_board, presentation);
        turn.last_health = HealthSnapshot.capture(state);
        turn.last_board.* = state.*;
        turn.battle.recordEvents(events);
        return !state.overflow and !state.fight.finished and state.active == turn.slot;
    }
};

fn decideOpponent(state: *st.State, slot: u8, decision: *ai.Decision) void {
    if (!state.units[slot].has(.ai_driven)) {
        var candidate = state.*;
        if (v08.decideV08(&candidate, slot, decision) and !candidate.overflow) {
            state.* = candidate;
            return;
        }
    }
    ai.decideTurn(state, slot, decision);
}

export fn hoc_macos_opponent_turn(battle: *Battle, force_after_timeout: bool) bool {
    const state = &battle.handle.state;
    if (battle.stalled or state.fight.finished or state.active < 0 or (!force_after_timeout and !battle.automates(@intCast(state.active)))) return false;
    const last_board = alloc.create(st.State) catch return false;
    defer alloc.destroy(last_board);
    last_board.* = state.*;
    battle.beginUpdate();
    var turn: OpponentTurn = .{
        .battle = battle,
        .slot = state.active,
        .last_health = HealthSnapshot.capture(state),
        .last_board = last_board,
        .chakram_capture = .{ .state = state },
        .gaze_capture = .{ .state = state },
    };
    const previous_capture = chakram.current;
    const previous_gaze = gaze.current;
    chakram.current = &turn.chakram_capture;
    gaze.current = &turn.gaze_capture;
    defer chakram.current = previous_capture;
    defer gaze.current = previous_gaze;
    const previous = v08util.battle;
    defer v08util.battle = previous;
    v08util.battle = battle.opponent_profile;
    const end = ai.continueMatchWith(state, max_laps, .{ .ctx = &turn, .step = OpponentTurn.observe }, decideOpponent);
    if (state.overflow or (end != .observer_stop and end != .elimination)) {
        battle.stalled = true;
    } else {
        battle.findTurn();
    }
    return true;
}
