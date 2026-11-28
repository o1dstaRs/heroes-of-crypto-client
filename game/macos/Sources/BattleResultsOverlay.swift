import ImageIO
import SwiftUI

private func resultTone(_ team: Team) -> Color {
    team == .opponent ? BattlePalette.color(0xff5a5a) : BattlePalette.team(team)
}

struct BattleResultsOverlay: View {
    let summary: BattleFightSummary
    let model: SkirmishModel

    private var title: String {
        switch summary.winner {
        case .player, .opponent: "VICTORY"
        case .draw: "DRAW"
        case nil: "INTERRUPTED"
        }
    }

    private var winnerTone: Color {
        if let team = summary.winner, team != .draw { return resultTone(team) }
        return BattlePalette.gold
    }

    private let edge = Color(red: 0.24, green: 0.22, blue: 0.20)

    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let compact = size.height < 780
            ZStack {
                ResultsCastle(size: size)
                Group {
                    if size.height <= 820 {
                        ScrollView {
                            resultsContent(compact: compact, scrollDamage: false)
                        }
                        .scrollBounceBehavior(.basedOnSize)
                    } else {
                        resultsContent(compact: compact, scrollDamage: true)
                    }
                }
                .frame(width: min(960, size.width * 0.945), height: min(940, size.height * 0.975))
                .clipShape(RoundedRectangle(cornerRadius: 11))
                .background { panelBackground }
                .overlay(alignment: .topTrailing) {
                    Button { model.setFightResultsVisible(false) } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(BattlePalette.parchment)
                            .frame(width: 27, height: 27)
                            .background(BattlePalette.color(0x21160e), in: Circle())
                            .overlay { Circle().strokeBorder(BattlePalette.bronze.opacity(0.85)) }
                    }
                    .buttonStyle(BattleButtonStyle())
                    .accessibilityLabel("Close fight results")
                    .padding(6)
                }
            }
            .frame(width: size.width, height: size.height)
        }
        .foregroundStyle(BattlePalette.parchment)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Fight results")
    }

    private func resultsContent(compact: Bool, scrollDamage: Bool) -> some View {
        VStack(spacing: compact ? 9 : 13) {
            header(height: compact ? 96 : 112)
            BattleResultsChart(summary: summary)
                .frame(height: 170)
                .background(.black.opacity(0.43), in: RoundedRectangle(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(edge) }
            damageTitle
            if scrollDamage {
                ViewThatFits(in: .vertical) {
                    damageColumns(compact: compact)
                    ScrollView { damageColumns(compact: compact) }
                        .scrollBounceBehavior(.basedOnSize)
                }
                .frame(maxHeight: .infinity, alignment: .top)
            } else {
                damageColumns(compact: compact)
            }
            HStack(alignment: .top, spacing: 20) {
                ForEach(summary.armies) { army in casualtyColumn(army) }
            }
            actions
        }
        .padding(compact ? 14 : 18)
        .padding(.top, 5)
    }

    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: 11)
            .fill(BattlePalette.color(0x110d09).opacity(0.88))
            .overlay {
                if let bronze = BattleResources.image("fight_results_burnished_bronze_panel_background_v1") {
                    Image(nsImage: bronze).resizable().opacity(0.3)
                        .clipShape(RoundedRectangle(cornerRadius: 11))
                }
            }
            .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(edge, lineWidth: 2) }
            .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(edge.opacity(0.6)).padding(6) }
            .shadow(color: .black.opacity(0.92), radius: 22, y: 10)
            .accessibilityHidden(true)
    }

    private func header(height: CGFloat) -> some View {
        HStack(spacing: 8) {
            participant(.player, reversed: false)
            VStack(spacing: 3) {
                SidebarIcon(asset: summary.winner == .draw ? "" : "fight_results_trophy_v1",
                            symbol: summary.winner == .draw ? "scale.3d" : "trophy.fill")
                    .frame(width: 43, height: 43)
                    .padding(5)
                    .background(.black.opacity(0.65), in: Circle())
                    .overlay { Circle().strokeBorder(winnerTone.opacity(0.58), lineWidth: 1.6) }
                Text(LocalizedStringKey(title))
                    .font(BattleResources.display(14)).tracking(1.2)
                    .foregroundStyle(winnerTone)
                    .accessibilityAddTraits(.isHeader)
                Text(summary.laps == 1
                     ? LocalizedStringKey("BATTLE · \(summary.laps) LAP")
                     : LocalizedStringKey("BATTLE · \(summary.laps) LAPS"))
                    .font(.system(size: 9, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(BattlePalette.sidebarTitle)
            }
            .frame(width: 123)
            .frame(maxHeight: .infinity)
            .background {
                RoundedRectangle(cornerRadius: 10)
                    .fill(RadialGradient(colors: [BattlePalette.color(0x4b3820).opacity(0.7), .black.opacity(0.88)],
                                         center: .center, startRadius: 4, endRadius: 79))
            }
            .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(edge) }
            participant(.opponent, reversed: true)
        }
        .frame(height: height)
    }

    private func participant(_ team: Team, reversed: Bool) -> some View {
        let tone = resultTone(team)
        let isAI = model.autoplay || model.automatedTeams.contains(team)
        let won = summary.winner == team
        let result = if summary.winner == nil { "UNFINISHED" }
                     else if summary.winner == .draw { "DRAWN" }
                     else if won { "VICTORIOUS" }
                     else { "DEFEATED" }
        return HStack(spacing: 12) {
            if !reversed { crest(team, isAI: isAI) }
            VStack(alignment: reversed ? .trailing : .leading, spacing: 6) {
                Text(LocalizedStringKey("\(team.title) \(isAI ? "AI" : "Player")".uppercased()))
                    .font(BattleResources.display(20)).tracking(0.65)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(LocalizedStringKey(result))
                    .font(BattleResources.display(11)).tracking(1)
                    .foregroundStyle(won ? BattlePalette.gold : tone)
                Text("\(Text(LocalizedStringKey(team.title.uppercased()))) ARMY")
                    .font(.system(size: 9, weight: .semibold)).tracking(0.7)
                    .foregroundStyle(BattlePalette.sidebarTitle)
            }
            .frame(maxWidth: .infinity, alignment: reversed ? .trailing : .leading)
            if reversed { crest(team, isAI: isAI) }
        }
        .padding(.horizontal, 15)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            RoundedRectangle(cornerRadius: 10)
                .fill(LinearGradient(colors: [tone.opacity(won ? 0.24 : 0.15), .black.opacity(0.84)],
                                     startPoint: reversed ? .trailing : .leading, endPoint: reversed ? .leading : .trailing))
        }
        .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(tone.opacity(won ? 0.56 : 0.31)) }
        .accessibilityElement(children: .combine)
    }

    private func crest(_ team: Team, isAI: Bool) -> some View {
        let tone = resultTone(team)
        return Group {
            if isAI {
                SidebarIcon(asset: "combat_toolbar_ember_ai", symbol: "brain.head.profile")
            } else {
                Text(String(team.title.prefix(1)))
                    .font(BattleResources.display(26))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(tone.opacity(0.17), in: Circle())
                    .overlay { Circle().strokeBorder(tone.opacity(0.66), lineWidth: 2) }
            }
        }
        .frame(width: 57, height: 57)
        .accessibilityHidden(true)
    }

    private var damageTitle: some View {
        HStack(spacing: 12) {
            Rectangle().fill(edge.opacity(0.86)).frame(height: 1)
            Text("DAMAGE DEALT")
                .font(BattleResources.display(13)).tracking(1.13)
                .foregroundStyle(BattlePalette.gold)
                .frame(width: 159, height: 27)
                .background(BattlePalette.color(0x2c1d10).opacity(0.9), in: RoundedRectangle(cornerRadius: 6))
                .overlay { RoundedRectangle(cornerRadius: 6).strokeBorder(BattlePalette.bronze.opacity(0.55)) }
                .accessibilityAddTraits(.isHeader)
            Rectangle().fill(edge.opacity(0.86)).frame(height: 1)
        }
    }

    private func synergies(for team: Team) -> [(key: String, level: Int, icon: String)] {
        guard let preview = model.teamPreview[team], let options = model.loadoutOptions else { return [] }
        let checked = model.loadouts[team]?.synergies ?? [:]
        return ["Life", "Nature", "Chaos", "Might"].compactMap { faction in
            guard let level = preview.levels[faction], level > 0,
                  let variant = checked[faction] ?? options.synergyDefaults[faction],
                  let icon = BattleResources.synergies["\(faction):\(variant):\(level)"]?.icon else { return nil }
            return ("\(faction):\(variant)", level, icon)
        }
    }

    private func damageColumns(compact: Bool) -> some View {
        HStack(alignment: .top, spacing: 20) {
            ForEach(summary.armies) { army in damageColumn(army, compact: compact) }
        }
        .padding(.horizontal, 5)
        .padding(.bottom, 3)
    }

    private func damageColumn(_ army: BattleFightSummary.Army, compact: Bool) -> some View {
        let tone = resultTone(army.team)
        let iconSide: CGFloat = compact ? 35.2 : 40
        let activeSynergies = synergies(for: army.team)
        let otherHasSynergies = summary.armies.contains { $0.team != army.team && !synergies(for: $0.team).isEmpty }
        return VStack(alignment: .leading, spacing: 5) {
            if !activeSynergies.isEmpty || otherHasSynergies {
                HStack(spacing: 12) {
                    if activeSynergies.isEmpty {
                        Text("No synergies").font(.caption.italic()).foregroundStyle(BattlePalette.sidebarTitle)
                    }
                    ForEach(activeSynergies, id: \.key) { synergy in
                        let title = SandboxTeamLoadout.synergyNames[synergy.key] ?? synergy.key
                        VStack(spacing: 4) {
                            SidebarIcon(asset: synergy.icon, symbol: "sparkles").frame(width: iconSide, height: iconSide)
                            HStack(spacing: 4) {
                                ForEach(0..<synergy.level, id: \.self) { _ in Circle().fill(tone).frame(width: 5, height: 5) }
                            }
                        }
                        .help("\(title) · Level \(synergy.level)")
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(title), level \(synergy.level)")
                    }
                }
                .frame(maxWidth: .infinity).frame(height: iconSide + 11)
            }
            ForEach(army.creatures) { row in
                HStack(spacing: 9) {
                    CreaturePortrait(name: row.name)
                        .frame(width: 34, height: 46)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .accessibilityHidden(true)
                    VStack(spacing: 4) {
                        HStack {
                            Text(LocalizedStringKey(row.name)).font(.system(size: 12, weight: .semibold)).foregroundStyle(BattlePalette.gold)
                            Spacer(minLength: 5)
                            Text(hudNumber(row.damage)).font(.system(size: 12, weight: .semibold).monospacedDigit())
                                .foregroundStyle(tone.opacity(row.damage > 0 ? 1 : 0.56))
                        }
                        GeometryReader { bar in
                            let fraction = summary.maxDamage > 0 ? row.damage / summary.maxDamage : 0
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2).fill(.black.opacity(0.75))
                                Rectangle().fill(tone).frame(width: bar.size.width * fraction)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 2))
                            .overlay { RoundedRectangle(cornerRadius: 2).strokeBorder(BattlePalette.bronze.opacity(0.7)) }
                        }
                        .frame(height: 6)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(army.team.title) \(row.name)")
                .accessibilityValue("\(hudNumber(row.damage)) damage dealt")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func casualtyColumn(_ army: BattleFightSummary.Army) -> some View {
        let tone = resultTone(army.team)
        let casualties = army.casualties
        let chosen = model.loadouts[army.team]
        let artifacts = model.loadoutOptions?.artifacts.filter { artifact in
            artifact.id != 0 && artifact.id == (artifact.tier == 1 ? chosen?.tier1 : chosen?.tier2)
        } ?? []
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(Text(LocalizedStringKey(army.team.title.uppercased()))) CASUALTIES")
                    .font(BattleResources.display(12)).tracking(0.65).foregroundStyle(tone)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                let percentage = BattleFightSummary.percentage(army.lost, of: army.deployed)
                Text("\(army.lost.formatted()) / \(army.deployed.formatted()) LOST · \(Int(percentage.rounded()))%")
                    .font(.system(size: 10, weight: .semibold).monospacedDigit())
                    .lineLimit(1)
            }
            Divider().overlay(tone.opacity(0.24))
            HStack(spacing: 8) {
                if army.team == .player && !artifacts.isEmpty { artifactRail(artifacts) }
                if casualties.isEmpty {
                    Text("No casualties").font(.caption.italic()).foregroundStyle(BattlePalette.sidebarTitle)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    GeometryReader { viewport in
                        let gap: CGFloat = 8
                        let padding: CGFloat = 6
                        let count = CGFloat(casualties.count)
                        let available = viewport.size.width - 2 * padding - (count - 1) * gap
                        let width = casualties.count > 6 ? 60 : min(60, max(40, available / count))
                        ScrollView(.horizontal) {
                            casualtyPortraits(casualties, width: width, spacing: gap, tone: tone)
                                .padding(.horizontal, padding)
                                .frame(height: viewport.size.height)
                        }
                        .scrollBounceBehavior(.basedOnSize)
                        .scrollIndicators(.hidden)
                    }
                }
                if army.team == .opponent && !artifacts.isEmpty { artifactRail(artifacts) }
            }
            .frame(height: 92)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func casualtyPortraits(_ casualties: [BattleFightSummary.Creature], width: CGFloat, spacing: CGFloat,
                                   tone: Color) -> some View {
        HStack(spacing: spacing) {
            ForEach(casualties) { row in
                CreaturePortrait(name: row.name)
                    .saturation(0.45).brightness(-0.11)
                    .frame(width: width, height: width * 4 / 3)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                    .overlay(alignment: .bottomTrailing) {
                        Text("×\(row.lost)")
                            .font(.system(size: 11.5, weight: .bold).monospacedDigit())
                            .padding(.horizontal, 4)
                            .frame(minWidth: 20)
                            .frame(height: 20)
                            .background(BattlePalette.color(0x1c0d03), in: Capsule())
                            .overlay { Capsule().strokeBorder(tone, lineWidth: 0.8) }
                            .offset(x: 4, y: 4)
                    }
                    .help("\(row.name) · \(row.lost) of \(row.deployed) lost")
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(row.name), \(row.lost) of \(row.deployed) lost")
            }
        }
    }

    private func artifactRail(_ artifacts: [SandboxLoadoutOptions.Artifact]) -> some View {
        VStack(spacing: 2) {
            ForEach(artifacts, id: \.tier) { item in
                SidebarIcon(asset: item.imageKey, symbol: "seal")
                    .frame(width: 21, height: 21)
                    .help("\(item.name) · \(item.description)")
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Tier \(item.tier) artifact, \(item.name)")
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 14) {
            if model.canReplay {
                BattlePlate("REPLAY", height: 38, tint: BattlePalette.color(0x39322c), action: model.playReplay)
                    .frame(width: 138)
            }
            BattlePlate("REMATCH", icon: "arrow.counterclockwise", height: 38,
                        tint: BattlePalette.color(0x635326), action: model.startRematch)
                .frame(width: 158)
            BattlePlate("+ NEW BATTLE", height: 38, tint: nil, action: model.newBattle)
                .frame(width: 146)
        }
    }
}

private struct ResultsCastle: View {
    let size: CGSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appearsActive) private var appearsActive
    @State private var opening = Date()

    private static let fireFrames: [CGImage] = {
        guard let url = Bundle.main.url(forResource: "fight_results_moonlit_fire_overlay_v9", withExtension: "webp"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return [] }
        return (0..<CGImageSourceGetCount(source)).compactMap { CGImageSourceCreateImageAtIndex(source, $0, nil) }
    }()

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.09, paused: reduceMotion || !appearsActive)) { timeline in
            let frames = Self.fireFrames
            let tick = max(0, Int(timeline.date.timeIntervalSince(opening) / 0.09))
            let fire = frames.isEmpty ? nil : frames[reduceMotion ? 0 : tick % frames.count]
            HStack(spacing: 0) {
                pane(.leading, fire: fire)
                pane(.trailing, fire: fire)
            }
        }
        .background(BattlePalette.color(0x050504))
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }

    private func pane(_ edge: Alignment, fire: CGImage?) -> some View {
        ZStack {
            if let castle = BattleResources.image("fight_results_moonlit_castle_background") {
                Image(nsImage: castle).resizable().scaledToFill()
                    .frame(width: size.width / 2, height: size.height, alignment: edge)
            }
            if let fire {
                Image(decorative: fire, scale: 1).resizable().scaledToFill()
                    .frame(width: size.width / 2, height: size.height, alignment: edge)
            }
        }
        .frame(width: size.width / 2, height: size.height)
        .clipped()
    }
}

private struct BattleResultsChart: View {
    let summary: BattleFightSummary

    private struct Elimination {
        let creature: BattleFightSummary.Elimination
        let lap: Int
        let origin: CGPoint
    }

    private var markerRadius: CGFloat {
        BattlePresentationScript.context?.objectForKeyedSubscript("hocCasualtyRadius")?.toDouble() ?? 16
    }

    var body: some View {
        GeometryReader { geometry in
            let plot = CGRect(x: 46, y: 18, width: max(1, geometry.size.width - 66), height: max(1, geometry.size.height - 54))
            let ticks = summary.samples.indices.filter { $0 == 0 || summary.samples[$0 - 1].lap != summary.samples[$0].lap }
            let marks = summary.samples.enumerated().flatMap { index, sample in
                sample.eliminated.map { creature in
                    Elimination(creature: creature, lap: sample.lap, origin: point(at: index, team: creature.team, in: plot))
                }
            }
            let centers = layout(marks, in: plot)
            Canvas { context, _ in
                for percent in [0, 25, 50, 75, 100] {
                    let y = plot.maxY - plot.height * Double(percent) / 100
                    var gridline = Path()
                    gridline.move(to: CGPoint(x: plot.minX, y: y))
                    gridline.addLine(to: CGPoint(x: plot.maxX, y: y))
                    context.stroke(gridline, with: .color(BattlePalette.gold.opacity(percent == 0 ? 0.45 : 0.17)))
                    let label = Text("\(percent)%").font(.system(size: 10).monospacedDigit()).foregroundStyle(BattlePalette.sidebarTitle)
                    context.draw(label, at: CGPoint(x: plot.minX - 7, y: y), anchor: .trailing)
                }
                for (offset, tick) in ticks.enumerated() where offset.isMultiple(of: max(1, (ticks.count + 7) / 8)) {
                    let x = point(at: tick, team: .player, in: plot).x
                    let label = Text("LAP \(summary.samples[tick].lap)").font(.system(size: 9, weight: .medium))
                        .foregroundStyle(BattlePalette.sidebarTitle)
                    context.draw(label, at: CGPoint(x: x, y: plot.maxY + 12))
                }
                for army in summary.armies {
                    drawSeries(army.team, in: context, plot: plot)
                }
                for (mark, center) in zip(marks, centers) where mark.origin != center {
                    let leader = Path { path in
                        path.move(to: mark.origin)
                        path.addLine(to: center)
                    }
                    context.stroke(leader, with: .color(resultTone(mark.creature.team).opacity(0.65)),
                                   style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                }
            }
            .accessibilityHidden(true)
            ForEach(marks.indices, id: \.self) { index in
                let mark = marks[index]
                let label = "\(mark.creature.name): all stacks defeated on lap \(mark.lap)"
                eliminationPortrait(mark.creature, radius: markerRadius)
                    .position(centers[index])
                    .help(label)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(mark.creature.team.title) \(label)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Casualties by lap")
    }

    private func layout(_ marks: [Elimination], in plot: CGRect) -> [CGPoint] {
        guard !marks.isEmpty else { return [] }
        let points = marks.map { [$0.origin.x, $0.origin.y] }
        let bounds = ["left": plot.minX, "right": plot.maxX, "top": plot.minY, "bottom": plot.maxY]
        let positions = BattlePresentationScript.context?.objectForKeyedSubscript("hocCasualtyCenters")?
            .call(withArguments: [points, bounds])?.toArray() as? [[Double]]
        guard let positions, positions.count == marks.count else { return marks.map(\.origin) }
        return zip(positions, marks).map { center, mark in
            center.count == 2 ? CGPoint(x: center[0], y: center[1]) : mark.origin
        }
    }

    private func eliminationPortrait(_ creature: BattleFightSummary.Elimination, radius: CGFloat) -> some View {
        let tone = resultTone(creature.team)
        let background = BattlePalette.color(0x1c0d03)
        let badgeRadius = radius * 0.45
        return ZStack {
            Circle().fill(background)
                .overlay { Circle().stroke(.black.opacity(0.9), lineWidth: 2.5) }
            CreaturePortrait(name: creature.name)
                .frame(width: (radius - 2) * 2, height: (radius - 2) * 2)
                .clipShape(Circle())
            Circle().stroke(tone, lineWidth: 1.75).padding(1)
            Circle().fill(background)
                .overlay { Circle().stroke(tone, lineWidth: 1.25) }
                .overlay {
                    let arm = radius * 0.2
                    Path { cross in
                        let middle = badgeRadius
                        cross.move(to: CGPoint(x: middle - arm, y: middle - arm))
                        cross.addLine(to: CGPoint(x: middle + arm, y: middle + arm))
                        cross.move(to: CGPoint(x: middle + arm, y: middle - arm))
                        cross.addLine(to: CGPoint(x: middle - arm, y: middle + arm))
                    }
                    .stroke(BattlePalette.parchment, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                }
                .frame(width: badgeRadius * 2, height: badgeRadius * 2)
                .offset(x: radius * 0.7, y: radius * 0.7)
        }
        .frame(width: radius * 2, height: radius * 2)
    }

    private func point(at index: Int, team: Team, in plot: CGRect) -> CGPoint {
        let percentage = summary.samples[index].losses[team, default: 0]
        let step = plot.width / CGFloat(max(1, summary.samples.count - 1))
        return CGPoint(x: plot.minX + CGFloat(index) * step, y: plot.maxY - plot.height * percentage / 100)
    }

    private func drawSeries(_ team: Team, in context: GraphicsContext, plot: CGRect) {
        let points = summary.samples.indices.map { point(at: $0, team: team, in: plot) }
        guard let first = points.first, let last = points.last else { return }
        let tone = resultTone(team)
        var line = Path()
        line.addLines(points)
        var area = line
        area.addLine(to: CGPoint(x: last.x, y: plot.maxY))
        area.addLine(to: CGPoint(x: first.x, y: plot.maxY))
        area.closeSubpath()
        context.fill(area, with: .linearGradient(Gradient(colors: [tone.opacity(0.31), .clear]),
                     startPoint: CGPoint(x: plot.minX, y: plot.minY), endPoint: CGPoint(x: plot.minX, y: plot.maxY)))
        context.stroke(line, with: .color(tone), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
    }
}
