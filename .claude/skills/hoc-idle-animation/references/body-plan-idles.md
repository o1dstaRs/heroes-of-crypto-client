# Idle language by body plan

Use support geometry and mass distribution to select an idle language. A material or personality modifier such as armored, undead, elastic, or mechanical changes the expression within a family; it does not replace the support family.

Record `bodyPlanFamily`, `supportModel`, `stableAnchor`, `primaryMass`, and the closest approved production record before drawing key poses. If no approved record exists for that family, use calibration mode.

## Grounded bipeds — currently calibrated

Peasant and Squire work provides the current evidence for humanlike grounded bipeds. Both feet normally define the support baseline while the pelvis and torso carry the visible breathing motion.

- On inhale, the ribcage widens locally, the upper torso rises and may recline slightly, and shoulders, arms, held equipment, cloth, and head follow as one connected chain.
- On exhale, the ribcage narrows and the upper torso may settle slightly forward. Do not reverse this physiology or imitate it by stretching the whole sprite.
- The head may translate or rotate naturally with the spine, but its authored size and identity remain constant.
- Preserve planted feet unless the approved concept explicitly includes a weight shift. A stable foot row alone is insufficient: also control pelvis position, optical center, apparent scale, and silhouette width.
- Treat both hands, grips, shaft, blade, fork, shield, or other held equipment as a connected kinematic chain. Angular changes should progress smoothly rather than snapping between poses.

These rules apply to humanlike bipeds. A birdlike, digitigrade, giant, or unusually jointed biped may require a separate calibrated subtype.

## Grounded quadrupeds

Use the support polygon formed by the planted feet rather than a single human foot line. Breathing usually reads through ribcage volume, spine arc, shoulders, flanks, and head counter-motion. Do not copy biped torso lean or arm/weapon behavior. Any weight shift must remain consistent with which feet carry load.

## Grounded multipeds

Anchor the body to the active contact set and distribute motion through segments or the body shell. Avoid moving every leg in phase, which reads as scaling or hovering. Small traveling compression, antenna motion, or shell settling may be more appropriate than mammalian breathing.

## Legless ground-supported or coiled creatures

Replace `footAnchorY` reasoning with a recorded contact band, coil base, belly line, or lowest support region. Use local compression, extension, coil settling, or upper-body sway without sliding the entire contact patch. Never invent a foot-like bounce merely to reuse a grounded-biped loop.

## Rooted or planted creatures

Lock the root mass or planted base. Let motion accumulate upward through trunk, branches, leaves, tendrils, or crown with believable lag. Avoid translating the root contact or moving the whole silhouette as a rigid pendulum.

## Flying or hovering creatures

Use a stable body centroid or hover anchor rather than a ground baseline. Define the permitted vertical envelope, pitch, wing or energy phase, and counter-motion. The loop may drift around the anchor, but must not climb, sink, or change apparent scale over repeated cycles.

## Wheeled, suspended, or mechanically supported creatures

Record the actual support mechanism: wheels, tracks, cables, levitation field, fixed chassis, or articulated legs. Use suspension settling, pressure cycles, controlled vibration, glow, or mechanical reciprocation. Do not apply organic breathing unless the creature visibly contains a living body that supports it.

## Cross-family approval boundary

An approved record may seed production only when support geometry, mass path, and primary idle mechanism match. Shared palette, faction, equipment, or visual style is not enough. When in doubt, reuse identity and rendering constraints but recalibrate motion.
