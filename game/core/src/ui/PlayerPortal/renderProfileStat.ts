const escape = (value: string | number): string =>
    String(value).replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );

/** Framework-independent profile statistic, shared by React and Astro. */
export function renderProfileStat(label: string, value: string | number, color?: string): string {
    const accent = color && /^#[\da-f]{3,8}$/i.test(color) ? ` style="color:${color}"` : "";
    return `<div class="hoc-profile-stat"><dt>${escape(label)}</dt><dd${accent}>${escape(value)}</dd></div>`;
}
