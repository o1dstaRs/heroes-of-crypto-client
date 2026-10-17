import type { Plugin } from "vite";
import preferences from "../src/settings/approvedBrowserPreferences.json";

export function approvedBrowserPreferencesScript(): string {
    const values = JSON.stringify(preferences).replace(/</g, "\\u003c");
    return `try{for(const [key,value] of Object.entries(${values})){if(localStorage.getItem(key)===null)localStorage.setItem(key,value);}}catch{}`;
}

export function approvedBrowserPreferencesPlugin(): Plugin {
    return {
        name: "hoc-approved-browser-preferences",
        transformIndexHtml() {
            return [{ tag: "script", injectTo: "head-prepend", children: approvedBrowserPreferencesScript() }];
        },
    };
}
