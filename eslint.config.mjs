import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import { moduleBoundaries } from "./eslint.module-boundaries.mjs";

export default defineConfig(
  // apps/web carries its own Next.js flat config.
  globalIgnores(["**/dist/**", "**/.next/**", "apps/web/**"]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  moduleBoundaries,
  {
    // Config files are not part of any tsconfig project, so type-aware rules cannot run on them.
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
