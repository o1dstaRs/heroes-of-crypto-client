// MIT License

// Copyright (c) 2019 Erin Catto

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { b2Vec2, b2Transform } from "./b2_math";
import { b2Color, b2Draw, debugColors } from "./b2_draw";
import { b2Body, b2BodyType } from "../dynamics/b2_body";
import { b2Fixture } from "../dynamics/b2_fixture";
import { b2World } from "../dynamics/b2_world";
import { b2MakeArray } from "./b2_common";
import { b2AABB } from "../collision/b2_collision";

const temp = {
    cA: new b2Vec2(),
    cB: new b2Vec2(),
    vs: b2MakeArray(4, b2Vec2),
    xf: new b2Transform(),
};

export function GetShapeColor(b: b2Body, isLightMode: boolean) {
    const userData = b.GetUserData();
    if (userData) {
        if (b.IsActive()) {
            return debugColors.active;
        }
        if (userData.team === 1) {
            return debugColors.teamA;
        }
        if (userData.team === 2) {
            return debugColors.teamB;
        }
    }

    if (b.GetType() === b2BodyType.b2_dynamicBody && b.m_mass === 0) {
        return debugColors.badBody;
    }
    if (!b.IsEnabled()) {
        return debugColors.disabledBody;
    }
    if (b.GetType() === b2BodyType.b2_staticBody) {
        return isLightMode ? new b2Color(0, 0, 0) : new b2Color(1, 1, 1);
    }
    if (b.GetType() === b2BodyType.b2_kinematicBody) {
        return debugColors.kinematicBody;
    }
    if (!b.IsAwake()) {
        return debugColors.sleepingBody;
    }
    return debugColors.body;
}

function testOverlap(fixture: b2Fixture, aabb: b2AABB) {
    for (let i = 0; i < fixture.m_proxyCount; i++) {
        if (aabb.TestOverlap(fixture.GetAABB(i))) {
            return true;
        }
    }
    return false;
}

export function DrawShapes(draw: b2Draw, world: b2World, within?: b2AABB) {
    const isLightMode = localStorage.getItem("joy-mode") === "light";
    const activeColor = isLightMode ? new b2Color(0, 0, 0, 1) : new b2Color(1, 1, 1, 1);
    for (let b = world.GetBodyList(); b; b = b.m_next) {
        const xf = b.m_xf;

        draw.PushTransform(xf);

        for (let f: b2Fixture | null = b.GetFixtureList(); f; f = f.m_next) {
            if (within && !testOverlap(f, within)) continue;

            const fixtureUserData = f.GetUserData();
            if (fixtureUserData) {
                const fixtureTeam = fixtureUserData.team;
                if (fixtureTeam === 1) {
                    if (isLightMode) {
                        f.GetShape().Draw(draw, new b2Color(0.823529411764706, 0.098039215686275, 0.043137254901961));
                    } else {
                        f.GetShape().Draw(draw, new b2Color(0.956862745098039, 0.262745098039216, 0.211764705882353));
                    }
                } else if (isLightMode) {
                    f.GetShape().Draw(draw, new b2Color(0, 0.631372549019608, 0));
                } else {
                    f.GetShape().Draw(draw, new b2Color(0.419607843137255, 0.870588235294118, 0.329411764705882));
                }
            } else if (
                f.IsSensor() ||
                !b.GetUserData() ||
                (b.GetUserData() &&
                    b.GetUserData().team !== 1 &&
                    b.GetUserData().team !== 2 &&
                    b.GetUserData().id !== "BLOCK")
            ) {
                f.GetShape().Draw(draw, GetShapeColor(b, isLightMode));
            } else if (b.IsActive()) {
                f.GetShape().Draw(draw, activeColor);
            }
        }

        draw.PopTransform(xf);
    }
}

export function DrawJoints(draw: b2Draw, world: b2World) {
    for (let j = world.GetJointList(); j; j = j.m_next) {
        j.Draw(draw);
    }
}

export function DrawPairs(draw: b2Draw, world: b2World) {
    for (let contact = world.GetContactList(); contact; contact = contact.m_next) {
        const fixtureA = contact.GetFixtureA();
        const fixtureB = contact.GetFixtureB();
        const indexA = contact.GetChildIndexA();
        const indexB = contact.GetChildIndexB();
        const cA = fixtureA.GetAABB(indexA).GetCenter(temp.cA);
        const cB = fixtureB.GetAABB(indexB).GetCenter(temp.cB);

        draw.DrawSegment(cA, cB, debugColors.pair);
    }
}

export function DrawAABBs(draw: b2Draw, world: b2World, within?: b2AABB) {
    const { vs } = temp;
    for (let b = world.GetBodyList(); b; b = b.m_next) {
        if (!b.IsEnabled()) {
            continue;
        }

        for (let f: b2Fixture | null = b.GetFixtureList(); f; f = f.m_next) {
            for (let i = 0; i < f.m_proxyCount; ++i) {
                const { aabb } = f.m_proxies[i].treeNode;
                if (within && !within.TestOverlap(aabb)) continue;

                vs[0].Set(aabb.lowerBound.x, aabb.lowerBound.y);
                vs[1].Set(aabb.upperBound.x, aabb.lowerBound.y);
                vs[2].Set(aabb.upperBound.x, aabb.upperBound.y);
                vs[3].Set(aabb.lowerBound.x, aabb.upperBound.y);

                draw.DrawPolygon(vs, 4, debugColors.aabb);
            }
        }
    }
}

export function DrawCenterOfMasses(draw: b2Draw, world: b2World) {
    const { xf } = temp;
    for (let b = world.GetBodyList(); b; b = b.m_next) {
        xf.q.Copy(b.m_xf.q);
        xf.p.Copy(b.GetWorldCenter());
        draw.DrawTransform(xf);
    }
}
