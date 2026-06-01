import { initializeApp }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, setDoc,
         query, where, orderBy, serverTimestamp, onSnapshot }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getFunctions, httpsCallable }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
import { getStorage, ref, uploadBytes }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseApp = initializeApp({
  apiKey:            'AIzaSyBF9QkwP42TQrS6F7xwZVXfyRmDptZzW-8',
  authDomain:        'homestud-os.firebaseapp.com',
  projectId:         'homestud-os',
  storageBucket:     'homestud-os.firebasestorage.app',
  messagingSenderId: '480918577802',
  appId:             '1:480918577802:web:e8f8d27d072ca0b6c00373',
});

const auth      = getAuth(firebaseApp);
const db        = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, 'us-central1');
const storage   = getStorage(firebaseApp);

// Identity-only provider — no Gmail/Calendar scopes here.
// Those connect separately via server-side OAuth flow.
const provider = new GoogleAuthProvider();

let currentUser  = null;
const unsubs     = [];   // active Firestore listeners

// ── Auth ────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  currentUser = user;
  updateAuthUI(user);
  unsubs.forEach(fn => fn());
  unsubs.length = 0;
  if (user) {
    await loadIntegrationStatus(user.uid);
    subscribeDispatch(user.uid);
    checkOAuthReturn();
    uploadPendingPhotos();
  } else {
    renderDispatch([], [], []);
  }
});

function updateAuthUI(user) {
  const btn  = document.getElementById('auth-btn');
  const info = document.getElementById('auth-info');
  if (!btn) return;
  if (user) {
    btn.textContent = 'Sign out';
    btn.onclick = () => signOut(auth);
    if (info) info.textContent = user.email;
  } else {
    btn.textContent = 'Connect Google';
    btn.onclick = signIn;
    if (info) info.textContent = '';
    setIntegrationBadge('gmail-status', false);
    setIntegrationBadge('cal-status', false);
  }
}

async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error('Sign-in failed', err);
  }
}

// ── Integration status ───────────────────────────────────────
async function loadIntegrationStatus(uid) {
  for (const id of ['gmail', 'calendar']) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'integrations', id));
      const connected = snap.exists() && snap.data()?.status === 'connected';
      setIntegrationBadge(id === 'gmail' ? 'gmail-status' : 'cal-status', connected);
    } catch (_) {}
  }
}

function setIntegrationBadge(elId, connected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = connected ? '✓' : '→';
}

// Called from Settings tab entries
async function connectIntegration(integrationId) {
  if (!currentUser) { await signIn(); return; }
  try {
    await currentUser.getIdToken(true);
    const callable = httpsCallable(functions, 'getGoogleOAuthUrl');
    const result   = await callable({ integrationId });
    window.location.assign(result.data.url);
  } catch (err) {
    console.error('Integration connect failed', err);
  }
}

// Handle redirect back from Google OAuth
function checkOAuthReturn() {
  const params     = new URLSearchParams(window.location.search);
  const connected  = params.get('connected');
  const failed     = connected === 'failed';
  const integration = failed ? params.get('integration') : connected;

  if (!integration || !['gmail', 'calendar'].includes(integration)) return;

  // Clean URL
  params.delete('settings');
  params.delete('connected');
  params.delete('integration');
  const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', clean);

  if (failed) {
    showToast(`${integration} connection failed — try again`);
  } else {
    showToast(`${integration} connected`);
    if (currentUser) loadIntegrationStatus(currentUser.uid);
    // Switch to settings tab so user sees the updated status
    const settingsTab = document.querySelector('.tab:last-child');
    if (settingsTab) settingsTab.click();
  }
}

// ── Firestore live listeners ─────────────────────────────────
function subscribeDispatch(uid) {
  let actions    = [];
  let waitingOns = [];
  let captures   = [];

  const actionsQ = query(
    collection(db, 'actions'),
    where('userId', '==', uid),
    where('status', 'in', ['open', 'waiting']),
    orderBy('createdAt', 'desc'),
  );
  const waitingQ = query(
    collection(db, 'waitingOns'),
    where('userId', '==', uid),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc'),
  );
  const capturesQ = query(
    collection(db, 'captures'),
    where('userId', '==', uid),
    where('reviewStatus', 'in', ['unreviewed', 'proposed']),
    orderBy('createdAt', 'desc'),
  );

  unsubs.push(onSnapshot(actionsQ, snap => {
    actions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDispatch(actions, waitingOns, captures);
  }));
  unsubs.push(onSnapshot(waitingQ, snap => {
    waitingOns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDispatch(actions, waitingOns, captures);
  }));
  unsubs.push(onSnapshot(capturesQ, snap => {
    captures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDispatch(actions, waitingOns, captures);
  }));
}

function renderDispatch(actions, waitingOns, captures) {
  const PRIORITY = { urgent: 0, today: 1, normal: 2 };

  // Urgent
  const urgent = actions.filter(a => a.priority === 'urgent' && a.status === 'open');
  setSection('dispatch-urgent', urgent.map(a =>
    `<div class="dispatch-item">${escHtml(a.title)}</div>`
  ).join(''), urgent.length === 0 ? 'Nothing flagged.' : null);

  // Top 5
  const top5 = [...actions]
    .filter(a => a.status === 'open')
    .sort((a, b) => (PRIORITY[a.priority] ?? 2) - (PRIORITY[b.priority] ?? 2))
    .slice(0, 5);
  setSection('dispatch-top5', top5.map(a =>
    `<div class="dispatch-item">${escHtml(a.title)}</div>`
  ).join(''), top5.length === 0 ? 'Not set for today.' : null);

  // Waiting On
  setSection('dispatch-waiting', waitingOns.map(w =>
    `<div class="dispatch-item"><span class="dispatch-item-who">${escHtml(w.waitingOn || '?')}</span> — ${escHtml(w.title)}</div>`
  ).join(''), waitingOns.length === 0 ? 'Nothing tracked.' : null);

  // Captures to Review
  const calCaptures  = captures.filter(c => c.source === 'calendar');
  const reviewCaps   = captures.filter(c => c.source !== 'calendar');
  setSection('dispatch-captures', reviewCaps.slice(0, 5).map(c => {
    const label = c.gmailSubject || c.rawText || c.type || 'capture';
    return `<div class="dispatch-item">${escHtml(label.slice(0, 80))}</div>`;
  }).join(''), reviewCaps.length === 0 ? 'Nothing pending.' : null);

  // Looking Ahead (calendar captures)
  setSection('dispatch-ahead', calCaptures.slice(0, 5).map(c => {
    const when  = c.eventStart ? new Date(c.eventStart).toLocaleDateString('en-CA', { month:'short', day:'numeric' }) : '';
    const title = c.calendarTitle || c.rawText || 'event';
    return `<div class="dispatch-item">${when ? '<span class="dispatch-item-who">' + when + '</span> — ' : ''}${escHtml(title.slice(0, 80))}</div>`;
  }).join(''), calCaptures.length === 0 ? '—' : null);
}

function setSection(id, html, emptyText) {
  const el = document.getElementById(id);
  if (!el) return;
  if (emptyText !== null) {
    el.innerHTML = `<div class="dispatch-empty">${emptyText}</div>`;
  } else {
    el.innerHTML = html;
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Debrief now ──────────────────────────────────────────────
async function runDebriefNow() {
  if (!currentUser) { showToast('Sign in first.'); return; }
  showToast('Running debrief…');
  try {
    const callable = httpsCallable(functions, 'runGoogleDebriefNow');
    const result   = await callable({});
    showToast(`Debrief done — ${result.data.imported} new capture${result.data.imported === 1 ? '' : 's'}.`);
  } catch (err) {
    showToast('Debrief failed. Connect Gmail or Calendar first.');
    console.error(err);
  }
}

// ── Save debrief time ────────────────────────────────────────
async function saveDebriefTime(value) {
  if (!currentUser) return;
  try {
    await setDoc(
      doc(db, 'users', currentUser.uid, 'settings', 'harlan'),
      { userId: currentUser.uid, debriefTime: value, timezone: 'America/Halifax' },
      { merge: true },
    );
    showToast('Night debrief set for ' + value);
  } catch (err) {
    console.error('saveDebriefTime', err);
  }
}

// ── Capture ──────────────────────────────────────────────────
async function saveCapture(text) {
  if (!currentUser) return;
  await addDoc(collection(db, 'captures'), {
    userId:       currentUser.uid,
    type:         'text',
    rawText:      text,
    reviewStatus: 'unreviewed',
    source:       'mobile',
    createdAt:    serverTimestamp(),
    capturedAt:   serverTimestamp(),
  });
}

// ── Photo capture (offline-first) ───────────────────────────
const PHOTO_DB_NAME = 'hs-photo-queue';
const PHOTO_STORE   = 'pending';

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function queuePhoto(blob, captureId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put({ id: captureId, blob, userId: currentUser.uid, queuedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function getPendingPhotos() {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function removePendingPhoto(captureId) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(captureId);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function uploadPendingPhotos() {
  if (!currentUser || !navigator.onLine) return;
  const pending = await getPendingPhotos();
  const mine    = pending.filter(p => p.userId === currentUser.uid);
  if (!mine.length) return;
  updatePhotoQueueStatus(mine.length, true);
  for (const item of mine) {
    try {
      const storageRef = ref(storage, `captures/${item.userId}/${item.id}/photo.jpg`);
      await uploadBytes(storageRef, item.blob, { contentType: 'image/jpeg' });
      await removePendingPhoto(item.id);
    } catch (err) {
      console.error('Photo upload failed', item.id, err);
    }
  }
  const remaining = (await getPendingPhotos()).filter(p => p.userId === currentUser.uid);
  updatePhotoQueueStatus(remaining.length, false);
}

function updatePhotoQueueStatus(count, uploading) {
  const el = document.getElementById('photo-queue-status');
  if (!el) return;
  if (count === 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.textContent   = uploading
    ? `Uploading ${count} notebook photo${count > 1 ? 's' : ''}…`
    : `${count} notebook photo${count > 1 ? 's' : ''} queued — will upload when online.`;
}

window.firePhotoCapture = function() {
  if (!currentUser) { showToast('Sign in first.'); return; }
  document.getElementById('photoInput').click();
};

window.handlePhotoSelected = async function(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  const captureId = 'notebook_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  // Create a placeholder capture doc immediately so it appears in the queue
  await addDoc(collection(db, 'captures'), {
    userId:       currentUser.uid,
    type:         'image',
    rawText:      '',
    reviewStatus: 'processing',
    source:       'notebook',
    captureId,
    createdAt:    serverTimestamp(),
    capturedAt:   serverTimestamp(),
  });

  if (navigator.onLine) {
    try {
      const storageRef = ref(storage, `captures/${currentUser.uid}/${captureId}/photo.jpg`);
      await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
      showToast('Photo uploaded — Harlan is reading it.');
    } catch (err) {
      console.error('Upload failed, queuing offline', err);
      await queuePhoto(file, captureId);
      updatePhotoQueueStatus(1, false);
      showToast('Offline — photo saved, will upload when back online.');
    }
  } else {
    await queuePhoto(file, captureId);
    updatePhotoQueueStatus(1, false);
    showToast('Offline — photo saved, will upload when back online.');
  }
};

// Flush queue when connectivity returns
window.addEventListener('online', uploadPendingPhotos);

// ── Claude streaming prompt ──────────────────────────────────
async function sendPrompt(promptText) {
  if (!currentUser) {
    const go = confirm('Sign in with Google to use HomeStud OS.');
    if (go) await signIn();
    return;
  }

  showResponsePane(promptText);

  try {
    const token = await currentUser.getIdToken();
    const resp  = await fetch('/api/claudeStream', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body:    JSON.stringify({ prompt: promptText }),
    });

    if (!resp.ok || !resp.body) throw new Error('Stream failed');

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    const pane    = document.getElementById('response-text');
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const chunk = line.slice(6);
        if (chunk === '[DONE]') break;
        try { pane.textContent += JSON.parse(chunk).text || ''; } catch (_) {}
      }
    }
  } catch (err) {
    const pane = document.getElementById('response-text');
    if (pane) pane.textContent = '[Error: ' + err.message + ']';
  }
}

// ── Response pane ────────────────────────────────────────────
function showResponsePane(prompt) {
  let pane = document.getElementById('response-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.id = 'response-pane';
    pane.innerHTML = `
      <div id="response-header">
        <span id="response-label"></span>
        <button onclick="document.getElementById('response-pane').style.display='none'"
                style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--paper);line-height:1;">✕</button>
      </div>
      <div id="response-text"></div>`;
    document.body.appendChild(pane);
    const s = document.createElement('style');
    s.textContent = `
      #response-pane {
        position:fixed;bottom:0;left:0;right:0;height:55vh;
        background:var(--paper);border-top:2px solid var(--ink);
        flex-direction:column;z-index:100;display:none;
        max-width:760px;margin:0 auto;
      }
      #response-header {
        background:var(--ink);color:var(--paper);padding:10px 16px;
        font-size:11px;letter-spacing:.5px;font-family:Georgia,serif;
        display:flex;justify-content:space-between;align-items:center;
      }
      #response-text {
        flex:1;overflow-y:auto;padding:16px;font-family:Georgia,serif;
        font-size:14px;line-height:1.7;color:var(--ink);white-space:pre-wrap;
      }`;
    document.head.appendChild(s);
  }
  const label = document.getElementById('response-label');
  if (label) label.textContent = prompt.slice(0, 80) + (prompt.length > 80 ? '…' : '');
  document.getElementById('response-text').textContent = '';
  pane.style.display = 'flex';
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
    'background:var(--ink);color:var(--paper);padding:10px 18px;' +
    'font-family:Georgia,serif;font-size:13px;z-index:200;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Service worker ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Public API ───────────────────────────────────────────────
window.HS = { sendPrompt, saveCapture, signIn, connectIntegration, runDebriefNow, saveDebriefTime, firePhotoCapture, handlePhotoSelected };
