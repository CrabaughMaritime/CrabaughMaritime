# Crabaugh Maritime — Vercel + Supabase deployment

A responsive, installable web app with Supabase email authentication, organization membership, RLS-protected bookkeeping, private receipt storage, payroll/distribution records, reminders, and CSV export.

## 1. Create Supabase project

1. Go to https://supabase.com/dashboard and create a project. Save the project database password privately.
2. In **SQL Editor**, paste and run `supabase/schema.sql` once. Review the SQL before running. This creates tables, RLS policies, private receipt bucket, and invitation acceptance.
3. Under **Authentication > Providers > Email**, enable email sign-in and preferably email confirmation. Configure an SMTP provider before production use if Supabase's default email limits are insufficient.
4. In **Project Settings > API** (or **Connect**), copy the project URL and **publishable** key (or legacy anon key). **Never use the service_role/secret key in a browser or Vercel VITE_ variables.**

## 2. Deploy on Vercel

1. Upload this folder to a private GitHub repository (do not commit `.env` files).
2. At https://vercel.com/new import the repository. Vercel should detect **Vite**. Build command `npm run build`, output `dist`.
3. Add environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
4. Deploy. Vercel will issue a free `*.vercel.app` address (the exact name depends on availability and your project slug).
5. In Supabase **Authentication > URL Configuration**, set **Site URL** to your actual Vercel address and add it to allowed Redirect URLs as needed. Redeploy after any Vercel env changes.
6. Open the site, create an account, confirm email if prompted, sign in, then create the Crabaugh Maritime workspace.

## 3. Add spouse or teammate

As workspace owner, open **Team**, enter the exact email address. Share the Vercel site URL manually. They sign up or sign in with that same email. Invitations are not emailed automatically. New or existing users are added on their next sign-in. Both users share transactions and receipts, with access enforced by RLS.

## 4. iPhone

Open the live site in Safari > Share > Add to Home Screen. The app icon uses the supplied Crabaugh Maritime logo. Safari file preview of an HTML attachment is not the live app.

## Security and accounting limitations

- RLS is enabled on organization-scoped tables and storage. Receipt links are signed and expire after 60 seconds. Passwords are handled by Supabase Auth.
- Members currently have equal edit/delete rights; the owner controls invitations. For production, consider role-based permissions, audit history, backups, MFA, and accountant read-only access.
- **No automatic bank feeds, OCR, payroll processing, tax filing, email reminders, or push notifications** are included. The reminders screen is in-app only and recurring dates advance when marked done.
- **Do not use this app as the sole system of record for taxes or payroll until it has undergone independent security and accounting review.** Classifications are user-entered; deductions must be substantiated. S-Corp distributions and transfers are not treated as deductible operating expenses.
- This package does not provision Supabase/Vercel accounts or publish a site automatically. Deployment requires you to configure your own accounts.
- To modify the app later, edit `src.js`/`style.css`, commit to GitHub, and Vercel will redeploy. Schema changes require a reviewed migration.

## Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local with your Supabase URL and publishable key
npm run dev
```

## Production readiness checklist

- Verify RLS with two separate test accounts and two separate organizations.
- Verify users cannot access another organization's receipts or transactions.
- Configure reliable email delivery and authentication recovery.
- Set up database backups, retention policy, and secure account recovery.
- Add audit logs, reconciliation, and stricter financial controls before using with real financial data.
