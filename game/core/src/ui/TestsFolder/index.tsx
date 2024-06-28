import React from "react";
import { Link, useLocation } from "react-router-dom";

import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";
import { Section } from "../Section";

export interface TestsFolderProps {
    name: string;
    link: string;
    tests: SceneEntry[];
}

export const TestsFolder = ({ name, link, tests }: TestsFolderProps) => {
    const location = useLocation();
    const active = tests.some((test) => link === getSceneLink(test));
    return (
        <Section legend={name} legendClassName={active ? "active-legend" : ""}>
            {tests.map((test) => (
                <Link
                    to={getSceneLink(test)}
                    key={test.name}
                    className={location.pathname === getSceneLink(test) ? "active-link" : ""}
                >
                    {test.name}
                </Link>
            ))}
        </Section>
    );
};
