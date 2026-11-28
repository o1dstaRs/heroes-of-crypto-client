import Foundation

enum GameLocalization {
    private static let russian = Bundle.main.url(forResource: "ru", withExtension: "lproj").flatMap(Bundle.init(url:))

    static func text(_ key: String, locale: Locale) -> String {
        guard locale.language.languageCode?.identifier == "ru", let russian else { return key }
        return russian.localizedString(forKey: key, value: key, table: nil)
    }

    static func format(_ key: String, locale: Locale, _ arguments: CVarArg...) -> String {
        String(format: text(key, locale: locale), locale: locale, arguments: arguments)
    }
}

struct UnitInspectionDescription: Equatable {
    let title: String
    let description: String
    var note: String? = nil

    var accessibilityHint: String {
        [description.isEmpty ? nil : description, note].compactMap { $0 }.joined(separator: " ")
    }
}

enum UnitInspectionDescriptions {
    private struct Catalog: Decodable, Sendable {
        struct Ability: Decodable, Sendable {
            let description: String
            let descriptionRu: String?
            let stackPowered: Bool
        }

        struct Spell: Decodable, Sendable {
            let description: String
            let descriptionRu: String?
            let applied: String
            let stackPower: Int
        }

        let abilities: [String: Ability]
        let spells: [String: Spell]
        let effects: [String: String]
        let auras: [String: String]
        let wholeBattle: Double
    }

    private static let catalog: Catalog? = {
        guard let url = Bundle.main.url(forResource: "unit-inspection", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }()

    static func ability(_ name: String, locale: Locale = Locale(identifier: "en")) -> UnitInspectionDescription {
        let definition = catalog?.abilities[name]
        let translated = locale.language.languageCode?.identifier == "ru" ? definition?.descriptionRu : nil
        return UnitInspectionDescription(title: name, description: translated ?? definition?.description ?? "",
                                         note: definition?.stackPowered == true
                                            ? GameLocalization.text("Scales with stack power.", locale: locale) : nil)
    }

    static func spell(_ spell: StackSpell, locale: Locale = Locale(identifier: "en")) -> UnitInspectionDescription {
        let definition = catalog?.spells[spell.name]
        let translated = locale.language.languageCode?.identifier == "ru" ? definition?.descriptionRu : nil
        let scrolls = GameLocalization.format(spell.charges == 1 ? "%lld scroll left." : "%lld scrolls left.",
                                               locale: locale, spell.charges)
        let requirement = definition.map { GameLocalization.format("Requires stack power %lld.", locale: locale, $0.stackPower) }
        return UnitInspectionDescription(title: spell.name, description: translated ?? definition?.description ?? "",
                                         note: [scrolls, requirement].compactMap { $0 }.joined(separator: " "))
    }

    static func status(_ status: StackStatus, locale: Locale = Locale(identifier: "en")) -> UnitInspectionDescription {
        let auraName = status.name.hasSuffix(" Aura") ? String(status.name.dropLast(" Aura".count)) : status.name
        let aura = catalog?.auras[status.name] ?? catalog?.auras[auraName]
        let unlimited = status.laps >= Double(9_007_199_254_740_991)
        let isAura = unlimited && aura != nil
        let template: String?
        if status.kind == .effect {
            template = catalog?.effects[status.name] ?? catalog?.spells[status.name]?.applied
        } else if isAura {
            template = aura
        } else {
            template = catalog?.spells[status.name]?.applied ?? aura ?? catalog?.effects[status.name]
        }

        var power = status.power
        var second = status.second.map(Double.init) ?? status.first.map(Double.init) ?? power
        if status.name == "Sniper Augment" {
            // Unlike weapon buffs, the Sniper Augment stores both percentages as separate properties.
            power = status.first.map(Double.init) ?? power
        } else if status.name == "Crown of Command" {
            second = status.first.map(Double.init) ?? 0
        }
        var description = GameLocalization.text(template ?? "", locale: locale)
        if status.name == "Armor Augment" || status.name == "Sniper Augment",
           let first = description.range(of: "{}") {
            description.replaceSubrange(first, with: statusNumber(power, locale: locale))
            if let remaining = description.range(of: "{}") {
                description.replaceSubrange(remaining, with: statusNumber(second, locale: locale))
            }
        }
        description = description.replacingOccurrences(of: "{}", with: statusNumber(power, locale: locale))
            .replacingOccurrences(of: "[]", with: statusNumber(second, locale: locale))
            .replacingOccurrences(of: "<>", with: statusNumber(status.second.map(Double.init) ?? power, locale: locale))
        let note: String?
        if unlimited {
            note = isAura ? GameLocalization.text("While in aura range.", locale: locale) : nil
        } else if status.laps == catalog?.wholeBattle {
            note = GameLocalization.text("Lasts for the battle.", locale: locale)
        } else if status.laps > 0 {
            note = GameLocalization.format(status.laps == 1 ? "%@ lap remaining." : "%@ laps remaining.",
                                           locale: locale, statusNumber(status.laps, locale: locale))
        } else {
            note = nil
        }
        return UnitInspectionDescription(title: status.name, description: description, note: note)
    }

    private static func statusNumber(_ value: Double, locale: Locale) -> String {
        value.formatted(.number.locale(locale).precision(.fractionLength(0...4)))
    }
}
