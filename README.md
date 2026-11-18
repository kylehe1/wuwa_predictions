# WuWa Predictions

A small shared site for tracking Wuthering Waves drip marketing guesses.
Plain HTML, CSS and JavaScript on the page; two small server functions
on Vercel save everything to Supabase. Protected by one shared password.

## Files
- `index.html` – page layout (header, tabs, popups)
- `style.css` – all styling; colors live at the top in `:root`
- `app.js` – rendering, events, and sending changes to the server
- `api/state.js` – returns all data (GET)
- `api/save.js` – applies one change (POST)
- `supabase.sql` – run once in Supabase to create the tables and image bucket

## Setup
1. **Supabase**: new project → SQL Editor → paste `supabase.sql` → Run.
   Copy the Project URL and the secret key from Project Settings → API.
2. **Vercel**: import the GitHub repo (preset **Other**, no build command) and add
   environment variables `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_PASSWORD`.
3. Deploy, open the site, enter the password.

## Run locally
Live Server can't run the `api/` functions. Instead:
```
npm install -g vercel
vercel link        # once
vercel env pull    # copies the env vars into .env.local
vercel dev
```
