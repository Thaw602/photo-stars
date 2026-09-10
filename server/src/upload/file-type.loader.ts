// file-type v19 is ESM-only. With `module: commonjs`, tsc downlevels
// `import('file-type')` to `require('file-type')`, which fails at runtime
// (ERR_PACKAGE_PATH_NOT_EXPORTED: no CommonJS entry). Build a native dynamic
// import via Function so tsc leaves the body untouched and Node loads the ESM
// build directly. The specifier is a fixed literal passed as an argument — it is
// never interpolated into the function body, so there is no injection surface.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

export function loadFileType(): Promise<typeof import('file-type')> {
  return dynamicImport('file-type') as Promise<typeof import('file-type')>;
}
