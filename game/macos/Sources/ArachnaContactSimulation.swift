import Foundation

/// Rasterize the web's signed height and pressure field using its precomputed strand paths.
struct ArachnaContactSimulation {
    private let size: Int
    private let step: Double
    private let pinned: [Double]
    private let nodes: [(x: Double, y: Double)]
    private let offsets: [Int]
    private let table: [Double]

    init?(url: URL, size: Int) {
        guard let data = try? Data(contentsOf: url), size > 0, data.count.isMultiple(of: MemoryLayout<Double>.stride) else { return nil }
        let table = data.withUnsafeBytes { Array($0.bindMemory(to: Double.self)) }
        guard let count = table.first.map(Int.init), count > 0, table.count >= 2 + count * 3 else { return nil }
        let offsets = table[1..<(count + 2)].map { Int($0) * 4 + count * 3 + 2 }
        guard offsets.last == table.count else { return nil }
        let start = count + 2
        let nodes: [(x: Double, y: Double)] = (0..<count).map { node in
            let position = start + node * 2
            return (table[position], table[position + 1])
        }
        let step = 640 / Double(size)
        self.size = size
        self.step = step
        self.pinned = (0..<(size * size)).map { index in
            let x = (Double(index % size) + 0.5) * step
            let y = (Double(index / size) + 0.5) * step
            return Self.smooth(min(x - 3, 636 - x, y - 3, 636 - y) / 24)
        }
        self.nodes = nodes
        self.offsets = offsets
        self.table = table
    }

    func update(_ loads: [Double], pixels: UnsafeMutableBufferPointer<UInt8>) {
        var heights = Array(repeating: Float(0), count: size * size)
        var pressure = heights
        for n in stride(from: 0, to: loads.count, by: 5) {
            let x = loads[n], y = loads[n + 1]
            let load = loads[n + 2], age = loads[n + 3] / 1000, strength = loads[n + 4]
            addTension(x: x, y: y, age: age, strength: strength, load: load, heights: &heights)

            let wave = age * 110
            let amplitude = strength * 1.05 * exp(-age * 7) * Self.smooth(age / 0.035) *
                (1 - Self.smooth((age - 0.5) / 0.16))
            let radius = max(load > 0 ? 24 : 0, amplitude > 0.002 ? wave + 12 : 0)
            guard radius > 0 else { continue }
            let x0 = max(0, Int(floor((x - radius) / step)))
            let x1 = min(size - 1, Int(ceil((x + radius) / step)))
            let y0 = max(0, Int(floor((y - radius) / step)))
            let y1 = min(size - 1, Int(ceil((y + radius) / step)))
            guard x0 <= x1, y0 <= y1 else { continue }
            for row in y0...y1 {
                let dy = (Double(row) + 0.5) * step - y
                for column in x0...x1 {
                    let dx = (Double(column) + 0.5) * step - x
                    let d2 = dx * dx + dy * dy
                    let index = row * size + column
                    let weight = load > 0 ? load * exp(-d2 / 100) : 0
                    var ripple = 0.0
                    if amplitude > 0 {
                        let d = sqrt(d2) - wave
                        let front = d / 5
                        ripple = amplitude * exp(-front * front * 0.5) * cos(d * 0.48)
                    }
                    heights[index] = Float(Double(heights[index]) + (-2.8 * weight + ripple))
                    if weight > 0 { pressure[index] = Float(Double(pressure[index]) + weight * exp(-d2 / 48)) }
                }
            }
        }

        for index in heights.indices {
            let edge = pinned[index]
            let value = Int((32768 + max(-15, min(15, Double(heights[index]) * edge)) * 2048).rounded())
            let pixel = index * 4
            pixels[pixel] = UInt8(value >> 8)
            pixels[pixel + 1] = UInt8(value & 255)
            pixels[pixel + 2] = UInt8((min(1, Double(pressure[index])) * edge * 255).rounded())
            pixels[pixel + 3] = 255
        }
    }

    private func addTension(x: Double, y: Double, age: Double, strength: Double, load: Double, heights: inout [Float]) {
        guard age <= 0.66, strength > 0 || load > 0 else { return }
        var nearest = 0
        var distance = Double.infinity
        for (index, node) in nodes.enumerated() {
            let dx = node.x - x, dy = node.y - y
            let d2 = dx * dx + dy * dy
            if d2 < distance {
                distance = d2
                nearest = index
            }
        }
        distance = sqrt(distance)
        guard distance <= 32 else { return }
        let front = age * 190
        let attack = min(1, max(0, age / 0.025))
        let decay = exp(-age * 4.8) * max(0, min(1, (0.66 - age) / 0.16))
        let traveling = attack > 0 && decay > 0 && strength > 0
        func pulse(_ distance: Double) -> Double {
            guard distance.isFinite else { return 0 }
            let span = distance - front
            let shape = span / 8
            return exp(-shape * shape * 0.5) * cos(span * 0.3)
        }
        for entry in stride(from: offsets[nearest], to: offsets[nearest + 1], by: 4) {
            let cell = Int(table[entry])
            let d = table[entry + 1] + distance
            let sag = d < 20 ? -0.2 * load * (1 - d / 20) * (1 - d / 20) : 0
            var deflection = 0.0
            if traveling {
                let wave = pulse(d) - 0.32 * pulse(table[entry + 2] + distance)
                let transmission = 1 / sqrt(1 + d * 0.025)
                deflection = wave * strength * 1.05 * attack * decay * transmission
            }
            heights[cell] = Float(Double(heights[cell]) + (deflection + sag) * table[entry + 3])
        }
    }

    private static func smooth(_ value: Double) -> Double {
        let t = max(0, min(1, value))
        return t * t * (3 - 2 * t)
    }
}
