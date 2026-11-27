import CryptoKit
import Foundation

enum PremiumSite {
    static let origin = "https://heroesofcrypto.io"
    static let entry = URL(string: "\(origin)/premium/")!
    static let bridge = "hocMacPremium"
    static let crewKey = "hoc.premium.crew.v1"

    enum Destination: Equatable {
        case website, signIn, arena, lobby, sandbox, external(URL), blocked
    }

    static func owns(_ url: URL) -> Bool {
        isHTTPS(url) && url.host == entry.host && (url.port == nil || url.port == 443)
    }

    static func isWorkspace(_ url: URL) -> Bool {
        owns(url) && localizedPath(url) == "premium"
    }

    static func route(_ url: URL, opensWindow: Bool, userLink: Bool) -> Destination {
        guard isHTTPS(url) else { return .blocked }
        let path = localizedPath(url)
        if owns(url) {
            switch path {
            case "auth/login", "auth/register", "auth/verify": return .signIn
            case "play/ranked" where url.query == nil: return .arena
            case "play/lobbies" where url.query == nil: return .lobby
            case "sandbox" where url.query == nil: return .sandbox
            default:
                if !opensWindow || isWorkspace(url) { return .website }
            }
        }
        if url.host == "app.heroesofcrypto.io", (url.port == nil || url.port == 443) {
            switch path {
            case "play" where url.query == nil: return .arena
            case "lobbies" where url.query == nil: return .lobby
            case "" where url.query == nil, "sandbox" where url.query == nil: return .sandbox
            default: return .external(withoutHandoff(url))
            }
        }
        return userLink ? .external(withoutHandoff(url)) : .blocked
    }

    // Keep the website’s saved draft across launches. The web view's account storage is ephemeral.
    static func crewPreference(for account: NativeAccount) -> String {
        let email = account.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let key = SHA256.hash(data: Data(email.utf8)).map { String(format: "%02x", $0) }.joined()
        return "hoc.premium.crew.\(key)"
    }

    static func validatedCrew(_ draft: String?) -> String? {
        guard let draft, draft.utf8.count <= 4096,
              let object = try? JSONSerialization.jsonObject(with: Data(draft.utf8)) as? [String: Any],
              object["version"] as? Int == 1, object["ids"] as? [Int] != nil else { return nil }
        return draft
    }

    static func bootstrap(session: NativeAccountSession?, crew: String?) -> String {
        let profile = session.map {
            ["username": $0.account.username, "email": $0.account.email]
        }
        return """
            (() => {
                if (location.origin !== \(javascript(origin))) return;
                const token = \(javascript(session?.token));
                const profile = \(javascript(profile));
                const crewKey = \(javascript(crewKey));
                if (token === null) return;
                localStorage.setItem("accessToken", token);
                localStorage.setItem("hocAuthUser", JSON.stringify({...profile, is_active: true}));
                const send = (message) => window.webkit.messageHandlers.\(bridge).postMessage(message);
                document.addEventListener("click", (event) => {
                    if (!event.isTrusted || !event.target?.closest?.("[data-auth-logout]")) return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    send({kind: "signOut"});
                }, true);
                if (!/^\\/(ru\\/)?premium\\/?$/.test(location.pathname)) return;
                // The library's crew requests and AI stream combine cancellation and timeouts.
                // macOS 14 can have a WebKit version predating AbortSignal.any.
                if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any !== "function") {
                    AbortSignal.any = (signals) => {
                        const controller = new AbortController();
                        const sources = Array.from(signals);
                        const alreadyAborted = sources.find((signal) => signal.aborted);
                        if (alreadyAborted) controller.abort(alreadyAborted.reason);
                        else for (const source of sources) {
                            source.addEventListener("abort", () => controller.abort(source.reason), {
                                once: true, signal: controller.signal,
                            });
                        }
                        return controller.signal;
                    };
                }
                let reportedExpiry = false;
                const expired = () => {
                    if (reportedExpiry) return;
                    reportedExpiry = true;
                    send({kind: "authorizationExpired"});
                };
                const remove = Storage.prototype.removeItem;
                Storage.prototype.removeItem = function(key) {
                    const lost = this === localStorage && key === "accessToken" && this.getItem(key) !== null;
                    remove.call(this, key);
                    if (lost) expired();
                };
                const fetch = window.fetch.bind(window);
                let lastRefresh = token;
                window.fetch = async (...args) => {
                    const response = await fetch(...args);
                    if (!response.url) return response;
                    const url = new URL(response.url);
                    const game = url.origin === "https://game.heroesofcrypto.io" && url.pathname.startsWith("/v1/premium/");
                    const ai = url.origin === "https://test.heroesofcrypto.io" && url.pathname === "/ai/knowledge/ask";
                    if ((game || ai) && (response.status === 401 || response.status === 440)) {
                        expired();
                    } else if (game && response.ok) {
                        let refreshed = response.headers.get("x-new-token")?.trim();
                        if (refreshed && !refreshed.startsWith("Bearer ")) refreshed = "Bearer " + refreshed;
                        if (refreshed && refreshed !== lastRefresh) {
                            lastRefresh = refreshed;
                            send({kind: "refreshToken", value: refreshed});
                        }
                    }
                    return response;
                };
                const savedCrew = \(javascript(validatedCrew(crew)));
                if (savedCrew !== null && localStorage.getItem(crewKey) === null) localStorage.setItem(crewKey, savedCrew);
                const put = Storage.prototype.setItem;
                Storage.prototype.setItem = function(key, value) {
                    const changed = this === localStorage && key === crewKey && this.getItem(key) !== value;
                    put.call(this, key, value);
                    if (changed) send({kind: "crew", value});
                };
            })();
            """
    }

    private static func isHTTPS(_ url: URL) -> Bool {
        url.scheme == "https" && url.host != nil && url.user == nil && url.password == nil
    }

    private static func localizedPath(_ url: URL) -> String {
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return path.hasPrefix("ru/") ? String(path.dropFirst(3)) : path
    }

    private static func withoutHandoff(_ url: URL) -> URL {
        guard var result = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        func isCredential(_ item: URLQueryItem) -> Bool {
            ["access_token", "accesstoken", "authorization"].contains(item.name.lowercased())
        }
        if let items = result.queryItems, items.contains(where: isCredential) {
            let remaining = items.filter { !isCredential($0) }
            result.queryItems = remaining.isEmpty ? nil : remaining
        }
        if let fragment = result.percentEncodedFragment {
            var fields = URLComponents()
            fields.percentEncodedQuery = fragment
            if let items = fields.queryItems, items.contains(where: isCredential) {
                fields.queryItems = items.filter { !isCredential($0) }
                result.percentEncodedFragment = fields.percentEncodedQuery?.isEmpty == false ? fields.percentEncodedQuery : nil
            }
        }
        return result.url ?? url
    }

    private static func javascript(_ value: some Encodable) -> String {
        String(decoding: try! JSONEncoder().encode(value), as: UTF8.self)
    }
}
