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

Set `NEXT_PUBLIC_CONVEX_URL` in `.env.local` to your FLOWER Convex deployment. Run `npm run dev:backend` against that same deployment to sync backend changes before using new frontend features.

## Validation

Run `npm test`, `npm run lint`, and `npm run build`. The Vitest suite exercises real Convex functions in an isolated `convex-test` database and tests frontend navigation/forms with mocked data; it does not write to your deployment.

## Transactions and balances

Unknown quick-input items can be assigned to an existing expense category, saved with a new category, or recorded as **Belum dikategorikan**. New categories and transactions are saved together. Existing category names and item aliases are still recognized automatically.

Weekly/monthly filters limit the displayed income, expenses, and transaction history. **Saldo sebelumnya** includes all earlier active transactions; **Saldo tersedia** adds the current period's income and subtracts its expenses. This also applies to the dashboard's daily view. No rollover transactions are created, so changing/deleting/voiding old records automatically recalculates subsequent balances. The current single-user query reads historical transactions to preserve existing data without a backfill; a large ledger would benefit from an aggregate index.

Quick actions select the destination tab and open the relevant form (or focus quick input). The `action=create` URL parameter is consumed after use, while the tab remains in the URL.

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
