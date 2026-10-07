"use client";

import { Monitor, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const satisfies readonly { value: string; label: string; icon: LucideIcon }[];

type ThemeChoice = (typeof THEME_OPTIONS)[number]["value"];

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return THEME_OPTIONS.some((option) => option.value === value);
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

// False during the server render and hydration, true afterwards: the stored theme is only known
// in the browser, so anything derived from it waits to avoid a hydration mismatch.
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export function ThemeToggle(): ReactNode {
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();
  const choice = isMounted && isThemeChoice(theme) ? theme : null;
  const ActiveIcon = THEME_OPTIONS.find((option) => option.value === choice)?.icon ?? SunMoon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme" title="Theme">
          <ActiveIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={choice ?? ""}
          onValueChange={(value) => {
            if (isThemeChoice(value)) {
              setTheme(value);
            }
          }}
        >
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
