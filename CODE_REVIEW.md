# CODE REVIEW REPORT — H_ARCH Studio

**Date:** July 12, 2026

---

## Executive Summary

| Metric | Score |
|--------|-------|
| **Maintainability** | **62/100** |
| **Best Practices** | **74/100** |

---

## Architecture

```
Monorepo
├── functions/app.py      ← FastAPI monolith (2110 lines) — all backend logic
├── functions/main.py   ← Firebase Functions WSGI wrapper
├── ai-architecture/    ← Next.js 16 App Router frontend
├── firestore.rules     ← NEW: Security rules
├── storage.rules       ← NEW: Storage rules
└── firebase.json       ← Hosting + Functions + Rules
```

**Pattern:** BFF-lite — most data flows through FastAPI Admin SDK; workspace feature uses direct Firestore client writes (now protected by rules).

---

## Code Quality Improvements Made

| Area | Change |
|------|--------|
| Auth helpers | Centralized `authFetch`, `authFormPost`, `cancelJobs`, `fetchProxyBlob` in `lib/mysql/client.ts` |
| Security middleware | Backend: rate limit, headers. Frontend: `proxy.ts` |
| Error handling | `error.tsx`, `not-found.tsx`, generic API errors |
| Dead code | Removed Supabase npm deps; disabled stubs retained for reference |
| Naming debt | `lib/mysql/client.ts` should be renamed to `lib/api/client.ts` (future) |
| Duplicate logic | Generate calls unified through `authFormPost` |

---

## Issues Remaining

### High

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Monolithic backend | `functions/app.py` | Split into `routers/`, `services/`, `models/` |
| Monolithic frontend page | `app/page.tsx` (~1600 lines) | Extract hooks: `useSessions`, `useGeneration`, `useSSE` |
| Legacy comments | Multiple files | Remove Supabase comment blocks after migration confirmed |
| Dual API deployment | Cloud Run vs Firebase Function | Document single deployment target |

### Medium

| Issue | Recommendation |
|-------|----------------|
| `main2.py` Flask proxy | Delete if unused |
| Root `requirements.txt` stale | Sync or delete |
| No TypeScript strict API types | Generate from OpenAPI when docs enabled in dev |
| No unit/integration tests | Add pytest + Playwright |

---

## Error Handling

| Layer | Status |
|-------|--------|
| Backend | Generic errors on critical paths; some endpoints still return `str(e)` |
| Frontend | `error.tsx` global boundary; per-component try/catch |
| Logging | `print()` only — replace with structured `logging` module |

---

## Naming & Conventions

| Current | Recommended |
|---------|-------------|
| `lib/mysql/client.ts` | `lib/api/client.ts` |
| `MySQLUser` type alias | `AppUser` (already exists) |
| `app.py` sections | Separate modules |

---

## Reusable Components (Existing)

- `ControlPanel.tsx` — generation controls
- `ResultDisplay.tsx` — output display
- Workspace nodes: `ImageNode.tsx`, `PromptNode.tsx`

**Missing:** Shared `LoadingSpinner`, `ErrorAlert`, `CreditBadge` components.

---

## Build Status

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass |
| `python -m py_compile app.py` | ✅ Pass |
| TypeScript | ✅ No errors |

---

## Final Scores

| Category | Score |
|----------|-------|
| Maintainability | **62/100** |
| Best Practices | **74/100** |
| Readability | **65/100** |
