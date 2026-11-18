// Shared helpers for the server functions. Files starting with "_"
// are not turned into endpoints by Vercel.
import { createClient } from '@supabase/supabase-js';

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// Every request must send the shared password in this header.
export function checkPassword(req, res) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    res.status(401).json({ error: 'Wrong password' });
    return false;
  }
  return true;
}
