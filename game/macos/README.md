# Heroes of Crypto for macOS

Local Sandbox opens directly for offline play. Choosing Ranked Arena or Lobby restores a saved session or opens the sign-in screen, with email sign-in, account creation and verification, password recovery, and Google sign-in. The startup soundtrack follows the game’s Arena playlist, and the Mac saves your volume and mute settings.

Google sign-in opens the system authentication browser and returns to the app with a short-lived, single-use code. The Mac checks that the dedicated `/desktop-sign-in.html` page and the auth service’s exchange are available before opening the browser. The native email forms use the existing account API. [Google button artwork](https://developers.google.com/identity/branding-guidelines)

Sandbox opens with an empty battlefield. Hover or select a creature in the roster to see its portrait, stats and abilities in the left sidebar. Drag it into either army's deployment zone, or select it and click an open tile in either zone. The creature and its footprint preview appear at the legal drop position under the pointer. Press U to expand or collapse the roster. The right sidebar's Army section edits the selected stack. Load Sample Armies places six stacks per side using each team's current augments. Selecting a stack opens its Green or Red panel, where you can pick that army's augments, synergies, and one artifact per tier. Choose Normal, Fire Pit, or Barrels in the Board section and drag stacks within their deployment zones. Click the selected Barrels map again to reroll the terrain.

The Green and Red AI switches below Start begin off. Turn on either switch to give that team to the AI. During combat, the AI button in the right sidebar gives both sides to the AI. Switch it off to return to the setup choices after the current AI turn. AI-driven creatures take their own turns even when both team switches are off. The native app uses the Zig v0.8 battle policy and the shared v0.1 policy for AI-driven creatures.

Choose a highlighted tile to move or a highlighted stack or obstacle to attack. Move the pointer across a target's tiles to preview a melee approach or ranged aim, then click to attack from that angle. Right-click or Control-click a creature during deployment or combat to inspect it. Hover over stats, abilities, and effects to see their descriptions in the sidebar or the inspection card. Crossed swords on a stack's flag mean it has used its response. A chain and ball mark a stack that cannot move. A plain move ends the current turn. Use the buttons beside Damage, or press W to wait, D to defend, E to end a turn, A to cycle attack types, and B for the spellbook. Escape closes unit inspection or clears spell targeting. Command-R returns to deployment. The turn clock, active unit, and lap appear above the turn queue. Use the plus button to request additional time once per team per lap.

The fight results show both armies, damage by creature, and casualties over time. Replay plays back the finished fight. Rematch starts a new fight with the same formation and loadouts. New Battle returns to an empty board. After closing the overlay, use Fight Results in the right sidebar to reopen it.

Choose Ranked Arena or press Command-1 to open ranked matchmaking in the same window. Choose Lobby or press Command-3 to browse and create custom games. Both use the app's signed-in session and the live game client. Press Command-2 for Sandbox or Command-0 for Home. Use the fullscreen control in the lower-right corner or press Control-Command-F from any screen.

Choose Premium or press Command-4 to open the website's Premium workspace with the app's signed-in account. The crew planner, rankings, guides, data, and Ask Premium AI are available with an active Premium account and during initial calibration or recalibration. The app reconnects when the workspace's sign-in expires and checks access again when you reopen Premium.

Choose Statistics or press Command-5 to browse the current public ladder and overall player records across the current pool and finished seasons. Sort the overall board by peak MMR, wins, matches, or win rate. Seasons shows each finished season’s podium and final standings by MMR or season currency. Select a player on either board for their match record and season history.

Open Settings from the main menu or with Command-comma to change menu music, turn on Ranked alerts, or sign out. With macOS notification permission, the running app can tell you when a match is ready or it’s your turn while the app is in the background. Selecting the alert returns you to Ranked Arena.

## Build and run

Use macOS 14 or newer, the Xcode Command Line Tools with Swift 6, Zig 0.15.2, and the workspace's Bun version. From the repository root:

```sh
git submodule update --init --recursive
bun install
HOC_IMAGES_LOC="$HOME/Google Drive/My Drive/heroesofcrypto/images" \
  HOC_ANIMATIONS_LOC="$HOME/Google Drive/My Drive/heroesofcrypto/animations" \
  bash game/macos/build.sh --open
```

The locally signed app is written to `game/macos/.build/Heroes of Crypto.app`. Use the locations of your production artwork and exported animation atlases. Set `HOC_ANIMATIONS_LOC` to the parent of the canonical `output` directory. The build requires idle, walk, and attack atlases for the full catalogue and bundles the available directional attacks, reactions, and casts. Creature sizes, offsets, and row perspective come from the browser's board framing. The game's display font and sound effects come from the existing core package. The Mac bundle icon comes from the game's existing 512-pixel favicon.

Use the same asset variables with `bash game/macos/build.sh --test` to check the full playable catalogue, manual red turns, AI versus AI, deployment, terrain, spell targeting, and a full battle through the Swift-to-Zig bridge. The tests also sample intermediate movement positions, Wolf's foot registration, Arbalester's high-resolution pages, and the Fire Pit layers.

The native build's test command also checks the account flows with fixture responses and verifies the Google return code and proof. With both asset variables omitted, `--test` runs the fixture checks in a temporary directory. The playable app is packaged only when both asset locations are set.

For a public download, set the same asset variables, `HOC_MACOS_SIGNING_IDENTITY` to the full Developer ID Application certificate name, and `HOC_MACOS_NOTARY_PROFILE` to the notarytool keychain profile. Run `bash game/macos/build.sh --release` on the target architecture. It signs the app with hardened runtime, submits it for notarization, staples and validates the ticket, then writes an architecture-specific zip beside the app.

## Engine and client

SwiftUI uses the web client's hand-traced floor geometry for painted tiles, highlights, and input. The app statically links the pinned [common Zig engine](../heroes-of-crypto-common/zig/BRIDGE.md). The [C interface](Engine/include/HOCEngine.h) owns one battle, accepts commands, and projects available moves, attacks, spell targets, and combat actions to Swift. The build uses Bun and the common snapshot exporter to prepare the bundled opening states from the canonical unit definitions. The installed app runs offline with Swift and Zig.

The Sandbox bundles the shared web loadout rules for offline setup and uses the web creature atlases and their authored timing. Individual Pixi spell and aura effects have their own presentation in the web client. The in-app ranked view runs the server-authoritative game client. A direct public download needs Developer ID signing and notarization. [Apple distribution documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
