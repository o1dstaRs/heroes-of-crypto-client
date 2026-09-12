export const SHOT_TRAJECTORY_STYLE_STORAGE_KEY = "hoc-shot-trajectory-style-v2";

export const SHOT_TRAJECTORY_STYLES = [
    { id: "ember-dashes", label: "01 · Огненные штрихи", description: "Текущий поток светящихся штрихов." },
    { id: "solid-gold", label: "02 · Цельная золотая", description: "Чистая непрерывная линия с мягким свечением." },
    { id: "twin-tracer", label: "03 · Двойной трассер", description: "Две тонкие направляющие и бегущий центр." },
    {
        id: "marching-chevrons",
        label: "04 · Бегущие шевроны",
        description: "Последовательность стрелок, подчёркивающая направление.",
    },
    {
        id: "double-chevron-pulses",
        label: "05 · Парные — светлая кость",
        description: "Резные молочные шевроны с тёплой бронзовой направляющей.",
    },
    {
        id: "forged-double-chevrons",
        label: "06 · Парные — кованое золото",
        description: "Тяжёлый тёмный кант и золотая грань без направляющей и точек.",
    },
    {
        id: "ember-double-chevrons",
        label: "07 · Парные — раскалённая бронза",
        description: "Обугленный сердечник и пульсирующий огненный край.",
    },
    {
        id: "gold-casings",
        label: "08 · Стрела по частям",
        description: "Оперение у стрелка, сегменты древка на линии и наконечник у цели.",
    },
] as const;

export type ShotTrajectoryStyle = (typeof SHOT_TRAJECTORY_STYLES)[number]["id"];

export const DEFAULT_SHOT_TRAJECTORY_STYLE: ShotTrajectoryStyle = "gold-casings";

export const isShotTrajectoryStyle = (value: unknown): value is ShotTrajectoryStyle =>
    SHOT_TRAJECTORY_STYLES.some((style) => style.id === value);

export const getShotTrajectoryStyle = (): ShotTrajectoryStyle => {
    if (typeof window === "undefined") return DEFAULT_SHOT_TRAJECTORY_STYLE;
    const stored = window.localStorage.getItem(SHOT_TRAJECTORY_STYLE_STORAGE_KEY);
    return isShotTrajectoryStyle(stored) ? stored : DEFAULT_SHOT_TRAJECTORY_STYLE;
};

export const setShotTrajectoryStyle = (style: ShotTrajectoryStyle): void => {
    if (typeof window !== "undefined") window.localStorage.setItem(SHOT_TRAJECTORY_STYLE_STORAGE_KEY, style);
};
