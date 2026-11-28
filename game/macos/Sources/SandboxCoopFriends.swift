import SwiftUI

struct SandboxCoopHandoff: Equatable {
    struct Unit: Encodable, Equatable {
        let unitName: String
        let cells: [Cell]
    }

    let gameID: String
    let army: [Unit]
}

struct SandboxCoopFriends: View {
    let battle: BattleView
    let account: NativeAccountController
    let api: NativeCoopAPI
    let open: (SandboxCoopHandoff) -> Void
    @State private var friends: [NativeCoopAPI.Friend]?
    @State private var message: String?
    @State private var inviting: String?
    @State private var refresh = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Invite a friend")
                .font(BattleResources.display(28))
            Text("Your Green army and map will carry over to Co-op Sandbox.")
                .foregroundStyle(BattlePalette.sidebarTitle)
            if let message {
                Text(message).foregroundStyle(BattlePalette.parchment)
            }
            if let friends {
                if friends.isEmpty {
                    Text("Add friends from Ranked Arena or Lobby to invite them here.")
                        .foregroundStyle(BattlePalette.sidebarTitle)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 7) {
                            ForEach(friends) { friend in row(friend) }
                        }
                    }
                    .scrollBounceBehavior(.basedOnSize)
                }
            } else if message == nil {
                ProgressView("Loading friends…")
                    .controlSize(.small)
            }
            Button("Refresh", systemImage: "arrow.clockwise") { refresh += 1 }
                .buttonStyle(GameMenuButtonStyle(prominent: false))
                .disabled(inviting != nil)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(24)
        .frame(maxWidth: 520, maxHeight: 500, alignment: .topLeading)
        .background(BattlePalette.backdrop)
        .foregroundStyle(BattlePalette.parchment)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BattlePalette.backdrop)
        .task(id: refresh) { await loadFriends() }
    }

    private func row(_ friend: NativeCoopAPI.Friend) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(friend.username).font(BattleResources.display(15)).lineLimit(1)
                Text(friend.inGameId != nil ? "In a game" : friend.online ? "Online" : "Offline")
                    .font(.caption)
                    .foregroundStyle(BattlePalette.sidebarTitle)
            }
            Spacer()
            Button(inviting == friend.id ? "Inviting…" : "Invite") {
                inviting = friend.id
                message = nil
                Task { await invite(friend) }
            }
            .buttonStyle(GameMenuButtonStyle(prominent: true))
            .accessibilityLabel("Invite \(friend.username)")
            .disabled(inviting != nil || friend.inGameId != nil)
        }
        .padding(9)
        .background(BattlePalette.color(0x1c1410), in: RoundedRectangle(cornerRadius: 7))
    }

    private func loadFriends() async {
        message = nil
        do {
            guard let session = try await account.revalidateSession(), !Task.isCancelled else { return }
            friends = try await api.friends(account: session, deviceID: account.deviceID)
        } catch {
            if !Task.isCancelled { message = error.localizedDescription }
        }
    }

    private func invite(_ friend: NativeCoopAPI.Friend) async {
        defer { inviting = nil }
        guard !battle.started, let session = account.verifiedSession else { return }
        let army = battle.stacks.filter { $0.team == .player && !$0.cells.isEmpty }.map {
            SandboxCoopHandoff.Unit(unitName: $0.name, cells: $0.cells)
        }
        do {
            let id = try await api.invite(friend, gridType: battle.map.rawValue, account: session, deviceID: account.deviceID)
            open(SandboxCoopHandoff(gameID: id, army: army))
        } catch {
            message = error.localizedDescription
        }
    }
}
