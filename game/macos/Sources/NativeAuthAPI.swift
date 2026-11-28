import Foundation

struct NativeAccount: Equatable, Sendable {
    let username: String
    let email: String
    let verified: Bool
}

struct NativeAccountSession: Sendable {
    let account: NativeAccount
    let token: String
}

enum NativeAuthFailure: Error {
    case http(Int)
    case invalidResponse
    case invalidResetLink
    case couldNotStartBrowser
    case desktopSignInUnavailable
}

struct NativeAuthAPI: Sendable {
    private let baseURL: URL
    private let network: URLSession
    private let deviceID: String

    init(baseURL: URL = URL(string: "https://auth.heroesofcrypto.io/v1/")!, deviceID: String,
         network: URLSession? = nil) {
        self.baseURL = baseURL
        self.deviceID = deviceID
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 25
        self.network = network ?? URLSession(configuration: config, delegate: RefuseServiceRedirects(), delegateQueue: nil)
    }

    func authenticate(email: String, password: String, username: String? = nil) async throws -> NativeAccountSession {
        let body = AuthWire.fields([(1, username ?? ""), (2, email), (3, password)])
        return try await exchange(path: username == nil ? "login" : "register", body: body)
    }

    func authenticate(code: String, verifier: String) async throws -> NativeAccountSession {
        let body = try JSONEncoder().encode(DesktopGrant(code: code, verifier: verifier))
        return try await exchange(path: "desktop-auth-exchange", body: body, json: true)
    }

    func checkDesktopSignIn(page: URL) async throws {
        var probe = URLRequest(url: page, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        probe.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        async let browserPage = network.data(for: probe)
        async let service = request("desktop-auth-exchange", timeout: 6)
        do {
            let ((html, result), (configuration, _)) = try await (browserPage, service)
            guard let response = result as? HTTPURLResponse, response.statusCode == 200,
                  response.url == page, response.mimeType == "text/html",
                  String(decoding: html.prefix(4096), as: UTF8.self)
                    .contains(#"<meta name="hoc-desktop-sign-in" content="1""#),
                  try JSONDecoder().decode(DesktopSignInSupport.self, from: configuration).version == 1 else {
                throw NativeAuthFailure.desktopSignInUnavailable
            }
        } catch let error as URLError {
            throw error
        } catch {
            throw NativeAuthFailure.desktopSignInUnavailable
        }
    }

    func account(token: String) async throws -> NativeAccountSession {
        let (bytes, response) = try await request("me", token: token)
        let current = response.value(forHTTPHeaderField: "x-new-token") ?? token
        return NativeAccountSession(account: try AuthWire.profile(bytes), token: try Self.bearer(current))
    }

    func confirm(email: String, code: String, token: String) async throws -> String {
        let (_, response) = try await request("confirm-verification-code",
                                              body: AuthWire.fields([(1, email), (2, code)]), token: token)
        return try Self.bearer(response.value(forHTTPHeaderField: "x-new-token") ?? token)
    }

    func resend(email: String, token: String) async throws -> String {
        let (_, response) = try await request("request-verification-code", body: AuthWire.fields([(1, email)]),
                                              token: token)
        return try Self.bearer(response.value(forHTTPHeaderField: "x-new-token") ?? token)
    }

    func requestPasswordReset(email: String) async throws {
        _ = try await request("request-password-reset", body: AuthWire.fields([(1, email)]))
    }

    func resetPassword(link: String, password: String) async throws {
        let reset = try PasswordResetLink(link)
        let body = AuthWire.fields([(1, reset.email), (2, password)]) + AuthWire.bytes(field: 3, reset.token)
        _ = try await request("reset-password", body: body)
    }

    func logout(token: String) async throws {
        _ = try await request("logout", body: Data(), token: token)
    }

    private func exchange(path: String, body: Data, json: Bool = false) async throws -> NativeAccountSession {
        let (bytes, response) = try await request(path, body: body, json: json)
        let token = try Self.bearer(response.value(forHTTPHeaderField: "Authorization"))
        return NativeAccountSession(account: try AuthWire.profile(bytes), token: token)
    }

    private func request(_ path: String, body: Data? = nil, token: String? = nil, json: Bool = false,
                         timeout: TimeInterval = 15) async throws
        -> (Data, HTTPURLResponse) {
        var req = URLRequest(url: baseURL.appendingPathComponent(path), timeoutInterval: timeout)
        req.httpMethod = body == nil ? "GET" : "POST"
        req.httpBody = body
        req.setValue(json ? "application/json" : "application/octet-stream", forHTTPHeaderField: "Content-Type")
        req.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        req.setValue(UUID().uuidString, forHTTPHeaderField: "x-request-id")
        req.setValue(deviceID, forHTTPHeaderField: "X-HoC-Device")
        if let token { req.setValue(token, forHTTPHeaderField: "Authorization") }
        let (bytes, result) = try await network.data(for: req)
        guard let response = result as? HTTPURLResponse else { throw NativeAuthFailure.invalidResponse }
        guard (200...299).contains(response.statusCode) else { throw NativeAuthFailure.http(response.statusCode) }
        return (bytes, response)
    }

    private static func bearer(_ value: String?) throws -> String {
        guard let value, !value.isEmpty, value.count <= 4096, !value.contains(where: \.isNewline) else {
            throw NativeAuthFailure.invalidResponse
        }
        return value.hasPrefix("Bearer ") ? value : "Bearer \(value)"
    }

    private struct DesktopGrant: Encodable {
        let code: String
        let verifier: String
    }

    private struct DesktopSignInSupport: Decodable {
        let version: Int
    }
}

final class RefuseServiceRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct PasswordResetLink {
    let email: String
    let token: Data

    init(_ link: String) throws {
        guard let parts = URLComponents(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "https", parts.host == "heroesofcrypto.io",
              parts.path == "/reset-password" || parts.path == "/reset-password/",
              let items = parts.queryItems,
              let email = items.first(where: { $0.name == "email" })?.value, !email.isEmpty,
              let hex = items.first(where: { $0.name == "token" })?.value,
              hex.utf8.count == 64, hex.count == 64, hex.allSatisfy(\.isHexDigit) else {
            throw NativeAuthFailure.invalidResetLink
        }
        var token = Data()
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else {
                throw NativeAuthFailure.invalidResetLink
            }
            token.append(byte)
            index = next
        }
        self.email = email
        self.token = token
    }
}

private enum AuthWire {
    static func fields(_ values: [(Int, String)]) -> Data {
        values.reduce(into: Data()) { result, field in
            if !field.1.isEmpty { result.append(bytes(field: field.0, Data(field.1.utf8))) }
        }
    }

    static func bytes(field: Int, _ value: Data) -> Data {
        Data(varint(UInt64((field << 3) | 2)) + varint(UInt64(value.count))) + value
    }

    private static func varint(_ value: UInt64) -> [UInt8] {
        var value = value
        var result: [UInt8] = []
        while value >= 0x80 {
            result.append(UInt8(value & 0x7f) | 0x80)
            value >>= 7
        }
        result.append(UInt8(value))
        return result
    }

    // ResponseMe uses fields 1, 2, and 6. Skip the other known protobuf wire types so the account fields
    // still decode when the server includes game data or adds new fields.
    static func profile(_ data: Data) throws -> NativeAccount {
        guard data.count <= 64 * 1024 else { throw NativeAuthFailure.invalidResponse }
        let input = [UInt8](data)
        var index = 0
        var username = ""
        var email = ""
        var verified = false

        func readVarint() throws -> UInt64 {
            var result: UInt64 = 0
            for shift in stride(from: 0, through: 63, by: 7) {
                guard index < input.count else { throw NativeAuthFailure.invalidResponse }
                let value = input[index]
                index += 1
                guard shift != 63 || value <= 1 else { throw NativeAuthFailure.invalidResponse }
                result |= UInt64(value & 0x7f) << shift
                if value < 0x80 { return result }
            }
            throw NativeAuthFailure.invalidResponse
        }

        while index < input.count {
            let tag = try readVarint()
            let field = tag >> 3
            guard field != 0 else { throw NativeAuthFailure.invalidResponse }
            switch tag & 7 {
            case 0:
                let value = try readVarint()
                if field == 6 { verified = value != 0 }
            case 1:
                index += 8
            case 2:
                let count = try readVarint()
                guard count <= UInt64(input.count - index) else { throw NativeAuthFailure.invalidResponse }
                let end = index + Int(count)
                if field == 1 || field == 2 {
                    guard let value = String(bytes: input[index..<end], encoding: .utf8) else {
                        throw NativeAuthFailure.invalidResponse
                    }
                    if field == 1 { username = value } else { email = value }
                }
                index = end
            case 5:
                index += 4
            default:
                throw NativeAuthFailure.invalidResponse
            }
            guard index <= input.count else { throw NativeAuthFailure.invalidResponse }
        }
        guard !username.isEmpty, !email.isEmpty else { throw NativeAuthFailure.invalidResponse }
        return NativeAccount(username: username, email: email, verified: verified)
    }
}
