import SwiftUI

struct SidebarPortraitClip: Decodable {
    struct Page: Decodable {
        let resource: String
        let columns: Int
        let rows: Int
        let frameCount: Int
    }

    struct Frame {
        let page: Page
        let index: Int
    }

    let frameSeconds: TimeInterval
    let pauseSeconds: TimeInterval
    let reverse: Bool
    let pages: [Page]

    var frames: [Frame] {
        pages.flatMap { page in (0..<page.frameCount).map { Frame(page: page, index: $0) } }
    }
}

@MainActor
enum SidebarPortraits {
    struct Artwork: Decodable {
        let scale: CGFloat
        let scaleX: CGFloat
        let offsetX: CGFloat
        let offsetY: CGFloat
        let animation: SidebarPortraitClip?
    }

    private struct Catalogue: Decodable {
        let aspect: CGFloat
        let creatures: [String: Artwork]
    }

    private static let catalogue: Catalogue? = {
        guard let url = Bundle.main.url(forResource: "sidebar-portraits", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalogue.self, from: data)
    }()
    static var aspect: CGFloat { catalogue?.aspect ?? 190 / 256 }
    static func artwork(for name: String) -> Artwork? { catalogue?.creatures[name] }

    // Portrait browsing should not evict the battlefield's live combat atlases.
    private static let cache: NSCache<NSString, BattlefieldAtlas.Sheet> = {
        let cache = NSCache<NSString, BattlefieldAtlas.Sheet>()
        cache.totalCostLimit = 64 * 1024 * 1024
        return cache
    }()
    private static var loading: [String: Task<BattlefieldAtlas.Sheet?, Never>] = [:]

    @discardableResult
    static func warm(_ resource: String, priority: TaskPriority = .utility) -> Task<BattlefieldAtlas.Sheet?, Never>? {
        if let task = loading[resource] { return task }
        guard cache.object(forKey: resource as NSString) == nil,
              let url = Bundle.main.url(forResource: resource, withExtension: nil, subdirectory: "SidebarPortraits")
        else { return nil }
        let task = Task {
            let image = await Task.detached(priority: priority) { BattlefieldAtlas.decode(url, maxDimension: nil) }.value
            loading.removeValue(forKey: resource)
            guard let image else { return nil as BattlefieldAtlas.Sheet? }
            let page = BattlefieldAtlas.Sheet(image)
            cache.setObject(page, forKey: resource as NSString, cost: image.bytesPerRow * image.height)
            return page
        }
        loading[resource] = task
        return task
    }

    static func frame(_ frame: SidebarPortraitClip.Frame) async -> CGImage? {
        let resource = frame.page.resource
        let page: BattlefieldAtlas.Sheet?
        if let cached = cache.object(forKey: resource as NSString) {
            page = cached
        } else {
            page = await warm(resource, priority: .userInitiated)?.value
        }
        return page?.frame(columns: frame.page.columns, rows: frame.page.rows, index: frame.index)
    }
}

struct SidebarAnimatedPortrait: View {
    let clip: SidebarPortraitClip
    let playing: Bool
    let fallback: Image?

    @Environment(\.appearsActive) private var appearsActive
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bitmap: CGImage?
    @State private var missing = false

    var body: some View {
        let shouldPlay = playing && appearsActive && !reduceMotion
        ZStack {
            if let bitmap {
                Image(decorative: bitmap, scale: 1).resizable().interpolation(.high).scaledToFit()
            } else if missing, let fallback {
                fallback.resizable().interpolation(.high).scaledToFit()
            } else {
                Color.clear
            }
        }
        .task(id: shouldPlay) { await showPortrait(playing: shouldPlay) }
    }

    private func showPortrait(playing: Bool) async {
        let forward = clip.frames
        guard let first = forward.first else { return }
        let poster = await SidebarPortraits.frame(first)
        guard !Task.isCancelled else { return }
        bitmap = poster
        missing = poster == nil
        guard poster != nil, playing, forward.count > 1 else { return }

        let cycle = clip.reverse ? forward + Array(forward.reversed()) : forward
        let clock = ContinuousClock()
        var deadline = clock.now
        var prefetchedFrom: String?
        var index = 0
        while !Task.isCancelled {
            let frame = cycle[index]
            let resource = frame.page.resource
            if prefetchedFrom != resource {
                let nextPage = cycle[index...].first { $0.page.resource != resource }?.page
                    ?? cycle.first?.page
                if let nextPage { SidebarPortraits.warm(nextPage.resource) }
                prefetchedFrom = resource
            }
            let image = await SidebarPortraits.frame(frame)
            guard !Task.isCancelled else { return }
            if let image { bitmap = image }
            let endpoint = index == forward.count - 1 || index == cycle.count - 1
            let hold = Duration.seconds(clip.frameSeconds + (endpoint ? clip.pauseSeconds : 0))
            deadline += hold
            if deadline <= clock.now { deadline = clock.now + hold }
            try? await clock.sleep(until: deadline)
            index = (index + 1) % cycle.count
        }
    }
}
