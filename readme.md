[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/samchanpanha/car_project7?utm_source=readme&utm_medium=badge)

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
