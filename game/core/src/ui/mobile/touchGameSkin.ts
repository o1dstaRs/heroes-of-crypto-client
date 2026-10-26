import { images } from "../../generated/image_imports";

/** Touch controls reuse the shipped sidebar skin, including its authored corners and stone face. */
export const touchGameSkin = {
    "--hoc-touch-frame": `url(${images.ui_container_frame_2_9slice})`,
    "--hoc-touch-plate": `url(${images.ui_start_button_plate_trimmed})`,
    "--hoc-touch-stone": `url(${images.ui_draft_action_stone_texture_v1})`,
    "--hoc-touch-radio-off": `url(${images.ui_fantasy_radio_off})`,
    "--hoc-touch-radio-on": `url(${images.ui_fantasy_radio_on})`,
    "--hoc-touch-slider-thumb": `url(${images.slider_dot})`,
} as const;
