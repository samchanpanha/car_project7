[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/samchanpanha/car_project7?utm_source=readme&utm_medium=badge)

> 🚀 **Architecture Migration**: Full plan to split SQLite to PostgreSQL, Spring Boot 3.4 (Java 21), Nacos, MinIO, Redis, Nginx, and Grafana/Loki/Prometheus monitoring is documented in [ARCHITECTURE_MIGRATION_PLAN.md](file:///Users/samchanpanha/Desktop/projects/projects/cars_project7/ARCHITECTURE_MIGRATION_PLAN.md).

## Full stack with Docker (recommended)

PostgreSQL, Redis, MinIO, Nacos, the Spring Boot backend, the Next.js frontend,
NGINX and the Grafana/Prometheus/Loki stack all come up together:

```sh
cp .env.example .env      # then set AUTH_SECRET (openssl rand -hex 32)
docker compose up -d --build
```

- App (via NGINX gateway): http://localhost/
- Backend health: http://localhost/api/health
- Swagger UI: http://localhost/swagger-ui/index.html
- MinIO console: http://localhost:9001 · Nacos: http://localhost:8848/nacos · Grafana: http://localhost:3001

See [deploy_note.md](deploy_note.md) for the environment variables and
`scripts/verify_docker_system.sh` for an end-to-end smoke test of the fleet.

## Local development (frontend only)

Prisma's datasource provider is `postgresql`, so a running PostgreSQL is
required — a `file:` SQLite URL will not work. (`db/custom.db` is a leftover
from before the migration; see
[ARCHITECTURE_MIGRATION_PLAN.md](ARCHITECTURE_MIGRATION_PLAN.md).)

Start just the database, then run Next.js against it:

```sh
docker compose up -d postgres redis minio backend
pnpm install
pnpm db:generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

To create a disposable database with the default demo dataset, run:

```sh
docker compose exec -T postgres createdb -U khlan khlan_test
DATABASE_URL=postgresql://khlan:khlan_secret_2026@localhost:5432/khlan_test pnpm exec prisma db push
DATABASE_URL=postgresql://khlan:khlan_secret_2026@localhost:5432/khlan_test SEED_ALLOW_RESET=1 pnpm db:seed
DATABASE_URL=postgresql://khlan:khlan_secret_2026@localhost:5432/khlan_test pnpm db:verify
DATABASE_URL=postgresql://khlan:khlan_secret_2026@localhost:5432/khlan_test pnpm dev
```

The seed script clears its target before inserting demo records. Only run it
against a disposable database, as shown above.

Checks:

```sh
pnpm lint        # ESLint (must be clean — CI enforces it)
pnpm test        # vitest; the storage-resilience suite needs a live PostgreSQL
pnpm typecheck   # prisma generate + tsc --noEmit
```


Demo accounts use the password `khlan123`:

- Buyer: `+85511998877`
- Dealer: `+85512998001`
- Admin: `+85512998009`
