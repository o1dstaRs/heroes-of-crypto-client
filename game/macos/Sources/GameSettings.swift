import SwiftUI

struct GameSettings: View {
    let notifications: RankedNotifications
    let music: StartupMusic
    let account: NativeAccountController

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle("Ranked alerts", isOn: Binding(get: { notifications.enabled }, set: { enabled in
                    Task { await notifications.setEnabled(enabled) }
                }))
                .disabled(notifications.requesting)
                Text("Get an alert when a match is ready or it’s your turn while the game is in the background.")
                    .foregroundStyle(.secondary)
                if let problem = notifications.problem {
                    Text(problem).foregroundStyle(.secondary)
                } else if notifications.enabled && notifications.authorization == .denied {
                    Text("Allow Heroes of Crypto in System Settings → Notifications.")
                        .foregroundStyle(.secondary)
                }
            }
            if music.available {
                Section("Audio") {
                    Toggle("Mute menu music", isOn: Binding(
                        get: { music.muted || music.volume == 0 },
                        set: { _ in music.toggleMute() }
                    ))
                    Slider(value: Binding(get: { music.volume }, set: { music.setVolume($0) }), in: 0...1) {
                        Text("Music volume")
                    }
                    .disabled(music.muted)
                }
            }
            if let profile = account.account {
                Section("Account") {
                    LabeledContent(profile.username, value: profile.email)
                    Button("Sign Out") { Task { await account.signOut() } }
                        .disabled(account.activity != nil)
                    if let problem = account.problem {
                        Text(problem).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 440)
        .fixedSize(horizontal: false, vertical: true)
        .task { await notifications.refreshAuthorization() }
    }
}
