import CryptoKit
import Foundation
import JavaScriptCore

@main
@MainActor
enum AuthSmoke {
    static func main() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AccountFixture.self]
        let api = NativeAuthAPI(baseURL: URL(string: "https://account.example.test/v1/")!,
                                deviceID: "native-auth-test", network: URLSession(configuration: config))
        let store = MemorySessionStore()
        let controller = NativeAccountController(api: api, store: store)
        await controller.restore()
        precondition(!controller.checking && controller.account == nil)

        await controller.signIn(email: "player@example.test", password: "Fixture123!", username: "Player")
        precondition(controller.account?.verified == false && store.token == "Bearer test-session")
        await controller.resendCode()
        precondition(controller.notice != nil)
        await controller.verify(code: "ABC123")
        precondition(controller.account?.verified == true && store.token == "Bearer rotated-session")

        let restarted = NativeAccountController(api: api, store: store)
        await restarted.restore()
        precondition(restarted.account?.username == "Player")
        await restarted.signOut()
        precondition(restarted.account == nil && store.token == nil)
        await restarted.signIn(email: "player@example.test", password: "Fixture123!")
        precondition(restarted.account?.verified == true)

        let resetRequested = await controller.requestReset(email: "player@example.test")
        precondition(resetRequested)
        let token = String(repeating: "ff", count: 32)
        let link = "https://heroesofcrypto.io/reset-password?email=player%40example.test&token=\(token)"
        let reset = await controller.reset(link: link, password: "Changed123!")
        precondition(reset)
        precondition((try? PasswordResetLink(link.replacingOccurrences(of: "heroesofcrypto.io",
                                                                      with: "other.example"))) == nil)

        let attempt = try DesktopSignInAttempt()
        precondition(attempt.startURL.path == "/desktop-sign-in.html")
        try await api.checkDesktopSignIn(page: URL(string: "https://account.example.test/desktop-sign-in.html")!)
        do {
            try await api.checkDesktopSignIn(page: URL(string: "https://account.example.test/spa-fallback.html")!)
            preconditionFailure("The game fallback page passed the sign-in check")
        } catch NativeAuthFailure.desktopSignInUnavailable {}
        let fragment = URLComponents(url: attempt.startURL, resolvingAgainstBaseURL: false)?.fragment
        let fields = URLComponents(string: "https://example.test/?" + (fragment ?? ""))?.queryItems
        let state = fields?.first(where: { $0.name == "state" })?.value ?? ""
        let challenge = fields?.first(where: { $0.name == "challenge" })?.value
        let digest = SHA256.hash(data: Data(attempt.verifier.utf8))
        let proof = Data(digest).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        precondition(challenge == proof && !state.isEmpty && state != attempt.verifier)
        precondition(!attempt.startURL.absoluteString.contains(attempt.verifier))
        let code = String(repeating: "A", count: 43)
        let root = "\(DesktopSignInAttempt.scheme):/sign-in?code=\(code)&state="
        precondition((try? attempt.code(from: URL(string: root + state)!)) == code)
        precondition((try? attempt.code(from: URL(string: root + "different")!)) == nil)
        let google = try await api.authenticate(code: code, verifier: attempt.verifier)
        precondition(google.account.verified && google.account.email == "player@example.test")
        try store.save(AccountFixture.rankedToken)
        let ranked = NativeAccountController(api: api, store: store)
        await ranked.restore()
        await ranked.acceptSessionRefresh(AccountFixture.otherSessionToken)
        await ranked.acceptSessionRefresh(AccountFixture.invalidRefresh)
        precondition(store.token == AccountFixture.rankedToken)
        await ranked.acceptSessionRefresh(AccountFixture.rankedRefresh)
        precondition(ranked.verifiedSession?.token == AccountFixture.rankedRefresh)
        precondition(store.token == AccountFixture.rankedRefresh)
        await ranked.acceptSessionRefresh(AccountFixture.rankedToken)
        precondition(store.token == AccountFixture.rankedRefresh)
        let stillRanked = try await ranked.revalidateSession()
        precondition(stillRanked?.token == AccountFixture.rankedRefresh)
        guard let session = ranked.verifiedSession else { preconditionFailure("Missing account for Premium") }
        checkPremium(session)
        print("Native account flows, desktop proof, Ranked refresh, and Premium website handoff passed.")
    }

    private static func checkPremium(_ session: NativeAccountSession) {
        precondition(PremiumSite.route(PremiumSite.entry, opensWindow: false, userLink: false) == .website)
        let login = URL(string: "https://heroesofcrypto.io/ru/auth/login")!
        precondition(PremiumSite.route(login, opensWindow: false, userLink: true) == .signIn)
        let link = URL(string: "https://example.test/help?accessToken=fixture&page=1#authorization=fixture")!
        let publicLink = URL(string: "https://example.test/help?page=1")!
        precondition(PremiumSite.route(link, opensWindow: true, userLink: true) == .external(publicLink))
        precondition(PremiumSite.route(link, opensWindow: true, userLink: false) == .blocked)
        let draft = #"{"version":1,"ids":[1,5,9]}"#
        precondition(PremiumSite.validatedCrew(draft) == draft && PremiumSite.validatedCrew("{}") == nil)

        func javascript(origin: String, session: NativeAccountSession?) -> JSContext {
            let context = JSContext()!
            context.evaluateScript("""
                class Storage {
                    getItem(key) { return this[key] ?? null; }
                    setItem(key, value) { this[key] = value; }
                    removeItem(key) { delete this[key]; }
                }
                class URL {
                    constructor(href) {
                        const [, origin, pathname] = /^(https:\\/\\/[^/]+)([^?]*)/.exec(href);
                        Object.assign(this, { origin, pathname });
                    }
                }
                const localStorage = new Storage(), messages = [];
                const location = { origin: '\(origin)', pathname: '/premium/' };
                const document = { addEventListener(name, callback) { this.listener = callback; } };
                const window = { fetch: async (url, status, token) => ({
                    url, status, ok: status < 300, headers: {get: () => token}
                }), webkit: { messageHandlers: { hocMacPremium: {
                    postMessage(message) { messages.push(message); }
                }}}};
                """)
            context.evaluateScript(PremiumSite.bootstrap(session: session, crew: draft))
            precondition(context.exception == nil)
            return context
        }
        let firstParty = javascript(origin: PremiumSite.origin, session: session)
        precondition(firstParty.evaluateScript("localStorage.getItem('accessToken')")?.toString() == session.token)
        precondition(firstParty.evaluateScript("JSON.parse(localStorage.hocAuthUser).email")?.toString() == session.account.email)
        precondition(firstParty.evaluateScript("localStorage.getItem('hoc.premium.crew.v1')")?.toString() == draft)
        precondition(firstParty.evaluateScript("""
            localStorage.setItem('hoc.premium.crew.v1', '{"version":1,"ids":[1,3]}');
            messages[0].kind;
            """)?.toString() == "crew")
        precondition(firstParty.evaluateScript("""
            const logout = {isTrusted: false, target: { closest: () => true },
                preventDefault() {}, stopImmediatePropagation() {}};
            document.listener(logout);
            document.listener({...logout, isTrusted: true});
            messages.length === 2 && messages[1].kind === 'signOut';
            """)?.toBool() == true)
        firstParty.evaluateScript("""
            (async () => {
                const account = 'https://game.heroesofcrypto.io/v1/premium/account';
                await window.fetch('https://example.test/v1/premium/account', 200, 'foreign');
                await window.fetch('https://example.test/v1/premium/account', 401);
                await window.fetch(account, 403);
                await window.fetch(account, 200, 'rotated');
                await window.fetch(account, 200, 'rotated');
                await window.fetch(account, 440);
                localStorage.removeItem('accessToken');
                await window.fetch(account, 401);
                return true;
            })()
            """)
        precondition(firstParty.evaluateScript("""
            messages.length === 4 && messages[2].kind === 'refreshToken'
                && messages[2].value === 'Bearer rotated' && messages[3].kind === 'authorizationExpired';
            """)?.toBool() == true)
        let expiredInBrowser = javascript(origin: PremiumSite.origin, session: session)
        precondition(expiredInBrowser.evaluateScript("""
            localStorage.removeItem('accessToken');
            messages.length === 1 && messages[0].kind === 'authorizationExpired';
            """)?.toBool() == true)
        for context in [javascript(origin: "https://example.test", session: session),
                        javascript(origin: PremiumSite.origin, session: nil)] {
            precondition(context.evaluateScript("localStorage.getItem('accessToken') === null")?.toBool() == true)
        }
    }
}

private final class MemorySessionStore: NativeSessionStore {
    var token: String?
    func read() throws -> String? { token }
    func save(_ value: String?) throws { token = value }
}

private final class AccountFixture: URLProtocol, @unchecked Sendable {
    static let rankedToken = token(id: "Ranked", exp: 4_000_000_000)
    static let rankedRefresh = token(id: "Ranked", exp: 4_000_000_010)
    static let invalidRefresh = token(id: "Ranked", exp: 4_000_000_020)
    static let otherSessionToken = token(id: "Different", exp: 4_000_000_030)

    private static func token(id: String, exp: Int) -> String {
        let payload = Data("{\"sessionId\":\"\(id)\",\"exp\":\(exp)}".utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
        return "Bearer fixture.\(payload).signature"
    }

    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "account.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let email = "player@example.test"
        let profile = Data([0x0a, 6]) + Data("Player".utf8) + Data([0x12, UInt8(email.utf8.count)]) + Data(email.utf8)
        let verified = profile + Data([0x18, 4, 0x30, 1])
        var body = Data()
        var headers: [String: String] = [:]
        var status = 200
        if request.url?.path.hasPrefix("/v1/") == true {
            precondition(request.value(forHTTPHeaderField: "X-HoC-Device") == "native-auth-test")
            precondition(request.value(forHTTPHeaderField: "x-request-id") != nil)
        }

        switch request.url?.path {
        case "/desktop-sign-in.html":
            headers["Content-Type"] = "text/html; charset=utf-8"
            body = Data(#"<meta name="hoc-desktop-sign-in" content="1" />"#.utf8)
        case "/spa-fallback.html":
            headers["Content-Type"] = "text/html; charset=utf-8"
            body = Data("<title>Play Heroes of Crypto</title>".utf8)
        case "/v1/login":
            precondition(request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Authorization") == nil)
            body = verified
            headers["Authorization"] = "Bearer rotated-session"
        case "/v1/register":
            precondition(request.httpMethod == "POST")
            precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/octet-stream")
            body = profile
            headers["Authorization"] = "Bearer test-session"
        case "/v1/confirm-verification-code":
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer test-session")
            headers["x-new-token"] = "Bearer rotated-session"
        case "/v1/me":
            precondition(request.httpMethod == "GET")
            let token = request.value(forHTTPHeaderField: "Authorization")
            precondition(token != Self.otherSessionToken)
            if token == Self.invalidRefresh { status = 401 }
            else { precondition(["Bearer rotated-session", Self.rankedToken, Self.rankedRefresh].contains(token)) }
            body = verified
        case "/v1/logout":
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer rotated-session")
        case "/v1/request-verification-code", "/v1/request-password-reset", "/v1/reset-password":
            precondition(request.httpMethod == "POST")
        case "/v1/desktop-auth-exchange" where request.httpMethod == "GET":
            headers["Content-Type"] = "application/json"
            body = Data(#"{"version":1}"#.utf8)
        case "/v1/desktop-auth-exchange":
            precondition(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
            body = verified
            headers["Authorization"] = "Bearer native-google-session"
        default:
            client?.urlProtocol(self, didFailWithError: URLError(.resourceUnavailable))
            return
        }

        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}
