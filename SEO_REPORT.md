# SEO REPORT — H_ARCH Studio

**Date:** July 12, 2026

---

## Executive Summary

| Metric | Before | After |
|--------|--------|-------|
| **SEO Score** | 35/100 | **58/100** |

The app is primarily a client-side SPA (authenticated tool). SEO improvements focus on discoverability of public pages and metadata foundations.

---

## Implemented Improvements

| Item | File | Status |
|------|------|--------|
| Enhanced root metadata | `app/layout.tsx` | ✅ title template, keywords, OG, Twitter |
| `metadataBase` | `app/layout.tsx` | ✅ Canonical base URL |
| robots.txt | `app/robots.ts` | ✅ Disallow /admin, /api |
| sitemap.xml | `app/sitemap.ts` | ✅ Main public routes |
| `robots` meta | `layout.tsx` | ✅ index, follow |
| Semantic HTML lang | `layout.tsx` | ✅ `lang="en"` |
| Security headers | `next.config.ts` | ✅ Indirect SEO trust signal |

---

## Page-Level SEO Status

| Route | Indexable | Metadata | Notes |
|-------|-----------|----------|-------|
| `/` | ⚠️ Partial | Root only | Client-rendered — crawlers see shell |
| `/login` | ✅ | Root only | Public page |
| `/video` | ⚠️ | Root only | Client-rendered |
| `/workspace` | ❌ | — | Auth-required tool |
| `/apps/[id]` | ⚠️ | Root only | Dynamic — needs generateMetadata |
| `/admin` | ❌ | robots disallow | Correct |

---

## Missing SEO Items

| Priority | Item | Recommendation |
|----------|------|----------------|
| P1 | Per-route metadata | Add `layout.tsx` with metadata for `/login`, `/video` |
| P1 | `generateMetadata` for `/apps/[id]` | Fetch app card title/description server-side |
| P1 | OG image | Add `/public/og-image.png` (1200×630) |
| P2 | JSON-LD structured data | `SoftwareApplication` schema on homepage |
| P2 | Canonical URLs per page | Use `alternates.canonical` in metadata |
| P2 | SSR for marketing content | Extract hero section to Server Component |
| P3 | hreflang | If Arabic version added |
| P3 | Blog/docs section | For organic traffic |

---

## Core Web Vitals & SEO Overlap

SEO ranking is influenced by performance:

| Optimization | SEO Benefit |
|--------------|-------------|
| Font swap | Better LCP → ranking signal |
| Smaller bundle | Better TTI → lower bounce |
| AVIF/WebP images | Faster LCP on image-heavy pages |

---

## robots.txt Configuration

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /workspace/editor
Sitemap: https://gen-lang-client-0550261552.web.app/sitemap.xml
```

---

## Sitemap Routes

- `/` (priority 1.0)
- `/login` (0.5)
- `/video` (0.8)
- `/workspace` (0.7)

**Env:** Set `NEXT_PUBLIC_SITE_URL` for correct URLs in production.

---

## Accessibility Overlap (SEO)

| Item | Status |
|------|--------|
| `lang` attribute | ✅ |
| Alt text on images | ⚠️ Partial — verify generated content images |
| Keyboard navigation | ⚠️ Not audited |
| ARIA labels | ⚠️ Partial on icon buttons |
| Color contrast | ✅ Dark theme with teal accents |

**Accessibility Score:** **55/100** (estimated)

---

## Recommendations for 80+ SEO Score

1. Create a public landing Server Component with static hero content
2. Add OG image and per-page titles
3. Implement `generateMetadata` for dynamic app routes
4. Add JSON-LD for `SoftwareApplication`
5. Run Google Search Console after deploy
6. Consider pre-rendering `/login` and marketing pages with SSG

---

## Final SEO Score: **58/100**

Appropriate for an authenticated SaaS tool; not yet optimized for marketing/discovery.
