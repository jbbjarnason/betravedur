// @betravedur/pipeline — Node-only, build-time pipeline workspace.
// Never bundled into the browser: uses Node built-ins (zlib/crypto/fetch) only.
// Barrel re-exports land as modules are added (derive in Plan 01; backfill/aggregate later).
export { encodeDerived, decodeDerived } from "./derive.js";
export type { DerivedFile, QuantSpec } from "./derive.js";
export { fetchChunk, backfillStation, PACE_MS, CHUNK_YEARS } from "./backfill.js";
export type { ObservationKind, FetchDeps, BackfillDeps } from "./backfill.js";
export {
  upsertPartition,
  readPartition,
  highWaterYear,
  partitionPath,
  DEFAULT_ROOT,
} from "./rawstore.js";
export { contentHash, updateManifest, serializeManifest, readManifest, HASH_LEN } from "./manifest.js";
export type { Manifest, ManifestEntry, HighWaterMarks } from "./manifest.js";
