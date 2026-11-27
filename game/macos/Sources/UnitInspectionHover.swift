import SwiftUI

@MainActor
@Observable
private final class UnitInspectionHover {
    struct Entry {
        let owner: UUID
        let frame: CGRect
        let detail: UnitInspectionDescription
    }

    var current: Entry?

    func dismiss(_ owner: UUID) {
        if current?.owner == owner { current = nil }
    }
}

private struct UnitInspectionHoverKey: EnvironmentKey {
    static let defaultValue: UnitInspectionHover? = nil
}

extension View {
    func unitInspectionHover(_ detail: UnitInspectionDescription, magnifies: Bool = false) -> some View {
        modifier(UnitInspectionHoverTarget(detail: detail, magnifies: magnifies))
    }
}

struct UnitInspectionHoverHost: ViewModifier {
    var enabled = true
    @State private var hover = UnitInspectionHover()

    func body(content: Content) -> some View {
        content
            .environment(\.unitInspectionHover, hover)
            .overlay {
                if enabled, let entry = hover.current {
                    GeometryReader { geometry in
                        let origin = geometry.frame(in: .global).origin
                        let anchor = entry.frame.offsetBy(dx: -origin.x, dy: -origin.y)
                        if CGRect(origin: .zero, size: geometry.size).intersects(anchor) {
                            UnitTooltipLayout(anchor: anchor) {
                                UnitTooltip(detail: entry.detail)
                            }
                        }
                    }
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)
                }
            }
            .onChange(of: enabled) { if !enabled { hover.current = nil } }
    }
}

private extension EnvironmentValues {
    var unitInspectionHover: UnitInspectionHover? {
        get { self[UnitInspectionHoverKey.self] }
        set { self[UnitInspectionHoverKey.self] = newValue }
    }
}

private struct UnitInspectionHoverTarget: ViewModifier {
    let detail: UnitInspectionDescription
    let magnifies: Bool
    @Environment(\.unitInspectionHover) private var hover
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var owner = UUID()
    @State private var frame = CGRect.zero
    @State private var inside = false

    func body(content: Content) -> some View {
        content
            .brightness(inside ? 0.12 : 0)
            .scaleEffect(magnifies && inside && !reduceMotion ? 1.05 : 1)
            .contentShape(Rectangle())
            .accessibilityHint(Text(verbatim: detail.accessibilityHint))
            .modifier(SandboxCursorTarget(hovering: inside))
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: {
                frame = $0
                if inside && (hover?.current?.owner ?? owner) == owner { show() }
            }
            .onHover { entered in
                inside = entered
                if entered { show() }
                else { hover?.dismiss(owner) }
            }
            .onChange(of: detail) { if inside { show() } }
            .onDisappear { hover?.dismiss(owner) }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.13), value: inside)
    }

    private func show() {
        guard !frame.isEmpty else { return }
        hover?.current = UnitInspectionHover.Entry(owner: owner, frame: frame, detail: detail)
    }
}

private struct UnitTooltip: View {
    let detail: UnitInspectionDescription

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(verbatim: detail.title)
                .font(BattleResources.display(13))
                .foregroundStyle(BattlePalette.gold)
            if !detail.description.isEmpty {
                Text(verbatim: detail.description)
                    .foregroundStyle(BattlePalette.parchment)
            }
            if let note = detail.note {
                Text(verbatim: note)
                    .foregroundStyle(BattlePalette.sidebarTitle)
            }
        }
        .font(.system(size: 12))
        .fixedSize(horizontal: false, vertical: true)
        .padding(11)
        .background(BattlePalette.color(0x21190f), in: RoundedRectangle(cornerRadius: 7))
        .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(BattlePalette.bronze, lineWidth: 1) }
        .shadow(color: .black.opacity(0.65), radius: 7, y: 3)
    }
}

private struct UnitTooltipLayout: Layout {
    let anchor: CGRect

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let detail = subviews.first else { return }
        let margin: CGFloat = 8
        let width = min(274, max(0, bounds.width - 2 * margin))
        let offered = ProposedViewSize(width: width, height: nil)
        let size = detail.sizeThatFits(offered)
        let right = anchor.maxX + margin
        let left = anchor.minX - margin - size.width
        let rawX = right + size.width <= bounds.width - margin ? right : left
        let x = max(margin, min(rawX, bounds.width - margin - size.width))
        let y = max(margin, min(anchor.midY - size.height / 2, bounds.height - margin - size.height))
        detail.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), anchor: .topLeading, proposal: offered)
    }
}
