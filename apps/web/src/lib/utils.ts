import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Later classes win over conflicting earlier ones, so a caller's className can override a variant.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
