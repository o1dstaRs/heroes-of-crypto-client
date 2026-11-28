import Foundation

struct NativeCoopAPI: Sendable {
    static let armyTakenMessage = "hocMacCoopArmyTaken"

    struct Friend: Decodable, Identifiable, Sendable {
        let playerId: String
        let username: String
        let online: Bool
        let inGameId: String?

        var id: String { playerId }
    }

    private struct Friends: Decodable {
        let friends: [Friend]
    }

    private struct Invitation: Encodable {
        let toPlayerId: String
        let gridType: Int
    }

    private struct OpenedSandbox: Decodable {
        let gameId: String
    }

    private struct Failure: LocalizedError {
        var errorDescription: String?
    }

    private let matchmaking: URL
    private let games: URL
    private let network: URLSession

    init(matchmaking: URL = URL(string: "https://mm.heroesofcrypto.io/v1")!,
         games: URL = URL(string: "https://game.heroesofcrypto.io/v1")!, network: URLSession? = nil) {
        self.matchmaking = matchmaking
        self.games = games
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 25
        self.network = network ?? URLSession(configuration: configuration, delegate: RefuseServiceRedirects(), delegateQueue: nil)
    }

    func friends(account: NativeAccountSession, deviceID: String) async throws -> [Friend] {
        let overview: Friends = try await request(matchmaking.appending(path: "friends"), account: account, deviceID: deviceID,
                                                  fallback: "Couldn’t load your friends.")
        return overview.friends.sorted {
            $0.online != $1.online ? $0.online : $0.username.localizedStandardCompare($1.username) == .orderedAscending
        }
    }

    func invite(_ friend: Friend, gridType: Int, account: NativeAccountSession, deviceID: String) async throws -> String {
        let body = try JSONEncoder().encode(Invitation(toPlayerId: friend.playerId, gridType: gridType))
        let response: OpenedSandbox = try await request(games.appending(path: "sandbox-create"), body: body,
                                                        account: account, deviceID: deviceID,
                                                        fallback: "Couldn’t open Co-op Sandbox.")
        guard UUID(uuidString: response.gameId) != nil else { throw Failure(errorDescription: "The sandbox link was incomplete.") }
        return response.gameId
    }

    static func carryArmyScript(gameID: String, army: Data) -> String {
        let encoder = JSONEncoder()
        guard let game = try? encoder.encode(gameID),
              let payload = try? encoder.encode(String(decoding: army, as: UTF8.self)) else { return "" }
        return """
            try {
                const game = \(String(decoding: game, as: UTF8.self));
                if (location.pathname === "/sandbox/" + game) {
                    const key = "hoc:coop-carry:" + game;
                    const marker = "hoc:native-coop:" + game;
                    if (!sessionStorage.getItem(marker)) {
                        sessionStorage.setItem(key, \(String(decoding: payload, as: UTF8.self)));
                        sessionStorage.setItem(marker, "1");
                    }
                    const removeArmy = Storage.prototype.removeItem;
                    Storage.prototype.removeItem = function (removed) {
                        const taking = this === sessionStorage && removed === key && this.getItem(key) !== null;
                        const result = removeArmy.call(this, removed);
                        if (taking) {
                            try { window.webkit.messageHandlers.\(armyTakenMessage).postMessage(game); } catch {}
                        }
                        return result;
                    };
                }
            } catch {}
            """
    }

    private func request<Value: Decodable>(_ url: URL, body: Data? = nil, account: NativeAccountSession,
                                            deviceID: String, fallback: String) async throws -> Value {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.setValue(account.token, forHTTPHeaderField: "Authorization")
        request.setValue(deviceID, forHTTPHeaderField: "X-HoC-Device")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "x-request-id")
        let (data, response) = try await network.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw Failure(errorDescription: fallback) }
        switch http.statusCode {
        case 200..<300: return try JSONDecoder().decode(Value.self, from: data)
        case 401, 440: throw Failure(errorDescription: "Your session has expired. Sign in again.")
        case 403: throw Failure(errorDescription: "You can only invite friends into your sandbox.")
        case 409: throw Failure(errorDescription: "One of you is already in a game.")
        default: throw Failure(errorDescription: fallback)
        }
    }
}
