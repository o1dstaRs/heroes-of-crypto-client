import AppKit
import AuthenticationServices
import CryptoKit
import Security

struct DesktopSignInAttempt {
    static let scheme = "io.heroesofcrypto.skirmish"
    static let signInPage = URL(string: "https://app.heroesofcrypto.io/desktop-sign-in.html")!

    let verifier: String
    private let state: String

    init() throws {
        verifier = try Self.makeSecret()
        state = try Self.makeSecret()
    }

    var startURL: URL {
        var url = URLComponents(url: Self.signInPage, resolvingAgainstBaseURL: false)!
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8)))
        url.fragment = "challenge=\(Self.base64URL(challenge))&state=\(state)"
        return url.url!
    }

    func code(from url: URL) throws -> String {
        guard let callback = URLComponents(url: url, resolvingAgainstBaseURL: false),
              callback.scheme == Self.scheme, callback.host == nil, callback.path == "/sign-in",
              let items = callback.queryItems, items.count == 2,
              items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value,
              code.wholeMatch(of: /[A-Za-z0-9_-]{43}/) != nil else {
            throw NativeAuthFailure.invalidResponse
        }
        return code
    }

    private static func makeSecret() throws -> String {
        var bytes = Data(count: 32)
        let status = bytes.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!)
        }
        guard status == errSecSuccess else { throw NativeAuthFailure.couldNotStartBrowser }
        return base64URL(bytes)
    }

    private static func base64URL(_ bytes: Data) -> String {
        bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

@MainActor
final class DesktopBrowserSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private weak var anchor: NSWindow?
    private var session: ASWebAuthenticationSession?
    private var completion: CheckedContinuation<URL, Error>?
    private var activeAttempt: UUID?

    func authorize(presenting window: NSWindow) async throws -> (code: String, verifier: String) {
        guard activeAttempt == nil else { throw NativeAuthFailure.couldNotStartBrowser }
        let attempt = try DesktopSignInAttempt()
        let id = UUID()
        let callback = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
                guard !Task.isCancelled else { return continuation.resume(throwing: CancellationError()) }
                anchor = window
                activeAttempt = id
                completion = continuation
                let session = ASWebAuthenticationSession(url: attempt.startURL,
                                                         callbackURLScheme: DesktopSignInAttempt.scheme) {
                    [weak self] url, error in
                    Task { @MainActor in
                        if let url { self?.finish(.success(url), attempt: id) }
                        else { self?.finish(.failure(error ?? NativeAuthFailure.invalidResponse), attempt: id) }
                    }
                }
                session.presentationContextProvider = self
                self.session = session
                if !session.start() { finish(.failure(NativeAuthFailure.couldNotStartBrowser), attempt: id) }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                if self?.activeAttempt == id { self?.cancel() }
            }
        }
        try Task.checkCancellation()
        return (try attempt.code(from: callback), attempt.verifier)
    }

    func cancel() {
        guard let activeAttempt else { return }
        session?.cancel()
        finish(.failure(CancellationError()), attempt: activeAttempt)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<URL, Error>, attempt: UUID) {
        guard activeAttempt == attempt else { return }
        let pending = completion
        activeAttempt = nil
        completion = nil
        session = nil
        anchor = nil
        pending?.resume(with: result)
    }
}
