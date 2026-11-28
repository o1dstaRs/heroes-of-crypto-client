import AppKit
import SwiftUI
import WebKit

/// The web FightLog component runs against the locally bundled page. Only the log text and copy command cross the bridge.
struct BattleLogPane: NSViewRepresentable {
    let lines: [String]
    @Environment(\.locale) private var locale

    struct Snapshot: Equatable {
        let text: String
        let language: String
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "copyBattleLog")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.underPageBackgroundColor = NSColor(red: 0.031, green: 0.027, blue: 0.024, alpha: 1)
        view.navigationDelegate = context.coordinator
        context.coordinator.load(view)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.update(Snapshot(text: lines.reversed().joined(separator: "\n"),
                                            language: locale.language.languageCode?.identifier ?? "en"), in: view)
    }

    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "copyBattleLog", contentWorld: .page)
        view.navigationDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
        private let page = Bundle.main.url(forResource: "native-fight-log", withExtension: "html")
        private var pending = Snapshot(text: "", language: "en")
        private var displayed: Snapshot?
        private var ready = false

        func load(_ view: WKWebView) {
            ready = false
            displayed = nil
            if let page { view.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent()) }
        }

        func update(_ snapshot: Snapshot, in view: WKWebView) {
            pending = snapshot
            guard ready, displayed != snapshot else { return }
            displayed = snapshot
            Task { [weak self, weak view] in
                guard let self, let view, ready, displayed == snapshot else { return }
                do {
                    _ = try await view.callAsyncJavaScript("window.hocSetBattleLog(text, language)",
                                                           arguments: ["text": snapshot.text, "language": snapshot.language],
                                                           in: nil, contentWorld: .page)
                } catch {
                    if displayed == snapshot { displayed = nil }
                }
            }
        }

        func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            update(pending, in: view)
        }

        func webViewWebContentProcessDidTerminate(_ view: WKWebView) {
            load(view)
        }

        func webView(_ view: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            action.request.url == page ? .allow : .cancel
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                                   replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
            guard let page, message.frameInfo.isMainFrame, message.frameInfo.request.url == page,
                  let text = message.body as? String else {
                replyHandler(nil, "Could not copy the battle log.")
                return
            }
            NSPasteboard.general.clearContents()
            if NSPasteboard.general.setString(text, forType: .string) {
                replyHandler(nil, nil)
            } else {
                replyHandler(nil, "Could not copy the battle log.")
            }
        }
    }
}
