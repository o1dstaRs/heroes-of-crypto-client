/** Native 1280×768 attack cels: measured opaque steel tips, with a 3px overlap. */
export const PIKEMAN_SPEAR_TIPS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
    attack: [
        [902, 19],
        [981, 121],
        [1172, 327],
        [1210, 310],
        [986, 69],
        [902, 19],
    ],
    attack_up: [
        [902, 19],
        [975, 65],
        [1140, 37],
        [1170, 68],
        [1036, 59],
        [902, 19],
    ],
    attack_down: [
        [902, 19],
        [962, 107.5],
        [1129, 557],
        [1150, 575.5],
        [1052, 550],
        [902, 19],
    ],
};

/** Rear shaft endpoints in the two thrust cels, measured on the same native canvas. */
export const PIKEMAN_SPEAR_BUTTS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
    attack: [
        [360, 310],
        [400, 300],
    ],
    attack_up: [
        [418, 410],
        [425, 390],
    ],
    attack_down: [
        [400, 190],
        [425, 188],
    ],
};

/** Visual length beyond the steel tip, relative to the entire painted weapon. */
export const PIKEMAN_SPEAR_EXTENSION_RATIO = 0.35;
