import AppKit
import Observation
import UserNotifications
import WebKit

private enum RankedAlert: String, CaseIterable {
    case matchReady = "hoc-match-ready"
    case yourTurn = "hoc-your-turn"

    var title: String {
        switch self {
        case .matchReady: "Ranked match ready"
        case .yourTurn: "Your turn"
        }
    }

    var body: String {
        switch self {
        case .matchReady: "Return to Ranked Arena to accept the match."
        case .yourTurn: "Return to the battle to give your unit an order."
        }
    }
}

@MainActor
@Observable
final class RankedNotifications: NSObject, UNUserNotificationCenterDelegate {
    private static let enabledKey = "hoc.ranked.notifications"

    private(set) var enabled: Bool
    private(set) var authorization: UNAuthorizationStatus = .notDetermined
    private(set) var requesting = false
    private(set) var problem: String?
    private(set) var openedAlert = 0
    @ObservationIgnored private var liveAlerts: [RankedAlert: UUID] = [:]
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.enabled = defaults.bool(forKey: Self.enabledKey)
    }

    var permitted: Bool {
        enabled && (authorization == .authorized || authorization == .provisional)
    }

    func register() {
        UNUserNotificationCenter.current().delegate = self
    }

    func refreshAuthorization() async {
        authorization = await readAuthorization()
        if !permitted { clear() }
    }

    func setEnabled(_ enabled: Bool) async {
        guard !requesting else { return }
        self.enabled = enabled
        defaults.set(enabled, forKey: Self.enabledKey)
        problem = nil
        guard enabled else {
            clear()
            return
        }
        requesting = true
        defer { requesting = false }
        let center = UNUserNotificationCenter.current()
        if await readAuthorization() == .notDetermined {
            do {
                _ = try await center.requestAuthorization(options: .alert)
            } catch {
                problem = "Couldn’t request permission for notifications."
                self.enabled = false
                defaults.set(false, forKey: Self.enabledKey)
            }
        }
        await refreshAuthorization()
    }

    private func readAuthorization() async -> UNAuthorizationStatus {
        await withCheckedContinuation { continuation in
            UNUserNotificationCenter.current().getNotificationSettings { @Sendable settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
    }

    fileprivate func show(_ alert: RankedAlert, id: UUID) {
        guard permitted, !NSApp.isActive, liveAlerts[alert] != id else { return }
        liveAlerts[alert] = id
        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.body
        let center = UNUserNotificationCenter.current()
        center.removeDeliveredNotifications(withIdentifiers: [alert.rawValue])
        center.add(UNNotificationRequest(identifier: alert.rawValue, content: content, trigger: nil))
    }

    fileprivate func close(_ alert: RankedAlert, id: UUID) {
        guard liveAlerts[alert] == id else { return }
        liveAlerts[alert] = nil
        remove([alert.rawValue])
    }

    func clear() {
        liveAlerts.removeAll()
        remove(RankedAlert.allCases.map(\.rawValue))
    }

    private func remove(_ identifiers: [String]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        center.removeDeliveredNotifications(withIdentifiers: identifiers)
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              RankedAlert(rawValue: response.notification.request.identifier) != nil else { return }
        await openRanked()
    }

    private func openRanked() {
        clear()
        openedAlert += 1
        NSApp.activate()
        if let window = NSApp.windows.first(where: { $0.title == GameWindow.title || $0.title == GameWindow.sandboxTitle }) {
            if window.isMiniaturized { window.deminiaturize(nil) }
            window.makeKeyAndOrderFront(nil)
        }
    }
}

@MainActor
final class RankedNotificationHandler: NSObject, WKScriptMessageHandler {
    static let name = "hocMacRankedNotification"
    let origin: String
    let notifications: RankedNotifications

    init(origin: String, notifications: RankedNotifications) {
        self.origin = origin
        self.notifications = notifications
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard rankedMessageOrigin(message) == origin,
              let data = message.body as? [String: String],
              let tag = data["tag"], let alert = RankedAlert(rawValue: tag),
              let value = data["id"], let id = UUID(uuidString: value) else { return }
        switch data["action"] {
        case "show": notifications.show(alert, id: id)
        case "close": notifications.close(alert, id: id)
        default: break
        }
    }

    // Ranked runs the hosted client. Its existing browser alerts do not require a separate web release.
    static func script(permitted: Bool) -> String {
        """
        let rankedNotificationsAllowed = \(permitted);
        window.hocMacSyncRankedNotifications = (allowed) => {
            rankedNotificationsAllowed = allowed === true;
        };
        const rankedNotificationHandler = window.webkit.messageHandlers.\(name);
        const rankedNotificationTags = new Set([\(RankedAlert.allCases.map { "\"\($0.rawValue)\"" }.joined(separator: ", "))]);
        window.Notification = class {
            static get permission() {
                return rankedNotificationsAllowed ? "granted" : "denied";
            }
            static requestPermission(callback) {
                if (typeof callback === "function") callback(this.permission);
                return Promise.resolve(this.permission);
            }
            #tag;
            #id;
            constructor(_title, options = {}) {
                if (!rankedNotificationsAllowed || !rankedNotificationTags.has(options.tag)) return;
                this.#tag = options.tag;
                this.#id = crypto.randomUUID();
                rankedNotificationHandler.postMessage({ action: "show", tag: this.#tag, id: this.#id });
            }
            close() {
                if (!this.#id) return;
                rankedNotificationHandler.postMessage({ action: "close", tag: this.#tag, id: this.#id });
                this.#id = undefined;
            }
        };
        """
    }
}

@MainActor
func rankedMessageOrigin(_ message: WKScriptMessage) -> String? {
    guard message.frameInfo.isMainFrame else { return nil }
    let securityOrigin = message.frameInfo.securityOrigin
    var source = URLComponents()
    source.scheme = securityOrigin.protocol
    source.host = securityOrigin.host
    if securityOrigin.port != 0 && securityOrigin.port != 443 { source.port = securityOrigin.port }
    return source.string
}

@MainActor
final class GameAppDelegate: NSObject, NSApplicationDelegate {
    let notifications = RankedNotifications()

    func applicationWillFinishLaunching(_ notification: Notification) {
        notifications.register()
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        Task { await notifications.refreshAuthorization() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        notifications.clear()
    }
}
