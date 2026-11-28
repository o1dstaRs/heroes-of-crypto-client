import AVFoundation
import Observation

@MainActor
@Observable
final class StartupMusic: NSObject, AVAudioPlayerDelegate {
    var volume: Double { audio.level(for: .music).volume }
    var muted: Bool { audio.level(for: .music).muted }
    var available: Bool { !tracks.isEmpty }

    @ObservationIgnored private let audio: GameAudioSettings
    @ObservationIgnored private let tracks: [URL]
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var nextTrack = 0
    @ObservationIgnored private var active = false

    init(audio: GameAudioSettings, bundle: Bundle = .main) {
        self.audio = audio
        self.tracks = Self.trackURLs(in: bundle)
        super.init()
    }

    func setActive(_ active: Bool) {
        self.active = active
        refresh()
    }

    func toggleMute() {
        audio.setMuted(audio.level(for: .music).audible, for: .music)
        refresh()
    }

    func setVolume(_ value: Double) {
        audio.setVolume(value, for: .music)
        refresh()
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        let finished = ObjectIdentifier(player)
        Task { @MainActor [weak self] in
            guard let self, let player = self.player, ObjectIdentifier(player) == finished else { return }
            self.player = nil
            self.refresh()
        }
    }

    func refresh() {
        let gain = audio.gain(.music)
        guard active, gain > 0, available else {
            player?.pause()
            return
        }
        if player == nil {
            for _ in tracks {
                let url = tracks[nextTrack]
                nextTrack = (nextTrack + 1) % tracks.count
                guard let loaded = try? AVAudioPlayer(contentsOf: url) else { continue }
                loaded.delegate = self
                loaded.volume = 0
                player = loaded
                break
            }
        }
        guard let player else { return }
        if !player.isPlaying {
            player.volume = 0
            player.play()
        }
        player.setVolume(gain, fadeDuration: 0.18)
    }

    private static func trackURLs(in bundle: Bundle) -> [URL] {
        guard let manifest = bundle.url(forResource: "startup-music", withExtension: "json"),
              let data = try? Data(contentsOf: manifest),
              let names = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return names.compactMap { bundle.url(forResource: $0, withExtension: nil, subdirectory: "Music") }
    }
}
