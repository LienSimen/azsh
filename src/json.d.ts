// resolveJsonModule is off: tsc literal-infers src/data/tables/*.json (and the lazy
// *data.json chunks) and OOMs a 16 GB box (V8 Zone / stack overflow, 2026-08-16).
// Vite still loads the files at runtime. Call sites already `as` the schema type.
declare module '*.json' {
  const value: unknown;
  export default value;
}
