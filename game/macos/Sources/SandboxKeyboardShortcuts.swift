import AppKit
import Carbon.HIToolbox
import SwiftUI

enum SandboxShortcut {
    case d, s, c

    init?(_ event: NSEvent) {
        guard event.type == .keyDown, !event.isARepeat,
              event.modifierFlags.isDisjoint(with: [.command, .control, .option]) else { return nil }
        // A physical S key reports the same code when it types Ы.
        switch Int(event.keyCode) {
        case kVK_ANSI_D: self = .d
        case kVK_ANSI_S: self = .s
        case kVK_ANSI_C: self = .c
        default: return nil
        }
    }
}

struct SandboxKeyboardShortcuts: NSViewRepresentable {
    let perform: (SandboxShortcut) -> Bool

    func makeNSView(context: Context) -> EventView { EventView() }

    func updateNSView(_ view: EventView, context: Context) {
        view.perform = perform
    }

    static func dismantleNSView(_ view: EventView, coordinator: ()) {
        view.stopMonitoring()
    }

    final class EventView: NSView {
        var perform: ((SandboxShortcut) -> Bool)?
        private var monitor: Any?

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, let window = self.window, window.isKeyWindow, event.window === window,
                      let shortcut = SandboxShortcut(event) else { return event }
                let responder = window.firstResponder
                if let editor = responder as? NSTextView, editor.isEditable { return event }
                if let field = responder as? NSTextField, field.isEditable { return event }
                return self.perform?(shortcut) == true ? nil : event
            }
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
    }
}

struct SandboxOptionMonitor: NSViewRepresentable {
    @Binding var isHeld: Bool

    func makeNSView(context: Context) -> EventView { EventView() }

    func updateNSView(_ view: EventView, context: Context) {
        view.changed = { isHeld = $0 }
    }

    static func dismantleNSView(_ view: EventView, coordinator: ()) {
        view.stopMonitoring()
    }

    final class EventView: NSView {
        var changed: ((Bool) -> Void)?
        private var monitor: Any?

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard let window else { return }
            let notifications = NotificationCenter.default
            notifications.addObserver(self, selector: #selector(focusChanged), name: NSWindow.didBecomeKeyNotification, object: window)
            notifications.addObserver(self, selector: #selector(focusChanged), name: NSWindow.didResignKeyNotification, object: window)
            monitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
                if let self, let window = self.window, window.isKeyWindow, event.window == nil || event.window === window {
                    self.changed?(event.modifierFlags.contains(.option))
                }
                return event
            }
        }

        @objc private func focusChanged(_ notification: Notification) {
            changed?(notification.name == NSWindow.didBecomeKeyNotification && NSEvent.modifierFlags.contains(.option))
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
            NotificationCenter.default.removeObserver(self)
        }
    }
}

struct BattleQueueWheelMonitor: NSViewRepresentable {
    let scroll: (CGFloat) -> Void

    func makeNSView(context: Context) -> EventView { EventView() }

    func updateNSView(_ view: EventView, context: Context) { view.scroll = scroll }

    static func dismantleNSView(_ view: EventView, coordinator: ()) { view.stopMonitoring() }

    final class EventView: NSView {
        var scroll: ((CGFloat) -> Void)?
        private var monitor: Any?

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
                guard let self, event.window === window, event.modifierFlags.contains(.option),
                      bounds.contains(convert(event.locationInWindow, from: nil)),
                      abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX) else { return event }
                scroll?(-event.scrollingDeltaY * (event.hasPreciseScrollingDeltas ? 1 : 24))
                return nil
            }
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
    }
}
