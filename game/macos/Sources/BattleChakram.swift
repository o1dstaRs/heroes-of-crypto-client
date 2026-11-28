import CoreGraphics
import Foundation

struct BattleChakram {
    struct Point {
        let logical: CGPoint
        var hand = false
    }

    struct Leg {
        let from: Point
        let to: Point
        let start: TimeInterval
        let end: TimeInterval
    }

    struct Impact {
        let point: Point
        let time: TimeInterval
        let contact: Moment.ChakramFlight.Contact
        let ricochets: Bool
    }

    let release: TimeInterval
    let legs: [Leg]
    let impacts: [Impact]
    let catchTime: TimeInterval

    init(origin: CGPoint, destination: CGPoint, release: TimeInterval,
         contacts: [Moment.ChakramFlight.Contact], positions: [Int: CGPoint], cellsPerSecond: CGFloat = 10.5) {
        let hand = Point(logical: origin, hand: true)
        var previous = hand
        var time = release
        var legs: [Leg] = []
        var impacts: [Impact] = []
        func fly(to point: Point) {
            let distance = hypot(point.logical.x - previous.logical.x, point.logical.y - previous.logical.y)
            let arrival = time + max(1.0 / 60, distance / cellsPerSecond)
            legs.append(Leg(from: previous, to: point, start: time, end: arrival))
            previous = point
            time = arrival
        }
        if contacts.isEmpty { fly(to: Point(logical: destination)) }
        for (index, contact) in contacts.enumerated() {
            if contact.route.count > 2 {
                for cell in contact.route.dropFirst().dropLast() {
                    fly(to: Point(logical: BattlefieldProjection.logicalCenter([cell])))
                }
            }
            let arrival = contact.route.last.map { BattlefieldProjection.logicalCenter([$0]) }
            let at = index == 0 ? destination
                : (contact.kind == .shield ? arrival : positions[contact.target]) ?? arrival ?? previous.logical
            fly(to: Point(logical: at))
            impacts.append(Impact(point: previous, time: time, contact: contact,
                                  ricochets: contact.kind == .hit && index + 1 < contacts.count))
        }
        fly(to: hand)
        self.release = release
        self.legs = legs
        self.impacts = impacts
        self.catchTime = time
    }

    var firstImpact: TimeInterval { legs.first?.end ?? release }

    func leg(at elapsed: TimeInterval) -> Leg? { legs.first { ($0.start..<$0.end).contains(elapsed) } }
}
