// Single source of the Nx module-boundary rule (tag contract revision 1), shared by the root flat
// config (ESLint 10) and apps/web/eslint.config.mjs (ESLint 9, the Next.js pin).
import nx from "@nx/eslint-plugin";

const depConstraints = [
  { sourceTag: "scope:backend", onlyDependOnLibsWithTags: ["scope:backend"] },
  {
    sourceTag: "scope:web",
    onlyDependOnLibsWithTags: ["scope:web", "scope:client"],
  },
  { sourceTag: "scope:client", onlyDependOnLibsWithTags: ["scope:client"] },
  { sourceTag: "type:app", onlyDependOnLibsWithTags: ["type:lib"] },
  { sourceTag: "type:lib", onlyDependOnLibsWithTags: ["type:lib"] },
];

export const moduleBoundaries = {
  files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs", "**/*.mts", "**/*.cts"],
  // Only the ESLint configs are exempt: apps/web/eslint.config.mjs must import this file by relative
  // path, which the rule would otherwise report as a workspace-root import. Other config files
  // (next.config.ts runs inside the web server) stay under the boundary rule.
  ignores: ["**/eslint.config.mjs"],
  plugins: { "@nx": nx },
  rules: {
    "@nx/enforce-module-boundaries": [
      "error",
      { enforceBuildableLibDependency: true, allow: [], depConstraints },
    ],
  },
};
