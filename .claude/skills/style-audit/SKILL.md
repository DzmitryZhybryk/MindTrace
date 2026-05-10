---
name: style-audit
description: Audit MindTrace frontend files (.tsx, .css, index.html) against the project's color and typography policy and report (or fix) deviations. Use when the user asks to check style consistency, audit colors/fonts, verify design-token compliance, or align stray hex values to the palette.
---

# Style audit

Scan visual files in `frontend/` against the canonical design tokens documented below. Report deviations and, when the user asks to fix them, apply edits.

## Scope

Files to audit:
- `frontend/src/**/*.tsx`
- `frontend/src/**/*.css`
- `frontend/index.html`

Out of scope:
- `frontend/node_modules/**`, `frontend/dist/**`
- CDN/asset URLs (e.g. globe textures)
- Mantine internal CSS classes
- Console messages, comments, alt text

## Canonical tokens

The source of truth for tokens is `frontend/src/theme.ts` and `frontend/src/index.css`. Treat the values below as the allowed set; anything else is a deviation.

### Color palette

**Slate scale** (defined in `theme.ts`, used via Mantine `c="slate.N"` or raw hex):

| token | hex |
|---|---|
| slate.0 | `#f8fafc` |
| slate.1 | `#f1f5f9` |
| slate.2 | `#e2e8f0` |
| slate.3 | `#cbd5e1` |
| slate.4 | `#94a3b8` |
| slate.5 | `#64748b` |
| slate.6 | `#475569` (primaryShade) |
| slate.7 | `#334155` |
| slate.8 | `#1e293b` |
| slate.9 | `#0f172a` |

**Brand & surface**:
- `#0a1230` — primary action button fill (used by `<Button color="#0a1230">`)
- `#1f2937` — body text default (in `index.css`)
- `#eef2f8` — `--app-bg`
- `#dbe2ec` — Paper border on auth cards
- `rgba(15, 30, 80, 0.10)` — auth Paper shadow

**Auth/home gradient stops**:
- `#f5f8fc` (light)
- `#dbe5f3` (mid)
- `#b8c8e0` (dark)

**Globe stage** (dark sphere placeholder + real globe):
- `#0a1230`, `#02040a`, `#000` — radial gradient stops
- `#cfe6ff` — globe placeholder hint text
- `#4ab3ff` and `rgba(74, 179, 255, *)` — atmosphere / aura accent

**Globe pins**:
- `#ffd54a` — visited-city dot
- `rgba(255, 213, 74, *)` — pin pulse glow
- `rgba(255, 255, 255, 0.35)` / `rgba(255, 255, 255, 0.55)` — pin ring
- `#ffffff` — pin label text
- `rgba(0, 0, 0, 0.7)` / `rgba(0, 0, 0, 0.95)` — pin label text-shadow

Anything else (e.g. `#3b82f6`, tailwind blues, arbitrary grays) is a **deviation** — flag it and propose the closest token from the list above.

### Typography

**Canonical font stack** (from `theme.ts`):

```
-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```

Acceptable shortenings in CSS:

```
-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif
```

Flag any stack that:
- starts with `system-ui` (legacy in this codebase — should be migrated to the canonical stack),
- omits `"Inter"`,
- introduces a different family (`Helvetica`, `Arial` alone, custom fonts).

**Allowed font sizes** (px):

```
10  — micro tracked label (group sublabel)
11  — tracking labels (titles, dates)
12  — caption / desc / globe hint
13  — small body
14  — body / dimmed text
15  — body emphasis
16  — item name (city/country/stat)
18  — greeting (h-tier 4)
22  — primary tabs (h-tier 3)
32  — large stat number (legacy, now replaced by 16/11 pair)
```

Sizes outside this scale are deviations.

**Tracking (letter-spacing) for uppercase labels**: between `0.16em` and `0.22em`. Outside this range → flag.

### Radii (from `theme.ts`)

`xs 4px` / `sm 8px` / `md 10px` / `lg 16px` / `xl 20px`.

Hardcoded `border-radius` values that don't match this scale (except `50%` for circles and `999px` for pills) should be flagged.

### Component conventions

- All Mantine `<Button>` for **primary actions** must include `color="#0a1230"`. A bare `<Button type="submit">` without the color prop is a deviation (it will render as the slate primaryShade #475569, visually inconsistent with Create account / Sign up).
- All Mantine `<Title>` in auth screens use `c="slate.8"`.
- Secondary/dimmed body text uses Mantine `c="dimmed"` or hex `#64748b`.

## Audit procedure

1. **Collect**: walk the in-scope file globs. For each file, extract:
   - hex color literals via `#[0-9a-fA-F]{3,8}\b`
   - `rgb()` / `rgba()` literals
   - `font-family` and shorthand `font:` declarations
   - Mantine `color="..."` / `c="..."` props (string-literal values)
   - `font-size` declarations and JSX `fz=` props
   - `border-radius` declarations and JSX `radius=` props
   - `letter-spacing` declarations

2. **Classify** each finding as one of:
   - ✅ matches a canonical token
   - ⚠ off-token but visually close (suggest replacement)
   - ❌ off-policy (no close match — needs decision)

3. **Component-level checks**:
   - For each `<Button type="submit">` in `frontend/src/pages/**`, verify `color="#0a1230"` is present.
   - For each `<Title>` in auth pages, verify `c="slate.8"`.

4. **Report** grouped by file:

   ```
   pages/LoginPage.tsx
     L122  Button missing color prop      → add color="#0a1230"
   sandbox/sandbox.css
     L28   font stack starts with system-ui  → migrate to canonical stack
   ```

5. **Fix** (only when the user asks): apply Edits using the suggestions, then re-run the collect step on the touched files and confirm clean.

## Notes for the auditor

- Don't expand scope into refactoring CSS structure or naming — only token compliance.
- When two tokens look equally close (e.g. a stray `#1e40af` vs `#0a1230` vs `#4ab3ff`), surface the choice to the user instead of guessing.
- Globe textures and CDN URLs are not styling — skip.
- If a deviation appears in only ONE file but matches a clear pattern, propose either (a) updating the lone deviation to match the canonical token, or (b) adding the new value to the canonical list — let the user pick.
- Treat `frontend/src/sandbox/**` with the same rigor as production code; sandbox files often drift first and should not become a parallel design system.
