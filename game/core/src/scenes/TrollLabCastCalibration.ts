// Measured corresponding body features and material patches against rendered idle.
// Local record: heroesofcrypto-assets/design/troll_cast_20260920_v2/calibration.json
export const TROLL_CAST_CALIBRATION = [
    {
        matrix: [
            [0.9806236, 0.0037732, 7.3127895],
            [-0.0037732, 0.9806236, 4.907645],
        ],
        matches: 233,
        skin: {
            gain: [1.2605634, 1.2394366, 1.2302632],
            offset: [-32.3028169, -23.3239437, -20.7105263],
            sourceMedian: [147.0, 135.0, 116.0],
            idleMedian: [153.0, 144.0, 122.0],
            samples: 1483,
        },
        leather: {
            gain: [0.96, 1.0363636, 1.0149254],
            offset: [-3.56, -3.4, -3.6865672],
            sourceMedian: [111.0, 66.0, 46.0],
            idleMedian: [103.0, 65.0, 43.0],
            samples: 1320,
        },
        cloth: {
            gain: [0.9607843, 1.0243902, 1.0588235],
            offset: [-16.0784314, -8.4146341, -7.4117647],
            sourceMedian: [100.0, 58.0, 41.0],
            idleMedian: [80.0, 51.0, 36.0],
        },
    },
    {
        matrix: [
            [0.9846605, 0.0064083, 4.5118123],
            [-0.0064083, 0.9846605, 5.0105607],
        ],
        matches: 227,
        skin: {
            gain: [1.252669, 1.1780822, 1.205298],
            offset: [-26.3843416, -11.6849315, -11.8907285],
            sourceMedian: [144.0, 133.0, 111.5],
            idleMedian: [154.0, 145.0, 122.5],
            samples: 1468,
        },
        leather: {
            gain: [0.9714286, 1.0, 0.9545455],
            offset: [-2.9714286, 1.0, 0.8636364],
            sourceMedian: [106.0, 61.0, 41.0],
            idleMedian: [100.0, 62.0, 40.0],
            samples: 1293,
        },
        cloth: {
            gain: [0.98, 1.0769231, 1.0588235],
            offset: [-15.06, -8.2307692, -6.3529412],
            sourceMedian: [97.0, 55.0, 40.0],
            idleMedian: [80.0, 51.0, 36.0],
        },
    },
    {
        matrix: [
            [0.9848523, 0.0090908, 1.6555573],
            [-0.0090908, 0.9848523, 7.7853053],
        ],
        matches: 200,
        skin: {
            gain: [1.2463768, 1.2142857, 1.2236842],
            offset: [-33.7536232, -23.4285714, -17.9342105],
            sourceMedian: [137.0, 128.0, 107.0],
            idleMedian: [137.0, 132.0, 113.0],
            samples: 1588,
        },
        leather: {
            gain: [0.8995984, 0.9259259, 0.9322034],
            offset: [0.4457831, 3.037037, 0.0508475],
            sourceMedian: [114.0, 68.0, 45.0],
            idleMedian: [103.0, 66.0, 42.0],
            samples: 888,
        },
        cloth: {
            gain: [0.9423077, 1.05, 1.0588235],
            offset: [-11.4038462, -6.75, -6.3529412],
            sourceMedian: [97.0, 55.0, 40.0],
            idleMedian: [80.0, 51.0, 36.0],
        },
    },
    {
        matrix: [
            [0.9776581, 0.0032822, 9.7230768],
            [-0.0032822, 0.9776581, 6.4084721],
        ],
        matches: 210,
        skin: {
            gain: [1.2459016, 1.1627907, 1.2112676],
            offset: [-25.3934426, -10.1395349, -12.7183099],
            sourceMedian: [148.0, 136.0, 117.0],
            idleMedian: [159.0, 148.0, 129.0],
            samples: 1319,
        },
        leather: {
            gain: [0.9206349, 0.9433962, 1.0],
            offset: [3.2539683, 1.509434, -2.0],
            sourceMedian: [104.0, 62.0, 43.0],
            idleMedian: [99.0, 60.0, 41.0],
            samples: 1077,
        },
        cloth: {
            gain: [0.9423077, 1.0769231, 1.1612903],
            offset: [-12.3461538, -9.3076923, -10.4516129],
            sourceMedian: [98.0, 56.0, 40.0],
            idleMedian: [80.0, 51.0, 36.0],
        },
    },
] as const;
