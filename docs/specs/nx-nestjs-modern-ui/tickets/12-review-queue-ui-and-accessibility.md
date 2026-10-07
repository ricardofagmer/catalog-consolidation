# 12: Review queue UI and accessibility

**What to build:** The review queue is redesigned in the new shell: each Review Item beside its Candidates and similarity score, filterable by status, with link, create and reject buttons that disable while pending and an "already resolved" notice on a repeated submit. The accessibility carry-overs are completed: skip link, a live region present before notices fill, review-specific accessible names on repeated buttons, visible focus, reduced-motion respect and contrast of at least 4.5:1 in both themes.

**Blocked by:** 11

**Closes checks:** C30, C31

**Status:** done

- [ ] While a resolution is pending its buttons are disabled; submitting the same resolution twice shows the "already resolved" notice and creates no second link
- [ ] Contrast of every text and background token pair is at least 4.5:1 in both themes, with the computed values recorded
- [ ] The skip link is the first focus stop, focus is always visible, notices sit in a live region that exists before they fill, and repeated buttons have review-specific names
- [ ] With reduced motion requested no animation or transition runs
- [ ] `next build`, lint and typecheck pass for `web`

## Comments
