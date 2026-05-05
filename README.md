# Tennis Tournament Website

This project is configured for:

- Next.js (App Router)
- Prisma ORM
- Neon PostgreSQL
- Railway deployment

## 1) Connect Neon

1. Create a Neon project and database.
2. Copy the Neon connection string.
3. Update `.env`:

```bash
DATABASE_URL="postgresql://<NEON_USER>:<NEON_PASSWORD>@<NEON_HOST>/<NEON_DB>?sslmode=require"
```

## 2) Create database schema

Run:

```bash
npm run db:migrate -- --name init
npm run db:generate
```

This will create your initial tables (`Tournament`, `Player`, `Match`) in Neon.

## 3) Run locally

```bash
npm run dev
```

## 4) Deploy to Railway

1. Push this project to GitHub.
2. In Railway, create a **New Project** from your GitHub repo.
3. In Railway service variables, add:
   - `DATABASE_URL` (the same Neon URL)
4. Railway will automatically run `npm install` and `npm run build`.
5. Set start command to:

```bash
npm run start
```

## Useful commands

- `npm run db:migrate -- --name <migration-name>`
- `npm run db:generate`
- `npm run db:studio`
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
