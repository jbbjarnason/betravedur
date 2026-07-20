/**
 * Build the map attribution HTML from the domain ATTRIBUTION constant (single
 * source of truth for the CC BY 4.0 licensing requirement — UX-01, T-03-02).
 * The Veðurstofan text is NEVER hardcoded here; it comes from @betravedur/domain.
 * OSM + Protomaps basemap credit is appended (basemap licensing).
 */
import { ATTRIBUTION } from "@betravedur/domain";

/** The composed attribution HTML shown in the MapLibre AttributionControl. */
export function attributionHtml(): string {
  return (
    `${ATTRIBUTION.text_is} ${ATTRIBUTION.modifiedNotice_is} ` +
    `(<a href="${ATTRIBUTION.sourceUrl}" target="_blank" rel="noopener">${ATTRIBUTION.license}</a>) · ` +
    `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · ` +
    `<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>`
  );
}
