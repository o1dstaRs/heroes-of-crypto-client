import Foundation

struct RankedStatisticsSeason: Decodable, Identifiable, Sendable {
    struct Currency: Decodable { let name: String }

    let sequence: Int
    let name: String
    let startsAt: Double
    let endsAt: Double
    let currency: Currency?

    var id: Int { sequence }
    var currencyName: String { currency?.name ?? "Gold" }
}

struct RankedStatisticsPlayer: Decodable, Sendable {
    let playerId: String
    let username: String
    let leagueName: String?
    let mmr: Int?
    let peakMmr: Int?
    let wins: Int
    let losses: Int
    let draws: Int
    let totalGames: Int?
    let gold: Int
    let totalGold: Int?
    let mmrPlace: Int?
    let goldPlace: Int?

    var balance: Int { totalGold ?? gold }
    var rating: Int? { mmrPlace == 0 ? nil : mmr }
    var publicPeak: Int? { rating.map { max($0, peakMmr ?? $0) } }
    var record: RankedStatisticsRecord {
        RankedStatisticsRecord(wins: wins, losses: losses, draws: draws, games: totalGames ?? wins + losses + draws)
    }
}

struct RankedStatisticsRecord: Sendable {
    var wins = 0
    var losses = 0
    var draws = 0
    var games = 0

    var winRate: Double { games > 0 ? Double(wins) / Double(games) : 0 }

    mutating func include(_ record: Self) {
        wins += record.wins
        losses += record.losses
        draws += record.draws
        games += record.games
    }
}

struct RankedStatisticsBoard: Sendable {
    enum Order: Hashable { case rating, currency }

    struct Row: Identifiable {
        let place: Int
        let player: RankedStatisticsPlayer
        var id: String { player.playerId }
    }

    struct SeasonTotals {
        let playerCount: Int
        let rankedCount: Int
        let totalGold: Int
    }

    let season: RankedStatisticsSeason?
    let players: [RankedStatisticsPlayer]
    let calibrating: [RankedStatisticsPlayer]
    let totals: SeasonTotals?

    var currencyName: String { season?.currencyName ?? "Gold" }
    var sequence: Int { season?.sequence ?? 0 }

    func rows(orderedBy order: Order) -> [Row] {
        if totals == nil {
            // The public ladder splits the full roster into leagues. Restore the ranking order
            // used by the server's top-N endpoint before assigning a position to each player.
            let ranked = players.sorted { left, right in
                if left.mmr != right.mmr { return (left.mmr ?? 0) > (right.mmr ?? 0) }
                if left.wins != right.wins { return left.wins > right.wins }
                return left.playerId < right.playerId
            }
            return ranked.enumerated().map { Row(place: $0.offset + 1, player: $0.element) }
        }

        func place(_ player: RankedStatisticsPlayer) -> Int {
            (order == .rating ? player.mmrPlace : player.goldPlace) ?? 0
        }

        // Preserve the recorded final places, with unplaced participants below them.
        return players.sorted { left, right in
            let leftPlace = place(left)
            let rightPlace = place(right)
            if leftPlace != rightPlace { return leftPlace > 0 && (rightPlace == 0 || leftPlace < rightPlace) }
            if order == .rating, left.balance != right.balance { return left.balance > right.balance }
            if order == .currency {
                let leftRatingPlace = left.mmrPlace ?? 0
                let rightRatingPlace = right.mmrPlace ?? 0
                if leftRatingPlace != rightRatingPlace {
                    return leftRatingPlace > 0 && (rightRatingPlace == 0 || leftRatingPlace < rightRatingPlace)
                }
            }
            return left.playerId < right.playerId
        }.map { Row(place: place($0), player: $0) }
    }
}

struct RankedStatisticsCareer: Identifiable, Sendable {
    struct Period: Identifiable, Sendable {
        let sequence: Int
        let title: String
        let isCurrent: Bool
        let currencyName: String
        let player: RankedStatisticsPlayer

        var id: Int { sequence }
    }

    let id: String
    let username: String
    let periods: [Period]
    let record: RankedStatisticsRecord
    let peak: Int?

    static func players(current: RankedStatisticsBoard, archive: [RankedStatisticsBoard]) -> [Self] {
        var histories: [String: [Period]] = [:]
        // The closed table wins if the live feed still reports that season during rollover.
        let liveBoards = archive.contains { $0.sequence == current.sequence } ? [] : [current]
        let boards = liveBoards + archive.sorted { $0.sequence > $1.sequence }
        for board in boards {
            let placed = Set(board.players.map(\.playerId))
            for player in board.players + board.calibrating.filter({ !placed.contains($0.playerId) }) {
                guard player.record.games > 0 else { continue }
                let period = Period(sequence: board.sequence, title: board.season?.name ?? "Current ladder",
                                    isCurrent: board.totals == nil, currencyName: board.currencyName, player: player)
                histories[player.playerId, default: []].append(period)
            }
        }
        return histories.compactMap { id, periods in
            guard let latest = periods.first else { return nil }
            let record = periods.reduce(into: RankedStatisticsRecord()) { $0.include($1.player.record) }
            return Self(id: id, username: latest.player.username, periods: periods, record: record,
                        peak: periods.compactMap(\.player.publicPeak).max())
        }
    }
}

struct RankedStatisticsAPI: Sendable {
    private struct Standings: Decodable {
        struct League: Decodable { let players: [RankedStatisticsPlayer] }
        let season: RankedStatisticsSeason?
        let leagues: [League]
        let calibrating: [RankedStatisticsPlayer]?
    }

    private struct Archive: Decodable {
        struct Entry: Decodable { let season: RankedStatisticsSeason }
        let seasons: [Entry]
    }

    private struct SeasonResults: Decodable {
        let season: RankedStatisticsSeason
        let playerCount: Int
        let rankedCount: Int
        let totalGold: Int
        let players: [RankedStatisticsPlayer]
    }

    private let baseURL: URL
    private let network: URLSession

    init(baseURL: URL = URL(string: "https://mm.heroesofcrypto.io/v1")!, network: URLSession? = nil) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForResource = 20
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        self.network = network ?? URLSession(configuration: config)
    }

    func currentStandings() async throws -> RankedStatisticsBoard {
        let standings: Standings = try await fetch("ranked-standings")
        return RankedStatisticsBoard(season: standings.season, players: standings.leagues.flatMap(\.players),
                                     calibrating: standings.calibrating ?? [], totals: nil)
    }

    func finishedSeasons() async throws -> [RankedStatisticsSeason] {
        let archive: Archive = try await fetch("season-results")
        return archive.seasons.map(\.season).sorted { $0.sequence > $1.sequence }
    }

    func results(for sequence: Int) async throws -> RankedStatisticsBoard {
        let result: SeasonResults = try await fetch("season-results/\(sequence)")
        guard result.season.sequence == sequence else { throw URLError(.cannotParseResponse) }
        let totals = RankedStatisticsBoard.SeasonTotals(playerCount: result.playerCount, rankedCount: result.rankedCount,
                                                        totalGold: result.totalGold)
        return RankedStatisticsBoard(season: result.season, players: result.players, calibrating: [], totals: totals)
    }

    private func fetch<Value: Decodable>(_ path: String) async throws -> Value {
        var request = URLRequest(url: baseURL.appending(path: path), cachePolicy: .reloadIgnoringLocalCacheData,
                                 timeoutInterval: 12)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await network.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(Value.self, from: data)
    }
}
