// @betravedur/pipeline — Node-only, build-time pipeline workspace.
// Never bundled into the browser: uses Node built-ins (zlib/crypto/fetch) only.
// Barrel re-exports land as modules are added (derive in Plan 01; backfill/aggregate later).
export { encodeDerived, decodeDerived } from "./derive.js";
export type { DerivedFile, QuantSpec } from "./derive.js";
