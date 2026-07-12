# FIREBASE REPORT — H_ARCH Studio

**Date:** July 12, 2026  
**Project:** `gen-lang-client-0550261552`

---

## Executive Summary

Firebase is the primary backend infrastructure: **Auth**, **Firestore**, **Storage**, **Hosting**, **Cloud Functions**.

Prior to this audit, **no security rules existed in the repository** — a critical gap now resolved.

---

## Services Used

| Service | Purpose | Access Pattern |
|---------|---------|----------------|
| Firebase Auth | User login/register | Client SDK + Admin verify |
| Firestore | Users, jobs, sessions, CMS | Admin SDK (backend) + client (workspace only) |
| Storage | Generated images/videos | Admin SDK upload, public URLs |
| Hosting | Next.js frontend | Firebase Web Frameworks |
| Cloud Functions | FastAPI API (`main.py`) | WSGI via a2wsgi |
| Cloud Run | Production API (alternate) | `api-*.run.app` in `.env.production` |

---

## Firestore Collections

| Collection | Client Read | Client Write | Backend Write |
|------------|-------------|--------------|---------------|
| `users` | Own doc only | ❌ Denied | ✅ Admin SDK |
| `app_jobs` | ❌ Denied | ❌ Denied | ✅ Admin SDK |
| `app_user_sessions` | ❌ Denied | ❌ Denied | ✅ Admin SDK |
| `app_user_workspaces` | Own doc only | Own doc only | — |
| `app_tools` | ✅ Public | ❌ Denied | ✅ Admin SDK |
| `app_cards` | ✅ Public | ❌ Denied | ✅ Admin SDK |
| `app_plans` | ✅ Public | ❌ Denied | ✅ Admin SDK |
| `app_hero` | ✅ Public | ❌ Denied | ✅ Admin SDK |
| `app_prompts` | ✅ Public | ❌ Denied | ✅ Admin SDK |
| `app_credit_costs` | ✅ Public | ❌ Denied | ✅ Admin SDK |

---

## Security Rules (NEW)

**File:** `firestore.rules`

```
- Default: deny all
- users/{uid}: read if auth.uid == uid
- app_user_workspaces/{uid}: read/write if auth.uid == uid
- CMS collections: read public, write denied
- app_jobs, app_user_sessions: fully denied to clients
```

**File:** `storage.rules`

```
- Client writes: denied (all uploads via Admin SDK)
- Client reads: require auth (public URLs still work via make_public())
```

**Deploy:** `firebase deploy --only firestore,storage` (now in CI)

---

## Indexes (NEW)

**File:** `firestore.indexes.json`

| Collection | Fields | Purpose |
|------------|--------|---------|
| `app_user_sessions` | user_id ASC, updated_at DESC | Session listing |
| `app_credit_costs` | operation ASC | Cost lookup |

Additional single-field indexes may auto-create for `order_by('created_at')` on CMS collections.

---

## Authentication Flow

```
1. User signs in via Firebase Web SDK (email/password)
2. Client gets ID token → stored in localStorage (harch_token)
3. Client sends Bearer token to FastAPI
4. Backend: fb_auth.verify_id_token(token)
5. Backend creates/reads users/{uid} in Firestore
6. Admin: email matched against ADMIN_EMAILS env var
```

**Custom Claims:** Not used. Admin is env-based email allowlist.

---

## Read/Write Cost Optimization

| Optimization | Impact |
|--------------|--------|
| Credit costs cache (5 min) | -N reads per generate |
| Admin stats count() | O(1) vs O(n) reads |
| Sessions limit 200 | Bounded query cost |
| Strip base64 from status API | Smaller documents transferred |
| Transactional credit deduction | Prevents overdraw, 1 write per success |

---

## Storage Configuration

| Current | Issue | Recommendation |
|---------|-------|----------------|
| `blob.make_public()` | World-readable URLs | Signed URLs with 1-hour expiry |
| No client upload rules needed | Backend handles uploads | ✅ storage.rules blocks client writes |

---

## Deployment Configuration

**firebase.json** (updated):
```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage": { "rules": "storage.rules" },
  "functions": [...],
  "hosting": [...]
}
```

**CI:** `.github/workflows/firebase-hosting-merge.yml` now deploys firestore, storage, functions, hosting.

---

## Region Alignment

| Service | Region |
|---------|--------|
| Hosting frameworksBackend | europe-west3 |
| Cloud Function (`main.py`) | us-central1 |
| Production API URL | us-central1 (`*-uc.a.run.app`) |

**Recommendation:** Align all services to one region to reduce latency.

---

## Remaining Firebase Work

| Priority | Item |
|----------|------|
| P0 | Deploy rules to production: `firebase deploy --only firestore,storage` |
| P1 | Replace `make_public()` with signed URLs |
| P1 | Add Firebase Custom Claims for admin role |
| P2 | Enable Firebase App Check |
| P2 | Set up Firestore backup schedule |
| P3 | Add composite index for CMS order_by queries if deploy fails |

---

## Firebase Score: **78/100**

Deductions: public storage (-8), no App Check (-5), region mismatch (-4), localStorage auth (-5).
