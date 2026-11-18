/* =========================================================
   WuWa Predictions
   Plain JavaScript. All data lives in one `state` object.
   Every change is sent to the server (/api/save), which stores
   it in Supabase, so everyone with the password sees the same data.

   state = {
     players: ["K", "P"],
     activeBatchId: "b_...",
     batches: [                       // index 0 = newest
       {
         id, label,
         characters: [
           {
             id, image (URL), name, nickname, notes,
             guesses: [ {element, weapon, role},   // player 1
                        {element, weapon, role} ]  // player 2
           }
         ]
       }
     ]
   }
   ========================================================= */

const PASSWORD_KEY = 'wuwa-predictions-password';
const ACTIVE_TAB_KEY = 'wuwa-predictions-active-tab';
const SYNC_INTERVAL = 3000;  // ms between checks for the other player's changes
const TEXT_SAVE_DELAY = 600;  // ms to wait after typing stops before saving
const MAX_IMAGE_SIZE = 800; // px, longest side

const ELEMENTS = ['Glacio', 'Fusion', 'Electro', 'Aero', 'Spectro', 'Havoc'];
const WEAPONS = ['Broadblade', 'Sword', 'Pistols', 'Gauntlets', 'Rectifier'];
const ROLES = ['Main DPS', 'Sub DPS', 'Support'];

let state = { players: ['K', 'P'], activeBatchId: readLocal(ACTIVE_TAB_KEY), batches: [] };
let editingTabId = null;   // which tab is being renamed
let pendingUpload = null;  // { mode: 'add' } or { mode: 'replace', charId }

/* ---------- Shortcuts to page elements ---------- */
const tabsEl = document.getElementById('tabs');
const batchEl = document.getElementById('batch');
const lightboxEl = document.getElementById('lightbox');
const fileInput = document.getElementById('file-input');
const passwordEl = document.getElementById('password');
const playerInputs = [document.getElementById('player-0'), document.getElementById('player-1')];

/* =========================================================
   Server
   ========================================================= */
// Small wrappers so a blocked/private-mode localStorage never breaks the page
function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

let password = readLocal(PASSWORD_KEY) || '';

async function request(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-app-password': password },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    askForPassword(password ? 'Wrong password.' : '');
    throw new Error('Wrong password');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

// Sends one change to the server. Shows a message if it fails.
let pendingSaves = 0;
async function save(op, fields) {
  pendingSaves++;
  try {
    return await request('/api/save', { op, ...fields });
  } catch (err) {
    if (err.message !== 'Wrong password') showToast('Could not save: ' + err.message);
    throw err;
  } finally {
    pendingSaves--;
  }
}

// Gets everything from the server and redraws the page
async function loadFromServer() {
  const data = await request('/api/state');
  const changed = JSON.stringify(data.players) !== JSON.stringify(state.players) ||
                  JSON.stringify(data.batches) !== JSON.stringify(state.batches);
  state.players = data.players;
  state.batches = data.batches;
  if (changed) render();
}

// Text fields save a moment after typing stops, not on every key
const textTimers = {};
function saveLater(key, saveFn) {
  clearTimeout(textTimers[key]);
  textTimers[key] = setTimeout(() => {
    delete textTimers[key];
    saveFn();
  }, TEXT_SAVE_DELAY);
}

// Pick up the other player's changes, unless you're mid-edit
async function sync() {
  const busy = pendingSaves > 0 || Object.keys(textTimers).length > 0 || editingTabId ||
               document.activeElement?.matches('input, textarea, select');
  if (busy || document.hidden || !password) return;
  try { await loadFromServer(); } catch { /* try again next time */ }
}

/* ---------- Password ---------- */
function askForPassword(message) {
  passwordEl.hidden = false;
  passwordEl.querySelector('.password-error').textContent = message;
  const input = passwordEl.querySelector('input');
  input.value = '';
  input.focus();
}

passwordEl.querySelector('form').addEventListener('submit', async e => {
  e.preventDefault();
  password = passwordEl.querySelector('input').value;
  try {
    await loadFromServer();
    writeLocal(PASSWORD_KEY, password);
    passwordEl.hidden = true;
    render();
  } catch (err) {
    if (err.message !== 'Wrong password') showToast('Could not connect: ' + err.message);
  }
});

/* =========================================================
   Helpers
   ========================================================= */
function makeId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Makes user text safe to put inside HTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Lowest "Tab N" not already used. Renamed tabs free up their number,
// so if "Tab 1" was renamed, the next new tab is "Tab 1" again.
function nextTabLabel() {
  const used = new Set(state.batches.map(b => b.label));
  let n = 1;
  while (used.has(`Tab ${n}`)) n++;
  return `Tab ${n}`;
}

function getActiveBatch() {
  return state.batches.find(b => b.id === state.activeBatchId) || state.batches[0] || null;
}

function findCharacter(charId) {
  const batch = getActiveBatch();
  return batch ? batch.characters.find(c => c.id === charId) : null;
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
}

/* =========================================================
   Rendering
   ========================================================= */
function render() {
  playerInputs[0].value = state.players[0];
  playerInputs[1].value = state.players[1];
  renderTabs();
  renderBatch();
}

function renderTabs() {
  const active = getActiveBatch();

  const tabsHtml = state.batches.map(batch => {
    const isActive = active && batch.id === active.id;
    const isEditing = batch.id === editingTabId;

    const label = isEditing
      ? `<input class="tab-input" value="${esc(batch.label)}" maxlength="40">`
      : `<span class="tab-label">${esc(batch.label)}</span>`;

    const editButton = isActive && !isEditing
      ? `<button class="tab-edit" data-action="rename-tab" title="Rename tab">✎</button>`
      : '';

    return `
      <div class="tab ${isActive ? 'active' : ''}" data-action="select-tab" data-id="${batch.id}">
        <span class="tab-dot"></span>
        ${label}
        <span class="tab-count">${batch.characters.length}</span>
        ${editButton}
      </div>`;
  }).join('');

  tabsEl.innerHTML = tabsHtml +
    `<button class="tab-add" data-action="new-batch" title="New batch">+</button>`;

  // If a tab is being renamed, focus its input
  const input = tabsEl.querySelector('.tab-input');
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = getActiveBatch().label; input.blur(); }
    });
    input.addEventListener('blur', () => {
      const batch = getActiveBatch();
      const oldLabel = batch.label;
      batch.label = '';  // so this tab's old name doesn't block its own number
      batch.label = input.value.trim() || nextTabLabel();
      editingTabId = null;
      if (batch.label !== oldLabel) save('renameBatch', { id: batch.id, label: batch.label });
      renderTabs();
    });
  }
}

function renderBatch() {
  const batch = getActiveBatch();

  if (!batch) {
    batchEl.innerHTML = `
      <div class="empty">
        No batches yet.
        <button class="btn btn-accent" data-action="new-batch">+ New batch</button>
      </div>`;
    return;
  }

  const count = batch.characters.length;
  const cards = batch.characters.map(renderCard).join('');

  batchEl.innerHTML = `
    <div class="batch-bar">
      <span class="batch-count">${count} ${count === 1 ? 'character' : 'characters'}</span>
      <span class="rule"></span>
      <button class="btn btn-delete" data-action="delete-batch" data-confirm-text="Click again to delete">Delete batch</button>
    </div>

    <div class="grid">
      ${cards}
      <div class="add-card" data-action="add-character" tabindex="0">
        <span class="add-icon"><span>+</span></span>
        <div>
          <span class="add-title">Add character</span>
          <span class="add-hint">Click to upload, drag an image here, or paste</span>
        </div>
      </div>
    </div>`;
}

function renderOptions(list, selected) {
  return `<option value="">—</option>` + list.map(item =>
    `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`
  ).join('');
}

function renderSelect(field, player, list, value) {
  const extraClass = field === 'element' ? 'el-select' : '';
  return `
    <select class="${extraClass}" data-field="${field}" data-player="${player}" data-value="${esc(value)}">
      ${renderOptions(list, value)}
    </select>`;
}

function renderCard(char) {
  const [g1, g2] = char.guesses;

  return `
    <article class="card" data-char-id="${char.id}">
      <div class="card-image">
        <img src="${char.image}" alt="${esc(char.name)}" data-action="view-image">
        <div class="card-tools">
          <button class="btn" data-action="replace-image">Replace</button>
          <button class="btn btn-delete" data-action="delete-character" data-confirm-text="Confirm?">Delete</button>
        </div>
      </div>

      <div class="card-body">
        <div class="card-names">
          <input class="name-input" data-field="name" value="${esc(char.name)}" placeholder="Name">
          <input class="nick-input" data-field="nickname" value="${esc(char.nickname)}" placeholder="nickname">
        </div>

        <div class="guess-table">
          <span></span>
          <span class="col-head" data-player-name="0">${esc(state.players[0])}</span>
          <span class="col-head" data-player-name="1">${esc(state.players[1])}</span>

          <span class="row-label">Element</span>
          ${renderSelect('element', 0, ELEMENTS, g1.element)}
          ${renderSelect('element', 1, ELEMENTS, g2.element)}

          <span class="row-label">Weapon</span>
          ${renderSelect('weapon', 0, WEAPONS, g1.weapon)}
          ${renderSelect('weapon', 1, WEAPONS, g2.weapon)}

          <span class="row-label">Role</span>
          ${renderSelect('role', 0, ROLES, g1.role)}
          ${renderSelect('role', 1, ROLES, g2.role)}
        </div>

        <textarea class="notes" data-field="notes" placeholder="Theories…">${esc(char.notes)}</textarea>
      </div>
    </article>`;
}

/* =========================================================
   Actions
   ========================================================= */
function setActiveBatch(id) {
  state.activeBatchId = id;
  writeLocal(ACTIVE_TAB_KEY, id ?? '');
}

async function createBatch() {
  const batch = { id: makeId('b'), label: nextTabLabel(), characters: [] };
  state.batches.unshift(batch); // newest first
  setActiveBatch(batch.id);
  render();
  await save('createBatch', { id: batch.id, label: batch.label }).catch(() => {});
}

async function deleteActiveBatch() {
  const batch = getActiveBatch();
  state.batches = state.batches.filter(b => b.id !== batch.id);
  setActiveBatch(state.batches[0]?.id ?? null);
  render();
  await save('deleteBatch', { id: batch.id }).catch(() => {});
}

async function addCharacter(image) {
  const batch = getActiveBatch();
  if (!batch) return;
  const emptyGuess = () => ({ element: '', weapon: '', role: '' });
  const char = {
    id: makeId('c'),
    image, // local preview until the upload finishes
    name: '',
    nickname: '',
    notes: '',
    guesses: [emptyGuess(), emptyGuess()],
  };
  batch.characters.push(char);
  render();
  try {
    const result = await save('createCharacter', { id: char.id, batchId: batch.id, image });
    char.image = result.image;
  } catch {
    batch.characters = batch.characters.filter(c => c !== char);
    render();
  }
}

async function replaceImage(charId, image) {
  const char = findCharacter(charId);
  const oldImage = char.image;
  char.image = image;
  render();
  try {
    const result = await save('replaceImage', { id: charId, image });
    char.image = result.image;
  } catch {
    char.image = oldImage;
    render();
  }
}

async function deleteCharacter(charId) {
  const batch = getActiveBatch();
  batch.characters = batch.characters.filter(c => c.id !== charId);
  render();
  await save('deleteCharacter', { id: charId }).catch(() => {});
}

// Delete buttons need two clicks. First click arms the button,
// second click (within 3 seconds) runs the action.
function confirmThen(button, action) {
  if (button.classList.contains('confirming')) {
    action();
    return;
  }
  const originalText = button.textContent;
  button.classList.add('confirming');
  button.textContent = button.dataset.confirmText || 'Confirm?';
  setTimeout(() => {
    button.classList.remove('confirming');
    button.textContent = originalText;
  }, 3000);
}

/* =========================================================
   Images
   ========================================================= */
// Shrinks an image file so its longest side is MAX_IMAGE_SIZE,
// and returns it as a JPEG data URL (much smaller than the original).
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    img.src = url;
  });
}

async function handleImageFile(file, target = { mode: 'add' }) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('That file is not an image.');
    return;
  }
  try {
    const dataUrl = await resizeImage(file);
    if (target.mode === 'replace') {
      replaceImage(target.charId, dataUrl);
    } else {
      addCharacter(dataUrl);
    }
  } catch (err) {
    showToast('Could not read that image.');
  }
}

function openFilePicker(target) {
  pendingUpload = target;
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', () => {
  handleImageFile(fileInput.files[0], pendingUpload);
  pendingUpload = null;
});

/* =========================================================
   Popups
   ========================================================= */
function openLightbox(src) {
  lightboxEl.querySelector('img').src = src;
  lightboxEl.hidden = false;
}
function closeLightbox() { lightboxEl.hidden = true; }

/* =========================================================
   Event listeners
   All clicks go through one listener that looks for the
   nearest element with a data-action attribute.
   ========================================================= */
document.addEventListener('click', e => {
  if (e.target.matches('input, select, textarea')) return;

  const el = e.target.closest('[data-action]');
  if (!el) return;

  const charId = el.closest('[data-char-id]')?.dataset.charId;

  switch (el.dataset.action) {
    case 'select-tab':
      if (el.dataset.id !== state.activeBatchId) {
        setActiveBatch(el.dataset.id);
        editingTabId = null;
        render();
      }
      break;
    case 'rename-tab':
      editingTabId = getActiveBatch().id;
      renderTabs();
      break;
    case 'new-batch':
      createBatch();
      break;
    case 'delete-batch':
      confirmThen(el, deleteActiveBatch);
      break;
    case 'add-character':
      openFilePicker({ mode: 'add' });
      break;
    case 'replace-image':
      openFilePicker({ mode: 'replace', charId });
      break;
    case 'delete-character':
      confirmThen(el, () => deleteCharacter(charId));
      break;
    case 'view-image':
      openLightbox(el.src);
      break;
  }
});

lightboxEl.addEventListener('click', closeLightbox);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
  // Keyboard users: Enter on the "Add character" card
  if (e.key === 'Enter' && e.target.matches('.add-card')) openFilePicker({ mode: 'add' });
});

// Typing in any card field or dropdown autosaves
document.addEventListener('input', e => {
  const field = e.target.dataset.field;
  const charId = e.target.closest('[data-char-id]')?.dataset.charId;
  if (!field || !charId) return;

  const char = findCharacter(charId);
  const player = e.target.dataset.player;

  if (player !== undefined) {
    char.guesses[player][field] = e.target.value;
    e.target.dataset.value = e.target.value; // updates element color
    save('updateCharacter', { id: charId, changes: { guesses: char.guesses } }).catch(() => {});
  } else {
    char[field] = e.target.value;
    saveLater(charId + field, () =>
      save('updateCharacter', { id: charId, changes: { [field]: char[field] } }).catch(() => {}));
  }
});

// Player names: one edit updates every card
playerInputs.forEach((input, i) => {
  input.addEventListener('input', () => {
    state.players[i] = input.value;
    document.querySelectorAll(`[data-player-name="${i}"]`).forEach(el => (el.textContent = input.value));
    saveLater('players', () => save('setPlayers', { players: state.players }).catch(() => {}));
  });
});

// Drag and drop onto the "Add character" card
document.addEventListener('dragover', e => {
  e.preventDefault(); // stops the browser from opening the file
  document.querySelectorAll('.add-card').forEach(card =>
    card.classList.toggle('dragging', card.contains(e.target)));
});

document.addEventListener('dragleave', e => {
  if (!e.relatedTarget) document.querySelectorAll('.add-card').forEach(c => c.classList.remove('dragging'));
});

document.addEventListener('drop', e => {
  e.preventDefault();
  const card = e.target.closest('.add-card');
  document.querySelectorAll('.add-card').forEach(c => c.classList.remove('dragging'));
  if (card && e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
});

// Paste an image anywhere on the page to add it to the open batch
document.addEventListener('paste', e => {
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (!file) return; // normal text paste
  e.preventDefault();
  if (!getActiveBatch()) { showToast('Create a batch first.'); return; }
  handleImageFile(file);
});

/* ---------- Start ---------- */
render();
if (password) {
  loadFromServer().catch(err => {
    if (err.message !== 'Wrong password') showToast('Could not connect: ' + err.message);
  });
} else {
  askForPassword('');
}
setInterval(sync, SYNC_INTERVAL);
window.addEventListener('focus', sync);
