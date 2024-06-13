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

import { b2Transform } from "../common/b2_math";
import { b2CollideEdgeAndPolygon } from "../collision/b2_collide_edge";
import { b2Manifold } from "../collision/b2_collision";
import { b2ChainShape } from "../collision/b2_chain_shape";
import { b2EdgeShape } from "../collision/b2_edge_shape";
import { b2PolygonShape } from "../collision/b2_polygon_shape";
import { b2Contact } from "./b2_contact";

/** @internal */
export class b2ChainAndPolygonContact extends b2Contact<b2ChainShape, b2PolygonShape> {
    private static Evaluate_s_edge = new b2EdgeShape();

    public Evaluate(manifold: b2Manifold, xfA: b2Transform, xfB: b2Transform): void {
        const edge = b2ChainAndPolygonContact.Evaluate_s_edge;
        this.GetShapeA().GetChildEdge(edge, this.m_indexA);
        b2CollideEdgeAndPolygon(manifold, edge, xfA, this.GetShapeB(), xfB);
    }
}
