import AppKit
import SwiftUI

@MainActor
enum GameWindow {
    static let title = "Heroes of Crypto"
    static let sandboxTitle = "Sandbox"

    static var current: NSWindow? {
        NSApp.windows.first { $0.isVisible && ($0.title == title || $0.title == sandboxTitle) }
    }

    static func toggleFullScreen() {
        current?.toggleFullScreen(nil)
    }
}

struct GameHome: View {
    let account: NativeAccountController
    let music: StartupMusic
    let signInTitle: String?
    let openArena: () -> Void
    let openLobby: () -> Void
    let openSkirmish: () -> Void
    let openStatistics: () -> Void
    let openPremium: () -> Void
    let closeSignIn: () -> Void

    @Environment(\.appearsActive) private var active
    @State private var cursor = SandboxCursorController()

    var body: some View {
        GeometryReader { viewport in
            ScrollView {
                Group {
                    if let signInTitle {
                        AccountPanel(controller: account, destinationTitle: signInTitle)
                            .frame(maxWidth: 390)
                            .onExitCommand(perform: closeSignIn)
                    } else {
                        modeMenu(viewport.size)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.top, 24)
                .padding(.bottom, 72)
                .frame(minHeight: viewport.size.height)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background { backdrop(viewport.size) }
            .overlay(alignment: .bottom) { footer }
        }
        .background { SandboxCursorHost(controller: cursor).accessibilityHidden(true) }
        .environment(\.sandboxCursor, cursor)
        .foregroundStyle(BattlePalette.parchment)
        .onChange(of: active, initial: true) { _, isActive in music.setActive(isActive) }
        .onDisappear { music.setActive(false) }
    }

    private func modeMenu(_ size: CGSize) -> some View {
        let titleSize = min(40, max(27, size.width * 0.033))
        let inset = min(82, max(0, size.width * 0.075 - 28))
        return HStack(spacing: 0) {
            branding(width: min(440, size.width * 0.37))
            Spacer(minLength: 24)
            VStack(alignment: .trailing, spacing: 9) {
                GameModeButton(title: "Ranked Arena", detail: "Find an opponent and climb the ladder",
                               titleSize: titleSize, action: openArena)
                GameModeButton(title: "Lobby", detail: "Create or join a custom game",
                               titleSize: titleSize, action: openLobby)
                GameModeButton(title: "Local Sandbox", detail: "Build armies and battle offline",
                               titleSize: titleSize, action: openSkirmish)
                GameModeButton(title: "Statistics", detail: "Player rankings and season results",
                               titleSize: titleSize, action: openStatistics)
                GameModeButton(title: "Premium", detail: "Explore battle stats, build armies, and ask Premium AI",
                               titleSize: titleSize, premium: true, action: openPremium)
            }
            .frame(width: min(310, size.width * 0.42))
        }
        .padding(.horizontal, inset)
    }

    private func branding(width: CGFloat) -> some View {
        Group {
            if let logo = BattleResources.image("startup-logo") {
                Image(nsImage: logo)
                    .resizable()
                    .scaledToFit()
                    .accessibilityLabel("Heroes of Crypto")
            } else {
                Text("Heroes of Crypto")
                    .font(BattleResources.display(width / 8.5))
            }
        }
        .frame(width: width)
        .shadow(color: .black.opacity(0.86), radius: 16, y: 6)
        .accessibilityAddTraits(.isHeader)
    }

    private var footer: some View {
        HStack(spacing: 8) {
            if music.available { MusicControl(music: music) }
            Spacer()
            SettingsLink {
                Image(systemName: "gearshape")
            }
            .buttonStyle(GameMenuButtonStyle(prominent: false))
            .accessibilityLabel("Settings")
            .help("Settings")
            Button(action: GameWindow.toggleFullScreen) {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
            }
            .buttonStyle(GameMenuButtonStyle(prominent: false))
            .accessibilityLabel("Toggle full screen")
            .help("Toggle full screen")
        }
        .padding(.horizontal, 21)
        .padding(.vertical, 12)
    }

    private func backdrop(_ size: CGSize) -> some View {
        ZStack {
            BattlePalette.backdrop
            if let art = BattleResources.image("startup-battle") {
                Image(nsImage: art)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size.width, height: size.height)
                    .clipped()
            }
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.24), location: 0),
                    .init(color: .clear, location: 0.48),
                    .init(color: .black.opacity(0.12), location: 0.72),
                    .init(color: BattlePalette.backdrop.opacity(0.87), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            if signInTitle == nil {
                RadialGradient(
                    stops: [
                        .init(color: BattlePalette.backdrop.opacity(0.85), location: 0),
                        .init(color: BattlePalette.backdrop.opacity(0.65), location: 0.43),
                        .init(color: .clear, location: 1),
                    ],
                    center: UnitPoint(x: 0.91, y: 0.47),
                    startRadius: 0, endRadius: min(size.width * 0.49, size.height * 0.8)
                )
            }
        }
        .accessibilityHidden(true)
    }
}

private struct GameModeButton: View {
    let title: String
    let detail: String
    let titleSize: CGFloat
    var premium = false
    let action: () -> Void

    @State private var hovered = false
    @FocusState private var focused: Bool

    var body: some View {
        Button(action: action) {
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 9) {
                    if premium, let url = Bundle.main.url(forResource: "premium", withExtension: "svg"),
                       let icon = NSImage(contentsOf: url) {
                        Image(nsImage: icon).resizable().scaledToFit()
                            .frame(width: titleSize * 0.92, height: titleSize * 0.92)
                            .accessibilityHidden(true)
                    }
                    Text(title)
                        .font(BattleResources.display(titleSize))
                        .foregroundStyle(titleColor)
                }
                Text(detail)
                    .font(.system(size: 13))
                    .foregroundStyle(BattlePalette.sidebarTitle)
            }
            .multilineTextAlignment(.trailing)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .shadow(color: .black, radius: 4, y: 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .focused($focused)
        .onHover { hovered = $0 }
        .modifier(SandboxCursorTarget(hovering: hovered))
        .accessibilityLabel(title)
        .accessibilityHint(detail)
    }

    private var titleColor: Color {
        if premium { return BattlePalette.color(hovered || focused ? 0xffe0bf : 0xffad66) }
        return hovered || focused ? BattlePalette.gold : BattlePalette.parchment
    }
}

private struct MusicControl: View {
    let music: StartupMusic

    var body: some View {
        HStack(spacing: 9) {
            Button(action: music.toggleMute) {
                Image(systemName: music.muted || music.volume == 0 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .modifier(SandboxCursorTarget())
            .accessibilityLabel(music.muted || music.volume == 0 ? "Unmute music" : "Mute music")
            .help(music.muted || music.volume == 0 ? "Unmute music" : "Mute music")
            Slider(value: Binding(get: { music.muted ? 0 : music.volume }, set: { music.setVolume($0) }), in: 0...1) {
                Text("Music volume")
            }
            .labelsHidden()
            .frame(width: 86)
            .modifier(SandboxCursorTarget())
        }
        .tint(BattlePalette.gold)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(BattlePalette.backdrop.opacity(0.94), in: Capsule())
        .overlay { Capsule().strokeBorder(BattlePalette.bronze) }
    }
}

private struct AccountPanel: View {
    private enum Mode { case signIn, register, recover, reset }
    private enum Field: Hashable { case username, email, password, code, resetLink }

    let controller: NativeAccountController
    let destinationTitle: String

    @State private var mode = Mode.signIn
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var resetLink = ""
    @State private var googleSignIn: Task<Void, Never>?
    @FocusState private var focus: Field?

    private var busy: Bool { controller.activity != nil }
    private var emailAddress: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var emailValid: Bool { emailAddress.wholeMatch(of: /[^\s@]+@[^\s@]+\.[^\s@]+/) != nil }
    private var codeValue: String { code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
    private var strongPassword: Bool {
        password.wholeMatch(of: /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&])[A-Za-z0-9@$!%*?&]{8,50}/) != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            if controller.checking {
                title(destinationTitle)
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Checking your session…").foregroundStyle(BattlePalette.sidebarTitle)
                }
            } else if let account = controller.account, !account.verified {
                verify(account)
            } else {
                switch mode {
                case .signIn, .register: signInForm
                case .recover: recoveryForm
                case .reset: resetForm
                }
            }

            if let activity = controller.activity, activity != .restore {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(activity.rawValue).font(.subheadline)
                    Spacer(minLength: 2)
                    if activity == .google {
                        Button("Cancel", action: cancelGoogleSignIn).buttonStyle(.borderless)
                            .modifier(SandboxCursorTarget())
                    }
                }
                .foregroundStyle(BattlePalette.sidebarTitle)
            }
            if let notice = controller.notice { note(notice, icon: "checkmark.circle", color: BattlePalette.sidebarTitle) }
            if let problem = controller.problem {
                note(problem, icon: "exclamationmark.circle", color: Color(red: 1, green: 0.65, blue: 0.52))
            }
        }
        .padding(25)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BattlePalette.color(0x140e0a).opacity(0.97), in: RoundedRectangle(cornerRadius: 13))
        .overlay {
            RoundedRectangle(cornerRadius: 13).strokeBorder(BattlePalette.gold.opacity(0.46))
        }
        .shadow(color: .black.opacity(0.72), radius: 24, y: 10)
        .onChange(of: controller.account) { _, account in
            if let account {
                clearSecretFields()
                focus = account.verified ? nil : .code
            } else {
                switchTo(.signIn)
            }
        }
        .onDisappear {
            cancelGoogleSignIn()
            clearSecretFields()
        }
    }

    private var signInForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            title(mode == .register ? "Create an account" : "Sign in to open \(destinationTitle)")
            googleButton
            HStack(spacing: 11) {
                Rectangle().fill(BattlePalette.bronze.opacity(0.7)).frame(height: 1)
                Text("or use email").font(.caption).foregroundStyle(BattlePalette.sidebarTitle).fixedSize()
                Rectangle().fill(BattlePalette.bronze.opacity(0.7)).frame(height: 1)
            }
            if mode == .register {
                input("Username", field: .username) { TextField("3–42 letters or numbers", text: $username) }
            }
            emailInput
            passwordInput(newPassword: mode == .register)
            if mode == .register { passwordRequirements }
            primary(mode == .register ? "Create Account" : "Sign In",
                    enabled: emailValid && (mode == .register
                        ? strongPassword && username.wholeMatch(of: /[A-Za-z0-9]{3,42}/) != nil
                        : !password.isEmpty)) {
                await controller.signIn(email: emailAddress, password: password,
                                        username: mode == .register ? username : nil)
            }
            HStack {
                textButton(mode == .register ? "Back to sign in" : "Create an account") {
                    switchTo(mode == .register ? .signIn : .register)
                }
                Spacer()
                if mode == .signIn { textButton("Forgot password?") { switchTo(.recover) } }
            }
        }
    }

    private var googleButton: some View {
        Button {
            let window = GameWindow.current
            googleSignIn = Task { await controller.signInWithGoogle(window: window) }
        } label: {
            if let url = Bundle.main.url(forResource: "google-sign-in", withExtension: "png"),
               let image = NSImage(contentsOf: url) {
                Image(nsImage: image).resizable().scaledToFit().frame(width: 180, height: 40)
            } else {
                Text("Sign in with Google").frame(height: 40)
            }
        }
        .buttonStyle(.plain)
        .modifier(SandboxCursorTarget())
        .disabled(busy)
        .opacity(busy ? 0.45 : 1)
        .frame(maxWidth: .infinity)
        .accessibilityLabel("Sign in with Google")
        .accessibilityHint("Opens system sign-in and returns to the game")
    }

    private func cancelGoogleSignIn() {
        googleSignIn?.cancel()
        googleSignIn = nil
        controller.cancelGoogle()
    }

    private func verify(_ account: NativeAccount) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Verify your email")
            Text("Enter the code sent to \(account.email).")
                .font(.subheadline).foregroundStyle(BattlePalette.sidebarTitle)
            input("Verification code", field: .code) {
                TextField("", text: $code).textContentType(.oneTimeCode)
            }
            primary("Verify Email", enabled: codeValue.wholeMatch(of: /[A-Z0-9]{6}/) != nil) {
                await controller.verify(code: codeValue)
            }
            HStack {
                textButton("Resend code") { Task { await controller.resendCode() } }
                Spacer()
                textButton("Back to sign in") { Task { await controller.signOut() } }
            }
        }
    }

    private var recoveryForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Reset your password")
            emailInput
            primary("Send Reset Link", enabled: emailValid) {
                if await controller.requestReset(email: emailAddress) { mode = .reset; focus = .resetLink }
            }
            textButton("I already have a reset link") { switchTo(.reset) }
            textButton("Back to sign in") { switchTo(.signIn) }
        }
    }

    private var resetForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            title("Choose a new password")
            input("Reset link from your email", field: .resetLink) { TextField("", text: $resetLink) }
            passwordInput(newPassword: true)
            passwordRequirements
            primary("Change Password", enabled: !resetLink.isEmpty && strongPassword) {
                let recoveredEmail = (try? PasswordResetLink(resetLink))?.email
                if await controller.reset(link: resetLink, password: password) {
                    clearSecretFields()
                    if let recoveredEmail { email = recoveredEmail }
                    mode = .signIn
                    focus = .password
                }
            }
            HStack {
                textButton("Send another link") { switchTo(.recover) }
                Spacer()
                textButton("Back to sign in") { switchTo(.signIn) }
            }
        }
    }

    private var emailInput: some View {
        input("Email address", field: .email) {
            TextField("", text: $email).textContentType(.emailAddress)
        }
    }

    private func passwordInput(newPassword: Bool) -> some View {
        input(newPassword ? "New password" : "Password", field: .password) {
            SecureField("", text: $password).textContentType(newPassword ? .newPassword : .password)
        }
    }

    private var passwordRequirements: some View {
        Text("Use 8–50 characters with uppercase, lowercase, a number, and one of @ $ ! % * ? &.")
            .font(.caption).foregroundStyle(BattlePalette.sidebarTitle)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func input<Content: View>(_ label: String, field: Field, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(BattlePalette.sidebarTitle)
                .accessibilityHidden(true)
            content()
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .padding(.horizontal, 11)
                .frame(height: 38)
                .background(BattlePalette.backdrop, in: RoundedRectangle(cornerRadius: 6))
                .overlay {
                    RoundedRectangle(cornerRadius: 6).strokeBorder(focus == field ? BattlePalette.gold : BattlePalette.bronze)
                }
                .focused($focus, equals: field)
                .accessibilityLabel(label)
                .disabled(busy)
        }
    }

    private func title(_ string: String) -> some View {
        Text(string).font(BattleResources.display(30)).fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private func primary(_ label: String, enabled: Bool, action: @escaping @MainActor () async -> Void) -> some View {
        Button(label) { Task { await action() } }
            .buttonStyle(GameMenuButtonStyle(prominent: true, fullWidth: true))
            .keyboardShortcut(.defaultAction)
            .disabled(!enabled || busy)
    }

    private func textButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .modifier(SandboxCursorTarget())
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(BattlePalette.gold)
            .disabled(busy)
    }

    private func note(_ text: String, icon: String, color: Color) -> some View {
        Label(text, systemImage: icon)
            .font(.subheadline)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func switchTo(_ mode: Mode) {
        clearSecretFields()
        controller.clearMessages()
        self.mode = mode
        focus = switch mode {
        case .signIn, .recover: .email
        case .register: .username
        case .reset: .resetLink
        }
    }

    private func clearSecretFields() {
        password = ""
        resetLink = ""
        code = ""
    }
}
