import AppKit
import Observation
import SwiftUI
import WebKit

@MainActor
@Observable
final class PremiumWebSession: NSObject, WKNavigationDelegate, WKUIDelegate {
    enum Action { case signIn, signOut, arena, lobby, sandbox }

    private(set) var view: WKWebView?
    private(set) var loading = false
    private(set) var problem: String?
    @ObservationIgnored private var token: String?
    @ObservationIgnored private var crewPreference: String?
    @ObservationIgnored private var returnURL = PremiumSite.entry
    @ObservationIgnored private var handle: ((Action) -> Void)?
    @ObservationIgnored private weak var account: NativeAccountController?
    @ObservationIgnored private var authorizationCheck: Task<Void, Never>?
    @ObservationIgnored private var tokenRefresh: Task<Void, Never>?
    @ObservationIgnored private var authorizationExpired = false
    @ObservationIgnored private var triedReconnect = false

    func prepare(_ account: NativeAccountController, handle: @escaping (Action) -> Void) {
        let returning = self.handle == nil
        self.account = account
        self.handle = handle
        if returning { triedReconnect = false }
        let session = account.verifiedSession
        if view == nil {
            open(session)
        } else if session?.token != token {
            updateAccount(session)
        } else if returning, let view {
            if authorizationExpired {
                reconnect(view)
            } else if view.url.map(PremiumSite.isWorkspace) == true {
                // Re-check the site's live entitlement when Premium is reopened without reloading its workspace.
                view.evaluateJavaScript("window.dispatchEvent(new Event('focus'));")
            }
        }
    }

    func updateAccount(_ session: NativeAccountSession?) {
        guard view != nil, token != session?.token else { return }
        if handle == nil { discardView() }
        else { open(session) }
    }

    func detach() {
        handle = nil
        authorizationCheck?.cancel()
        authorizationCheck = nil
        loading = view?.isLoading == true
    }

    func reload(offerSignIn: Bool = false) {
        triedReconnect = false
        let session = account?.verifiedSession
        if let view, session != nil { reconnect(view, offerSignIn: offerSignIn) }
        else { open(session) }
    }

    func goBack() -> Bool {
        guard let view, view.canGoBack else { return false }
        problem = nil
        view.goBack()
        return true
    }

    private func discardView() {
        authorizationCheck?.cancel()
        authorizationCheck = nil
        tokenRefresh?.cancel()
        tokenRefresh = nil
        authorizationExpired = false
        if let previous = view {
            if let url = previous.url, PremiumSite.isWorkspace(url) { returnURL = url }
            previous.stopLoading()
            previous.navigationDelegate = nil
            previous.uiDelegate = nil
            previous.configuration.userContentController.removeScriptMessageHandler(forName: PremiumSite.bridge)
        }
        view = nil
        token = nil
        crewPreference = nil
        problem = nil
        loading = false
    }

    private func open(_ session: NativeAccountSession?) {
        discardView()
        token = session?.token
        crewPreference = session.map { PremiumSite.crewPreference(for: $0.account) }
        let crew = crewPreference.flatMap { UserDefaults.standard.string(forKey: $0) }
        let configuration = WKWebViewConfiguration()
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(PremiumMessageHandler(self), name: PremiumSite.bridge)
        configuration.userContentController.addUserScript(WKUserScript(
            source: PremiumSite.bootstrap(session: session, crew: crew), injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.underPageBackgroundColor = .black
        web.navigationDelegate = self
        web.uiDelegate = self
        view = web
        problem = nil
        loading = true
        web.load(URLRequest(url: returnURL))
    }

    private func reconnect(_ web: WKWebView, offerSignIn: Bool = true) {
        guard web === view, handle != nil, let account, authorizationCheck == nil else { return }
        guard !triedReconnect else {
            loading = false
            problem = "Premium couldn’t verify your sign-in. Reload to reconnect."
            return
        }
        triedReconnect = true
        loading = true
        problem = nil
        authorizationCheck = Task { [weak self, weak web] in
            guard let self, let web else { return }
            do {
                await tokenRefresh?.value
                try Task.checkCancellation()
                let session = try await account.revalidateSession()
                guard !Task.isCancelled, view === web else { return }
                authorizationCheck = nil
                open(session)
                if session == nil && offerSignIn { handle?(.signIn) }
            } catch {
                guard !Task.isCancelled, view === web else { return }
                authorizationCheck = nil
                requestFailed()
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard webView === view, let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame == false {
            // WebKit and the site's CSP govern embedded resources. Native actions apply to the top-level page.
            decisionHandler(.allow)
            return
        }
        let target = route(action, url: url)
        if target == .website {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            follow(target)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard webView === view, let url = action.request.url else { return nil }
        let target = route(action, url: url)
        if target == .website { webView.load(action.request) }
        else { follow(target) }
        return nil
    }

    private func route(_ action: WKNavigationAction, url: URL) -> PremiumSite.Destination {
        let fromSite = action.sourceFrame.isMainFrame && action.sourceFrame.request.url.map(PremiumSite.owns) == true
        guard fromSite || PremiumSite.owns(url) && action.targetFrame != nil else { return .blocked }
        return PremiumSite.route(url, opensWindow: action.targetFrame == nil,
                                 userLink: fromSite && action.navigationType == .linkActivated)
    }

    private func follow(_ destination: PremiumSite.Destination) {
        switch destination {
        case .signIn: handle?(.signIn)
        case .arena: handle?(.arena)
        case .lobby: handle?(.lobby)
        case .sandbox: handle?(.sandbox)
        case let .external(url): NSWorkspace.shared.open(url)
        case .website, .blocked: break
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigation: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        guard navigation.isForMainFrame else { decisionHandler(.allow); return }
        guard webView === view, let url = navigation.response.url, PremiumSite.owns(url) else {
            decisionHandler(.cancel)
            return
        }
        if let response = navigation.response as? HTTPURLResponse, response.statusCode >= 400 {
            requestFailed()
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard webView === view else { return }
        problem = nil
        loading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === view else { return }
        if let url = webView.url, PremiumSite.isWorkspace(url) { returnURL = url }
        loading = authorizationCheck != nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        if webView === view, (error as? URLError)?.code != .cancelled { requestFailed() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        if webView === view, (error as? URLError)?.code != .cancelled { requestFailed() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === view { requestFailed() }
    }

    func requestFailed() {
        loading = false
        problem = "Couldn’t open Premium. Check your connection and try again."
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.webView === view, message.frameInfo.isMainFrame, token != nil,
              let url = message.frameInfo.request.url, PremiumSite.owns(url),
              let body = message.body as? [String: Any] else { return }
        switch body["kind"] as? String {
        case "signOut": handle?(.signOut)
        case "authorizationExpired":
            guard PremiumSite.isWorkspace(url), let web = view else { return }
            authorizationExpired = true
            reconnect(web)
        case "refreshToken":
            guard PremiumSite.isWorkspace(url), let account, let value = body["value"] as? String,
                  value != account.verifiedSession?.token else { return }
            tokenRefresh?.cancel()
            tokenRefresh = Task { [weak account] in await account?.acceptSessionRefresh(value) }
        case "crew":
            if let crewPreference, PremiumSite.isWorkspace(url), let draft = PremiumSite.validatedCrew(body["value"] as? String) {
                UserDefaults.standard.set(draft, forKey: crewPreference)
            }
        default: break
        }
    }
}

@MainActor
private final class PremiumMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var session: PremiumWebSession?

    init(_ session: PremiumWebSession) { self.session = session }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        session?.receive(message)
    }
}

struct InAppPremium: View {
    let session: PremiumWebSession
    let account: NativeAccountController
    let handle: (PremiumWebSession.Action) -> Void

    var body: some View {
        ZStack {
            BattlePalette.backdrop
            if let view = session.view {
                HostedGameWebView(view: view)
                    .id(ObjectIdentifier(view))
                    .allowsHitTesting(session.problem == nil)
            }
            if let problem = session.problem {
                VStack(spacing: 16) {
                    Text(problem)
                    Button("Reload Premium") { session.reload() }
                        .buttonStyle(GameMenuButtonStyle(prominent: true))
                }
                .padding(24)
                .foregroundStyle(BattlePalette.parchment)
                .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 9))
            } else if session.view == nil || session.loading {
                ProgressView("Opening Premium…")
                    .padding(21)
                    .foregroundStyle(BattlePalette.parchment)
                    .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 9))
                    .allowsHitTesting(false)
            }
        }
        .task(id: account.checking) {
            await account.restore()
            if !Task.isCancelled && !account.checking { session.prepare(account, handle: handle) }
        }
        .onDisappear { session.detach() }
    }
}
