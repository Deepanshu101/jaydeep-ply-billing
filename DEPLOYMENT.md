# Jaydeep Ply Billing Deployment

## Fastest Online Setup

Deploy the Next.js app to Vercel and keep Supabase as the database/auth provider.

1. Push this project to GitHub.
2. Import the repo in Vercel.
3. Add these environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_IMPORT_MODEL`
   - `OPENAI_IMPORT_MAX_OUTPUT_TOKENS`
   - `DEFAULT_IMPORT_MARGIN_PERCENT`
4. In Supabase Authentication settings, add the production URLs:
   - Site URL: `https://your-domain.com`
   - Redirect URL: `https://your-domain.com/auth/callback`
5. Deploy.

## Mobile App Access

The app is now a PWA.

On Android:
1. Open the production URL in Chrome.
2. Tap menu.
3. Tap `Add to Home screen` or `Install app`.

On iPhone:
1. Open the production URL in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.

This gives staff a phone app icon without maintaining a separate Android/iOS codebase.

## TallyPrime Important Note

Cloud hosting cannot access `http://localhost:9000` on your office computer.

For online Tally sync, use one of these:

1. Office-only sync:
   - Keep `TALLY_HTTP_URL=http://localhost:9000`
   - Run sync only from the local office machine.

2. Secure Tally bridge:
   - Run a small local bridge on the Tally computer.
   - The bridge authenticates requests from the cloud app and forwards them to TallyPrime.
   - Recommended before exposing anything to the internet.

3. Temporary tunnel for testing:
   - Use Cloudflare Tunnel or ngrok to expose the local bridge.
   - Do not expose TallyPrime directly without authentication.

## Production Checklist

- Run latest `supabase/schema.sql`.
- Enable Supabase email/password auth.
- Add production auth callback URL.
- Set Vercel environment variables.
- Test login, quotation PDF, import extraction, invoice edit, and Tally sync.
- Install the PWA on one Android phone and one iPhone.
