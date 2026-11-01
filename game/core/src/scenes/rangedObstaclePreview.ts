import {
    AbilityHelper,
    GridMath,
    type AttackHandler,
    type Grid,
    type HoCMath,
    type IAttackObstacle,
    type IRangeAttackEvaluation,
    type Unit,
} from "@heroesofcrypto/common";

export interface RangedObstaclePreview {
    hits: IAttackObstacle[];
    blocker?: IAttackObstacle;
    evaluation: IRangeAttackEvaluation;
}

export function projectRangedObstacles({
    attacker,
    grid,
    units,
    handler,
    aim,
    from = attacker.getPosition(),
    evaluation = handler.evaluateRangeAttack(
        units,
        attacker,
        from,
        aim,
        attacker.hasAbilityActive("Through Shot"),
        false,
        attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw"),
    ),
    obstacleTarget = false,
    blastCells = evaluation.affectedCells.flat(),
}: {
    attacker: Unit;
    grid: Grid;
    units: ReadonlyMap<string, Unit>;
    handler: Pick<AttackHandler, "evaluateRangeAttack" | "getObstacleIntersections">;
    aim: HoCMath.XY;
    from?: HoCMath.XY;
    evaluation?: IRangeAttackEvaluation;
    obstacleTarget?: boolean;
    blastCells?: readonly HoCMath.XY[];
}): RangedObstaclePreview {
    if (!grid.hasScatteredMountains()) return { hits: [], blocker: evaluation.attackObstacle, evaluation };

    if (attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw")) {
        const settings = grid.getSettings();
        const blast = new Set(blastCells.map((cell) => `${cell.x}:${cell.y}`));
        const hits = grid
            .getScatteredMountainsStanding()
            .filter((cell) => blast.has(`${cell.x}:${cell.y}`))
            .map((cell) => {
                const position = GridMath.getPositionForCell(
                    cell,
                    settings.getMinX(),
                    settings.getStep(),
                    settings.getHalfStep(),
                );
                return { position, size: 1, distance: Math.hypot(position.x - from.x, position.y - from.y) };
            });
        return { hits, evaluation };
    }

    const doubleShot = AbilityHelper.getDoubleShotAbility(attacker);
    const intersections = obstacleTarget || doubleShot ? handler.getObstacleIntersections(from, aim) : [];
    const hits = intersections.length
        ? intersections.slice(0, doubleShot ? 2 : 1)
        : evaluation.attackObstacle
          ? [evaluation.attackObstacle]
          : [];
    const blocker =
        obstacleTarget || !doubleShot || hits.length >= 2
            ? hits.at(-1)
            : intersections.length
              ? undefined
              : evaluation.attackObstacle;
    return { hits, blocker, evaluation };
}
