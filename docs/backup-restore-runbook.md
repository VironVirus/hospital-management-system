# St Gianna HMS MySQL Backup and Restore Runbook

Patient, clinical, laboratory, pharmacy, radiology, inventory, staff, and financial data are stored in the Hostinger MySQL database. Treat every backup as confidential medical data.

## Backup Policy

- Keep Hostinger automatic backups enabled.
- Create a manual backup before every deployment that changes the database.
- Download an encrypted off-site backup at least monthly.
- Test restoration into a separate staging database every three months.
- Never commit database dumps to GitHub.

## Manual Backup

Use hPanel/phpMyAdmin Export, selecting SQL format and all tables. If remote MySQL access is enabled, use:

```bash
mysqldump --single-transaction --routines --triggers \
  -h YOUR_DB_HOST -u YOUR_DB_USER -p YOUR_DB_NAME \
  > st-gianna-hms-YYYY-MM-DD.sql
```

## Restore Drill

1. Create a separate staging MySQL database.
2. Import the SQL backup through phpMyAdmin or the MySQL client.
3. Configure a staging deployment with the staging credentials.
4. Verify staff login, patient search, clinical records, laboratory workflow, radiology, pharmacy, billing, accounts, and inventory.
5. Record the backup date, restore date, operator, and any issues.

```bash
mysql -h STAGING_DB_HOST -u STAGING_DB_USER -p STAGING_DB_NAME \
  < st-gianna-hms-YYYY-MM-DD.sql
```

Before restoring production, announce downtime, take a final backup, and confirm the target database name twice.
