import Foundation

struct BattleWaterShieldBreak {
    let stack: Stack
    let position: CGPoint
    let started: Date

    var duration: TimeInterval { stack.name == "Mermaid" ? 2.2 : 0.55 }
}

struct BattleFlagStatus {
    let responded: Bool
    let immobilized: Bool
    let waiting: Bool
    let stunned: Bool
}

struct BattleCombatCue {
    enum DamageTone { case fireWall, reflection, petrifyingGaze }

    enum Kind {
        case health(delta: Double, casualties: Int)
        case status(name: String, kind: StackStatus.Kind)
    }

    let stack: Stack
    let position: CGPoint
    let kind: Kind
    let started: Date
    var damageTone: DamageTone? = nil
    var silentHurt = false
    var statusArt: String? = nil
    var statusSource: Faction? = nil
    var borrowedIcon = false
    var flashes = false
    var replacedAt: Date? = nil

    var duration: TimeInterval {
        switch kind {
        case .health: 0.65
        case .status: BattleStatusEffects.overheadDuration
        }
    }

    var endsAt: Date { min(started.addingTimeInterval(duration), replacedAt ?? .distantFuture) }

    var statusName: String? {
        if case let .status(name, _) = kind { return name }
        return nil
    }

    var statusClip: BattleStatusEffects.Clip? {
        guard !borrowedIcon, let name = statusArt ?? statusName else { return nil }
        return BattleStatusEffects.bundled?.clips[name]
    }
}

/// A presentation timeline for one accepted engine update. All times are relative to one clock.
@MainActor
struct BattlePlayback {
    struct Action {
        let moment: Moment
        let counterattack: Counterattack?
        let start: TimeInterval
        let moveEnd: TimeInterval
        let actionEnd: TimeInterval
        let projectile: BattleProjectile?
        let release: TimeInterval?
        let impact: TimeInterval
        let pose: CreatureAction?
        let direction: String?
        let route: [Cell]
        let startPosition: CGPoint?
        let attackPosition: CGPoint?
        let target: CGPoint?
        let skewerContact: CGPoint?
        let damageCast: BattleDamageCast?
        let fireTraversal: BattleFireTraversal?
        let chakram: BattleChakram?

        var completesAt: TimeInterval { max(actionEnd, impact) }
    }

    struct Reaction {
        let start: TimeInterval
        let duration: TimeInterval
        let action: CreatureAction
        var end: TimeInterval { start + duration }
    }

    struct FireTransition {
        let ignites: Bool
        let started: Date

        var endsAt: Date { started.addingTimeInterval(ignites ? 0.32 : 0.5) }

        func opacity(at time: Date) -> Double {
            let progress = min(1, max(0, time.timeIntervalSince(started) / (ignites ? 0.32 : 0.5)))
            return ignites ? progress : 1 - progress
        }
    }

    struct SmokeDeparture {
        let tile: BattleTerrainTile
        let at: Date
    }

    let started: Date
    let actions: [Action]
    let reactions: [Int: [Reaction]]
    let fallen: [Stack]
    let idleResumes: [Int: Date]
    let previousAmounts: [Int: Int]
    let combatCues: [BattleCombatCue]
    let waterShieldBreaks: [BattleWaterShieldBreak]
    let covenantBreaks: [Int: Date]
    let covenantAbsorbs: [Int: Date]
    let fireTransitions: [Cell: FireTransition]
    let smokeDepartures: [SmokeDeparture]
    let responseFeedback: [Int: Date]
    let resetsCombatCues: Bool
    let duration: TimeInterval
    let narrowingFrom: Int?
    let narrowingStarts: TimeInterval
    private let initialPositions: [Int: CGPoint]
    private let previousStacks: [Int: Stack]
    private let contacts: [Int: TimeInterval]
    private let statusContacts: [Int: TimeInterval]
    private let casualtyContacts: [Int: [(time: TimeInterval, casualties: Int)]]
    private let spawns: Set<Int>

    init(moments: [Moment] = [], previous: BattleView? = nil, next: BattleView? = nil,
         idleResumes: [Int: Date] = [:], priorResponseFeedback: [Int: Date] = [:],
         priorFireTransitions: [Cell: FireTransition] = [:], priorCombatCues: [BattleCombatCue] = [],
         priorCovenantBreaks: [Int: Date] = [:], priorCovenantAbsorbs: [Int: Date] = [:],
         replay: Bool = false) {
        let started = Date()
        self.started = started
        let before = Dictionary(uniqueKeysWithValues: (previous?.stacks ?? []).map { ($0.id, $0) })
        let after = Dictionary(uniqueKeysWithValues: (next?.stacks ?? []).map { ($0.id, $0) })
        var positions = before.mapValues { BattlefieldProjection.logicalCenter($0.cells) }
        resetsCombatCues = previous == nil
        initialPositions = positions
        previousStacks = before
        previousAmounts = before.mapValues(\.amount)
        fallen = (previous?.stacks ?? []).filter { after[$0.id] == nil && next != nil }
        spawns = previous == nil ? [] : Set(after.keys).subtracting(before.keys)

        var cursor: TimeInterval = 0
        var phases = [Action]()
        var changes = [Int: [Reaction]]()
        var hitTimes = [Int: TimeInterval]()
        var feedback = priorResponseFeedback.filter { after[$0.key] != nil && $0.value > started }
        var cues = previous == nil ? [] : priorCombatCues.filter {
            $0.endsAt.addingTimeInterval(BattleStatusEffects.overheadDuration) > started
        }
        var statusTimes = [Int: TimeInterval]()
        var dissolves = [BattleWaterShieldBreak]()
        var shatteredCovenants = priorCovenantBreaks.filter { started.timeIntervalSince($0.value) < 0.85 }
        var absorbedByCovenant = priorCovenantAbsorbs.filter { started.timeIntervalSince($0.value) < 0.65 }
        var recordedShields = Set<Int>()
        func dissolveShield(_ id: Int, at time: TimeInterval) {
            guard let stack = before[id] ?? after[id], recordedShields.insert(id).inserted else { return }
            let position = positions[id] ?? BattlefieldProjection.logicalCenter(stack.cells)
            dissolves.append(BattleWaterShieldBreak(stack: stack, position: position,
                                                   started: started.addingTimeInterval(time)))
        }
        var displayedHealth = [Int: Double]()
        var displayedCasualties = [Int: Int]()
        var displayedStatuses = [Moment.StatusApplication]()
        var casualtyTimes = [Int: [(time: TimeInterval, casualties: Int)]]()
        func healthCue(_ target: Int, delta: Double, casualties: Int, at time: TimeInterval,
                       tone: BattleCombatCue.DamageTone? = nil, silentHurt: Bool = false) {
            guard abs(delta) > 0.001 || casualties > 0, let stack = before[target] ?? after[target] else { return }
            if casualties != 0 { casualtyTimes[target, default: []].append((time, casualties)) }
            let position = positions[target] ?? BattlefieldProjection.logicalCenter(stack.cells)
            cues.append(BattleCombatCue(stack: stack, position: position, kind: .health(delta: delta, casualties: casualties),
                                        started: started.addingTimeInterval(time), damageTone: tone, silentHurt: silentHurt))
        }

        func statusCue(_ name: String, kind: StackStatus.Kind, for stack: Stack, at time: TimeInterval,
                       source: Stack? = nil, art: String? = nil, borrowedIcon: Bool = false, flashes: Bool = true) {
            let date = started.addingTimeInterval(time)
            let position = positions[stack.id] ?? BattlefieldProjection.logicalCenter(stack.cells)
            let clip = BattleStatusEffects.bundled?.clips[art ?? name]
            if !borrowedIcon, let clip, let active = cues.lastIndex(where: {
                guard case let .status(visibleName, _) = $0.kind else { return false }
                return $0.stack.id == stack.id && visibleName == name && $0.started <= date && $0.endsAt > date
            }) {
                if clip.restarts == true { cues[active].replacedAt = date }
                else { return }
            }
            cues.append(BattleCombatCue(stack: stack, position: position, kind: .status(name: name, kind: kind),
                                        started: date, statusArt: art, statusSource: name == "Stun" ? source?.faction : nil,
                                        borrowedIcon: borrowedIcon, flashes: flashes))
        }
        func statusCues(_ applications: [Moment.StatusApplication], at time: TimeInterval, source: Stack? = nil) {
            for (index, status) in applications.enumerated() where !applications.prefix(index).contains(status) {
                guard let stack = after[status.target], !BattleStatusEffects.isPassive(status.name) else { continue }
                statusTimes[status.target] = max(statusTimes[status.target] ?? time, time)
                if let victim = status.borrowedFrom.flatMap({ before[$0] }) {
                    statusCue("Borrowed Grace", kind: .buff, for: victim, at: time, flashes: false)
                    let icon = BattleStatusEffects.bundled?.borrowedClips.contains(status.name) != true
                    statusCue(status.name, kind: status.kind, for: stack, at: time + BattleStatusEffects.overheadDuration,
                              borrowedIcon: icon)
                } else if status.name == "Deep Wounds" {
                    let level = [3, 2, 1].first { source?.abilities.contains("Deep Wounds Level \($0)") == true } ?? 1
                    statusCue(status.name, kind: status.kind, for: stack, at: time, source: source, art: "Deep Wounds \(level)")
                } else {
                    statusCue(status.name, kind: status.kind, for: stack, at: time, source: source)
                }
            }
        }
        func react(_ id: Int, at impact: TimeInterval, exchanging group: [Action] = [], lethal: Bool? = nil) -> TimeInterval {
            hitTimes[id] = impact
            guard let stack = before[id] else { return impact }
            let dead = lethal ?? (after[id] == nil)
            let swing = group.first { $0.moment.actor == id && $0.pose != nil }
            // The outgoing swing is also the reaction pose in a simultaneous exchange.
            if swing != nil && !dead { return impact }
            let start = max(impact, swing?.completesAt ?? impact)
            let action: CreatureAction = dead ? .death : .hit
            let clip = CreatureAnimation.timing(for: stack.name, action: action, direction: nil)
            let duration = clip?.duration ?? (dead ? 0.56 : 0.24)
            changes[id, default: []].append(Reaction(start: start, duration: duration, action: action))
            return start + duration
        }

        func plan(_ moment: Moment, at start: TimeInterval, counterattack: Counterattack? = nil,
                  flight: Moment.ChakramFlight? = nil, shortenMeleeRecovery: Bool = false) -> Action {
            let stack = after[moment.actor] ?? before[moment.actor]
            let route = moment.route.reduce(into: [Cell]()) { route, cell in
                if route.last != cell { route.append(cell) }
            }
            let moveEnd = start + Self.travelTime(route, flying: stack?.flies == true)
            let attackPosition = route.last.map { Self.center(at: $0, for: stack) } ?? positions[moment.actor]
            let capturedTarget = flight?.contacts.first.flatMap { positions[$0.target] }
            let targetPosition = capturedTarget ?? moment.projectileEnd?.point ?? moment.splash.map { BattlefieldProjection.logicalCenter([$0.center]) }
                ?? moment.target.flatMap { positions[$0] }
                ?? moment.aim.map { BattlefieldProjection.logicalCenter([$0]) }
            let direction: String? = {
                let actor = stack?.footprint ?? .single
                let target = moment.target.flatMap { before[$0]?.footprint } ?? .single
                guard let attackPosition, let targetPosition else { return nil }
                let distance = targetPosition.y - attackPosition.y
                let halfHeights = flight != nil && stack?.name == "Zena" ? 0.35 : CGFloat(actor.height + target.height) / 2
                if distance >= halfHeights { return "up" }
                if distance <= -halfHeights { return "down" }
                return nil
            }()
            let requestedPose: CreatureAction? = switch moment.kind {
            case .melee: .meleeAttack
            case .shot: .attack
            case .obstacle: stack?.selectedAttack == .ranged ? .attack : .meleeAttack
            case .spell: .cast
            default: nil
            }
            let launchesProjectile = moment.kind == .shot || (moment.kind == .obstacle && requestedPose == .attack)
            let throwsDisc = launchesProjectile && (flight != nil || (stack?.name == "Zena" &&
                stack?.abilities.contains("Chakram") == true && stack?.statuses.contains { $0.name == "Break" } != true))
            let shooter = throwsDisc ? "Zena" : stack?.name == "Zena" ? nil : stack?.name
            let projectile = launchesProjectile ? BattleProjectile.forShooter(shooter) : nil
            let timing = requestedPose.flatMap { action in
                stack.flatMap { CreatureAnimation.timing(for: $0.name, action: action, direction: direction,
                                                         releaseFrame: projectile?.releaseFrame) }
            }
            let pose = requestedPose == .cast && timing == nil ? nil : requestedPose
            let fullDuration = pose == nil ? 0 : timing?.duration ?? 0.62
            let actionTime = shortenMeleeRecovery && moment.kind == .melee
                ? min(fullDuration, timing?.lethalMeleeDuration ?? 0.15) : fullDuration
            var actionEnd = moveEnd + actionTime
            let destination = flight != nil || moment.projectileEnd != nil || moment.splash != nil ? targetPosition :
                moment.aimSide.flatMap { side in moment.aim.map { side.point(on: $0) } } ?? targetPosition
            var release: TimeInterval?
            var chakram: BattleChakram?
            // The web commits melee contact in the same tick that both opening animations start.
            var impact = moment.kind == .melee ? moveEnd : moveEnd + (timing?.impact ?? actionTime * 0.5)
            if launchesProjectile, let attackPosition, let destination {
                let pierces = stack?.abilities.contains("Through Shot") == true &&
                    stack?.statuses.contains { $0.name == "Break" } != true
                let speed = (projectile?.cellsPerSecond ?? 16) * (pierces ? projectile?.piercingSpeedMultiplier ?? 1 : 1)
                let distance = hypot(destination.x - attackPosition.x, destination.y - attackPosition.y)
                let windup = projectile?.authoredRelease == false ? 0 : timing?.release ?? actionTime * 0.42
                release = moveEnd + windup
                impact = moveEnd + windup + max(1.0 / 60, distance / speed)
            }
            if throwsDisc, let attackPosition, let destination, let release {
                let disc = BattleChakram(origin: attackPosition, destination: destination, release: release,
                                         contacts: flight?.contacts ?? [], positions: positions,
                                         cellsPerSecond: projectile?.cellsPerSecond ?? 10.5)
                chakram = disc
                impact = disc.firstImpact
                actionEnd = stack?.name == "Zena" ? disc.catchTime + release - moveEnd : max(actionEnd, disc.catchTime)
            }
            let damageCast = moment.kind == .spell ? BattleDamageCast(
                moment: moment, actor: stack, target: moment.target.flatMap { before[$0] },
                mirrors: (moment.mirrorSources ?? []).compactMap { before[$0] }, origin: attackPosition,
                destination: destination, direction: direction, start: moveEnd, castDuration: actionTime, replay: replay
            ) : nil
            if let damageCast {
                release = damageCast.release
                impact = damageCast.impact
            } else if moment.kind == .spell && moment.statusApplications?.isEmpty == false {
                impact = actionEnd
            }
            let fireTraversal: BattleFireTraversal? = moment.crossedFire.flatMap { cells in
                guard !cells.isEmpty, route.count > 1 else { return nil }
                return BattleFireTraversal(actor: moment.actor, cells: cells, path: route.map { Self.center(at: $0, for: stack) },
                                           flying: stack?.flies == true, start: start, arrival: moveEnd)
            }
            let skewerContact = Self.skewerContact(for: moment, actor: before[moment.actor],
                                                   attackPosition: attackPosition, before: before, after: after)
            return Action(moment: moment, counterattack: counterattack, start: start, moveEnd: moveEnd,
                          actionEnd: actionEnd, projectile: projectile, release: release, impact: impact,
                          pose: pose, direction: direction, route: route, startPosition: positions[moment.actor],
                          attackPosition: attackPosition, target: destination, skewerContact: skewerContact,
                          damageCast: damageCast, fireTraversal: fireTraversal, chakram: chakram)
        }

        for moment in moments {
            let flights = moment.chakramFlights ?? []
            let gazes = moment.gazeImpacts ?? []
            func diesInExchange(_ id: Int) -> Bool {
                if gazes.contains(where: { $0.target == id && $0.lethal }) { return false }
                guard let stack = before[id], after[id] == nil, moment.hurt?.contains(id) == true else { return false }
                guard let recorded = moment.healthChanges else { return true }
                return recorded.contains { $0.target == id && $0.casualties + displayedCasualties[id, default: 0] >= stack.amount }
            }
            let opening = plan(moment, at: cursor, flight: flights.first { $0.actor == moment.actor },
                               shortenMeleeRecovery: moment.counterattack != nil && diesInExchange(moment.actor))
            var group = [opening]
            if let position = opening.attackPosition { positions[moment.actor] = position }
            var reply: Action?
            if let counterattack = moment.counterattack {
                let counter = Moment(kind: moment.kind, actor: counterattack.actor, target: counterattack.target,
                                     aim: nil, aimSide: nil, spell: nil, splash: counterattack.splash, route: [], hurt: moment.hurt,
                                     healthChanges: nil, statusApplications: nil)
                let response = plan(counter, at: opening.moveEnd, counterattack: counterattack,
                                    flight: flights.first { $0.actor == counterattack.actor },
                                    shortenMeleeRecovery: diesInExchange(counterattack.actor))
                reply = response
                group.append(response)
                if counterattack.spent { feedback[counterattack.actor] = started.addingTimeInterval(response.start + 1.6) }
            }
            for action in [opening] + [reply].compactMap({ $0 }) {
                var start = action.actionEnd
                for flight in flights.filter({ $0.actor == action.moment.actor }).dropFirst() {
                    let extra = Moment(kind: .shot, actor: flight.actor, target: flight.contacts.first?.target,
                                       aim: nil, aimSide: nil, spell: nil, route: [], hurt: nil, healthChanges: nil, statusApplications: nil)
                    let followup = plan(extra, at: start, counterattack: action.counterattack, flight: flight)
                    group.append(followup)
                    start = followup.actionEnd
                }
            }
            phases += group
            cursor = group.reduce(cursor) { end, action in
                let burst = action.moment.splash == nil ? 0 : action.projectile?.impact?.duration ?? 0.20
                let minimum = action.moment.kind == .melee
                    ? before[action.moment.actor].map { CreatureAnimation.minimumMeleeHold(for: $0.name) } ?? 0 : 0
                return max(end, action.actionEnd, action.impact + burst, action.moveEnd + minimum)
            }
            let impacts = group.flatMap { $0.chakram?.impacts ?? [] }.sorted { $0.time < $1.time }
            func strikingAction(for id: Int) -> Action {
                guard let reply else { return opening }
                if reply.moment.target == id { return reply }
                if let splash = reply.moment.splash, let recipient = before[id], recipient.team == before[moment.actor]?.team {
                    let radius: Int32 = splash.single ? 0 : 1
                    if recipient.cells.contains(where: {
                        max(abs($0.x - splash.center.x), abs($0.y - splash.center.y)) <= radius
                    }) { return reply }
                }
                return opening
            }
            func contact(for id: Int) -> TimeInterval {
                if let arrival = impacts.last(where: { $0.contact.target == id && $0.contact.kind == .hit }) { return arrival.time }
                return strikingAction(for: id).impact
            }
            if let id = moment.target { hitTimes[id] = contact(for: id) }
            if let id = reply?.moment.target { hitTimes[id] = contact(for: id) }
            for id in moment.hurt ?? [] {
                let responds = reply != nil && group.contains { $0.moment.actor == id }
                let gazeDamage = gazes.filter { $0.target == id }.reduce(0) { $0 + $1.damage }
                let ordinary = (moment.healthChanges?.first { $0.target == id }?.delta ?? -1) + gazeDamage
                if gazeDamage > 0 && ordinary >= -0.001 { continue }
                cursor = max(cursor, react(id, at: contact(for: id), exchanging: responds ? group : [],
                                           lethal: gazeDamage > 0 ? false : nil))
            }
            for arrival in impacts {
                let hit = arrival.contact
                if hit.kind == .miss, let stack = before[hit.target] {
                    statusCue("Miss", kind: .effect, for: stack, at: arrival.time, flashes: false)
                } else if hit.kind == .hit {
                    let response = reply != nil && before[hit.target]?.team == before[moment.actor]?.team
                    healthCue(hit.target, delta: hit.delta, casualties: hit.casualties, at: arrival.time, silentHurt: response)
                }
            }
            for change in moment.healthChanges ?? [] {
                displayedHealth[change.target, default: 0] += change.delta
                displayedCasualties[change.target, default: 0] += change.casualties
                let tone: BattleCombatCue.DamageTone? = if change.target != moment.actor { nil }
                    else if opening.damageCast?.mirrors.isEmpty == false { .reflection }
                    else if moment.kind == .move, opening.fireTraversal != nil { .fireWall }
                    else { nil }
                let covered = impacts.filter { $0.contact.target == change.target && $0.contact.kind == .hit }
                let petrified = gazes.filter { $0.target == change.target }
                let delta = change.delta - covered.reduce(0) { $0 + $1.contact.delta } + petrified.reduce(0) { $0 + $1.damage }
                let casualties = change.casualties - covered.reduce(0) { $0 + $1.contact.casualties } -
                    petrified.reduce(0) { $0 + $1.casualties }
                healthCue(change.target, delta: delta, casualties: casualties, at: contact(for: change.target), tone: tone,
                          silentHurt: strikingAction(for: change.target).counterattack != nil)
            }
            let applications = moment.statusApplications ?? []
            for (index, status) in applications.enumerated() where !applications.prefix(index).contains(status) {
                let source = strikingAction(for: status.target).moment.actor
                statusCues([status], at: contact(for: status.target), source: before[source])
            }
            for holder in opening.damageCast?.mirrors ?? [] where holder.abilities.contains("Magic Reflection") {
                statusCue("Magic Reflection", kind: .buff, for: holder, at: opening.impact, flashes: false)
            }
            if moment.kind == .spell, let target = moment.target.flatMap({ after[$0] }),
               let name = moment.spell, name == "Armor Rune" || name == "Weapon Rune",
               !applications.contains(where: { $0.target == target.id && $0.name == name }) {
                statusCue("No effect!", kind: .effect, for: target, at: opening.impact, flashes: false)
            }
            displayedStatuses += applications
            for id in moment.waterShieldBreaks ?? [] { dissolveShield(id, at: contact(for: id)) }
            for id in moment.covenantAbsorbs ?? [] { absorbedByCovenant[id] = started.addingTimeInterval(contact(for: id)) }
            if let broken = moment.covenantBreaks, !broken.isEmpty {
                for team in Set(broken.compactMap { before[$0]?.team }) {
                    let hits = [moment.target, reply?.moment.target].compactMap { $0 }
                    let recipient = hits.first { before[$0]?.team == team && before[$0]?.hasEmberCovenant == true }
                    let impact = recipient.map { contact(for: $0) } ?? opening.impact
                    for id in broken where before[id]?.team == team { shatteredCovenants[id] = started.addingTimeInterval(impact) }
                    if let recipient, !(moment.healthChanges ?? []).contains(where: { $0.target == recipient && $0.delta < 0 }) {
                        absorbedByCovenant[recipient] = started.addingTimeInterval(impact)
                    }
                }
            }
            var gazeEnds: [Int: TimeInterval] = [:]
            let overhead = BattleStatusEffects.overheadDuration
            for gaze in gazes {
                guard let victim = before[gaze.target] else { continue }
                // Keep the landed shot and any outgoing reply visible before the separate gaze phase.
                let struckAt = contact(for: gaze.target)
                let recovery = group.filter { $0.moment.actor == gaze.target }.map(\.completesAt).max() ?? struckAt
                let start = max(struckAt, recovery, changes[gaze.target]?.last?.end ?? struckAt,
                                gazeEnds[gaze.target] ?? struckAt)
                let impact = start + overhead / 2
                statusCue("Petrifying Gaze", kind: .effect, for: victim, at: start, flashes: false)
                healthCue(gaze.target, delta: -gaze.damage, casualties: gaze.casualties, at: impact, tone: .petrifyingGaze)
                let reactionEnd = react(gaze.target, at: impact, lethal: gaze.lethal)
                let end = max(start + overhead, reactionEnd)
                gazeEnds[gaze.target] = end
                cursor = max(cursor, end)
            }
        }

        if let previous, let next, previous.narrowing < next.narrowing {
            narrowingFrom = previous.narrowing
            narrowingStarts = cursor
            cursor += 0.65
        } else {
            narrowingFrom = nil
            narrowingStarts = cursor
        }
        // Damage from a turn transition or the collapsing floor doesn't belong to the preceding strike.
        if let previous, next != nil {
            let hurt = previous.stacks.filter { stack in
                guard let survivor = after[stack.id] else { return true }
                return survivor.amount < stack.amount || survivor.hp < stack.hp
            }
            let impact = narrowingFrom == nil ? (phases.map(\.impact).max() ?? 0) : narrowingStarts + 0.5
            for stack in hurt where hitTimes[stack.id] == nil ||
                (after[stack.id] == nil && changes[stack.id]?.last?.action != .death) {
                cursor = max(cursor, react(stack.id, at: max(impact, changes[stack.id]?.last?.end ?? impact)))
            }
            if next?.started == true {
                var remainingStatuses = [Moment.StatusApplication]()
                for stack in previous.stacks {
                    let survivor = after[stack.id]
                    if stack.hasWaterShield, survivor?.hasWaterShield == false { dissolveShield(stack.id, at: impact) }
                    if stack.hasEmberCovenant, survivor?.hasEmberCovenant == false, shatteredCovenants[stack.id] == nil {
                        shatteredCovenants[stack.id] = started.addingTimeInterval(impact)
                    }
                    let delta = (survivor?.cumulativeHealth ?? 0) - stack.cumulativeHealth
                    let casualties = stack.amount - (survivor?.amount ?? 0)
                    healthCue(stack.id, delta: delta - displayedHealth[stack.id, default: 0],
                              casualties: casualties - displayedCasualties[stack.id, default: 0], at: impact)
                    for status in survivor?.statuses ?? [] where status.laps < 1e12 && !BattleStatusEffects.isPassive(status.name) {
                        let morale = status.name == "Morale" || status.name == "Dismorale"
                        guard previous.started || morale else { continue }
                        let prior = stack.statuses.first { $0.kind == status.kind && $0.name == status.name }
                        let lapCue = previous.lap != next?.lap && morale
                        if !lapCue, let prior, status.laps <= prior.laps, status.power == prior.power,
                           status.first == prior.first, status.second == prior.second { continue }
                        let event = Moment.StatusApplication(target: stack.id, kind: status.kind, name: status.name)
                        if !displayedStatuses.contains(where: {
                            $0.target == event.target && $0.name == event.name && $0.kind == event.kind
                        }) { remainingStatuses.append(event) }
                    }
                }
                statusCues(remainingStatuses, at: impact)
            }
            if !spawns.isEmpty {
                cursor = max(cursor, (phases.map(\.impact).max() ?? 0) + 0.18)
            }
        }
        actions = phases
        reactions = changes
        contacts = hitTimes
        statusContacts = statusTimes
        casualtyContacts = casualtyTimes
        responseFeedback = feedback
        combatCues = cues
        waterShieldBreaks = dissolves
        covenantBreaks = shatteredCovenants
        covenantAbsorbs = absorbedByCovenant
        // Keep the deciding hit readable before the results overlay covers the board.
        if next?.winner != nil, let end = cues.map(\.endsAt).max() {
            cursor = max(cursor, end.timeIntervalSince(started))
        }
        duration = cursor
        var fire = priorFireTransitions.filter { $0.value.endsAt > started }
        if let previous, let next {
            let before = Set(previous.fireCells ?? [])
            let after = Set(next.fireCells ?? [])
            let impact = phases.last { $0.moment.spell == "Fire Wall" }?.impact ?? 0
            for cell in after.subtracting(before) {
                fire[cell] = FireTransition(ignites: true, started: started.addingTimeInterval(impact))
            }
            for cell in before.subtracting(after) {
                fire[cell] = FireTransition(ignites: false, started: started.addingTimeInterval(cursor))
            }
        }
        fireTransitions = fire
        let remainingSmoke = Set((next?.smokeTiles ?? []).map(\.cell))
        let removedSmoke = (previous?.smokeTiles ?? []).filter { !remainingSmoke.contains($0.cell) }
        var arrivals: [Cell: TimeInterval] = [:]
        for action in phases {
            if action.moveEnd > action.start, let anchor = action.route.last, let mover = before[action.moment.actor] {
                for cell in mover.footprint.cells(at: anchor) {
                    arrivals[cell] = min(arrivals[cell] ?? action.moveEnd, action.moveEnd)
                }
            }
            if action.moment.spell == "Castling" {
                for id in [action.moment.actor, action.moment.target].compactMap({ $0 }) {
                    for cell in after[id]?.cells ?? [] { arrivals[cell] = action.impact }
                }
            }
        }
        smokeDepartures = removedSmoke.map { tile in
            SmokeDeparture(tile: tile, at: started.addingTimeInterval(arrivals[tile.cell] ?? cursor))
        }
        var resumes = idleResumes.filter { after[$0.key] != nil }
        for action in phases where action.pose != nil || action.moveEnd > action.start {
            if after[action.moment.actor] != nil {
                resumes[action.moment.actor] = started.addingTimeInterval(action.actionEnd)
            }
        }
        for (id, reactions) in changes where after[id] != nil {
            guard let time = reactions.map(\.end).max() else { continue }
            let end = started.addingTimeInterval(time)
            resumes[id] = max(resumes[id] ?? end, end)
        }
        self.idleResumes = resumes
    }

    var impactTime: TimeInterval { actions.map(\.impact).max() ?? 0 }

    private static func skewerContact(for moment: Moment, actor: Stack?, attackPosition: CGPoint?,
                                      before: [Int: Stack], after: [Int: Stack]) -> CGPoint? {
        guard moment.kind == .melee, let actor, actor.name == "Pikeman", actor.abilities.contains("Skewer Strike"),
              !actor.statuses.contains(where: { $0.name == "Break" }),
              let position = attackPosition, let targetID = moment.target, let target = before[targetID],
              target.footprint == .single, let primary = target.anchor else { return nil }
        let footprint = actor.footprint
        let anchor = Cell(x: Int32(position.x + CGFloat(footprint.width) / 2) - 1,
                          y: Int32(position.y + CGFloat(footprint.height) / 2) - 1)
        let from = Cell(x: max(anchor.x - footprint.width + 1, min(anchor.x, primary.x)),
                        y: max(anchor.y - footprint.height + 1, min(anchor.y, primary.y)))
        let stepX = primary.x - from.x
        let stepY = primary.y - from.y
        guard max(abs(stepX), abs(stepY)) == 1 else { return nil }
        let behind = Cell(x: primary.x + stepX, y: primary.y + stepY)
        guard let victim = before.values.first(where: { $0.team != actor.team && $0.cells.contains(behind) }) else {
            return nil
        }
        // Each moment lists the stacks damaged by that accepted action. A consumed Water Shield is also contact.
        let shieldAbsorbed = victim.hasWaterShield && after[victim.id]?.hasWaterShield == false
        guard moment.hurt?.contains(victim.id) == true || shieldAbsorbed else { return nil }
        return BattlefieldProjection.logicalCenter([behind])
    }

    func impactTime(for stack: Stack) -> TimeInterval { contacts[stack.id] ?? impactTime }

    func amount(for stack: Stack, elapsed: TimeInterval, reducedMotion: Bool) -> Int {
        guard !reducedMotion, let before = previousAmounts[stack.id], let changes = casualtyContacts[stack.id] else {
            return stack.amount
        }
        return max(0, before - changes.reduce(0) { $0 + ($1.time <= elapsed ? $1.casualties : 0) })
    }

    func statusStack(for stack: Stack, elapsed: TimeInterval, reducedMotion: Bool) -> Stack {
        let change = statusContacts[stack.id] ?? impactTime(for: stack)
        return reducedMotion || elapsed >= change ? stack : previousStacks[stack.id] ?? stack
    }

    func statusTints(at now: Date) -> [Int: UInt32] {
        var latest: [Int: (time: Date, kind: StackStatus.Kind)] = [:]
        for cue in combatCues where cue.flashes {
            guard case let .status(_, kind) = cue.kind,
                  now < cue.endsAt,
                  (0..<BattleStatusEffects.washDuration).contains(now.timeIntervalSince(cue.started)) else { continue }
            if let prior = latest[cue.stack.id],
               prior.time > cue.started || (prior.time == cue.started && prior.kind != .buff && kind == .buff) { continue }
            latest[cue.stack.id] = (cue.started, kind)
        }
        return latest.compactMapValues { BattleStatusEffects.washTint(kind: $0.kind, age: now.timeIntervalSince($0.time)) }
    }

    func flagStatus(for stack: Stack, elapsed: TimeInterval, now: Date, reducedMotion: Bool) -> BattleFlagStatus {
        let prior = previousStacks[stack.id] ?? stack
        let state = statusStack(for: stack, elapsed: elapsed, reducedMotion: reducedMotion)
        let pendingResponse = actions.first { $0.counterattack?.actor == stack.id && $0.counterattack?.spent == true }
        let hasStarted = reducedMotion || (pendingResponse.map { elapsed >= $0.start } ?? true)
        let responded = hasStarted
            ? stack.responded || (responseFeedback[stack.id].map { now < $0 } == true)
            : prior.responded
        let effects = Set(state.statuses.filter { $0.kind != .buff }.map(\.name))
        let stunned = !effects.contains("Freeze") && (effects.contains("Stun") || effects.contains("Blindness") ||
            state.skipping == true && !effects.contains("Whirlpool"))
        return BattleFlagStatus(responded: responded, immobilized: state.immobilized, waiting: state.waiting, stunned: stunned)
    }

    func spawnOpacity(for stack: Stack, elapsed: TimeInterval) -> Double {
        guard spawns.contains(stack.id) else { return 1 }
        return min(1, max(0, (elapsed - impactTime) / 0.18))
    }

    func route(for stack: Stack) -> [Cell] {
        actions.filter { $0.moment.actor == stack.id }.flatMap(\.route)
    }

    func movementTime(_ route: [Cell]) -> TimeInterval { Self.travelTime(route, flying: false) }

    private static func travelTime(_ route: [Cell], flying: Bool) -> TimeInterval {
        guard route.count > 1 else { return 0 }
        // The browser applies its 16 cells/s speed in 1/240 s steps, 60 times per real second.
        let speed = 4.0 * (flying ? 1.2 : 1)
        return travelDistance(route) / speed
    }

    private static func travelDistance(_ route: [Cell]) -> Double {
        zip(route, route.dropFirst()).reduce(0.0) { sum, pair in
            sum + hypot(Double(pair.1.x - pair.0.x), Double(pair.1.y - pair.0.y))
        }
    }

    func pose(for stack: Stack, elapsed: TimeInterval, idleTime: TimeInterval, fallen: Bool) -> CreaturePose {
        if let reaction = reactions[stack.id]?.last(where: {
            elapsed >= $0.start && (elapsed < $0.end || $0.action == .death && fallen)
        }) {
            return CreaturePose(action: reaction.action, time: elapsed - reaction.start,
                                playbackDuration: reaction.duration)
        }
        if let action = activeAction(for: stack, at: elapsed) {
            if elapsed < action.moveEnd {
                let time = elapsed - action.start
                let distance = Self.travelDistance(action.route)
                return CreaturePose(action: .walk, time: time,
                                    walkDistance: distance * time / (action.moveEnd - action.start), walkLength: distance)
            }
            if let pose = action.pose, elapsed < action.actionEnd {
                if stack.name == "Zena", let disc = action.chakram {
                    let windup = disc.release - action.moveEnd
                    let time = elapsed < disc.catchTime ? min(elapsed - action.moveEnd, windup + 0.000_001)
                        : max(0, windup - 0.000_001 - (elapsed - disc.catchTime))
                    return CreaturePose(action: pose, time: time, verticalAttack: action.direction)
                }
                return CreaturePose(action: pose, time: elapsed - action.moveEnd,
                                    playbackDuration: action.actionEnd - action.moveEnd, verticalAttack: action.direction)
            }
        }
        return CreaturePose(action: .idle, time: idleTime)
    }

    func facing(for stack: Stack, elapsed: TimeInterval, reducedMotion: Bool) -> CGFloat {
        let home: CGFloat = stack.team == .player ? 1 : -1
        guard !reducedMotion, let action = activeAction(for: stack, at: elapsed) else { return home }
        if elapsed >= action.moveEnd, let start = action.attackPosition, let target = action.target,
           abs(start.x - target.x) > 0.03 { return start.x < target.x ? 1 : -1 }
        if let sample = routeSample(action, elapsed: elapsed) {
            for index in (0...sample.index).reversed() {
                let dx = action.route[index + 1].x - action.route[index].x
                if dx != 0 { return dx > 0 ? 1 : -1 }
            }
        }
        return home
    }

    func position(_ stack: Stack, at elapsed: TimeInterval, projection: BattlefieldProjection) -> CGPoint {
        let position = logicalPosition(stack, at: elapsed)
        return projection.point(x: position.x, y: position.y)
    }

    func isMoving(_ stack: Stack, at elapsed: TimeInterval) -> Bool {
        guard let action = activeAction(for: stack, at: elapsed) else { return false }
        return action.route.count > 1 && elapsed < action.moveEnd
    }

    func logicalPosition(_ stack: Stack, at elapsed: TimeInterval) -> CGPoint {
        let final = BattlefieldProjection.logicalCenter(stack.cells)
        if let action = activeAction(for: stack, at: elapsed) {
            if elapsed < action.moveEnd, let sample = routeSample(action, elapsed: elapsed) {
                let a = Self.center(at: action.route[sample.index], for: stack)
                let b = Self.center(at: action.route[sample.index + 1], for: stack)
                return CGPoint(x: a.x + (b.x - a.x) * sample.progress, y: a.y + (b.y - a.y) * sample.progress)
            }
            if let last = action.route.last { return Self.center(at: last, for: stack) }
        }
        if elapsed < impactTime, let initial = initialPositions[stack.id] { return initial }
        return final
    }

    private func activeAction(for stack: Stack, at elapsed: TimeInterval) -> Action? {
        actions.last { $0.moment.actor == stack.id && $0.start <= elapsed }
    }

    private func routeSample(_ action: Action, elapsed: TimeInterval) -> (index: Int, progress: Double)? {
        let count = action.route.count - 1
        guard count > 0, action.moveEnd > action.start else { return nil }
        let lengths = zip(action.route, action.route.dropFirst()).map { a, b in
            hypot(Double(b.x - a.x), Double(b.y - a.y))
        }
        var distance = lengths.reduce(0, +) * min(1, max(0, (elapsed - action.start) / (action.moveEnd - action.start)))
        for (index, length) in lengths.enumerated() {
            if distance <= length || index == count - 1 { return (index, min(1, distance / length)) }
            distance -= length
        }
        return nil
    }

    private static func center(at anchor: Cell, for stack: Stack?) -> CGPoint {
        let shape = stack?.footprint ?? .single
        return CGPoint(x: CGFloat(anchor.x + 1) - CGFloat(shape.width) / 2,
                       y: CGFloat(anchor.y + 1) - CGFloat(shape.height) / 2)
    }
}
