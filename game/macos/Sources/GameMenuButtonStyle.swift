import SwiftUI

struct GameMenuButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    let prominent: Bool
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: 7)
        return configuration.label
            .font(.system(size: 14, weight: .semibold))
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 15)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44)
            .foregroundStyle(prominent ? BattlePalette.backdrop : BattlePalette.parchment)
            .background(
                (prominent ? BattlePalette.gold : BattlePalette.color(0x241910))
                    .opacity(configuration.isPressed ? 0.7 : 1),
                in: shape
            )
            .overlay { shape.strokeBorder(prominent ? BattlePalette.gold : BattlePalette.bronze) }
            .contentShape(shape)
            .opacity(enabled ? 1 : 0.48)
            .modifier(BattleHoverFeedback(pressed: configuration.isPressed))
    }
}
