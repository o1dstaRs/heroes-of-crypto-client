import AppKit
import SwiftUI

/// Observes the board's pointer and shortcuts without intercepting primary clicks or drags.
struct BattlefieldSecondaryClick: NSViewRepresentable {
    let enabled: Bool
    let pointerMoved: (CGPoint?) -> Void
    let rotateFireWall: (() -> Void)?
    let inspect: (CGPoint) -> Bool

    func makeNSView(context: Context) -> EventView { EventView() }

    func updateNSView(_ view: EventView, context: Context) {
        let resumed = enabled && view.inspect == nil
        view.pointerMoved = pointerMoved
        view.inspect = enabled ? inspect : nil
        view.rotateFireWall = rotateFireWall
        if resumed { view.refreshPointerAfterLayout() }
    }

    static func dismantleNSView(_ view: EventView, coordinator: ()) {
        view.pointerMoved = nil
        view.stopMonitoring()
    }

    final class EventView: NSView {
        var pointerMoved: ((CGPoint?) -> Void)?
        var inspect: ((CGPoint) -> Bool)?
        var rotateFireWall: (() -> Void)?
        private var tracking: NSTrackingArea?
        private var monitor: Any?
        private var shiftDown = false

        override var isFlipped: Bool { true }
        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func updateTrackingAreas() {
            super.updateTrackingAreas()
            if tracking == nil {
                let area = NSTrackingArea(rect: .zero, options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                          owner: self, userInfo: nil)
                addTrackingArea(area)
                tracking = area
            }
        }

        override func mouseEntered(with event: NSEvent) { mouseMoved(with: event) }

        override func mouseMoved(with event: NSEvent) { updatePointer(at: event.locationInWindow) }

        override func mouseExited(with event: NSEvent) { pointerMoved?(nil) }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            let center = NotificationCenter.default
            center.removeObserver(self, name: NSWindow.didBecomeKeyNotification, object: nil)
            center.removeObserver(self, name: NSWindow.didResignKeyNotification, object: nil)
            guard let window else { return }
            center.addObserver(self, selector: #selector(windowBecameKey(_:)), name: NSWindow.didBecomeKeyNotification, object: window)
            center.addObserver(self, selector: #selector(windowResignedKey(_:)), name: NSWindow.didResignKeyNotification, object: window)
            shiftDown = NSEvent.modifierFlags.contains(.shift)
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.rightMouseDown, .leftMouseDown, .flagsChanged]) { [weak self] event in
                guard let self, let window = self.window else { return event }
                if event.type == .flagsChanged {
                    let pressed = event.modifierFlags.contains(.shift)
                    let wentDown = pressed && !self.shiftDown
                    self.shiftDown = pressed
                    if wentDown && window.isKeyWindow { self.rotateFireWall?() }
                    return event
                }
                guard event.window === window, let inspect = self.inspect else { return event }
                let controlClick = event.type == .leftMouseDown && event.modifierFlags.contains(.control)
                guard event.type == .rightMouseDown || controlClick else { return event }
                let point = self.convert(event.locationInWindow, from: nil)
                guard self.bounds.contains(point) else { return event }
                return inspect(point) || controlClick ? nil : event
            }
        }

        @objc private func windowBecameKey(_ notification: Notification) {
            if let window { updatePointer(at: window.mouseLocationOutsideOfEventStream) }
        }

        @objc private func windowResignedKey(_ notification: Notification) {
            pointerMoved?(nil)
        }

        func refreshPointerAfterLayout() {
            // Resuming board input may leave the pointer still over the same unit.
            DispatchQueue.main.async { [weak self] in
                guard let self, inspect != nil, let window, window.isKeyWindow else { return }
                updatePointer(at: window.mouseLocationOutsideOfEventStream)
            }
        }

        private func updatePointer(at location: NSPoint) {
            let point = convert(location, from: nil)
            pointerMoved?(visibleRect.contains(point) ? point : nil)
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
    }
}
