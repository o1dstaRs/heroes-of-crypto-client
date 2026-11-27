import AVFoundation
import Observation

@MainActor
@Observable
final class StartupMusic: NSObject, AVAudioPlayerDelegate {
    private static let volumeKey = "hoc.music.volume"
    private static let muteKey = "hoc.music.muted"

    private(set) var volume: Double
    private(set) var muted: Bool
    var available: Bool { !tracks.isEmpty }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let tracks: [URL]
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var nextTrack = 0
    @ObservationIgnored private var active = false

    init(bundle: Bundle = .main, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.volume = min(1, max(0, defaults.object(forKey: Self.volumeKey) as? Double ?? 0.2))
        self.muted = defaults.bool(forKey: Self.muteKey)
        self.tracks = Self.trackURLs(in: bundle)
        super.init()
    }

    func setActive(_ active: Bool) {
        self.active = active
        refresh()
    }

    func toggleMute() {
        muted = !(muted || volume == 0)
        if !muted && volume == 0 {
            volume = 0.2
            defaults.set(volume, forKey: Self.volumeKey)
        }
        defaults.set(muted, forKey: Self.muteKey)
        refresh()
    }

    func setVolume(_ value: Double) {
        volume = min(1, max(0, value))
        if volume > 0 { muted = false }
        defaults.set(volume, forKey: Self.volumeKey)
        defaults.set(muted, forKey: Self.muteKey)
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

    private func refresh() {
        guard active, !muted, volume > 0, available else {
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
        player.setVolume(Float(volume), fadeDuration: 0.18)
    }

    private static func trackURLs(in bundle: Bundle) -> [URL] {
        guard let manifest = bundle.url(forResource: "startup-music", withExtension: "json"),
              let data = try? Data(contentsOf: manifest),
              let names = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return names.compactMap { bundle.url(forResource: $0, withExtension: nil, subdirectory: "Music") }
    }
}
