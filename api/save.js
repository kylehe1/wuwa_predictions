// POST /api/save  { op, ...fields }  → applies one change.
import { db, checkPassword } from './_lib.js';

const BUCKET = 'images';

// Fields the page is allowed to change on each table
const CHARACTER_FIELDS = ['name', 'nickname', 'notes', 'guesses'];

async function uploadImage(charId, dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const path = `${charId}-${Date.now()}.jpg`; // new name each time so browsers don't show a cached old image
  const { error } = await db.storage.from(BUCKET)
    .upload(path, Buffer.from(base64, 'base64'), { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return { image_path: path, image_url: data.publicUrl };
}

async function removeImages(paths) {
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
}

const ops = {
  async setPlayers({ players }) {
    return db.from('settings').update({ players }).eq('id', 1);
  },

  async createBatch({ id, label }) {
    return db.from('batches').insert({ id, label });
  },

  async renameBatch({ id, label }) {
    return db.from('batches').update({ label }).eq('id', id);
  },

  async deleteBatch({ id }) {
    const { data } = await db.from('characters').select('image_path').eq('batch_id', id);
    await removeImages((data || []).map(c => c.image_path));
    return db.from('batches').delete().eq('id', id); // characters cascade
  },

  async createCharacter({ id, batchId, image }) {
    const img = await uploadImage(id, image);
    const result = await db.from('characters').insert({ id, batch_id: batchId, ...img });
    return { ...result, data: { image: img.image_url } };
  },

  async updateCharacter({ id, changes }) {
    const allowed = Object.fromEntries(
      Object.entries(changes).filter(([key]) => CHARACTER_FIELDS.includes(key)));
    return db.from('characters').update(allowed).eq('id', id);
  },

  async replaceImage({ id, image }) {
    const { data: old } = await db.from('characters').select('image_path').eq('id', id).single();
    const img = await uploadImage(id, image);
    const result = await db.from('characters').update(img).eq('id', id);
    if (old) await removeImages([old.image_path]);
    return { ...result, data: { image: img.image_url } };
  },

  async deleteCharacter({ id }) {
    const { data } = await db.from('characters').select('image_path').eq('id', id).single();
    if (data) await removeImages([data.image_path]);
    return db.from('characters').delete().eq('id', id);
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPassword(req, res)) return;

  const op = ops[req.body?.op];
  if (!op) return res.status(400).json({ error: 'Unknown op' });

  try {
    const { error, data } = await op(req.body);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, ...(data || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
