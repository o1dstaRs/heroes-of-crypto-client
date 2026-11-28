import SwiftUI

struct BattleTurnFooter: View {
    let active: Stack
    let queue: [Stack]
    let lap: Int
    let humanTurn: Bool
    let window: SandboxTurnClock.Window?
    let pausedAt: ContinuousClock.Instant?
    let width: CGFloat
    let requestTime: (() -> Void)?
    let inspect: (Stack) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var medallionSide: CGFloat { max(26, min(40, (width - 12) * 0.22)).rounded() }
    private var secondsWidth: CGFloat { width < 180 ? 28 : 32 }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            timer
            LinearGradient(colors: [.clear, BattlePalette.bronze.opacity(0.75), .clear],
                           startPoint: .leading, endPoint: .trailing)
                .frame(height: 1)
                .accessibilityHidden(true)
            BattleTurnQueue(stacks: queue, width: max(0, width - 12), inspect: inspect)
                .help("Hold Option (⌥) to view the full turn order")
        }
        .padding(.horizontal, 6)
        .padding(.top, 4)
        .padding(.bottom, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            GeometryReader { geometry in
                if let background = BattleResources.image("ui_up_next_smoky_chains_bg_85pct_v5") {
                    Image(nsImage: background).resizable().scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                } else {
                    Color.black.opacity(0.3)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 5))
            .accessibilityHidden(true)
        }
        .padding(.bottom, 3)
    }

    private var timer: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { timeline in
            timerContent(at: pausedAt ?? .now, time: timeline.date.timeIntervalSinceReferenceDate)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 5)
        .background {
            RoundedRectangle(cornerRadius: 3)
                .fill(LinearGradient(colors: [BattlePalette.color(0x1c1b18), BattlePalette.color(0x090908)],
                                     startPoint: .top, endPoint: .bottom))
                .overlay { RoundedRectangle(cornerRadius: 3).strokeBorder(BattlePalette.bronze.opacity(0.45)) }
        }
        .padding(.horizontal, 2)
    }

    private func timerContent(at now: ContinuousClock.Instant, time: TimeInterval) -> some View {
        let remaining = window?.remaining(at: now) ?? 0
        let seconds = Int(ceil(remaining))
        let fraction = window.map { $0.limit > 0 ? remaining / $0.limit : 0 } ?? 0
        let critical = remaining > 0 && remaining <= 5
        return VStack(spacing: 2) {
            HStack(spacing: 6) {
                VStack(spacing: 0) {
                    Text("LAP").font(BattleResources.display(medallionSide * 0.2)).tracking(0.8)
                        .foregroundStyle(BattlePalette.gold)
                    Text(max(1, lap), format: .number).font(BattleResources.display(medallionSide * 0.42))
                }
                .frame(width: medallionSide, height: medallionSide)
                .background {
                    Circle().fill(RadialGradient(colors: [BattlePalette.color(0x4a3214), BattlePalette.color(0x120b04)],
                                                 center: UnitPoint(x: 0.5, y: 0.32), startRadius: 0, endRadius: medallionSide))
                }
                .overlay { Circle().strokeBorder(BattlePalette.gold, lineWidth: 2) }
                .shadow(color: BattlePalette.gold.opacity(0.25), radius: 3)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Lap \(max(1, lap))")
                HStack(spacing: 6) {
                    gauge(fraction: fraction, critical: critical, time: time)
                    Text(window == nil ? "–" : "\(seconds)s")
                        .font(.system(size: width < 180 ? 12 : 14, weight: .bold).monospacedDigit())
                        .foregroundStyle(critical ? BattlePalette.opponent : BattlePalette.parchment)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(width: secondsWidth, alignment: .trailing)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(active.team.title) turn, \(active.name)")
                .accessibilityValue(window == nil ? "Timer unavailable" : "\(seconds) seconds remaining")
                .accessibilityIdentifier("TurnStatus")
            }
            HStack(spacing: 6) {
                Color.clear.frame(width: medallionSide)
                Group {
                    if let requestTime, window?.hasReachedHalfway(at: now) == true {
                        Button(action: requestTime) {
                            HStack(spacing: 5) {
                                Image(systemName: "timelapse").font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(BattlePalette.gold)
                                if width >= 184 {
                                    Text("More time").font(BattleResources.display(10)).tracking(0.45)
                                        .lineLimit(1).minimumScaleFactor(0.8)
                                }
                            }
                            .padding(.horizontal, 8)
                            .frame(height: 24)
                            .background {
                                Capsule().fill(LinearGradient(colors: [BattlePalette.color(0x3c2a13), BattlePalette.color(0x140d07)],
                                                              startPoint: .top, endPoint: .bottom))
                            }
                            .overlay { Capsule().strokeBorder(BattlePalette.gold.opacity(0.6)) }
                            .contentShape(Capsule())
                        }
                        .buttonStyle(BattleButtonStyle())
                        .accessibilityLabel("More time")
                        .accessibilityIdentifier("RequestTurnTime")
                        .help("Request additional time for this turn")
                    }
                }
                .frame(maxWidth: .infinity)
                Color.clear.frame(width: secondsWidth)
            }
            .frame(height: 25)
        }
    }

    private func gauge(fraction: Double, critical: Bool, time: TimeInterval) -> some View {
        let colors: [UInt32] = humanTurn ? [0xff8a73, 0xf4593f, 0xc2351f] :
            critical ? [0xffb36b, 0xef6c3a, 0xb83a17] : [0xffe6ab, 0xe8b558, 0xa87526]
        let pulse = critical && !reduceMotion ? (1 + cos(time * 2 * .pi / 0.9)) / 2 : 0
        return GeometryReader { geometry in
            Capsule().fill(.black.opacity(0.68))
                .overlay(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: colors.map(BattlePalette.color), startPoint: .top, endPoint: .bottom))
                        .frame(width: max(0, geometry.size.width - 4) * fraction)
                        .padding(2)
                        .animation(reduceMotion ? nil : .linear(duration: 0.25), value: fraction)
                }
                .overlay { Capsule().strokeBorder(BattlePalette.gold, lineWidth: 1.5) }
                .overlay { Capsule().strokeBorder(BattlePalette.opponent.opacity(pulse), lineWidth: 1.5) }
                .shadow(color: BattlePalette.opponent.opacity(pulse * 0.5), radius: 4)
        }
        .frame(height: max(12, (medallionSide * 0.45).rounded()))
        .accessibilityHidden(true)
    }
}

struct BattleUpNextOverlay: View {
    let battle: BattleView
    let projection: BattlefieldProjection
    let inspect: (Stack) -> Void

    var body: some View {
        GeometryReader { geometry in
            let art = projection.artworkRect.intersection(CGRect(origin: .zero, size: geometry.size))
            let floorTop = min(geometry.size.height, projection.point(x: 0, y: 16).y)
            let bandHeight = max(0, floorTop - art.minY)
            let width = art.width * 0.955
            let top = art.minY + bandHeight * 0.005
            let height = max(0, floorTop - top - bandHeight * 0.002)
            if !battle.turnOrder.isEmpty && width > 60 && height > 36 {
                VStack(spacing: height >= 150 ? 12 : 4) {
                    Text("LAP \(max(1, battle.lap))")
                        .font(BattleResources.display(height >= 150 ? 22 : 16))
                        .tracking(2.5)
                        .foregroundStyle(BattlePalette.gold)
                        .shadow(color: .black, radius: 4, y: 2)
                        .accessibilityAddTraits(.isHeader)
                    BattleTurnQueue(stacks: battle.turnOrder, width: width - 32, inspect: inspect, expandedHeight: height)
                }
                .frame(width: width, height: height)
                .background {
                    RadialGradient(colors: [.black.opacity(0.46), .black.opacity(0.74)],
                                   center: UnitPoint(x: 0.50, y: 0.62), startRadius: 5, endRadius: width * 0.55)
                    if let background = BattleResources.image("ui_up_next_smoky_chains_bg_wide_73pct_v4") {
                        Image(nsImage: background).resizable().scaledToFill()
                            .frame(width: width, height: height).clipped()
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("ExpandedTurnOrder")
                .offset(x: art.minX + art.width * 0.01, y: top)
            }
        }
    }
}

private struct BattleTurnQueue: View {
    let stacks: [Stack]
    let width: CGFloat
    let inspect: (Stack) -> Void
    var expandedHeight: CGFloat? = nil
    @State private var firstVisible: Int?
    @State private var wheelDistance: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let expanded = expandedHeight != nil
        let gap: CGFloat = expanded ? 8 : 5
        let compactWidth = min(max(34, floor((width - 4) / 2.6)), min(74, max(1, width - 4)))
        let portraitHeight = expandedHeight.map { fittedHeight(in: $0, gap: gap) } ?? (compactWidth * 256 / 190).rounded()
        let avatar = expanded ? cardWidth(for: portraitHeight) : compactWidth
        let glowMargin: CGFloat = expanded ? min(16, portraitHeight * 0.12) : 0
        let activeExtra = expanded ? ceil(avatar * 1.075) - avatar + glowMargin * 2 : 0
        let slotHeight = expanded ? ceil(portraitHeight * 1.075) + glowMargin * 2 : portraitHeight + 8
        let count = max(1, min(stacks.count, Int((width - activeExtra + gap - (expanded ? 0 : 4)) / (avatar + gap))))
        let content = avatar * CGFloat(stacks.count) + gap * CGFloat(max(0, stacks.count - 1)) + activeExtra
        let strip = expanded ? min(width, content) : avatar * CGFloat(count) + gap * CGFloat(count - 1)
        let lastLeadingIndex = max(0, stacks.count - count)
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: gap) {
                    ForEach(stacks) { stack in
                        let active = stack.id == stacks.first?.id
                        portrait(stack, width: avatar, height: portraitHeight, active: active, pulsing: expanded && active)
                            .frame(width: avatar + (active ? activeExtra : 0), height: slotHeight)
                            .id(stack.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollIndicators(.never, axes: .horizontal)
            .scrollTargetBehavior(.viewAligned)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .scrollPosition(id: $firstVisible, anchor: .leading)
            .frame(width: strip, height: slotHeight)
            .accessibilityLabel("Turn order")
            .accessibilityIdentifier("TurnQueue")
            if lastLeadingIndex > 0 {
                scrollbar(width: strip, visible: count, lastLeadingIndex: lastLeadingIndex)
            }
        }
        .background {
            if expanded, lastLeadingIndex > 0 {
                BattleQueueWheelMonitor { delta in
                    let step = (avatar + gap) / 2
                    if wheelDistance.sign != delta.sign { wheelDistance = 0 }
                    wheelDistance += delta
                    let cards = Int(wheelDistance / step)
                    guard cards != 0 else { return }
                    wheelDistance -= CGFloat(cards) * step
                    let current = stacks.firstIndex { $0.id == firstVisible } ?? 0
                    firstVisible = stacks[min(lastLeadingIndex, max(0, current + cards))].id
                }
            }
        }
        .padding(.leading, expanded ? 0 : 2)
        .onChange(of: stacks.first?.id, initial: true) { firstVisible = stacks.first?.id }
    }

    @ViewBuilder private func portrait(_ stack: Stack, width: CGFloat, height: CGFloat, active: Bool, pulsing: Bool) -> some View {
        let card = StackPortraitButton(stack: stack, width: width, height: height, selected: active) { inspect(stack) }
        if pulsing && !reduceMotion {
            TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
                let phase = (1 - cos(timeline.date.timeIntervalSinceReferenceDate * 2 * .pi / 1.25)) / 2
                card.scaleEffect(0.96 + phase * 0.115)
                    .shadow(color: BattlePalette.gold.opacity(0.34 + phase * 0.28), radius: 3 + phase * 4)
            }
        } else {
            card
        }
    }

    private func cardWidth(for height: CGFloat) -> CGFloat { (height * 190 / 256).rounded() + 2 }

    private func fittedHeight(in band: CGFloat, gap: CGFloat) -> CGFloat {
        let maximum = max(22, floor((band - min(86, band * 0.48)) / 1.075))
        func rowWidth(_ height: CGFloat) -> CGFloat {
            let card = cardWidth(for: height)
            return ceil(card * 1.075) + 2 * min(16, height * 0.12) + CGFloat(max(0, stacks.count - 1)) * (card + gap)
        }
        var fitted = min(maximum, 156)
        guard rowWidth(fitted) <= width else { return min(maximum, 256) }
        var taller = maximum
        while fitted < taller {
            let middle = ceil((fitted + taller) / 2)
            if rowWidth(middle) <= width { fitted = middle } else { taller = middle - 1 }
        }
        return fitted
    }

    private func scrollbar(width: CGFloat, visible: Int, lastLeadingIndex: Int) -> some View {
        let index = min(lastLeadingIndex, stacks.firstIndex { $0.id == firstVisible } ?? 0)
        let thumb = max(18, width * CGFloat(visible) / CGFloat(stacks.count))
        let travel = max(1, width - thumb)
        return ZStack(alignment: .leading) {
            Capsule().fill(.black.opacity(0.54))
            Capsule().fill(BattlePalette.color(0xcaa24f).opacity(0.76))
                .overlay { Capsule().strokeBorder(BattlePalette.gold.opacity(0.42)) }
                .frame(width: thumb)
                .offset(x: travel * CGFloat(index) / CGFloat(lastLeadingIndex))
        }
        .frame(width: width, height: 6)
        .frame(height: 13)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
            let fraction = min(1, max(0, (value.location.x - thumb / 2) / travel))
            firstVisible = stacks[Int((fraction * CGFloat(lastLeadingIndex)).rounded())].id
        })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scroll turn order")
        .accessibilityValue("\(index + 1) of \(lastLeadingIndex + 1)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: firstVisible = stacks[min(lastLeadingIndex, index + 1)].id
            case .decrement: firstVisible = stacks[max(0, index - 1)].id
            @unknown default: break
            }
        }
    }
}
