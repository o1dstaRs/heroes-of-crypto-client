#!/bin/bash
set -euo pipefail

if [[ $# -gt 1 || ( -n "${1:-}" && "$1" != "--open" && "$1" != "--test" && "$1" != "--release" ) ]]; then
    echo "Usage: bash game/macos/build.sh [--open|--test|--release]" >&2
    exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")"
case "$(uname -s):$(uname -m)" in
    Darwin:arm64) swift_arch=arm64; zig_arch=aarch64 ;;
    Darwin:x86_64) swift_arch=x86_64; zig_arch=x86_64 ;;
    *) echo "The native client builds on macOS." >&2; exit 1 ;;
esac

if [[ "${1:-}" == "--release" ]]; then
    if [[ "${HOC_MACOS_SIGNING_IDENTITY:-}" != "Developer ID Application: "* || -z "${HOC_MACOS_NOTARY_PROFILE:-}" ]]; then
        echo "Set HOC_MACOS_SIGNING_IDENTITY to your Developer ID Application certificate name and HOC_MACOS_NOTARY_PROFILE to your notarytool keychain profile." >&2
        exit 1
    fi
    if ! security find-identity -v -p codesigning | /usr/bin/grep -F "\"$HOC_MACOS_SIGNING_IDENTITY\"" >/dev/null; then
        echo "The requested Developer ID Application signing identity is unavailable in the keychain." >&2
        exit 1
    fi
    xcrun --find notarytool >/dev/null
    xcrun --find stapler >/dev/null
fi

fixture_test=false
if [[ -z "${HOC_IMAGES_LOC:-}" || -z "${HOC_ANIMATIONS_LOC:-}" ]]; then
    if [[ "${1:-}" == "--test" && -z "${HOC_IMAGES_LOC:-}" && -z "${HOC_ANIMATIONS_LOC:-}" ]]; then
        fixture_test=true
    else
        echo "Set HOC_IMAGES_LOC and HOC_ANIMATIONS_LOC to build the playable Mac app." >&2
        exit 1
    fi
fi

common=../heroes-of-crypto-common
if [[ ! -f "$common/zig/build.zig" ]]; then
    echo "Initialize game/heroes-of-crypto-common with git submodule update --init --recursive." >&2
    exit 1
fi

build="$PWD/.build"
mkdir -p "$build"
stage="$(mktemp -d "$build/package.XXXXXX")"
trap 'rm -r "$stage"' EXIT
app_name="Heroes of Crypto.app"
contents="$stage/$app_name/Contents"
mkdir -p "$contents/MacOS" "$contents/Resources"

zig build "-Dtarget=$zig_arch-macos.14.0" -Doptimize=ReleaseSafe "-Dcommon-sha=$(git -C "$common" rev-parse HEAD)" \
    --cache-dir "$build/zig-cache" --prefix "$build/zig" --summary failures
bun scripts/make-skirmish.ts "$contents/Resources"
bun scripts/bundle-startup.ts "$contents/Resources"
bun scripts/bundle-localization.ts "$contents/Resources"
bun scripts/bundle-animation-timing.ts "$contents/Resources/animation-timing.json"
bun scripts/bundle-wind-aura.ts "$contents/Resources"
bun scripts/bundle-arachna-aura.ts "$contents/Resources"
bun scripts/bundle-abomination-sand.ts "$contents/Resources"
bun scripts/bundle-smoke-cloud.ts "$contents/Resources"
bun scripts/bundle-damage-spells.ts "$contents/Resources"
bun build --target browser --format iife --minify scripts/battle-presentation.ts --outfile "$contents/Resources/battle-presentation.js"
if [[ "$fixture_test" == false ]]; then
    xcrun clang -arch "$swift_arch" -mmacosx-version-min=14.0 -O2 -fobjc-arc \
        scripts/render-status-shader.m -framework AppKit -framework ImageIO -framework OpenGL -o "$stage/render-status-shader"
fi
bun scripts/bundle-status-effects.ts "$contents/Resources" "$stage/render-status-shader"
bun scripts/bundle-fight-log.ts "$contents/Resources"
bun build --target browser --format iife --minify --define 'process.env={}' \
    scripts/sandbox-loadouts.ts --outfile "$contents/Resources/sandbox-loadouts.js"
cp Info.plist "$contents/Info.plist"

# Swift 6.1's IR generator crashes while specializing SwiftUI bindings with default CMO.
swift_flags=(-target "$swift_arch-apple-macos14.0" -swift-version 6 -O -disable-cmo -I Engine/include)
archive="$build/zig/lib/libhoc_macos.a"
xcrun swiftc "${swift_flags[@]}" Sources/*.swift "$archive" -o "$contents/MacOS/HeroesOfCrypto"

if [[ "${1:-}" == "--test" ]]; then
    smoke="$contents/MacOS/skirmish-smoke"
    xcrun swiftc "${swift_flags[@]}" Sources/NativeBattle.swift Sources/BattlefieldProjection.swift Sources/BattlePlayback.swift \
        Sources/BattlefieldAuraRenderer.swift Sources/BattlefieldWindAura.swift Sources/BattlefieldGriffinAura.swift \
        Sources/BattlefieldWyvernAura.swift Sources/BattlefieldArachnaAura.swift Sources/ArachnaContactSimulation.swift \
        Sources/BattlefieldAbominationAura.swift Tests/AbominationAuraSmoke.swift \
        Sources/BattleSmokeClouds.swift Tests/SmokeVolumeSmoke.swift Sources/BattlefieldOptics.swift Tests/OpticsSmoke.swift \
        Sources/BattleDamageSpell.swift Sources/BattleStatusEffects.swift Sources/BattleChakram.swift Sources/SandboxKeyboardShortcuts.swift \
        Sources/CreatureAnimation.swift Sources/BattleProjectile.swift Sources/FairyIdleAppearance.swift Sources/BattleMageIdleAppearance.swift \
        Sources/ElfIdleAppearance.swift \
        Sources/LeprechaunAppearance.swift \
        Sources/FirePitRegistration.swift Sources/SandboxTurnClock.swift Sources/SandboxSetup.swift Sources/SandboxLoadouts.swift \
        Sources/BattleFightSummary.swift Sources/UnitInspectionDescriptions.swift \
        Tests/SkirmishSmoke.swift Tests/DamageSpellSmoke.swift Tests/StatusEffectSmoke.swift Tests/BattleLogSmoke.swift "$archive" -o "$smoke"
    "$smoke" "$contents/Resources/skirmish.json"
    rm "$smoke"
    auth_smoke="$contents/MacOS/auth-smoke"
    xcrun swiftc "${swift_flags[@]}" Sources/NativeAuthAPI.swift Sources/DesktopBrowserSignIn.swift \
        Sources/NativeAccountController.swift Sources/NativeCoopAPI.swift Sources/NativePremiumAccess.swift Sources/PremiumSite.swift \
        Sources/GameAudioSettings.swift Sources/OnlinePreferences.swift Tests/AuthSmoke.swift -o "$auth_smoke"
    "$auth_smoke"
    rm "$auth_smoke"
    stats_smoke="$contents/MacOS/statistics-smoke"
    xcrun swiftc "${swift_flags[@]}" Sources/RankedStatisticsAPI.swift Tests/StatisticsSmoke.swift -o "$stats_smoke"
    "$stats_smoke"
    rm "$stats_smoke"
    if [[ "$fixture_test" == true ]]; then
        echo "Fixture checks passed. Set both asset locations to package the playable Mac app."
        exit 0
    fi
fi

icon_source=../../site/public/favicon/android-chrome-512x512.png
iconset="$stage/AppIcon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$icon_source" --out "$iconset/icon_${size}x${size}.png" >/dev/null
    retina_size=$((size * 2))
    sips -z "$retina_size" "$retina_size" "$icon_source" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$contents/Resources/AppIcon.icns"

if [[ "${1:-}" == "--release" ]]; then
    app="$stage/$app_name"
    submission_archive="$stage/notary-submission.zip"
    release_archive="$stage/Heroes-of-Crypto-macOS-$swift_arch.zip"
    codesign --force --timestamp --options runtime --sign "$HOC_MACOS_SIGNING_IDENTITY" "$app"
    codesign --verify --strict "$app"
    ditto -c -k --keepParent "$app" "$submission_archive"
    xcrun notarytool submit "$submission_archive" --keychain-profile "$HOC_MACOS_NOTARY_PROFILE" \
        --wait --timeout 30m --output-format json >"$stage/notary-result.json"
    if ! bun -e 'const result = await Bun.file(process.argv[1]).json();
        if (result.status !== "Accepted") {
            console.error("Notarization was " + result.status + ". Submission " + result.id);
            process.exit(1);
        }' "$stage/notary-result.json"; then
        exit 1
    fi
    xcrun stapler staple "$app"
    xcrun stapler validate "$app"
    spctl --assess --type execute "$app"
    ditto -c -k --keepParent "$app" "$release_archive"
    mv "$release_archive" "$build/"
    echo "$build/${release_archive##*/}"
else
    codesign --force --sign - "$stage/$app_name"
fi
if [[ -e "$build/$app_name" ]]; then
    mv "$build/$app_name" "$stage/previous.app"
fi
mv "$stage/$app_name" "$build/$app_name"
echo "$build/$app_name"
if [[ "${1:-}" == "--open" ]]; then
    open "$build/$app_name"
fi
