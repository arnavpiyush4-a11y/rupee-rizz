# RupeeRizz Video UI — fixed launch build

## Windows

From the folder that contains `package.json`:

```powershell
npm install
npm run dev
```

Open:

http://localhost:3000

## Supabase

Create `.env.local` in this folder with:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLIC_OR_ANON_KEY
```

The app now fails gracefully if Supabase is slow/offline instead of leaving the whole UI stuck on a blank splash screen.

## What was fixed

- Splash card is always paint-visible; it no longer starts at opacity 0.
- Supabase session loading has a 2.5 second fallback and a rejection handler.
- The app can continue into the public landing page when Supabase is unavailable.
