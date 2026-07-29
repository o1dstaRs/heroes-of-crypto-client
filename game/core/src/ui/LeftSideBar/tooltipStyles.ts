/**
 * The sidebar's tooltip look: dark wood, gold border, parchment text.
 *
 * One definition, because it was three — MessageBox, UpNext and UnitStatsListItem each carried a private
 * copy, and SynergiesRow carried none at all, so synergy tooltips rendered in MUI's default styling and
 * were the only ones in the panel that looked foreign. Anything in the sidebar that opens a Tooltip should
 * pass this.
 */
export const commonTooltipSx = {
    backgroundColor: "#2d1606", // Deep dark brown/wood
    border: "2px solid #dcb158", // Metallic gold/bronze border
    color: "#efe4cc", // Parchment/Cream text for contrast
    borderRadius: "8px",
    boxShadow: "0 6px 12px rgba(0,0,0,0.8)",
    fontSize: "0.85rem",
    fontWeight: 500,
    maxWidth: "280px",
    zIndex: 10000,
};
