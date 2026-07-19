// @betravedur/fetch — Node-only build-time API client for api.vedur.is.
export { BASE_URL, fetchWithRetry } from "./client.js";
export {
  fetchAwsDay,
  fetchSynopDay,
  parseObservationBody,
  normalizeObservations,
  assertObservationSchema,
} from "./observations.js";
export type { ObservationKind } from "./observations.js";
export { fetchStations, parseStationsBody, toStationMeta, writeRegistry } from "./stations.js";
export { buildRegistry, serializeRegistry } from "./registry.js";
