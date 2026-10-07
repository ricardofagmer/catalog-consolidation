import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import { moduleBoundaries } from "../../eslint.module-boundaries.mjs";

export default defineConfig(
  globalIgnores([".next/**", "next-env.d.ts", "node_modules/**"]),
  nextCoreWebVitals,
  nextTypescript,
  tseslint.configs.strict,
  moduleBoundaries,
  {
    rules: {
      // React escapes rendered text; raw HTML injection is the one way around that.
      "react/no-danger": "error",
    },
  },
);
