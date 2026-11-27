#ifndef HOC_MACOS_ENGINE_H
#define HOC_MACOS_ENGINE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct HOCSkirmish HOCSkirmish;
typedef struct { int32_t x; int32_t y; } HOCDeploymentCell;

typedef enum {
    HOCWait = 1,
    HOCDefend = 2,
    HOCEndTurn = 3,
    HOCCycleAttack = 4,
} HOCTurnCommand;

// All calls for a battle are serialized by the caller. The returned handle owns a copy of the snapshot.
HOCSkirmish *hoc_macos_create(const uint8_t *json, size_t length, char *error, size_t error_capacity);
// Register opening footprints on a fresh sandbox snapshot. Bit 1 controls red AI and bit 2 controls green AI.
bool hoc_macos_configure_sandbox(HOCSkirmish *battle, const HOCDeploymentCell *anchors, size_t count, uint8_t automated_teams);
bool hoc_macos_set_automation(HOCSkirmish *battle, uint8_t automated_teams);
void hoc_macos_destroy(HOCSkirmish *battle);

// Returns the UTF-8 JSON byte count (0 on error). Writes only when capacity is sufficient.
size_t hoc_macos_view(HOCSkirmish *battle, uint8_t *output, size_t capacity);

// Coordinates use the engine's y-up grid. Combat commands act on the active human-controlled stack.
bool hoc_macos_choose_cell(HOCSkirmish *battle, int32_t x, int32_t y);
// A side of -1 selects a melee landing anchor. Values 0 through 3 aim at a target cell edge.
bool hoc_macos_attack_angle(HOCSkirmish *battle, uint8_t target_id, int32_t x, int32_t y, int32_t side);
bool hoc_macos_select_stack(HOCSkirmish *battle, uint8_t id);
bool hoc_macos_ready(HOCSkirmish *battle);
bool hoc_macos_turn_command(HOCSkirmish *battle, HOCTurnCommand command);
// Pass -1 to close the aimed spell. Aimed spells can target cells or stacks through choose_cell.
bool hoc_macos_prepare_spell(HOCSkirmish *battle, int32_t spell);
bool hoc_macos_cast_untargeted(HOCSkirmish *battle);
bool hoc_macos_opponent_turn(HOCSkirmish *battle, bool force_after_timeout);

#endif
