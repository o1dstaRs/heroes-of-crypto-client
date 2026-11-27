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
}

struct BattleCombatCue {
    enum Kind {
        case health(delta: Double, casualties: Int)
        case status(name: String, kind: StackStatus.Kind)
    }

    let stack: Stack
    let position: CGPoint
    let kind: Kind
    let started: Date

    var duration: TimeInterval {
        switch kind {
        case .health: 0.65
        case .status: 1.30
        }
    }

    var endsAt: Date { started.addingTimeInterval(duration) }
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
    }

    struct Reaction {
        let start: TimeInterval
        let duration: TimeInterval
    }

    let started: Date
    let actions: [Action]
    let reactions: [Int: Reaction]
    let fallen: [Stack]
    let idleResumes: [Int: Date]
    let previousAmounts: [Int: Int]
    let combatCues: [BattleCombatCue]
    let waterShieldBreaks: [BattleWaterShieldBreak]
    let responseFeedback: [Int: Date]
    let resetsCombatCues: Bool
    let duration: TimeInterval
    let narrowingFrom: Int?
    let narrowingStarts: TimeInterval
    private let initialPositions: [Int: CGPoint]
    private let previousStacks: [Int: Stack]
    private let contacts: [Int: TimeInterval]
    private let spawns: Set<Int>

    init(moments: [Moment] = [], previous: BattleView? = nil, next: BattleView? = nil,
         idleResumes: [Int: Date] = [:], priorResponseFeedback: [Int: Date] = [:]) {
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
        var changes = [Int: Reaction]()
        var hitTimes = [Int: TimeInterval]()
        var feedback = priorResponseFeedback.filter { after[$0.key] != nil && $0.value > started }
        var cues = [BattleCombatCue]()
        var dissolves = [BattleWaterShieldBreak]()
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
        func healthCue(_ target: Int, delta: Double, casualties: Int, at time: TimeInterval) {
            guard abs(delta) > 0.001 || casualties > 0, let stack = before[target] ?? after[target] else { return }
            let position = positions[target] ?? BattlefieldProjection.logicalCenter(stack.cells)
            cues.append(BattleCombatCue(stack: stack, position: position, kind: .health(delta: delta, casualties: casualties),
                                        started: started.addingTimeInterval(time)))
        }

        func statusCues(_ applications: [Moment.StatusApplication], at time: TimeInterval) {
            for status in applications {
                guard let stack = after[status.target] ?? before[status.target] else { continue }
                let position = positions[status.target] ?? BattlefieldProjection.logicalCenter(stack.cells)
                cues.append(BattleCombatCue(stack: stack, position: position,
                                            kind: .status(name: status.name, kind: status.kind),
                                            started: started.addingTimeInterval(time)))
            }
        }
        func react(_ id: Int, at impact: TimeInterval, exchanging group: [Action] = []) -> TimeInterval {
            hitTimes[id] = impact
            guard let stack = before[id] else { return impact }
            let dead = after[id] == nil
            let swing = group.first { $0.moment.actor == id && $0.pose != nil }
            // The outgoing swing is also the reaction pose in a simultaneous exchange.
            if swing != nil && !dead { return impact }
            let deathStart = swing.map {
                $0.moment.kind == .melee ? min($0.actionEnd, impact + 0.15) : $0.actionEnd
            } ?? impact
            let start = max(impact, deathStart)
            let clip = CreatureAnimation.timing(for: stack.name, action: dead ? .death : .hit, direction: nil)
            let duration = clip?.duration ?? (dead ? 0.56 : 0.24)
            changes[id] = Reaction(start: start, duration: duration)
            return start + duration
        }

        func plan(_ moment: Moment, at start: TimeInterval, counterattack: Counterattack? = nil) -> Action {
            let stack = after[moment.actor] ?? before[moment.actor]
            let route = moment.route.reduce(into: [Cell]()) { route, cell in
                if route.last != cell { route.append(cell) }
            }
            let moveEnd = start + Self.travelTime(route, flying: stack?.flies == true)
            let attackPosition = route.last.map { Self.center(at: $0, for: stack) } ?? positions[moment.actor]
            let targetPosition = moment.splash.map { BattlefieldProjection.logicalCenter([$0.center]) }
                ?? moment.target.flatMap { positions[$0] }
                ?? moment.aim.map { BattlefieldProjection.logicalCenter([$0]) }
            let direction: String? = {
                let actor = stack?.footprint ?? .single
                let target = moment.target.flatMap { before[$0]?.footprint } ?? .single
                guard let attackPosition, let targetPosition else { return nil }
                let distance = targetPosition.y - attackPosition.y
                let halfHeights = CGFloat(actor.height + target.height) / 2
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
            let projectile = launchesProjectile ? BattleProjectile.forShooter(stack?.name) : nil
            let timing = requestedPose.flatMap { action in
                stack.flatMap { CreatureAnimation.timing(for: $0.name, action: action, direction: direction,
                                                         releaseFrame: projectile?.releaseFrame) }
            }
            let pose = requestedPose == .cast && timing == nil ? nil : requestedPose
            let actionTime = pose == nil ? 0 : timing?.duration ?? 0.62
            let actionEnd = moveEnd + actionTime
            let destination = moment.splash != nil ? targetPosition :
                moment.aimSide.flatMap { side in moment.aim.map { side.point(on: $0) } } ?? targetPosition
            var release: TimeInterval?
            var impact = moveEnd + (timing?.impact ?? actionTime * 0.5)
            if launchesProjectile, let attackPosition, let destination {
                let flight = hypot(destination.x - attackPosition.x, destination.y - attackPosition.y) / 16
                release = moveEnd + (timing?.release ?? actionTime * 0.42)
                impact = (release ?? moveEnd) + max(0.08, flight)
            }
            let skewerContact = Self.skewerContact(for: moment, actor: before[moment.actor],
                                                   attackPosition: attackPosition, before: before, after: after)
            return Action(moment: moment, counterattack: counterattack, start: start, moveEnd: moveEnd,
                          actionEnd: actionEnd, projectile: projectile, release: release, impact: impact,
                          pose: pose, direction: direction, route: route, startPosition: positions[moment.actor],
                          attackPosition: attackPosition, target: destination, skewerContact: skewerContact)
        }

        for moment in moments {
            let opening = plan(moment, at: cursor)
            var group = [opening]
            if let position = opening.attackPosition { positions[moment.actor] = position }
            var reply: Action?
            if let counterattack = moment.counterattack {
                let counter = Moment(kind: moment.kind, actor: counterattack.actor, target: counterattack.target,
                                     aim: nil, aimSide: nil, spell: nil, splash: counterattack.splash, route: [], hurt: moment.hurt,
                                     healthChanges: nil, statusApplications: nil)
                let response = plan(counter, at: opening.moveEnd, counterattack: counterattack)
                reply = response
                group.append(response)
                if counterattack.spent { feedback[counterattack.actor] = started.addingTimeInterval(response.start + 1.6) }
            }
            phases += group
            cursor = group.reduce(cursor) { end, action in
                let burst = action.moment.splash == nil ? 0 : action.projectile?.impact?.duration ?? 0.20
                return max(end, action.actionEnd, action.impact + burst)
            }
            func contact(for id: Int) -> TimeInterval {
                if let reply, reply.moment.target == id { return reply.impact }
                return opening.impact
            }
            if let id = moment.target { hitTimes[id] = contact(for: id) }
            if let id = reply?.moment.target { hitTimes[id] = contact(for: id) }
            for id in moment.hurt ?? [] {
                let responds = reply != nil && group.contains { $0.moment.actor == id }
                cursor = max(cursor, react(id, at: contact(for: id), exchanging: responds ? group : []))
            }
            for change in moment.healthChanges ?? [] {
                displayedHealth[change.target, default: 0] += change.delta
                displayedCasualties[change.target, default: 0] += change.casualties
                healthCue(change.target, delta: change.delta, casualties: change.casualties, at: contact(for: change.target))
            }
            let applications = moment.statusApplications ?? []
            let responseVictim = reply?.moment.target
            statusCues(applications.filter { $0.target != responseVictim }, at: opening.impact)
            if let reply { statusCues(applications.filter { $0.target == responseVictim }, at: reply.impact) }
            displayedStatuses += applications
            for id in moment.waterShieldBreaks ?? [] { dissolveShield(id, at: contact(for: id)) }
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
            let impact = narrowingFrom == nil ? (phases.last?.impact ?? 0) : narrowingStarts + 0.5
            for stack in hurt where hitTimes[stack.id] == nil || (after[stack.id] == nil && changes[stack.id] == nil) {
                cursor = max(cursor, react(stack.id, at: impact))
            }
            if next?.started == true {
                var remainingStatuses = [Moment.StatusApplication]()
                for stack in previous.stacks {
                    let survivor = after[stack.id]
                    if stack.hasWaterShield, survivor?.hasWaterShield == false { dissolveShield(stack.id, at: impact) }
                    let delta = (survivor?.cumulativeHealth ?? 0) - stack.cumulativeHealth
                    let casualties = stack.amount - (survivor?.amount ?? 0)
                    healthCue(stack.id, delta: delta - displayedHealth[stack.id, default: 0],
                              casualties: casualties - displayedCasualties[stack.id, default: 0], at: impact)
                    for status in survivor?.statuses ?? [] where status.laps < 1e12 && !status.name.hasSuffix(" Augment") {
                        let prior = stack.statuses.first { $0.kind == status.kind && $0.name == status.name }
                        if let prior, status.laps <= prior.laps, status.power == prior.power { continue }
                        let event = Moment.StatusApplication(target: stack.id, kind: status.kind, name: status.name)
                        if !displayedStatuses.contains(event) { remainingStatuses.append(event) }
                    }
                }
                statusCues(remainingStatuses, at: impact)
            }
            if !spawns.isEmpty {
                cursor = max(cursor, (phases.last?.impact ?? 0) + 0.18)
            }
        }
        actions = phases
        reactions = changes
        contacts = hitTimes
        responseFeedback = feedback
        combatCues = cues
        waterShieldBreaks = dissolves
        // Keep the deciding hit readable before the results overlay covers the board.
        if next?.winner != nil, let end = cues.map(\.endsAt).max() {
            cursor = max(cursor, end.timeIntervalSince(started))
        }
        duration = cursor
        var resumes = idleResumes.filter { after[$0.key] != nil }
        for action in phases where action.pose != nil || action.moveEnd > action.start {
            if after[action.moment.actor] != nil {
                resumes[action.moment.actor] = started.addingTimeInterval(action.actionEnd)
            }
        }
        for (id, reaction) in changes where after[id] != nil {
            let end = started.addingTimeInterval(reaction.start + reaction.duration)
            resumes[id] = max(resumes[id] ?? end, end)
        }
        self.idleResumes = resumes
    }

    var impactTime: TimeInterval { actions.last?.impact ?? 0 }

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

    func flagStatus(for stack: Stack, elapsed: TimeInterval, now: Date, reducedMotion: Bool) -> BattleFlagStatus {
        let prior = previousStacks[stack.id] ?? stack
        let state = reducedMotion || elapsed >= impactTime(for: stack) ? stack : prior
        let pendingResponse = actions.first { $0.counterattack?.actor == stack.id && $0.counterattack?.spent == true }
        let hasStarted = reducedMotion || (pendingResponse.map { elapsed >= $0.start } ?? true)
        let responded = hasStarted
            ? stack.responded || (responseFeedback[stack.id].map { now < $0 } == true)
            : prior.responded
        return BattleFlagStatus(responded: responded, immobilized: state.immobilized, waiting: state.waiting)
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
        if let reaction = reactions[stack.id], elapsed >= reaction.start,
           fallen || elapsed < reaction.start + reaction.duration {
            return CreaturePose(action: fallen ? .death : .hit, time: elapsed - reaction.start,
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
