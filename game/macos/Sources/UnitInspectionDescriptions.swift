import Foundation

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
            let stackPowered: Bool
        }

        struct Spell: Decodable, Sendable {
            let description: String
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

    static func ability(_ name: String) -> UnitInspectionDescription {
        let definition = catalog?.abilities[name]
        return UnitInspectionDescription(title: name, description: definition?.description ?? "",
                                         note: definition?.stackPowered == true ? "Scales with stack power." : nil)
    }

    static func spell(_ spell: StackSpell) -> UnitInspectionDescription {
        let definition = catalog?.spells[spell.name]
        let scrolls = spell.charges == 1 ? "1 scroll left." : "\(spell.charges) scrolls left."
        let requirement = definition.map { " Requires stack power \($0.stackPower)." } ?? ""
        return UnitInspectionDescription(title: spell.name, description: definition?.description ?? "",
                                         note: scrolls + requirement)
    }

    static func status(_ status: StackStatus) -> UnitInspectionDescription {
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
        var description = template ?? ""
        if status.name == "Armor Augment" || status.name == "Sniper Augment",
           let first = description.range(of: "{}") {
            description.replaceSubrange(first, with: statusNumber(power))
            if let remaining = description.range(of: "{}") {
                description.replaceSubrange(remaining, with: statusNumber(second))
            }
        }
        description = description.replacingOccurrences(of: "{}", with: statusNumber(power))
            .replacingOccurrences(of: "[]", with: statusNumber(second))
            .replacingOccurrences(of: "<>", with: statusNumber(status.second.map(Double.init) ?? power))
        let note: String?
        if unlimited {
            note = isAura ? "While in aura range." : nil
        } else if status.laps == catalog?.wholeBattle {
            note = "Lasts for the battle."
        } else if status.laps > 0 {
            note = "\(statusNumber(status.laps)) \(status.laps == 1 ? "lap" : "laps") remaining."
        } else {
            note = nil
        }
        return UnitInspectionDescription(title: status.name, description: description, note: note)
    }

    private static func statusNumber(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...4)))
    }
}
