import Foundation
import Observation

@MainActor
@Observable
final class GameAudioSettings {
    enum Channel: String, CaseIterable, Identifiable {
        case master, music, effects

        var id: Self { self }

        var title: String {
            switch self {
            case .master: "Master sound"
            case .music: "Music"
            case .effects: "Sound effects"
            }
        }

        var defaultVolume: Double {
            switch self {
            case .master: 1
            case .music: 0.2
            case .effects: 0.5
            }
        }

        // Preserve existing menu music choices.
        var key: String { self == .music ? "hoc.music" : "hoc.audio.\(rawValue)" }
        var webKey: String {
            switch self {
            case .master: "hoc:sound"
            case .music: "hoc:theme"
            case .effects: "hoc:effects"
            }
        }
    }

    struct Level: Equatable {
        var volume: Double
        var muted: Bool
        var audible: Bool { !muted && volume > 0 }
    }

    private(set) var channels: [Channel: Level]
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        channels = Dictionary(uniqueKeysWithValues: Channel.allCases.map { channel in
            let raw = defaults.object(forKey: "\(channel.key).volume") as? Double ?? channel.defaultVolume
            let volume = raw.isFinite ? min(1, max(0, raw)) : channel.defaultVolume
            return (channel, Level(volume: volume, muted: defaults.bool(forKey: "\(channel.key).muted")))
        })
    }

    func level(for channel: Channel) -> Level {
        channels[channel] ?? Level(volume: channel.defaultVolume, muted: false)
    }

    func setVolume(_ volume: Double, for channel: Channel) {
        guard volume.isFinite else { return }
        var next = level(for: channel)
        next.volume = min(1, max(0, volume))
        if next.volume > 0 { next.muted = false }
        store(next, for: channel)
    }

    func setMuted(_ muted: Bool, for channel: Channel) {
        var next = level(for: channel)
        next.muted = muted
        if !muted && next.volume == 0 { next.volume = channel.defaultVolume }
        store(next, for: channel)
    }

    func gain(_ channel: Channel) -> Float {
        let master = level(for: .master)
        let output = level(for: channel)
        guard master.audible, output.audible else { return 0 }
        if channel == .master { return Float(master.volume) }
        let boost: Double = channel == .music ? 1.5 : 1
        return Float(min(1, master.volume * output.volume * boost))
    }

    var webValues: [String: String] {
        var values: [String: String] = [:]
        for channel in Channel.allCases {
            let level = level(for: channel)
            values[channel.webKey + "Volume"] = String(level.volume)
            values[channel.webKey + "Muted"] = level.muted ? "1" : "0"
        }
        return values
    }

    func receiveWebValues(_ values: [String: String]) {
        for channel in Channel.allCases {
            guard let raw = values[channel.webKey + "Volume"], let volume = Double(raw), volume.isFinite,
                  let mute = values[channel.webKey + "Muted"], mute == "1" || mute == "0" else { continue }
            store(Level(volume: min(1, max(0, volume)), muted: mute == "1"), for: channel)
        }
    }

    private func store(_ next: Level, for channel: Channel) {
        guard level(for: channel) != next else { return }
        channels[channel] = next
        defaults.set(next.volume, forKey: "\(channel.key).volume")
        defaults.set(next.muted, forKey: "\(channel.key).muted")
    }
}
