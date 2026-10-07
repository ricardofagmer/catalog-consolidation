# 10: Design system and theme toggle

**What to build:** The web app adopts Tailwind v4 with shadcn/ui components and design tokens as CSS variables, with class-based theming through next-themes. A theme toggle offers light, dark and system, persists the choice and never flashes the wrong theme. The look is neutral and minimal with one accent colour, thin borders, tight type and subtle shadows, with native controls styled through `color-scheme`. Fonts are local.

**Blocked by:** 09

**Closes checks:** C27

**Status:** done

- [ ] The toggle offers three states; each applies immediately and the choice survives a reload
- [ ] A reload with dark stored paints dark from the first frame and the served HTML has a blocking theme script ahead of the content
- [ ] Tokens exist for both themes with no hard-coded colours in components; `color-scheme` styles form controls
- [ ] No third-party font request leaves the machine (fonts are local or a system stack)
- [ ] `next build`, lint and typecheck pass for `web`

## Comments
