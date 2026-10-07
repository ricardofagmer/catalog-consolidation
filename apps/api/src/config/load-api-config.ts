// The only module that reads process.env: configuration is validated here once and then injected.
import { statSync } from "node:fs";
import { parseApiConfig, type ApiConfig } from "./api-config.js";

export function loadApiConfig(): ApiConfig {
  return parseApiConfig({ env: process.env, isRegularFile });
}

function isRegularFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}
