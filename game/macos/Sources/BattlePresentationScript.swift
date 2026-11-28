import JavaScriptCore

@MainActor
enum BattlePresentationScript {
    static let context: JSContext? = {
        guard let url = Bundle.main.url(forResource: "battle-presentation", withExtension: "js"),
              let code = try? String(contentsOf: url, encoding: .utf8), let context = JSContext() else { return nil }
        context.evaluateScript(code)
        return context
    }()
}
