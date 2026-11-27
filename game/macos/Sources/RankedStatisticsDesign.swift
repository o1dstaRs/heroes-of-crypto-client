import SwiftUI

enum StatisticsTheme {
    static let background = BattlePalette.color(0x100e0d)
    static let chrome = BattlePalette.color(0x171311)
    static let glow = BattlePalette.color(0x211810)
    static let surface = BattlePalette.color(0x1d1815)
    static let stripe = BattlePalette.color(0x231d19)
    static let edge = BattlePalette.color(0x443528)
    static let ink = BattlePalette.color(0xf4e8d5)
    static let muted = BattlePalette.color(0xbdb09e)
    static let gold = BattlePalette.color(0xe8bd74)
    static let silver = BattlePalette.color(0xc2c9d5)
    static let bronze = BattlePalette.color(0xd19a76)
    static let wins = BattlePalette.color(0x8eb893)
    static let losses = BattlePalette.color(0xcd8a81)

    static func record(_ record: RankedStatisticsRecord) -> String {
        "\(record.wins.formatted())–\(record.losses.formatted())–\(record.draws.formatted())"
    }

    static func percent(_ record: RankedStatisticsRecord) -> String {
        record.games > 0 ? record.winRate.formatted(.percent.precision(.fractionLength(0...1))) : "—"
    }

    static func medal(_ place: Int) -> Color {
        switch place {
        case 1: gold
        case 2: silver
        default: bronze
        }
    }
}

extension View {
    func statisticsPanel(radius: CGFloat = 12) -> some View {
        background(StatisticsTheme.surface, in: RoundedRectangle(cornerRadius: radius))
            .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(StatisticsTheme.edge).allowsHitTesting(false) }
    }
}

struct StatisticsMetric {
    let label: String
    let value: String

    init(_ label: String, _ value: String) {
        self.label = label
        self.value = value
    }
}

private struct StatisticsMetrics: View {
    let items: [StatisticsMetric]
    let compact: Bool

    var body: some View {
        HStack(spacing: compact ? 16 : 25) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 {
                    Rectangle().fill(StatisticsTheme.gold.opacity(0.24)).frame(width: 1, height: 29)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.value)
                        .font(.system(size: compact ? 21 : 25, weight: .semibold, design: .monospaced))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(item.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(StatisticsTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

struct StatisticsHero: View {
    let title: String
    let subtitle: String
    let metrics: [StatisticsMetric]
    let compact: Bool
    let trophy: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 12 : 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(BattleResources.display(compact ? 33 : 43))
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
                    .accessibilityAddTraits(.isHeader)
                Text(subtitle)
                    .font(.system(size: compact ? 12 : 13, weight: .medium))
                    .foregroundStyle(StatisticsTheme.muted)
                    .lineLimit(1)
            }
            StatisticsMetrics(items: metrics, compact: compact)
        }
        .padding(.horizontal, compact ? 20 : 26)
        .padding(.vertical, compact ? 14 : 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .trailing) { artwork }
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(StatisticsTheme.gold.opacity(0.27)).allowsHitTesting(false) }
    }

    private var artwork: some View {
        ZStack(alignment: .trailing) {
            LinearGradient(colors: [StatisticsTheme.glow, StatisticsTheme.chrome],
                           startPoint: .leading, endPoint: .trailing)
            GeometryReader { geometry in
                if let scene = BattleResources.image("statistics-arena") {
                    Image(nsImage: scene)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geometry.size.width * (compact ? 0.55 : 0.64),
                               height: geometry.size.height, alignment: .center)
                        .clipped()
                        .opacity(trophy ? 0.46 : 0.84)
                        .mask {
                            LinearGradient(stops: [.init(color: .clear, location: 0.02),
                                                   .init(color: .black, location: 0.7)],
                                           startPoint: .leading, endPoint: .trailing)
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            LinearGradient(colors: [.clear, StatisticsTheme.background.opacity(0.55)],
                           startPoint: .center, endPoint: .bottom)
            if trophy {
                SidebarIcon(asset: "fight_results_trophy_v1", symbol: "trophy.fill")
                    .frame(width: compact ? 77 : 100, height: compact ? 77 : 100)
                    .foregroundStyle(StatisticsTheme.gold)
                    .shadow(color: .black.opacity(0.8), radius: 6, y: 4)
                    .padding(.trailing, compact ? 28 : 52)
            }
        }
        .accessibilityHidden(true)
    }
}

struct StatisticsLine: Identifiable {
    let id: String
    let name: String
    let subtitle: String
    let place: Int?
    let league: String?
    let lead: String
    let values: [String]
    let record: RankedStatisticsRecord
    let period: RankedStatisticsCareer.Period?
}

struct StatisticsPodium: View {
    let lines: [StatisticsLine]
    let measure: String
    let compact: Bool
    let select: (StatisticsLine) -> Void

    var body: some View {
        if !lines.isEmpty {
            HStack(spacing: compact ? 8 : 13) {
                ForEach(lines) { row in
                    if let place = row.place {
                        card(row, place: place)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Podium")
        }
    }

    private func card(_ row: StatisticsLine, place: Int) -> some View {
        let accent = StatisticsTheme.medal(place)
        return Button { select(row) } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 4) {
                    Image(systemName: place == 1 ? "trophy.fill" : "medal.fill")
                        .font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
                    Text("#\(place)").font(.system(size: 11, weight: .semibold, design: .monospaced))
                    Spacer(minLength: 2)
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(StatisticsTheme.muted)
                        .accessibilityHidden(true)
                }
                .foregroundStyle(accent)
                Text(row.name)
                    .font(BattleResources.display(compact ? 19 : 23))
                    .lineLimit(1)
                    .truncationMode(.tail)
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(row.lead).font(.system(size: compact ? 13 : 15, weight: .semibold, design: .monospaced))
                    Text(measure).font(.system(size: 10, weight: .medium)).foregroundStyle(StatisticsTheme.muted)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            }
            .padding(.horizontal, compact ? 11 : 15)
            .padding(.vertical, compact ? 9 : 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                LinearGradient(colors: [accent.opacity(place == 1 ? 0.17 : 0.08), StatisticsTheme.surface],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(accent.opacity(place == 1 ? 0.56 : 0.22)) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Rank \(place), \(row.name), \(row.lead) \(measure)")
        .accessibilityHint("Opens player statistics")
    }
}

struct StatisticsColumn {
    let title: String
    let width: CGFloat

    init(_ title: String, _ width: CGFloat) {
        self.title = title
        self.width = width
    }
}

struct StatisticsLeaderboard<Controls: View>: View {
    let title: String
    let columns: [StatisticsColumn]
    let lines: [StatisticsLine]
    @Binding var search: String
    let select: (StatisticsLine) -> Void
    @ViewBuilder let controls: () -> Controls

    var body: some View {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = query.isEmpty ? lines : lines.filter { $0.name.localizedStandardContains(query) }
        VStack(spacing: 0) {
            HStack(spacing: 9) {
                Text(title)
                    .font(BattleResources.display(22))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .accessibilityAddTraits(.isHeader)
                    .layoutPriority(1)
                Spacer(minLength: 3)
                controls()
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass").font(.system(size: 11)).accessibilityHidden(true)
                    TextField("Find a player", text: $search).textFieldStyle(.plain)
                        .foregroundStyle(StatisticsTheme.ink)
                        .font(.system(size: 12))
                    if !search.isEmpty {
                        Button { search = "" } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 11)) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear player search")
                    }
                }
                .padding(.horizontal, 8)
                .frame(width: 137, height: 26)
                .foregroundStyle(StatisticsTheme.muted)
                .statisticsPanel(radius: 6)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)

            if matches.isEmpty {
                Text(query.isEmpty ? "No standings yet" : "No matching players")
                    .font(.subheadline)
                    .foregroundStyle(StatisticsTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else {
                tableHeader
                LazyVStack(spacing: 0) {
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, row in
                        StatisticsPlayerRow(row: row, columns: columns, striped: index.isMultiple(of: 2)) { select(row) }
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .statisticsPanel()
    }

    private var tableHeader: some View {
        HStack(spacing: 6) {
            Text("Rank").frame(width: 33, alignment: .leading)
            Text("Player").frame(maxWidth: .infinity, alignment: .leading)
            ForEach(Array(columns.enumerated()), id: \.offset) { _, column in
                Text(column.title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: column.width, alignment: .trailing)
            }
            Color.clear.frame(width: 10, height: 1)
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(StatisticsTheme.muted)
        .padding(.horizontal, 13)
        .padding(.vertical, 8)
        .background(StatisticsTheme.background.opacity(0.62))
        .overlay(alignment: .top) {
            Rectangle().fill(StatisticsTheme.edge).frame(height: 1)
        }
        .accessibilityHidden(true)
    }
}

private struct StatisticsPlayerRow: View {
    let row: StatisticsLine
    let columns: [StatisticsColumn]
    let striped: Bool
    let select: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: select) {
            HStack(spacing: 6) {
                Text(row.place?.formatted() ?? "—")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(rankColor)
                    .frame(width: 33, alignment: .leading)
                HStack(spacing: 6) {
                    StatisticsCrest(league: row.league, name: row.name, size: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        Text(row.subtitle)
                            .font(.system(size: 10))
                            .foregroundStyle(StatisticsTheme.muted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(zip(columns, row.values).enumerated()), id: \.offset) { index, cell in
                    Text(cell.1)
                        .font(.system(size: 12, weight: index == 0 ? .semibold : .regular, design: .monospaced))
                        .foregroundStyle(index == 0 ? StatisticsTheme.ink : StatisticsTheme.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.67)
                        .frame(width: cell.0.width, alignment: .trailing)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(hovering ? StatisticsTheme.gold : StatisticsTheme.muted)
                    .frame(width: 10)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .frame(minHeight: 42)
            .background(hovering ? StatisticsTheme.gold.opacity(0.10) : striped ? StatisticsTheme.stripe : StatisticsTheme.surface)
            .overlay(alignment: .bottom) { Rectangle().fill(StatisticsTheme.edge.opacity(0.55)).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityLabel(accessibilityDescription)
        .accessibilityHint("Opens player statistics")
    }

    private var rankColor: Color {
        if let place = row.place, place <= 3 { StatisticsTheme.medal(place) }
        else { StatisticsTheme.muted }
    }

    private var accessibilityDescription: String {
        let metrics = zip(columns, row.values).map { "\($0.title) \($1)" }
        let rank = row.place.map { "Rank \($0)" } ?? "Unranked"
        return ([rank, row.name, row.subtitle] + metrics).joined(separator: ", ")
    }
}

private struct StatisticsCrest: View {
    let league: String?
    let name: String
    let size: CGFloat
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let nameKey = league?.lowercased() ?? ""
        let pixelSide = Int((size * displayScale).rounded())
        Group {
            if ["aspirant", "vanguard", "marshal", "overlord", "demigod"].contains(nameKey),
               let art = BattleResources.scaledIcon("league_\(nameKey)_512", pixelSide: pixelSide) {
                Image(decorative: art, scale: displayScale)
                    .interpolation(.high)
            } else {
                Text(name.prefix(1).uppercased())
                    .font(BattleResources.display(size * 0.54))
                    .foregroundStyle(StatisticsTheme.gold)
                    .frame(width: size * 0.88, height: size * 0.88)
                    .background(StatisticsTheme.gold.opacity(0.12), in: Circle())
                    .overlay { Circle().strokeBorder(StatisticsTheme.gold.opacity(0.26)) }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct StatisticsPlayerDetail: View {
    let row: StatisticsLine
    let career: RankedStatisticsCareer?
    @Environment(\.dismiss) private var dismiss

    private var periods: [RankedStatisticsCareer.Period] {
        let recorded = career?.periods ?? []
        guard let selected = row.period, !recorded.contains(where: { $0.sequence == selected.sequence }) else { return recorded }
        return [selected] + recorded
    }

    var body: some View {
        let record = career?.record ?? row.record
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                StatisticsCrest(league: row.league, name: row.name, size: 43)
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.name).font(BattleResources.display(29)).accessibilityAddTraits(.isHeader)
                    Text(career == nil ? (row.period?.title ?? row.subtitle) : "Overall ranked record")
                        .font(.subheadline).foregroundStyle(StatisticsTheme.muted)
                }
                Spacer()
                Button("Done") { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding(17)
            .background(StatisticsTheme.chrome)

            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    StatisticsMetrics(items: [.init("Matches", record.games.formatted()),
                                              .init("Win rate", StatisticsTheme.percent(record)),
                                              .init("Peak MMR", (career?.peak ?? row.period?.player.publicPeak)?.formatted() ?? "—")],
                                      compact: true)
                    recordBar(record)
                    if !periods.isEmpty {
                        Text("Ranked history").font(BattleResources.display(21)).accessibilityAddTraits(.isHeader)
                        ForEach(periods) { period in periodCard(period) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(width: 490, height: 420)
        .background(StatisticsTheme.background)
        .foregroundStyle(StatisticsTheme.ink)
    }

    private func recordBar(_ record: RankedStatisticsRecord) -> some View {
        let outcomes = [("Wins", record.wins, StatisticsTheme.wins), ("Losses", record.losses, StatisticsTheme.losses),
                        ("Draws", record.draws, StatisticsTheme.silver)]
        let total = outcomes.reduce(0) { $0 + $1.1 }
        return VStack(alignment: .leading, spacing: 8) {
            if total > 0 {
                GeometryReader { geometry in
                    HStack(spacing: 0) {
                        ForEach(outcomes, id: \.0) { _, count, color in
                            color.frame(width: geometry.size.width * CGFloat(count) / CGFloat(total))
                        }
                    }
                }
                .frame(height: 5)
                .clipShape(Capsule())
                .accessibilityHidden(true)
            }
            HStack(spacing: 17) {
                ForEach(outcomes, id: \.0) { label, count, color in
                    HStack(spacing: 5) {
                        Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
                        Text("\(count.formatted()) \(label)").foregroundStyle(StatisticsTheme.muted).font(.caption)
                    }
                }
            }
            .accessibilityElement(children: .combine)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .statisticsPanel(radius: 8)
    }

    private func periodCard(_ period: RankedStatisticsCareer.Period) -> some View {
        let player = period.player
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(period.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text(period.isCurrent ? "Live" : "Final")
                    .font(.caption).foregroundStyle(StatisticsTheme.muted)
            }
            Spacer(minLength: 6)
            historyValue("MMR", player.rating?.formatted() ?? "—")
            historyValue(period.currencyName, player.balance.formatted())
            historyValue("W–L–D", StatisticsTheme.record(player.record))
            historyValue("Win rate", StatisticsTheme.percent(player.record))
        }
        .padding(11)
        .statisticsPanel(radius: 8)
        .accessibilityElement(children: .combine)
    }

    private func historyValue(_ name: String, _ value: String) -> some View {
        VStack(alignment: .trailing, spacing: 4) {
            Text(value).font(.system(size: 12, weight: .semibold, design: .monospaced))
            Text(name).font(.caption).foregroundStyle(StatisticsTheme.muted)
        }
        .frame(minWidth: 60, alignment: .trailing)
    }
}
