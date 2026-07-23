# Provider login route

Date: 2026-07-22

## Goal

Give providers a dedicated login entry at `/provider/login`, hide the top crisis
bar from provider-facing surfaces, and surface the README demo credentials on the
provider login page to ease testing/demoing (temporary).

## Decisions

- **`/login` stays open** to all roles. `/provider/login` is an additional,
  provider-branded entry. No auth API change — `/api/auth/login` already redirects
  by role.
- **Crisis bar** hidden when the current user is a `PROVIDER` (all their pages) or
  the path is `/provider/login` (logged-out provider login page). Footer 988 line
  is left as-is (request was the top bar).
- **Test-creds panel** always rendered (temporary; removed later). Carries a
  visible "demo only" note and a keep-in-sync comment.

## Changes

### New

- `src/lib/crisisBar.ts` — pure `shouldShowCrisisBar(role, pathname)`.
- `src/components/CrisisBar.tsx` — client component; reads `usePathname()`,
  delegates visibility to `shouldShowCrisisBar`.
- `src/components/ProviderTestCredentials.tsx` — exports `DEMO_PASSWORD` +
  `PROVIDER_DEMO_ACCOUNTS` (mirrors README) and a static panel component.
- `src/app/provider/login/page.tsx` — `AuthForm` (provider variant) + panel.

### Edited

- `src/components/AuthForm.tsx` — optional props `title`, `subtitle`,
  `showRegisterLink` (default `true`). Existing `/login` + `/register` unchanged.
- `src/app/layout.tsx` — replace inline crisis `<div>` with
  `<CrisisBar isProvider={user?.role === "PROVIDER"} />`.

## Behavior: `shouldShowCrisisBar(role, pathname)`

Returns `false` when `role === "PROVIDER"` OR `pathname === "/provider/login"`;
otherwise `true`.

## Tests (vitest, node env — pure logic, no DOM)

- `crisisBar.test.ts` — hidden for provider role; hidden on `/provider/login`;
  shown for USER/ADMIN/null on other paths.
- `provider-credentials.test.ts` — `PROVIDER_DEMO_ACCOUNTS` contains the three
  README emails; `DEMO_PASSWORD === "demo-password-123"`.

## Out of scope

- Blocking providers from `/login`.
- Removing the footer crisis line.
- Copy-to-fill on the creds panel.
