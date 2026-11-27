import Foundation

@main
enum StatisticsSmoke {
    static func main() throws {
        let live = board(nil, players: [
            player("active", "Current name", rating: 1020, peak: 1200, wins: 6, losses: 2),
            player("same-name", "Current name", rating: 1020, wins: 5, losses: 5),
        ], calibrating: [
            try JSONDecoder().decode(RankedStatisticsPlayer.self, from: Data("""
                {"playerId":"placing","username":"Placing","wins":1,"losses":1,"draws":1,"totalGames":3,"gold":0}
                """.utf8))
        ])
        let final = board(1, players: [
            player("active", "Old name", rating: 1150, peak: 1240, wins: 2, losses: 8, gold: 50, mmrPlace: 1, goldPlace: 2),
            player("retired", "Former player", rating: 1050, wins: 1, losses: 1, gold: 110, mmrPlace: 2, goldPlace: 1),
            player("no-games", "No games", wins: 0, losses: 0, mmrPlace: 0, goldPlace: 0),
        ])

        let players = RankedStatisticsCareer.players(current: live, archive: [final])
        try require(players.count == 4, "Only players with results should appear and matching names must stay distinct.")
        guard let active = players.first(where: { $0.id == "active" }),
              let placing = players.first(where: { $0.id == "placing" }) else {
            throw Failure(message: "The current and historical player records should be available.")
        }
        try require(active.username == "Current name" && active.periods.map(\.sequence) == [0, 1],
                    "Player IDs should connect periods and retain the current public name.")
        try require(active.record.games == 18 && active.record.wins == 8 && active.record.losses == 10 &&
                    abs(active.record.winRate - 8.0 / 18.0) < 0.0001 && active.peak == 1240,
                    "Overall statistics must use the combined outcome counts and the highest published MMR.")
        try require(placing.record.games == 3 && placing.record.draws == 1 && placing.peak == nil,
                    "Placement records are public and have no published rating.")
        try require(live.rows(orderedBy: .rating).map(\.id) == ["active", "same-name"],
                    "The live ladder's MMR and wins order must be preserved.")
        try require(final.rows(orderedBy: .currency).map(\.id) == ["retired", "active", "no-games"] &&
                    final.rows(orderedBy: .rating).map(\.id) == ["active", "retired", "no-games"],
                    "A finished season must use its official place for the selected ranking.")

        let stale = board(1, players: live.players, calibrating: live.calibrating, archived: false)
        let atClose = RankedStatisticsCareer.players(current: stale, archive: [final])
        try require(atClose.count == 2 && atClose.first(where: { $0.id == "active" })?.record.games == 10,
                    "The closed table must replace a cached live copy of the same season.")
        print("Statistics passed record aggregation, placement visibility, official standings, and season rollover.")
    }

    static func board(_ sequence: Int?, players: [RankedStatisticsPlayer], calibrating: [RankedStatisticsPlayer] = [],
                      archived: Bool = true) -> RankedStatisticsBoard {
        let season = sequence.map {
            RankedStatisticsSeason(sequence: $0, name: "Season \($0)", startsAt: 0, endsAt: 1, currency: nil)
        }
        let totals = season != nil && archived
            ? RankedStatisticsBoard.SeasonTotals(playerCount: players.count, rankedCount: 2, totalGold: 160)
            : nil
        return RankedStatisticsBoard(season: season, players: players, calibrating: calibrating, totals: totals)
    }

    static func player(_ id: String, _ name: String, rating: Int? = nil, peak: Int? = nil, wins: Int, losses: Int,
                       gold: Int = 0, mmrPlace: Int? = nil, goldPlace: Int? = nil) -> RankedStatisticsPlayer {
        RankedStatisticsPlayer(playerId: id, username: name, leagueName: rating == nil ? nil : "Aspirant",
                               mmr: rating, peakMmr: peak, wins: wins, losses: losses, draws: 0, totalGames: wins + losses,
                               gold: gold, totalGold: nil, mmrPlace: mmrPlace, goldPlace: goldPlace)
    }

    struct Failure: Error {
        let message: String
    }

    static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw Failure(message: message) }
    }
}
