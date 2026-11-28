import Foundation
import Observation

@MainActor
@Observable
final class OnlinePreferences {
    static let messageName = "hocMacPreferences"
    enum Setting: String, CaseIterable {
        case language = "hoc:language"
        case boardSide = "hoc.ranked.boardSide"
        case armyColor = "hoc.ranked.armyColor"
        case staggerIdle = "hoc:staggerDuplicateIdle"
        case premiumEnabled = "hoc.premium.enabled"
        case suggestedMoves = "hoc.premium.suggestedMoves"

        var defaultValue: String {
            switch self {
            case .language: "en"
            case .boardSide: "seat"
            case .armyColor: "team"
            case .staggerIdle: "1"
            case .premiumEnabled, .suggestedMoves: "true"
            }
        }
    }

    struct Choices: Decodable {
        struct Language: Decodable, Identifiable {
            let code: String
            let label: String
            var id: String { code }
        }
        struct ArmyColor: Decodable, Identifiable {
            let id: String
            let label: String
            let color: UInt32
        }
        let languages: [Language]
        let armyColors: [ArmyColor]
    }

    let choices: Choices
    private(set) var values: [String: String] = [:]
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard, bundle: Bundle = .main) {
        self.defaults = defaults
        let url = bundle.url(forResource: "online-preferences", withExtension: "json")
        let data = url.flatMap { try? Data(contentsOf: $0) }
        choices = data.flatMap { try? JSONDecoder().decode(Choices.self, from: $0) } ??
            Choices(languages: [.init(code: "en", label: "English"), .init(code: "ru", label: "Русский")],
                    armyColors: [])
        for key in Setting.allCases {
            let value = defaults.string(forKey: key.rawValue) ?? key.defaultValue
            values[key.rawValue] = supports(value, for: key) ? value : key.defaultValue
        }
    }

    func get(_ key: Setting) -> String { values[key.rawValue] ?? key.defaultValue }

    func set(_ value: String, for key: Setting) {
        guard supports(value, for: key), get(key) != value else { return }
        values[key.rawValue] = value
        defaults.set(value, forKey: key.rawValue)
    }

    func receive(_ values: [String: String]) {
        for setting in Setting.allCases {
            if let value = values[setting.rawValue] { set(value, for: setting) }
        }
    }

    private func supports(_ value: String, for key: Setting) -> Bool {
        switch key {
        case .language: choices.languages.contains { $0.code == value }
        case .boardSide: ["seat", "left", "right"].contains(value)
        case .armyColor: value == "team" || choices.armyColors.contains { $0.id == value }
        case .staggerIdle: value == "0" || value == "1"
        case .premiumEnabled, .suggestedMoves: value == "true" || value == "false"
        }
    }

    static func encode(_ values: [String: String]) -> String {
        guard let data = try? JSONEncoder().encode(values) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }

    static func bridgeScript(_ values: [String: String]) -> String {
        """
        const preferences = \(encode(values));
        const preferenceKeys = Object.keys(preferences);
        const setPreference = Storage.prototype.setItem;
        const applyPreferences = (values, announce) => {
            const changed = [];
            for (const key of preferenceKeys) {
                const value = values[key];
                if (typeof value === "string" && localStorage.getItem(key) !== value) {
                    setPreference.call(localStorage, key, value);
                    changed.push(key);
                }
            }
            if (announce && changed.length) {
                window.dispatchEvent(new CustomEvent("hoc:mac-preferences", { detail: changed }));
            }
        };
        try {
            if (!sessionStorage.getItem("hoc:native-preferences")) {
                applyPreferences(preferences, false);
                sessionStorage.setItem("hoc:native-preferences", "1");
            }
            let reportScheduled = false;
            Storage.prototype.setItem = function (key, value) {
                const changed = this === localStorage && preferenceKeys.includes(key) && this.getItem(key) !== String(value);
                const result = setPreference.call(this, key, value);
                if (changed && !reportScheduled) {
                    reportScheduled = true;
                    queueMicrotask(() => {
                        reportScheduled = false;
                        const snapshot = Object.fromEntries(preferenceKeys.map(key => [key, localStorage.getItem(key)]));
                        window.webkit.messageHandlers.\(messageName).postMessage(snapshot);
                    });
                }
                return result;
            };
            window.hocMacApplyPreferences = values => applyPreferences(values, true);
        } catch {}
        """
    }
}
