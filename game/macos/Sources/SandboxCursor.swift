import AppKit
import SwiftUI

private struct SandboxCursorKey: EnvironmentKey {
    static let defaultValue: SandboxCursorController? = nil
}

extension EnvironmentValues {
    var sandboxCursor: SandboxCursorController? {
        get { self[SandboxCursorKey.self] }
        set { self[SandboxCursorKey.self] = newValue }
    }
}

@MainActor
final class SandboxCursorController {
    fileprivate weak var surface: SandboxCursorHost.Surface?
    private var board: SandboxCursorMode = .standard
    private var controls: Set<UUID> = []

    fileprivate var mode: SandboxCursorMode { controls.isEmpty ? board : .interactive }

    func setBoard(_ next: SandboxCursorMode) {
        let previous = mode
        board = next
        if mode != previous { surface?.scheduleCursorRefresh() }
    }

    func setControl(_ id: UUID, hovering: Bool) {
        let previous = mode
        if hovering { controls.insert(id) }
        else { controls.remove(id) }
        if mode != previous { surface?.scheduleCursorRefresh() }
    }
}

struct SandboxCursorTarget: ViewModifier {
    var hovering: Bool? = nil
    @Environment(\.sandboxCursor) private var cursor
    @Environment(\.isEnabled) private var enabled
    @State private var id = UUID()
    @State private var pointerInside = false

    func body(content: Content) -> some View {
        if let cursor {
            let active = enabled && (hovering ?? pointerInside)
            Group {
                if hovering == nil {
                    content.onHover { pointerInside = $0 }
                } else {
                    content
                }
            }
            .onChange(of: active, initial: true) { cursor.setControl(id, hovering: active) }
            .onDisappear { cursor.setControl(id, hovering: false) }
        } else {
            content
        }
    }
}

struct SandboxCursorHost: NSViewRepresentable {
    let controller: SandboxCursorController

    func makeNSView(context: Context) -> Surface {
        let view = Surface(frame: .zero)
        view.controller = controller
        controller.surface = view
        return view
    }

    func updateNSView(_ view: Surface, context: Context) {
        view.scheduleCursorRefresh()
    }

    static func dismantleNSView(_ view: Surface, coordinator: ()) {
        view.releaseCursor()
        if view.controller?.surface === view { view.controller?.surface = nil }
        view.controller = nil
    }

    final class Surface: NSView {
        weak var controller: SandboxCursorController?
        private var tracking: NSTrackingArea?
        private var installed: NSCursor?
        private var pendingRefresh = false

        override func hitTest(_ point: NSPoint) -> NSView? { nil }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            let center = NotificationCenter.default
            center.removeObserver(self, name: NSWindow.didBecomeKeyNotification, object: nil)
            if let window {
                center.addObserver(self, selector: #selector(windowBecameKey(_:)),
                                   name: NSWindow.didBecomeKeyNotification, object: window)
                scheduleCursorRefresh()
            }
        }

        @objc private func windowBecameKey(_ notification: Notification) {
            scheduleCursorRefresh()
        }

        override func updateTrackingAreas() {
            super.updateTrackingAreas()
            if tracking == nil {
                let area = NSTrackingArea(rect: .zero, options: [.cursorUpdate, .mouseMoved, .mouseEnteredAndExited,
                                                               .activeInKeyWindow, .inVisibleRect],
                                          owner: self, userInfo: nil)
                addTrackingArea(area)
                tracking = area
            }
            scheduleCursorRefresh()
        }

        override func resetCursorRects() {
            super.resetCursorRects()
            scheduleCursorRefresh()
        }

        override func cursorUpdate(with event: NSEvent) { scheduleCursorRefresh() }
        override func mouseEntered(with event: NSEvent) { scheduleCursorRefresh() }
        override func mouseMoved(with event: NSEvent) { scheduleCursorRefresh() }
        override func mouseExited(with event: NSEvent) { releaseCursor() }

        func scheduleCursorRefresh() {
            guard !pendingRefresh else { return }
            pendingRefresh = true
            // AppKit can install its default cursor as part of the same mouse or layout update.
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                pendingRefresh = false
                refreshCursor()
            }
        }

        private func refreshCursor() {
            guard let controller, let window, window.isKeyWindow else { return }
            let point = window.mouseLocationOutsideOfEventStream
            guard visibleRect.contains(convert(point, from: nil)) else { return }
            let content = window.contentView
            var hit = content?.hitTest(content?.superview?.convert(point, from: nil) ?? point)
            while let view = hit {
                if let field = view as? NSTextField, field.isEnabled && field.isEditable { return }
                if let editor = view as? NSTextView, editor.isEditable { return }
                hit = view.superview
            }
            let cursor = SandboxCursorArtwork.cursor(for: controller.mode)
            cursor.set()
            installed = cursor
        }

        func releaseCursor() {
            if let installed, window?.isKeyWindow == true, NSCursor.current === installed {
                NSCursor.arrow.set()
            }
            installed = nil
        }
    }
}

@MainActor
enum SandboxCursorArtwork {
    private static var cache: [SandboxCursorMode: NSCursor] = [:]

    static func cursor(for mode: SandboxCursorMode) -> NSCursor {
        if let cursor = cache[mode] { return cursor }
        let (asset, fallback): (String, NSCursor) = switch mode {
        case .standard: ("cursor_default", .arrow)
        case .interactive: ("cursor_interactive_point_x", .pointingHand)
        case .melee: ("cursor_melee", .crosshair)
        case .ranged: ("cursor_ranged", .crosshair)
        case .magic: ("cursor_magic", .crosshair)
        }
        guard let bitmap = BattleResources.cgImage(asset) else { return fallback }
        let size = CGSize(width: bitmap.width, height: bitmap.height)
        let cursor = if case let .melee(direction) = mode {
            sword(bitmap, size: size, direction: direction) ?? fallback
        } else {
            NSCursor(image: NSImage(cgImage: bitmap, size: size), hotSpot: .zero)
        }
        cache[mode] = cursor
        return cursor
    }

    private static func sword(_ bitmap: CGImage, size: CGSize, direction: SandboxCursorMode.MeleeDirection) -> NSCursor? {
        // The source points from the lower right to the upper left. Keep its blade tip on the click point.
        let rotation = CGAffineTransform(rotationAngle: direction.angle - atan2(23, -18))
        let source = CGRect(origin: .zero, size: size)
        let bounds = source.applying(rotation).integral
        let tip = CGPoint(x: 0, y: size.height).applying(rotation)
        let hotspot = CGPoint(x: min(bounds.width - 1, (tip.x - bounds.minX).rounded()),
                              y: min(bounds.height - 1, (bounds.maxY - tip.y).rounded()))
        guard let canvas = CGContext(data: nil, width: Int(bounds.width), height: Int(bounds.height),
                                     bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        canvas.translateBy(x: -bounds.minX, y: -bounds.minY)
        canvas.concatenate(rotation)
        canvas.draw(bitmap, in: source)
        guard let rotated = canvas.makeImage() else { return nil }
        return NSCursor(image: NSImage(cgImage: rotated, size: bounds.size), hotSpot: hotspot)
    }
}
