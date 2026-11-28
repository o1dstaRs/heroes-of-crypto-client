import AppKit
import SwiftUI
import WebKit

/// The web FightLog component runs against the locally bundled page. Only the log text and copy command cross the bridge.
struct BattleLogPane: NSViewRepresentable {
    let lines: [String]

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
        context.coordinator.update(lines.reversed().joined(separator: "\n"), in: view)
    }

    static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "copyBattleLog", contentWorld: .page)
        view.navigationDelegate = nil
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
        private let page = Bundle.main.url(forResource: "native-fight-log", withExtension: "html")
        private var pending = ""
        private var displayed: String?
        private var ready = false

        func load(_ view: WKWebView) {
            ready = false
            displayed = nil
            if let page { view.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent()) }
        }

        func update(_ text: String, in view: WKWebView) {
            pending = text
            guard ready, displayed != text else { return }
            displayed = text
            Task { [weak self, weak view] in
                guard let self, let view, ready, displayed == text else { return }
                do {
                    _ = try await view.callAsyncJavaScript("window.hocSetBattleLog(text)", arguments: ["text": text],
                                                           in: nil, contentWorld: .page)
                } catch {
                    if displayed == text { displayed = nil }
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
