# St Gianna Specialist Hospital HMS

A cost-conscious, single-hospital management system for **St Gianna Specialist Hospital**, No 6, 18 Road, Upper North, Transekulu, Enugu, Enugu State.

## Stack

- Next.js 15, React, and TypeScript
- Hostinger Business Node.js Web App hosting
- Hostinger MySQL using the lightweight `mysql2` driver
- Secure scrypt password hashing from Node.js itself
- Server-side MySQL sessions in HTTP-only cookies
- Tailwind CSS, TanStack Query, and Zod

There are no external database, authentication, image-storage, or SaaS runtime dependencies. Patient and hospital data consist of text, selections, dates, and numeric records stored in MySQL.

## Hospital Workflows

- Permanent Hospital IDs and longitudinal patient records
- Reception, outpatient, emergency, inpatient, and telemedicine encounters
- Doctor documentation, diagnoses, ICD-10 codes, clinical plans, and reports
- Nursing triage, vital signs, wards, beds, admissions, and discharge
- Pharmacy catalogue, stock, prescriptions, and dispensing
- Radiology requests, scheduling, findings, reports, and automatic charges
- Laboratory orders, samples, results, verification, reports, and quality control
- Patient billing, receipts, balances, income, expenses, and accounts
- Store inventory, receipts, issues, expiry dates, and reorder monitoring
- Admin-created staff accounts with department-specific permissions

This installation supports one hospital only. There is no public signup and the system does not upload patient images.

## Local Development

Requirements: Node.js 22+, pnpm 11+, and MySQL 8 or compatible MariaDB.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

The application automatically creates all required MySQL tables and the hospital record when it starts. When the database has no Admin, `HMS_ADMIN_EMAIL` and `HMS_ADMIN_PASSWORD` create the first Admin automatically. All later staff accounts must be created under **Administration → Staff & roles**.

## Hostinger Business Deployment

1. In hPanel, create a MySQL database and database user.
2. Push this repository to your GitHub repository.
3. In hPanel, select **Websites → Add website → Node.js Web App**.
4. Connect the GitHub repository and select the production branch.
5. Use these build settings:

```text
Framework: Next.js
Node.js: 22
Package manager: pnpm
Install: pnpm install --frozen-lockfile
Build: pnpm build
Start: pnpm start
```

6. Add the variables from `.env.example` using the actual Hostinger MySQL credentials.
7. Deploy. The schema and first Admin initialize automatically.
8. Sign in, create the remaining staff accounts, and replace/remove `HMS_ADMIN_PASSWORD` from hPanel after confirming the Admin account works.

Hostinger supplies `PORT`; do not set a fixed application port. The `pnpm start` command serves the optimized Next.js production build, including its CSS and browser assets.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Backups and Cost Control

- Use Hostinger Business while its CPU, RAM, and I/O graphs remain healthy.
- Enable Hostinger database/site backups and periodically download an encrypted off-site SQL backup.
- Do not add Redis, object storage, a VPS, or paid external services unless measured usage requires them.
- Do not commit `.env` files, SQL dumps, passwords, or patient exports to GitHub.
- Upgrade hosting only after monitoring shows the Business plan is consistently constrained.
