# Code Review Note: landing page build script renamed

## Summary
The change that renames the `build` npm script in `apps/landingPage/package.json` to `build#` removes the standard build script from that package.

## Impact
Our workspace relies on `pnpm --filter @first2apply/landing-page build` (and similar CI commands) to build the landing page. With the script renamed, that command now fails with:

```
None of the selected packages has a "build" script
```

This breaks the build pipeline for the landing page package and any aggregate `pnpm run build` workflows that expect a `build` script to exist.

## Recommendation
Instead of renaming the script, introduce conditional logic in CI to skip the landing page build, or guard the build pipeline via Nx/PNPM filters while leaving the `build` script intact.
