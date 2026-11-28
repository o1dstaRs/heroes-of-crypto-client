import SwiftUI

struct GameSettings: View {
    let notifications: RankedNotifications
    let audio: GameAudioSettings
    let online: OnlinePreferences
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
            Section("Audio") {
                ForEach(GameAudioSettings.Channel.allCases) { channel in
                    LabeledContent(LocalizedStringKey(channel.title)) {
                        HStack {
                            let level = audio.level(for: channel)
                            Button {
                                audio.setMuted(level.audible, for: channel)
                            } label: {
                                Image(systemName: level.audible ? "speaker.wave.2.fill" : "speaker.slash.fill")
                                    .frame(width: 22)
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel(level.audible
                                ? Text("Mute \(Text(LocalizedStringKey(channel.title)))")
                                : Text("Unmute \(Text(LocalizedStringKey(channel.title)))"))
                            Slider(value: Binding(
                                get: { audio.level(for: channel).muted ? 0 : audio.level(for: channel).volume },
                                set: { audio.setVolume($0, for: channel) }
                            ), in: 0...1)
                            .accessibilityLabel("\(Text(LocalizedStringKey(channel.title))) volume")
                        }
                    }
                }
            }
            Section("Language") {
                Picker("Language", selection: preference(.language)) {
                    ForEach(online.choices.languages) { Text($0.label).tag($0.code) }
                }
            }
            Section("Online play") {
                Picker("Your side of the battlefield", selection: preference(.boardSide)) {
                    Text("Assigned side").tag("seat")
                    Text("Left side").tag("left")
                    Text("Right side").tag("right")
                }
                Picker("Your army colour", selection: preference(.armyColor)) {
                    Text("Team colours").tag("team")
                    ForEach(online.choices.armyColors) { option in
                        Label {
                            Text(LocalizedStringKey(option.label))
                        } icon: {
                            Circle().fill(BattlePalette.color(option.color)).frame(width: 10, height: 10)
                        }
                        .tag(option.id)
                    }
                }
            }
            Section("Animation") {
                Toggle("Stagger identical creatures’ idle animations", isOn: Binding(
                    get: { online.get(.staggerIdle) == "1" },
                    set: { online.set($0 ? "1" : "0", for: .staggerIdle) }
                ))
            }
            Section("Premium") {
                Toggle("Suggested moves", isOn: Binding(
                    get: { online.get(.suggestedMoves) == "true" },
                    set: { online.set($0 ? "true" : "false", for: .suggestedMoves) }
                ))
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

    private func preference(_ setting: OnlinePreferences.Setting) -> Binding<String> {
        Binding(get: { online.get(setting) }, set: { online.set($0, for: setting) })
    }
}
