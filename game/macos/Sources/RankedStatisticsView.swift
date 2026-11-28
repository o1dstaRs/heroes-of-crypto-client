import SwiftUI

struct RankedStatisticsView: View {
    let api: RankedStatisticsAPI
    let openMatchHistory: () -> Void

    private enum Page: String, CaseIterable, Identifiable {
        case players = "Players"
        case seasons = "Seasons"

        var id: Self { self }
        var icon: String { self == .players ? "person.2.fill" : "trophy.fill" }
    }

    private enum PlayerScope: String, CaseIterable, Identifiable {
        case overall = "Overall"
        case current = "Current ladder"

        var id: Self { self }
    }

    private enum OverallOrder: String, CaseIterable, Identifiable {
        case peak = "Peak MMR"
        case wins = "Wins"
        case games = "Matches"
        case winRate = "Win rate"

        var id: Self { self }

        func score(_ player: RankedStatisticsCareer) -> Double? {
            switch self {
            case .peak: player.peak.map(Double.init)
            case .wins: Double(player.record.wins)
            case .games: Double(player.record.games)
            case .winRate: player.record.winRate
            }
        }

        func display(_ player: RankedStatisticsCareer) -> String {
            switch self {
            case .peak: player.peak?.formatted() ?? "—"
            case .wins: player.record.wins.formatted()
            case .games: player.record.games.formatted()
            case .winRate: StatisticsTheme.percent(player.record)
            }
        }
    }

    private enum Load<Value> {
        case loading
        case ready(Value)
        case unavailable

        var value: Value? {
            if case let .ready(value) = self { value } else { nil }
        }
    }

    @State private var page = Page.players
    @State private var scope = PlayerScope.overall
    @State private var overallOrder = OverallOrder.peak
    @State private var seasonOrder = RankedStatisticsBoard.Order.currency
    @State private var current: Load<RankedStatisticsBoard> = .loading
    @State private var archive: Load<[RankedStatisticsSeason]> = .loading
    @State private var overall: Load<[RankedStatisticsCareer]> = .loading
    @State private var boards: [Int: Load<RankedStatisticsBoard>] = [:]
    @State private var selection = 0
    @State private var revision = 0
    @State private var playerSearch = ""
    @State private var seasonSearch = ""
    @State private var profile: StatisticsLine?

    var body: some View {
        GeometryReader { geometry in
            let compact = geometry.size.width < 760
            let inset: CGFloat = compact ? 22 : 34
            VStack(spacing: 0) {
                header(compact: compact)
                    .padding(.horizontal, inset)
                    .frame(maxWidth: 1190)
                    .frame(maxWidth: .infinity)
                    .background(StatisticsTheme.chrome)
                Rectangle().fill(StatisticsTheme.edge).frame(height: 1)
                ScrollView {
                    VStack(alignment: .leading, spacing: compact ? 13 : 17) {
                        if page == .players { players(compact: compact) }
                        else { seasons(compact: compact) }
                    }
                    .padding(.horizontal, inset)
                    .padding(.top, compact ? 14 : 20)
                    .padding(.bottom, 26)
                    .frame(maxWidth: 1190)
                    .frame(maxWidth: .infinity)
                }
                .id(page)
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .background {
            LinearGradient(colors: [StatisticsTheme.glow, StatisticsTheme.background],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        .foregroundStyle(StatisticsTheme.ink)
        .task(id: revision) { await load() }
        .sheet(item: $profile) { row in
            StatisticsPlayerDetail(row: row, career: overall.value?.first { $0.id == row.id })
        }
    }

    private func header(compact: Bool) -> some View {
        HStack(spacing: compact ? 15 : 25) {
            Text("Statistics")
                .font(BattleResources.display(compact ? 31 : 37))
                .accessibilityAddTraits(.isHeader)
                .layoutPriority(1)
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                ForEach(Page.allCases) { item in
                    Button {
                        page = item
                    } label: {
                        Label(item.rawValue, systemImage: item.icon)
                            .font(.system(size: 13, weight: .semibold))
                            .padding(.horizontal, compact ? 12 : 17)
                            .frame(height: 34)
                            .foregroundStyle(page == item ? StatisticsTheme.gold : StatisticsTheme.muted)
                            .background(page == item ? StatisticsTheme.gold.opacity(0.13) : .clear,
                                        in: RoundedRectangle(cornerRadius: 7))
                            .overlay {
                                if page == item {
                                    RoundedRectangle(cornerRadius: 7).strokeBorder(StatisticsTheme.gold.opacity(0.4))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(page == item ? .isSelected : [])
                }
            }
            Button(action: openMatchHistory) {
                Group {
                    if compact { Image(systemName: "clock.arrow.circlepath") }
                    else { Label("My Match History", systemImage: "clock.arrow.circlepath") }
                }
                .font(.system(size: 13, weight: .medium))
                .frame(minWidth: 34, minHeight: 34)
                .padding(.horizontal, compact ? 0 : 11)
                .background(StatisticsTheme.surface, in: RoundedRectangle(cornerRadius: 7))
                .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(StatisticsTheme.edge) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("My Match History")
            .help("Search your matches and open ranked replays")
            Button(action: refresh) {
                Group {
                    if compact { Image(systemName: "arrow.clockwise") }
                    else { Label("Refresh", systemImage: "arrow.clockwise") }
                }
                    .font(.system(size: 13, weight: .medium))
                    .frame(minWidth: 34, minHeight: 34)
                    .padding(.horizontal, compact ? 0 : 11)
                    .background(StatisticsTheme.surface, in: RoundedRectangle(cornerRadius: 7))
                    .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(StatisticsTheme.edge) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Refresh statistics")
            .help("Refresh statistics")
        }
        .padding(.vertical, compact ? 13 : 16)
    }

    @ViewBuilder private func players(compact: Bool) -> some View {
        Picker("Players leaderboard", selection: $scope) {
            ForEach(PlayerScope.allCases) { Text(LocalizedStringKey($0.rawValue)).tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(width: 230, alignment: .leading)

        switch scope {
        case .overall:
            switch overall {
            case let .ready(entries):
                overallBoard(entries, compact: compact)
            case .loading:
                message("Loading overall standings…", loading: true)
            case .unavailable:
                message("Overall standings unavailable", detail: "Refresh to load the ladder and season records.", retry: true)
            }
        case .current:
            switch current {
            case let .ready(board):
                periodBoard(board, archived: false, compact: compact, search: $playerSearch)
            case .loading:
                message("Loading current ladder…", loading: true)
            case .unavailable:
                message("Current ladder unavailable", retry: true)
            }
        }
    }

    @ViewBuilder private func seasons(compact: Bool) -> some View {
        switch archive {
        case .loading:
            message("Loading the season archive…", loading: true)
        case .unavailable:
            message("Season archive unavailable", retry: true)
        case let .ready(seasons) where seasons.isEmpty:
            message("No finished seasons yet", detail: "Final results appear here when a season closes.")
        case let .ready(seasons):
            HStack(spacing: 13) {
                Picker("Finished season", selection: $selection) {
                    ForEach(seasons) { Text($0.name).tag($0.sequence) }
                }
                .labelsHidden()
                .frame(width: 174)
                Spacer(minLength: 0)
                if let season = seasons.first(where: { $0.sequence == selection }) {
                    Picker("Rank final standings by", selection: $seasonOrder) {
                        Text(season.currencyName).tag(RankedStatisticsBoard.Order.currency)
                        Text("MMR").tag(RankedStatisticsBoard.Order.rating)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(minWidth: 135, idealWidth: 170, maxWidth: 220)
                }
            }

            switch boards[selection] ?? .loading {
            case let .ready(board):
                periodBoard(board, archived: true, compact: compact, search: $seasonSearch)
            case .loading:
                message("Loading final standings…", loading: true)
            case .unavailable:
                message("Season results unavailable", retry: true)
            }
        }
    }

    private func overallBoard(_ entries: [RankedStatisticsCareer], compact: Bool) -> some View {
        let sorted = entries.sorted { left, right in
            let leftScore = overallOrder.score(left) ?? -.infinity
            let rightScore = overallOrder.score(right) ?? -.infinity
            if leftScore != rightScore { return leftScore > rightScore }
            if left.record.games != right.record.games { return left.record.games > right.record.games }
            return left.id < right.id
        }
        let lines = sorted.enumerated().map { index, entry in
            let record = entry.record
            let count = entry.periods.count
            return StatisticsLine(id: entry.id, name: entry.username, subtitle: "\(count) \(count == 1 ? "ranked period" : "ranked periods")",
                                  place: overallOrder.score(entry) == nil ? nil : index + 1,
                                  league: entry.periods.first?.player.leagueName, lead: overallOrder.display(entry),
                                  values: [entry.peak?.formatted() ?? "—", record.games.formatted(),
                                           compact ? record.wins.formatted() : StatisticsTheme.record(record),
                                           StatisticsTheme.percent(record)], record: record, period: nil)
        }
        let labels = [
            StatisticsColumn("Peak MMR", compact ? 65 : 86),
            StatisticsColumn("Matches", compact ? 63 : 78),
            StatisticsColumn(compact ? "Wins" : "W–L–D", compact ? 47 : 105),
            StatisticsColumn("Win rate", compact ? 62 : 80),
        ]
        return Group {
            StatisticsHero(title: "Overall players", subtitle: "Public ladder and finished-season records",
                           metrics: [.init("Players", entries.count.formatted()),
                                     .init("Finished seasons", (archive.value?.count ?? 0).formatted()),
                                     .init("Peak MMR", entries.compactMap(\.peak).max()?.formatted() ?? "—")],
                           compact: compact, trophy: false)
            StatisticsPodium(lines: leaders(lines), measure: overallOrder.rawValue, compact: compact, select: select)
            StatisticsLeaderboard(title: "Player leaderboard", columns: labels, lines: lines, search: $playerSearch, select: select) {
                Picker("Rank by", selection: $overallOrder) {
                    ForEach(OverallOrder.allCases) { Text(LocalizedStringKey($0.rawValue)).tag($0) }
                }
                .labelsHidden()
                .frame(width: compact ? 100 : 117)
            }
        }
    }

    private func periodBoard(_ board: RankedStatisticsBoard, archived: Bool, compact: Bool, search: Binding<String>) -> some View {
        let order = archived ? seasonOrder : .rating
        let balanceFirst = order == .currency
        let rows = board.rows(orderedBy: order)
        let title = board.season?.name ?? "Current ladder"
        let lines = rows.map { row in
            let entry = row.player
            let record = entry.record
            let rating = entry.rating?.formatted() ?? "—"
            let balance = entry.balance.formatted()
            let period = RankedStatisticsCareer.Period(sequence: board.sequence, title: title, isCurrent: !archived,
                                                       currencyName: board.currencyName, player: entry)
            return StatisticsLine(id: row.id, name: entry.username, subtitle: entry.leagueName ?? "Unranked",
                                  place: row.place > 0 ? row.place : nil, league: entry.leagueName,
                                  lead: balanceFirst ? balance : rating,
                                  values: [balanceFirst ? balance : rating, balanceFirst ? rating : balance,
                                           StatisticsTheme.record(record), StatisticsTheme.percent(record)],
                                  record: record, period: period)
        }
        let labels = [
            StatisticsColumn(balanceFirst ? board.currencyName : "MMR", compact ? 66 : 91),
            StatisticsColumn(balanceFirst ? "MMR" : board.currencyName, compact ? 66 : 91),
            StatisticsColumn("W–L–D", compact ? 67 : 96),
            StatisticsColumn("Win rate", compact ? 62 : 80),
        ]
        let subtitle = if let season = board.season { seasonDates(season) }
                       else { "Live ranked standings" }
        let metrics = if let totals = board.totals {
            [StatisticsMetric("Participants", totals.playerCount.formatted()),
             StatisticsMetric("Placed", totals.rankedCount.formatted()),
             StatisticsMetric("Final \(board.currencyName)", totals.totalGold.formatted())]
        } else {
            [StatisticsMetric("Ranked players", rows.count.formatted()),
             StatisticsMetric("In placement", board.calibrating.count.formatted()),
             StatisticsMetric("Top MMR", rows.first?.player.rating?.formatted() ?? "—")]
        }
        return Group {
            StatisticsHero(title: title, subtitle: subtitle, metrics: metrics, compact: compact, trophy: archived)
            StatisticsPodium(lines: leaders(lines), measure: balanceFirst ? board.currencyName : "MMR", compact: compact, select: select)
            StatisticsLeaderboard(title: archived ? "Final standings" : "Live ladder", columns: labels, lines: lines,
                                  search: search, select: select) { EmptyView() }
        }
    }

    private func leaders(_ lines: [StatisticsLine]) -> [StatisticsLine] {
        Array(lines.prefix(3).filter { $0.place != nil })
    }

    private func select(_ row: StatisticsLine) {
        profile = row
    }

    private func message(_ title: String, detail: String? = nil, loading: Bool = false, retry: Bool = false) -> some View {
        VStack(spacing: 11) {
            if loading { ProgressView().controlSize(.small).accessibilityHidden(true) }
            else { Image(systemName: retry ? "exclamationmark.circle" : "trophy").font(.system(size: 23)).foregroundStyle(StatisticsTheme.gold) }
            Text(LocalizedStringKey(title)).font(BattleResources.display(24))
            if let detail { Text(LocalizedStringKey(detail)).foregroundStyle(StatisticsTheme.muted).font(.subheadline) }
            if retry { Button("Try Again", action: refresh) }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 260)
        .statisticsPanel()
    }

    private func seasonDates(_ season: RankedStatisticsSeason) -> String {
        let start = Date(timeIntervalSince1970: season.startsAt / 1000).formatted(date: .abbreviated, time: .omitted)
        let end = Date(timeIntervalSince1970: season.endsAt / 1000).formatted(date: .abbreviated, time: .omitted)
        return "\(start) – \(end)"
    }

    private func refresh() { revision += 1 }

    private func load() async {
        current = .loading
        overall = .loading
        archive = .loading
        boards = [:]
        async let live: Void = loadCurrent()
        async let history: Void = loadArchive()
        _ = await (live, history)
        guard !Task.isCancelled else { return }
        guard let current = current.value, let archive = archive.value else {
            overall = .unavailable
            return
        }
        let finished = archive.compactMap { boards[$0.sequence]?.value }
        overall = finished.count == archive.count
            ? .ready(RankedStatisticsCareer.players(current: current, archive: finished))
            : .unavailable
    }

    private func loadCurrent() async {
        let snapshot = try? await api.currentStandings()
        guard !Task.isCancelled else { return }
        current = snapshot.map { .ready($0) } ?? .unavailable
    }

    private func loadArchive() async {
        let api = api
        let result = try? await api.finishedSeasons()
        guard !Task.isCancelled else { return }
        guard let result else {
            archive = .unavailable
            return
        }
        if !result.contains(where: { $0.sequence == selection }) { selection = result.first?.sequence ?? 0 }
        archive = .ready(result)

        // Only a few detail requests at once, even for a long-running archive.
        let prioritized = result.sorted { ($0.sequence == selection ? 1 : 0, $0.sequence) >
                                            ($1.sequence == selection ? 1 : 0, $1.sequence) }
        await withTaskGroup(of: (Int, RankedStatisticsBoard?).self) { group in
            var pending = prioritized.makeIterator()
            func requestNext() {
                guard let season = pending.next() else { return }
                group.addTask {
                    (season.sequence, try? await api.results(for: season.sequence))
                }
            }
            for _ in 0..<3 { requestNext() }
            while let (sequence, snapshot) = await group.next() {
                guard !Task.isCancelled else { return }
                boards[sequence] = snapshot.map { .ready($0) } ?? .unavailable
                requestNext()
            }
        }
    }
}
