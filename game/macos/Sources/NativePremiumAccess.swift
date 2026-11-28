import Foundation

struct NativePremiumAccess: Sendable {
    private let endpoint: URL
    private let network: URLSession

    init(endpoint: URL = URL(string: "https://game.heroesofcrypto.io/v1/premium/account")!, network: URLSession? = nil) {
        self.endpoint = endpoint
        self.network = network ?? URLSession(configuration: .ephemeral, delegate: RefuseServiceRedirects(), delegateQueue: nil)
    }

    func canSuggest(for session: NativeAccountSession, deviceID: String) async -> Bool {
        struct Account: Decodable {
            struct Entitlement: Decodable { let active: Bool }
            let entitlement: Entitlement
        }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.setValue(session.token, forHTTPHeaderField: "Authorization")
        request.setValue(deviceID, forHTTPHeaderField: "X-HoC-Device")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "x-request-id")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await network.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200,
              let result = try? JSONDecoder().decode(Account.self, from: data) else { return false }
        return result.entitlement.active
    }
}
