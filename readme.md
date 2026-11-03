[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/samchanpanha/car_project7?utm_source=readme&utm_medium=badge)

> 🚀 **Architecture Migration**: Full plan to split SQLite to PostgreSQL, Spring Boot 3.4 (Java 21), Nacos, MinIO, Redis, Nginx, and Grafana/Loki/Prometheus monitoring is documented in [ARCHITECTURE_MIGRATION_PLAN.md](file:///Users/samchanpanha/Desktop/projects/projects/cars_project7/ARCHITECTURE_MIGRATION_PLAN.md).

## Local development

Install dependencies, generate the Prisma client, then start Next.js:

```sh
pnpm install
pnpm db:generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The local `.env` uses
`db/custom.db`; it already contains existing marketplace data.

To create a disposable database with the default demo dataset, run:

```sh
DATABASE_URL=file:./db/test.db pnpm exec prisma db push
DATABASE_URL=file:./db/test.db SEED_ALLOW_RESET=1 pnpm db:seed
DATABASE_URL=file:./db/test.db pnpm db:verify
DATABASE_URL=file:./db/test.db pnpm dev
```

The seed script clears its target before inserting demo records. Only run it
against a disposable database, as shown above.

Demo accounts use the password `khlan123`:

- Buyer: `+85511998877`
- Dealer: `+85512998001`
- Admin: `+85512998009`

## SEO

Every screen has a real, crawlable URL — the marketplace is no longer a
single-page app behind client state:

| Route | Indexable | Notes |
| --- | --- | --- |
| `/` | ✅ | Home |
| `/browse`, `/browse?make=…` | ✅ | Filtered listings; `?q=` searches are `noindex` |
| `/vehicles/[id]` | ✅ | Server-rendered listing + JSON-LD (`Car`/`Motorcycle`/`Product`) |
| `/sell`, `/guide` | ✅ | Static landing pages |
| `/vehicles/[id]/report`, `/sellers/[id]` | ❌ `noindex` | Detail sub-pages |
| `/messages`, `/favorites`, `/compare`, `/auth`, `/dashboard` | ❌ `noindex` | Account surfaces |

Generated at the edge of the app router: `/robots.txt`, `/sitemap.xml`
(static routes + every published vehicle + image entries), `/manifest.webmanifest`,
`/og/khlan-cover.png` and the app icons.

### Configuration

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Canonical origin for `metadataBase`, sitemap, robots and OG URLs. Read at **request time** — set it to your public domain. |
| `BACKEND_URL` | Spring Boot origin used by server components (sitemap, listing pages) and the `/api/*` rewrite. Must match the build-time value. |
| `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` | Optional search-console tokens. |

> `SITE_URL` is read at request time rather than as `NEXT_PUBLIC_*`, because
> `NEXT_PUBLIC_*` variables are inlined into the bundle at build time and would
> freeze the domain into statically prerendered pages.

### Regenerating the OG cover and icons

```sh
node scripts/generate-seo-assets.mjs
```

Renders `public/og/khlan-cover.png` (1200×630) and the PWA icons from
`public/logo.svg` via `sharp`.

### Tests

```sh
pnpm vitest run tests/seo-routes.test.ts   # routing + metadata rules
pnpm playwright test e2e/seo.spec.ts        # raw-HTML crawler contract
pnpm playwright test e2e/url-sync.spec.ts   # URL ↔ view synchronisation
```

The Playwright suites assert against the **raw server response** (no
JavaScript), which is exactly what a crawler sees.
