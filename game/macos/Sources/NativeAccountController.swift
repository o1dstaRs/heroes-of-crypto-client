import AppKit
import AuthenticationServices
import Observation
import Security

protocol NativeSessionStore {
    func read() throws -> String?
    func save(_ value: String?) throws
}

struct KeychainAccountStore: NativeSessionStore {
    private var item: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "io.heroesofcrypto.skirmish.account",
            kSecAttrAccount as String: "session",
        ]
    }

    func read() throws -> String? {
        var query = item
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &value)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = value as? Data,
              let token = String(data: data, encoding: .utf8) else {
            throw KeychainFailure()
        }
        return token
    }

    func save(_ value: String?) throws {
        guard let value else {
            let status = SecItemDelete(item as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainFailure() }
            return
        }
        let data = Data(value.utf8)
        let status = SecItemUpdate(item as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw KeychainFailure() }
        var newItem = item
        newItem[kSecValueData as String] = data
        guard SecItemAdd(newItem as CFDictionary, nil) == errSecSuccess else { throw KeychainFailure() }
    }

    private struct KeychainFailure: Error {}
}

@MainActor
@Observable
final class NativeAccountController {
    enum Activity: String {
        case restore = "Checking your session…"
        case login = "Signing in…"
        case register = "Creating your account…"
        case checkingGoogle = "Checking Google sign-in…"
        case google = "Waiting for Google sign-in…"
        case finishingGoogle = "Finishing sign-in…"
        case verify = "Verifying your email…"
        case resend = "Sending a new code…"
        case requestReset = "Sending a reset link…"
        case reset = "Changing your password…"
        case logout = "Signing out…"
    }

    private(set) var account: NativeAccount?
    private(set) var activity: Activity?
    private(set) var checking = true
    var notice: String?
    var problem: String?

    var verifiedSession: NativeAccountSession? { account?.verified == true ? current : nil }

    let deviceID: String
    @ObservationIgnored private let api: NativeAuthAPI
    @ObservationIgnored private let store: any NativeSessionStore
    @ObservationIgnored private let browser = DesktopBrowserSignIn()
    private var current: NativeAccountSession?
    @ObservationIgnored private var started = false

    init(api: NativeAuthAPI? = nil, store: any NativeSessionStore = KeychainAccountStore()) {
        let defaults = UserDefaults.standard
        let key = "hoc.account.device"
        let device = defaults.string(forKey: key) ?? UUID().uuidString
        defaults.set(device, forKey: key)
        self.deviceID = device
        self.api = api ?? NativeAuthAPI(deviceID: device)
        self.store = store
    }

    func restore() async {
        guard !started else { return }
        started = true
        checking = true
        defer {
            if Task.isCancelled { started = false }
            checking = false
        }
        await perform(.restore) {
            guard let token = try store.read() else { return }
            do {
                adopt(try await api.account(token: token), previousToken: token)
            } catch NativeAuthFailure.http(let status) where status == 401 || status == 440 {
                try store.save(nil)
            }
        }
    }

    func signIn(email: String, password: String, username: String? = nil) async {
        await perform(username == nil ? .login : .register) {
            adopt(try await api.authenticate(email: email, password: password, username: username))
        }
    }

    func signInWithGoogle(window: NSWindow?) async {
        await perform(.checkingGoogle) {
            try Task.checkCancellation()
            guard let window else { throw NativeAuthFailure.couldNotStartBrowser }
            try await api.checkDesktopSignIn(page: DesktopSignInAttempt.signInPage)
            try Task.checkCancellation()
            guard window.isVisible else { return }
            activity = .google
            let grant = try await browser.authorize(presenting: window)
            activity = .finishingGoogle
            let session = try await api.authenticate(code: grant.code, verifier: grant.verifier)
            try Task.checkCancellation()
            adopt(session)
            window.makeKeyAndOrderFront(nil)
            NSApp.activate()
        }
    }

    func cancelGoogle() { browser.cancel() }

    func verify(code: String) async {
        guard let current else { return }
        await perform(.verify) {
            let account = current.account
            let token = try await api.confirm(email: account.email, code: code, token: current.token)
            adopt(NativeAccountSession(
                account: NativeAccount(username: account.username, email: account.email, verified: true), token: token
            ), previousToken: current.token)
        }
    }

    func resendCode() async {
        guard let current else { return }
        await perform(.resend) {
            let token = try await api.resend(email: current.account.email, token: current.token)
            adopt(NativeAccountSession(account: current.account, token: token), previousToken: current.token)
            if problem == nil { notice = "A new verification code is on its way." }
        }
    }

    func requestReset(email: String) async -> Bool {
        await perform(.requestReset) {
            try await api.requestPasswordReset(email: email)
            notice = "Check your email for a password reset link."
        }
    }

    func reset(link: String, password: String) async -> Bool {
        await perform(.reset) {
            try await api.resetPassword(link: link, password: password)
            notice = "Password changed. Sign in with your new password."
        }
    }

    func signOut() async {
        await perform(.logout) {
            try store.save(nil)
            let token = current?.token
            current = nil
            account = nil
            if let token { try? await api.logout(token: token) }
        }
    }

    func acceptSessionRefresh(_ token: String) async {
        guard let session = verifiedSession,
              let previous = RankedSessionClaims(token: session.token),
              let refresh = RankedSessionClaims(token: token),
              refresh.sessionId == previous.sessionId,
              refresh.exp > max(previous.exp, Date().timeIntervalSince1970) else { return }

        // Only the auth service can confirm a credential received from the embedded page.
        guard let refreshed = try? await api.account(token: token),
              !Task.isCancelled, current?.token == session.token,
              refreshed.account.verified, refreshed.account.email == session.account.email else { return }
        adopt(refreshed, previousToken: session.token)
    }

    func revalidateSession() async throws -> NativeAccountSession? {
        guard let session = verifiedSession else { return nil }
        do {
            let refreshed = try await api.account(token: session.token)
            try Task.checkCancellation()
            if current?.token == session.token { adopt(refreshed, previousToken: session.token) }
        } catch NativeAuthFailure.http(let status) where status == 401 || status == 440 {
            try Task.checkCancellation()
            if current?.token == session.token {
                current = nil
                account = nil
                do {
                    try store.save(nil)
                } catch {
                    problem = "macOS couldn’t clear this sign-in from Keychain."
                }
            }
        }
        return verifiedSession
    }

    func clearMessages() {
        notice = nil
        problem = nil
    }

    private func adopt(_ session: NativeAccountSession, previousToken: String? = nil) {
        current = session
        account = session.account
        guard session.token != previousToken else { return }
        do {
            try store.save(session.token)
        } catch {
            problem = "macOS couldn’t save this sign-in in Keychain."
        }
    }

    @discardableResult
    private func perform(_ action: Activity, _ execute: () async throws -> Void) async -> Bool {
        guard activity == nil else { return false }
        activity = action
        clearMessages()
        defer { activity = nil }
        do {
            try await execute()
            return true
        } catch is CancellationError {
            return false
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return false
        } catch {
            if !Task.isCancelled { problem = message(for: error, during: action) }
            return false
        }
    }

    private func message(for error: Error, during action: Activity) -> String {
        switch error {
        case NativeAuthFailure.invalidResetLink:
            return "Paste the full password reset link from your email."
        case NativeAuthFailure.couldNotStartBrowser:
            return "Couldn’t open the sign-in window. Try again."
        case NativeAuthFailure.desktopSignInUnavailable:
            return "Google sign-in is temporarily unavailable. You can sign in with email."
        case NativeAuthFailure.http(429):
            return "Too many attempts. Wait a moment and try again."
        case NativeAuthFailure.http(401) where action == .login:
            return "Check your email and password and try again."
        case NativeAuthFailure.http(400) where action == .verify:
            return "That code is invalid or expired. Request a new code and try again."
        case NativeAuthFailure.http(409) where action == .register:
            return "An account already uses that email or username."
        case NativeAuthFailure.http(400) where action == .reset:
            return "Check the link and choose a new password you haven’t used before."
        case is URLError:
            return "Couldn’t reach the account service. Check your connection and try again."
        default:
            return action == .restore ? "Couldn’t restore your last sign-in. You can sign in again." :
                "Couldn’t finish this step. Try again."
        }
    }
}

struct RankedSessionClaims: Decodable {
    let sessionId: String
    let exp: TimeInterval

    init?(token: String) {
        guard token.hasPrefix("Bearer "), token.utf8.count <= 4096 else { return nil }
        let body = token.dropFirst(7)
        guard !body.contains(where: \.isWhitespace) else { return nil }
        let segments = body.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count == 3, segments.allSatisfy({ !$0.isEmpty }) else { return nil }
        var payload = segments[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let bytes = Data(base64Encoded: payload), let claims = try? JSONDecoder().decode(Self.self, from: bytes),
              !claims.sessionId.isEmpty, claims.exp.isFinite else { return nil }
        self = claims
    }
}
