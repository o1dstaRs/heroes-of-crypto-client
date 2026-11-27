import AppKit
import SwiftUI

/// Observes secondary clicks within the board without sitting over its primary-click and drag targets.
struct BattlefieldSecondaryClick: NSViewRepresentable {
    let enabled: Bool
    let inspect: (CGPoint) -> Bool

    func makeNSView(context: Context) -> EventView { EventView() }

    func updateNSView(_ view: EventView, context: Context) {
        view.inspect = enabled ? inspect : nil
    }

    static func dismantleNSView(_ view: EventView, coordinator: ()) {
        view.stopMonitoring()
    }

    final class EventView: NSView {
        var inspect: ((CGPoint) -> Bool)?
        private var monitor: Any?

        override var isFlipped: Bool { true }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.rightMouseDown, .leftMouseDown]) { [weak self] event in
                guard let self, let window = self.window, event.window === window, let inspect = self.inspect else { return event }
                let controlClick = event.type == .leftMouseDown && event.modifierFlags.contains(.control)
                guard event.type == .rightMouseDown || controlClick else { return event }
                let point = self.convert(event.locationInWindow, from: nil)
                guard self.bounds.contains(point) else { return event }
                return inspect(point) || controlClick ? nil : event
            }
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
    }
}
