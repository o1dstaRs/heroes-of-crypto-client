import AppKit
import Observation
import SwiftUI
import WebKit

enum RankedDestination: Equatable {
    case arena, lobby, history, cooperative(SandboxCoopHandoff)

    var title: String {
        switch self {
        case .arena: "Ranked Arena"
        case .lobby: "Lobby"
        case .history: "Match History"
        case .cooperative: "Co-op Sandbox"
        }
    }

    func entryURL(relativeTo arena: URL) -> URL {
        let path: String
        switch self {
        case .arena: return arena
        case .lobby: path = "/lobbies"
        case .history: path = "/portal#profile-match-history"
        case let .cooperative(handoff): path = "/sandbox/\(handoff.gameID)"
        }
        return URL(string: path, relativeTo: arena)!.absoluteURL
    }
}

@MainActor
@Observable
final class RankedWebSession: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let entryURL = URL(string: "https://app.heroesofcrypto.io/play")!
    private let entry: URL
    private let origin: String
    private let preferences: OnlinePreferences
    private let audio: GameAudioSettings
    private(set) var view: WKWebView?
    private(set) var loading = false
    private(set) var problem: String?
    @ObservationIgnored private var destination: RankedDestination?
    @ObservationIgnored private var sessionToken: String?
    @ObservationIgnored private weak var account: NativeAccountController?
    @ObservationIgnored private weak var notifications: RankedNotifications?
    @ObservationIgnored private var authorizationCheck: Task<Void, Never>?
    @ObservationIgnored private var tokenRefresh: Task<Void, Never>?
    @ObservationIgnored private var handedOffCoopGames: Set<String> = []

    init(entry: URL = RankedWebSession.entryURL, preferences: OnlinePreferences, audio: GameAudioSettings) {
        self.entry = entry
        self.preferences = preferences
        self.audio = audio
        var url = URLComponents()
        url.scheme = entry.scheme
        url.host = entry.host
        url.port = entry.port
        self.origin = url.string!
        super.init()
    }

    func prepare(_ account: NativeAccountController, destination requested: RankedDestination,
                 fullscreen: Bool, notifications: RankedNotifications) {
        guard let session = account.verifiedSession else { return }
        let entryURL = requested.entryURL(relativeTo: entry)
        if let view, self.account === account, let sessionToken {
            let sameLogin = RankedSessionClaims(token: sessionToken).map {
                $0.sessionId == RankedSessionClaims(token: session.token)?.sessionId
            } ?? false
            if sessionToken == session.token || sameLogin {
                self.sessionToken = session.token
                if destination != requested {
                    if case .cooperative = requested {
                        // The army handoff has to run before the hosted board opens on the new document.
                        open(entryURL, destination: requested, session: session, account: account, fullscreen: fullscreen,
                             notifications: notifications, dataStore: view.configuration.websiteDataStore)
                        return
                    }
                    authorizationCheck?.cancel()
                    authorizationCheck = nil
                    destination = requested
                    problem = nil
                    loading = true
                    view.load(URLRequest(url: entryURL))
                }
                syncPreferences()
                return
            }
        }
        open(entryURL, destination: requested, session: session, account: account, fullscreen: fullscreen,
             notifications: notifications)
    }

    private func open(_ url: URL, destination: RankedDestination, session: NativeAccountSession,
                      account: NativeAccountController,
                      fullscreen: Bool, notifications: RankedNotifications,
                      dataStore: WKWebsiteDataStore = .nonPersistent()) {
        reset()
        self.destination = destination
        self.account = account
        self.notifications = notifications
        let configuration = WKWebViewConfiguration()
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.websiteDataStore = dataStore
        configuration.userContentController.addScriptMessageHandler(
            RankedFullscreenHandler(origin: origin), contentWorld: .page, name: "hocMacFullscreen"
        )
        configuration.userContentController.add(
            RankedNotificationHandler(origin: origin, notifications: notifications), name: RankedNotificationHandler.name
        )
        configuration.userContentController.add(
            RankedAccountHandler(origin: origin, session: self), name: RankedAccountHandler.name
        )
        let browserState = RankedBrowserStateHandler(origin: origin, session: self)
        configuration.userContentController.add(browserState, name: OnlinePreferences.messageName)
        configuration.userContentController.add(browserState, name: NativeCoopAPI.armyTakenMessage)
        let script = """
            (() => {
                if (window.location.origin !== \(Self.javascriptString(origin))) return;
                if (!sessionStorage.getItem("hoc:native-session")) {
                    localStorage.setItem("hoc:deviceId", \(Self.javascriptString(account.deviceID)));
                    localStorage.setItem("accessToken", \(Self.javascriptString(session.token)));
                    sessionStorage.setItem("hoc:native-session", "1");
                }
                \(coopTransferScript(destination))
                \(RankedAccountHandler.script)
                \(OnlinePreferences.bridgeScript(preferenceValues))
                let fullscreen = \(fullscreen);
                window.hocMacSyncFullscreen = (active) => {
                    if (active !== fullscreen) {
                        fullscreen = active;
                        document.dispatchEvent(new Event("fullscreenchange"));
                    }
                };
                const fullscreenHandler = window.webkit.messageHandlers.hocMacFullscreen;
                Object.defineProperties(document, {
                    fullscreenElement: { get: () => fullscreen ? document.documentElement : null },
                    fullscreenEnabled: { get: () => true }
                });
                document.exitFullscreen = () => fullscreenHandler.postMessage(false);
                Element.prototype.requestFullscreen = () => fullscreenHandler.postMessage(true);
                \(RankedNotificationHandler.script(permitted: notifications.permitted))
            })();
            """
        configuration.userContentController.addUserScript(WKUserScript(
            source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.underPageBackgroundColor = .black
        sessionToken = session.token
        view = web
        loading = true
        web.load(URLRequest(url: url))
    }

    func reset() {
        authorizationCheck?.cancel()
        authorizationCheck = nil
        tokenRefresh?.cancel()
        tokenRefresh = nil
        view?.stopLoading()
        view?.navigationDelegate = nil
        view?.uiDelegate = nil
        if let controller = view?.configuration.userContentController {
            controller.removeAllUserScripts()
            controller.removeScriptMessageHandler(forName: RankedNotificationHandler.name)
            controller.removeScriptMessageHandler(forName: RankedAccountHandler.name)
            controller.removeScriptMessageHandler(forName: OnlinePreferences.messageName)
            controller.removeScriptMessageHandler(forName: NativeCoopAPI.armyTakenMessage)
            controller.removeScriptMessageHandler(forName: "hocMacFullscreen")
        }
        notifications?.clear()
        view = nil
        destination = nil
        sessionToken = nil
        account = nil
        notifications = nil
        loading = false
        problem = nil
    }

    func retry() {
        guard let view, !loading, authorizationCheck == nil else { return }
        checkAuthorization(in: view, reconnect: true)
    }

    fileprivate func browserTokenChanged(_ token: String, in webView: WKWebView) {
        guard webView === view, let account else { return }
        if token.isEmpty {
            if authorizationCheck == nil { checkAuthorization(in: webView, reconnect: false) }
        } else if token != account.verifiedSession?.token {
            tokenRefresh?.cancel()
            tokenRefresh = Task { [weak account] in await account?.acceptSessionRefresh(token) }
        }
    }

    private func checkAuthorization(in webView: WKWebView, reconnect: Bool) {
        guard let account, let destination else { return }
        let reconnectURL = webView.url.flatMap { accepts($0) ? $0 : nil } ?? destination.entryURL(relativeTo: entry)
        if reconnect {
            problem = nil
            loading = true
        }
        authorizationCheck?.cancel()
        authorizationCheck = Task { [weak self, weak webView] in
            guard let self, let webView else { return }
            defer {
                if !Task.isCancelled { authorizationCheck = nil }
            }
            do {
                await tokenRefresh?.value
                try Task.checkCancellation()
                let session = try await account.revalidateSession()
                guard !Task.isCancelled, view === webView else { return }
                guard let session else {
                    reset()
                    return
                }
                if reconnect, let notifications {
                    let fullscreen = webView.window?.styleMask.contains(.fullScreen) == true
                    open(reconnectURL, destination: destination, session: session, account: account, fullscreen: fullscreen,
                         notifications: notifications, dataStore: webView.configuration.websiteDataStore)
                } else {
                    loading = false
                    problem = "\(destination.title) lost its sign-in. Reload to reconnect."
                }
            } catch {
                guard !Task.isCancelled, view === webView else { return }
                loading = false
                problem = "\(destination.title) couldn’t check your sign-in. Check your connection and try again."
            }
        }
    }

    func syncFullscreen() {
        guard let view, let window = view.window else { return }
        view.evaluateJavaScript("window.hocMacSyncFullscreen?.(\(window.styleMask.contains(.fullScreen)))")
    }

    func syncNotificationPermission(_ permitted: Bool) {
        view?.evaluateJavaScript("window.hocMacSyncRankedNotifications?.(\(permitted))")
    }

    private var preferenceValues: [String: String] {
        preferences.values.merging(audio.webValues) { _, audio in audio }
    }

    func syncPreferences() {
        view?.evaluateJavaScript("window.hocMacApplyPreferences?.(\(OnlinePreferences.encode(preferenceValues)))")
    }

    fileprivate func receivePreferences(_ values: [String: String], in webView: WKWebView) {
        guard webView === view else { return }
        preferences.receive(values)
        audio.receiveWebValues(values)
    }

    fileprivate func coopArmyTaken(_ gameID: String, in webView: WKWebView) {
        guard webView === view, case let .cooperative(handoff) = destination, handoff.gameID == gameID else { return }
        handedOffCoopGames.insert(gameID)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, accepts(url) else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigation: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigation.response.url, accepts(url) else {
            decisionHandler(.cancel)
            return
        }
        if navigation.isForMainFrame, let http = navigation.response as? HTTPURLResponse, http.statusCode >= 400 {
            loading = false
            problem = "\(destination?.title ?? "Ranked Arena") couldn’t load. Try again."
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, accepts(url) { webView.load(action.request) }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === view else { return }
        loading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === view else { return }
        loading = false
        syncFullscreen()
        syncPreferences()
        if let notifications { syncNotificationPermission(notifications.permitted) }
        if destination == .history, webView.url?.path == "/portal",
           webView.url?.fragment == "profile-match-history" {
            webView.evaluateJavaScript("""
                (() => {
                    const reveal = () => {
                        const heading = document.getElementById("profile-match-history");
                        if (!heading || location.pathname !== "/portal" ||
                            location.hash !== "#profile-match-history") return false;
                        heading.scrollIntoView({block:"start"});
                        return true;
                    };
                    if (reveal()) return;
                    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
                    observer.observe(document.body, {subtree:true,childList:true});
                    setTimeout(() => observer.disconnect(), 10000);
                })();
                """)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        guard webView === view else { return }
        showFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        guard webView === view else { return }
        showFailure(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === view else { return }
        notifications?.clear()
        loading = false
        problem = "\(destination?.title ?? "Ranked Arena") lost its connection. Reload to reconnect."
    }

    private func showFailure(_ error: any Error) {
        if (error as? URLError)?.code == .cancelled { return }
        loading = false
        problem = "\(destination?.title ?? "Ranked Arena") couldn’t load. Check your connection and try again."
    }

    private func accepts(_ url: URL) -> Bool {
        url.scheme == entry.scheme && url.host == entry.host && url.port == entry.port &&
            url.user == nil && url.password == nil
    }

    private func coopTransferScript(_ destination: RankedDestination) -> String {
        guard case let .cooperative(handoff) = destination, !handoff.army.isEmpty, !handedOffCoopGames.contains(handoff.gameID),
              let bytes = try? JSONEncoder().encode(handoff.army) else { return "" }
        return NativeCoopAPI.carryArmyScript(gameID: handoff.gameID, army: bytes)
    }

    private static func javascriptString(_ value: String) -> String {
        String(decoding: try! JSONEncoder().encode(value), as: UTF8.self)
    }
}

@MainActor
private final class RankedBrowserStateHandler: NSObject, WKScriptMessageHandler {
    private let origin: String
    private weak var session: RankedWebSession?

    init(origin: String, session: RankedWebSession) {
        self.origin = origin
        self.session = session
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard rankedMessageOrigin(message) == origin, let webView = message.webView else { return }
        if message.name == OnlinePreferences.messageName, let values = message.body as? [String: String] {
            session?.receivePreferences(values, in: webView)
        } else if message.name == NativeCoopAPI.armyTakenMessage, let gameID = message.body as? String {
            session?.coopArmyTaken(gameID, in: webView)
        }
    }
}

@MainActor
private final class RankedAccountHandler: NSObject, WKScriptMessageHandler {
    static let name = "hocMacRankedSession"
    private let origin: String
    private weak var session: RankedWebSession?

    init(origin: String, session: RankedWebSession) {
        self.origin = origin
        self.session = session
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard rankedMessageOrigin(message) == origin, let webView = message.webView,
              let token = message.body as? String, token.utf8.count <= 4096 else { return }
        session?.browserTokenChanged(token, in: webView)
    }

    // The hosted client writes same-document changes to localStorage, which don't fire a storage event.
    static let script = """
        const accessTokenKey = "accessToken";
        let reportedToken = localStorage.getItem(accessTokenKey);
        let tokenUpdateScheduled = false;
        const scheduleTokenUpdate = () => {
            if (tokenUpdateScheduled) return;
            tokenUpdateScheduled = true;
            queueMicrotask(() => {
                tokenUpdateScheduled = false;
                const token = localStorage.getItem(accessTokenKey);
                if (token === reportedToken) return;
                reportedToken = token;
                window.webkit.messageHandlers.\(name).postMessage(token ?? "");
            });
        };
        for (const method of ["setItem", "removeItem", "clear"]) {
            const original = Storage.prototype[method];
            Storage.prototype[method] = function (...args) {
                const result = original.apply(this, args);
                if (this === localStorage && (method === "clear" || args[0] === accessTokenKey)) {
                    scheduleTokenUpdate();
                }
                return result;
            };
        }
        window.webkit.messageHandlers.\(name).postMessage(reportedToken ?? "");
        """
}

@MainActor
private final class RankedFullscreenHandler: NSObject, WKScriptMessageHandlerWithReply {
    let origin: String

    init(origin: String) {
        self.origin = origin
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard rankedMessageOrigin(message) == origin, let fullscreen = message.body as? Bool,
              let window = message.webView?.window else {
            replyHandler(nil, "Couldn’t switch full screen.")
            return
        }
        if window.styleMask.contains(.fullScreen) != fullscreen { window.toggleFullScreen(nil) }
        replyHandler(nil, nil)
    }
}

struct InAppRanked: View {
    let session: RankedWebSession
    let account: NativeAccountController
    let notifications: RankedNotifications
    let destination: RankedDestination

    var body: some View {
        ZStack {
            BattlePalette.backdrop
            if let web = session.view {
                HostedGameWebView(view: web)
                    .id(ObjectIdentifier(web))
                    .allowsHitTesting(session.problem == nil)
            }
            if let problem = session.problem {
                VStack(spacing: 16) {
                    Text(LocalizedStringKey(problem))
                    Button("Reload \(Text(LocalizedStringKey(destination.title)))", action: session.retry)
                        .buttonStyle(GameMenuButtonStyle(prominent: true))
                }
                .padding(24)
                .foregroundStyle(BattlePalette.parchment)
                .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 9))
            } else if session.loading {
                ProgressView("Opening \(Text(LocalizedStringKey(destination.title)))…")
                    .padding(21)
                    .foregroundStyle(BattlePalette.parchment)
                    .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 9))
                    .allowsHitTesting(false)
            }
        }
        .task(id: account.verifiedSession?.token) { prepare() }
        .onChange(of: destination) { prepare() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in
            session.syncFullscreen()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { _ in
            session.syncFullscreen()
        }
    }

    private func prepare() {
        session.prepare(account, destination: destination,
                        fullscreen: GameWindow.current?.styleMask.contains(.fullScreen) == true,
                        notifications: notifications)
        session.syncFullscreen()
    }
}

struct HostedGameWebView: NSViewRepresentable {
    let view: WKWebView

    func makeNSView(context: Context) -> WKWebView { view }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
