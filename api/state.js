// GET /api/state → everything the page needs, in the same shape app.js uses.
import { db, checkPassword } from './_lib.js';

export default async function handler(req, res) {
  if (!checkPassword(req, res)) return;

  const [settings, batches, characters] = await Promise.all([
    db.from('settings').select('players').eq('id', 1).single(),
    db.from('batches').select('id, label, note').order('created_at', { ascending: false }),
    db.from('characters')
      .select('id, batch_id, image_url, name, nickname, notes, guesses')
      .order('created_at', { ascending: true }),
  ]);

  const error = settings.error || batches.error || characters.error;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    players: settings.data.players,
    batches: batches.data.map(b => ({
      ...b,
      characters: characters.data
        .filter(c => c.batch_id === b.id)
        .map(({ batch_id, image_url, ...c }) => ({ ...c, image: image_url })),
    })),
  });
}
