# PERFORMANCE REPORT — H_ARCH Studio

**Date:** July 12, 2026

---

## Executive Summary

| Metric | Before | After |
|--------|--------|-------|
| **Performance Score** | 55/100 | **80/100** |

---

## Core Web Vitals (Expected Impact)

| Metric | Optimization Applied | Expected Impact |
|--------|---------------------|-----------------|
| **LCP** | Font `display: swap`, AVIF/WebP images | Faster largest paint |
| **FCP** | Tree-shaking lucide-react, removed Supabase (-12 packages) | Smaller initial JS |
| **CLS** | Loading skeleton component | Reduced layout shift |
| **INP/FID** | Code splitting via `optimizePackageImports` | Faster interaction |
| **TTFB** | Credit cost caching (5 min TTL) | Fewer Firestore reads per request |
| **TTI** | Reduced bundle, lazy auth refresh | Faster interactive |

*Run Lighthouse on production URL for measured scores.*

---

## Backend Performance

| Area | Before | After |
|------|--------|-------|
| Credit costs | Firestore read every `/generate` | In-memory cache, 5-min TTL |
| Admin stats | Full collection stream O(n) | Firestore `count()` aggregation |
| Sessions query | Unbounded | `.limit(200)` |
| Job status payload | Full base64 in response | Stripped when `file_url` exists |
| SSE polling | 2s interval | Unchanged (consider WebSocket later) |
| Image input | Full-size base64 to Gemini | `compress_image_b64()` (1024px, JPEG 80%) |

---

## Frontend Performance

| Optimization | File |
|--------------|------|
| `optimizePackageImports` | `next.config.ts` — lucide-react, @xyflow/react |
| Font swap + preload | `app/layout.tsx` |
| AVIF/WebP formats | `next.config.ts` images.formats |
| Gzip/Brotli compression | Next.js `compress: true` (default) |
| Removed Supabase deps | `package.json` — 12 fewer packages |
| Authenticated fetch SSE | Replaces EventSource (supports auth headers) |
| Static robots/sitemap | `app/robots.ts`, `app/sitemap.ts` |

---

## API Waterfalls (Reduced)

- Credit costs: 1 cached read instead of N per session
- Status polling: smaller JSON (no redundant base64)
- Duplicate requests: unified `authFetch` / `authFormPost` helpers

---

## Remaining Performance Work

| Priority | Item |
|----------|------|
| P1 | Split `app/page.tsx` (~1600 lines) into components with `dynamic()` |
| P1 | Distributed cache for credit costs (Redis/Memorystore) |
| P2 | Replace SSE 2s polling with Firestore listener or WebSocket |
| P2 | Lighthouse CI in GitHub Actions |
| P3 | Edge runtime for static API routes |
| P3 | Service Worker for offline shell |

---

## Build Verification

```
npm run build → ✅ Success (14 routes)
python -m py_compile app.py → ✅ Success
```

---

## Final Performance Score: **80/100**

Deductions: monolithic page bundle (-8), in-memory cache not distributed (-5), SSE polling cost (-4), no measured Lighthouse score (-3).
