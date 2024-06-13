import React from "react";
import { Link } from "@react-nano/router";

import { getSceneLink } from "../../utils/reactUtils";
import { SceneEntry } from "../../scenes/scene";
import { Section } from "../Section";

export interface TestsFolderProps {
    name: string;
    link: string;
    tests: SceneEntry[];
}

export const TestsFolder = ({ name, link, tests }: TestsFolderProps) => {
    const active = tests.some((test) => link === getSceneLink(test));
    return (
        <Section legend={name} legendClassName={active ? "active-legend" : ""}>
            {tests.map((test) => (
                <Link
                    href={getSceneLink(test)}
                    key={test.name}
                    className={link === getSceneLink(test) ? "active-link" : ""}
                >
                    {test.name}
                </Link>
            ))}
        </Section>
    );
};
