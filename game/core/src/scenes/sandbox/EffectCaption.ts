import { Container, Rectangle, Text, TextStyle } from "pixi.js";
import { glyphScaleX } from "../../pixi/boardMirror";
import { HOC_NUMERIC_ARIAL_FONT_FAMILY } from "../../fontFamilies";
import { effectCaption, type EffectFaction } from "../effectCaptions";

const styles = new Map<string, TextStyle>();
export interface EffectCaptionView {
    root: Container;
    text: Text;
    owner: Container;
}
/** Reserve two readable lines before layout so new captions cannot overlap neighboring flag effects. */
export function addEffectCaption(
    owner: Container,
    name: string,
    cell: number,
    compact = false,
    sourceFaction?: EffectFaction,
): EffectCaptionView {
    const caption = effectCaption(name, sourceFaction);
    const size = cell * (compact ? 0.2 : 0.25);
    const width = cell * (compact ? 1 : 1.9);
    const lineHeight = size * 1.2;
    const key = `${caption.color}:${size}:${width}`;
    let style = styles.get(key);
    if (!style) {
        style = new TextStyle({
            fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
            fontSize: size,
            lineHeight,
            fontWeight: "700",
            fill: caption.color,
            align: "center",
            wordWrap: true,
            wordWrapWidth: width,
            breakWords: true,
            stroke: { color: "#101319", width: Math.max(1.5, cell * 0.023), join: "round" },
            dropShadow: { color: "#000000", alpha: 0.75, blur: 2, distance: 1 },
        });
        styles.set(key, style);
    }
    const bounds = owner.getLocalBounds();
    const root = new Container();
    root.label = "effect-caption";
    root.eventMode = "none";
    root.position.set((bounds.minX + bounds.maxX) / 2, bounds.maxY + cell * 0.055);
    // Fixed caption metrics keep Pixi's flag-layout pass from forcing cold canvas/font measurements.
    root.boundsArea = new Rectangle(-width / 2 - 2, -2, width + 4, lineHeight * 2 + 5);
    const text = new Text({ text: caption.name, style });
    text.anchor.set(0.5, 0);
    text.label = `effect-name:${caption.name}`;
    root.addChild(text);
    owner.addChild(root);
    const view = { root, text, owner };
    updateEffectCaption(view);
    return view;
}
export function updateEffectCaption(view: EffectCaptionView, mirrorOwner = view.owner): void {
    // Some motif rows already counter the board flip; cancel it exactly once for their caption too.
    view.root.scale.x = glyphScaleX() * (mirrorOwner.scale.x < 0 ? -1 : 1);
}
