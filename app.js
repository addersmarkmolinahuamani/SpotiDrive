/* =========================================================================
   SpotiDrive 5TB — Motor Principal (Google Drive + Offline + ID3 + Karaoke)
   ========================================================================= */

const DEFAULT_COVER =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%231db954'/><stop offset='100%' stop-color='%230d3b1e'/></linearGradient></defs><rect width='200' height='200' fill='url(%23g)'/><text x='100' y='118' font-size='78' text-anchor='middle' fill='%23fff'>♪</text></svg>";

// Canciones de demostración con letras sincronizadas (.LRC) para probar al instante
const DEMO_TRACKS = [
  {
    id: 'demo-1',
    title: 'Midnight Drive (Demo 5TB)',
    artist: 'SpotiDrive Synthwave',
    album: 'Demo Cloud Sessions',
    source: 'demo',
    cover: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g1' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%238e2de2'/><stop offset='100%' stop-color='%234a00e0'/></linearGradient></defs><rect width='200' height='200' fill='url(%23g1)'/><text x='100' y='115' font-size='64' text-anchor='middle' fill='%23fff'>🌆</text></svg>",
    lyrics: `[00:00.00] 🎵 Midnight Drive — SpotiDrive 5TB
[00:03.00] Conectando tus 5 TB de Google Drive...
[00:06.50] Escucha tu música desde laptop o celular
[00:10.00] Descarga tus canciones favoritas en Modo Offline ⬇️
[00:14.00] Comparte playlists con tus amigos con un solo link 🔗
[00:18.00] Haz clic en cualquier línea de esta letra para saltar a ese segundo
[00:22.00] ¡Sube tus propios archivos MP3 o FLAC para empezar!`
  },
  {
    id: 'demo-2',
    title: 'Neon Horizon (Karaoke Test)',
    artist: 'Cloud Beats Collective',
    album: 'Favoritas con Amigos',
    source: 'demo',
    cover: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g2' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%231db954'/><stop offset='100%' stop-color='%2311998e'/></linearGradient></defs><rect width='200' height='200' fill='url(%23g2)'/><text x='100' y='115' font-size='64' text-anchor='middle' fill='%23fff'>🎧</text></svg>",
    lyrics: `[00:00.00] 🎤 Neon Horizon — Modo Karaoke Activo
[00:03.50] Las luces de la ciudad brillan en la pantalla
[00:07.00] Tu biblioteca entera guardada en la nube
[00:11.00] Sin límites de espacio con tus 5 Terabytes
[00:15.00] Cambia de canción desde la pantalla de bloqueo de tu celular
[00:19.00] ¡Disfruta tu propio Spotify personalizado!`
  }
];

// Estado global de la aplicación
const state = {
  settings: {
    appName: 'SpotiDrive 5TB',
    driveFolderId: '',
    driveApiKey: '',
    friendPasscode: '',
    requirePasscode: false
  },
  tracks: [],
  playlists: [
    { id: 'pl-amigos', name: 'Previa con Amigos 🔥', description: 'Playlist compartida lista para enviar' }
  ],
  likedIds: new Set(JSON.parse(localStorage.getItem('spotidrive_likes') || '[]')),
  offlineIds: new Set(),
  currentView: 'home', // 'home' | 'favorites' | 'offline' | 'lyrics' | 'playlist:<id>'
  searchQuery: '',
  currentIndex: -1,
  currentQueue: [],
  isPlaying: false,
  isShuffle: false,
  repeatMode: 'off', // 'off' | 'all' | 'one'
  parsedLyrics: [],
  activeLyricIndex: -1,
  deferredPwaPrompt: null
};

const audio = document.getElementById('audioElement');
const seekSlider = document.getElementById('seekSlider');
const volumeSlider = document.getElementById('volumeSlider');

/* =========================================================================
   1. FALLBACKS & SLIDER SYNC (modern-web-guidance)
   ========================================================================= */

function syncSliderProperties(slider) {
  if (!slider) return;
  slider.style.setProperty('--attr-min', slider.min || 0);
  slider.style.setProperty('--attr-max', slider.max || 100);
  slider.style.setProperty('--control-value', slider.value || 0);
}

function setupModernDialogsAndSliders() {
  [seekSlider, volumeSlider].forEach((slider) => {
    syncSliderProperties(slider);
    slider.addEventListener('input', () => syncSliderProperties(slider));
  });

  // Fallback obligatorio para <dialog closedby="any"> en navegadores que aún no soportan closedBy
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    });
  }

  // Limpiar returnValue al cerrar cualquier dialog y conectar botones de cierre
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
    });
  });

  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close-dialog');
      const dlg = document.getElementById(targetId);
      if (dlg) dlg.close();
    });
  });
}

/* =========================================================================
   2. MOTOR OFFLINE (IndexedDB para guardar MP3/FLAC en celular y laptop)
   ========================================================================= */

const DB_NAME = 'spotidrive_offline_db';
const DB_STORE = 'audio_files';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function refreshOfflineTrackIds() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        state.offlineIds = new Set(keysReq.result || []);
        const badge = document.getElementById('offlineCountBadge');
        if (badge) badge.textContent = String(state.offlineIds.size);
        resolve();
      };
      keysReq.onerror = () => resolve();
    });
  } catch {
    // IndexedDB no disponible
  }
}

async function saveTrackOffline(track, blobOverride = null) {
  try {
    showToast(`⏳ Guardando "${track.title}" para modo Offline...`);
    let blob = blobOverride;
    if (!blob) {
      const streamUrl = getPlayableUrl(track);
      const resp = await fetch(streamUrl);
      if (!resp.ok) throw new Error('No se pudo descargar el audio');
      blob = await resp.blob();
    }

    const db = await openOfflineDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({
        id: track.id,
        blob,
        trackMeta: { ...track, blobUrl: undefined },
        savedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await refreshOfflineTrackIds();
    renderAll();
    showToast(`✅ "${track.title}" disponible sin internet (Offline)`);
  } catch (err) {
    showToast(`⚠️ Error guardando offline: ${err.message}`);
  }
}

async function getOfflineBlobUrl(trackId) {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(trackId);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(URL.createObjectURL(req.result.blob));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function loadOfflineStoredTracks() {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result || []).map((entry) => entry.trackMeta).filter(Boolean);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/* =========================================================================
   3. EXTRACTOR AUTOMÁTICO DE METADATOS ID3v2 (Portadas, Artista, Álbum)
   ========================================================================= */

async function extractID3Metadata(file) {
  const cleanName = file.name.replace(/\.[^/.]+$/, '');
  const parts = cleanName.split(' - ');
  const fallbackMeta = {
    title: parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanName,
    artist: parts.length > 1 ? parts[0].trim() : 'Artista en Mi Biblioteca',
    album: file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : 'Subidos desde Dispositivo',
    cover: DEFAULT_COVER
  };

  try {
    const slice = file.slice(0, 384 * 1024); // Leemos los primeros 384 KB donde vive la cabecera ID3v2
    const buffer = await slice.arrayBuffer();
    const view = new DataView(buffer);

    if (
      view.byteLength < 10 ||
      view.getUint8(0) !== 0x49 || // 'I'
      view.getUint8(1) !== 0x44 || // 'D'
      view.getUint8(2) !== 0x33    // '3'
    ) {
      return fallbackMeta;
    }

    const version = view.getUint8(3);
    const tagSize =
      ((view.getUint8(6) & 0x7f) << 21) |
      ((view.getUint8(7) & 0x7f) << 14) |
      ((view.getUint8(8) & 0x7f) << 7) |
      (view.getUint8(9) & 0x7f);

    let offset = 10;
    const limit = Math.min(tagSize + 10, view.byteLength);

    while (offset + 10 <= limit) {
      const frameId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      let frameSize = 0;
      if (version === 4) {
        frameSize =
          ((view.getUint8(offset + 4) & 0x7f) << 21) |
          ((view.getUint8(offset + 5) & 0x7f) << 14) |
          ((view.getUint8(offset + 6) & 0x7f) << 7) |
          (view.getUint8(offset + 7) & 0x7f);
      } else {
        frameSize = view.getUint32(offset + 4);
      }

      if (frameSize <= 0 || offset + 10 + frameSize > view.byteLength) break;

      const frameStart = offset + 10;

      if (frameId === 'TIT2' || frameId === 'TPE1' || frameId === 'TALB') {
        const encoding = view.getUint8(frameStart);
        const bytes = new Uint8Array(buffer, frameStart + 1, frameSize - 1);
        let text = '';
        if (encoding === 1 || encoding === 2) {
          text = new TextDecoder('utf-16').decode(bytes);
        } else {
          text = new TextDecoder('utf-8').decode(bytes);
        }
        text = text.replace(/\0/g, '').trim();
        if (text) {
          if (frameId === 'TIT2') fallbackMeta.title = text;
          if (frameId === 'TPE1') fallbackMeta.artist = text;
          if (frameId === 'TALB') fallbackMeta.album = text;
        }
      } else if (frameId === 'APIC') {
        // Extraer portada de álbum embebida
        let pos = frameStart + 1;
        while (pos < frameStart + frameSize && view.getUint8(pos) !== 0) pos++;
        pos++; // Saltar null de mime
        pos++; // Saltar byte de picture type
        while (pos < frameStart + frameSize && view.getUint8(pos) !== 0) pos++;
        pos++; // Saltar null de descripción
        if (pos < frameStart + frameSize && view.getUint8(pos) === 0) pos++;

        const imgBytes = new Uint8Array(buffer, pos, frameStart + frameSize - pos);
        if (imgBytes.byteLength > 64) {
          const blob = new Blob([imgBytes], { type: 'image/jpeg' });
          fallbackMeta.cover = await blobToDataUrl(blob);
        }
      }

      offset += 10 + frameSize;
    }
  } catch {
    // Usar metadatos por nombre de archivo si el ID3 falla
  }

  return fallbackMeta;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result || DEFAULT_COVER);
    reader.readAsDataURL(blob);
  });
}

/* =========================================================================
   4. GENERADOR DE AUDIO DEMO (Para que las pistas demo suenen al instante)
   ========================================================================= */

let cachedDemoWavUrl = null;
function getDemoSynthesizedWavUrl() {
  if (cachedDemoWavUrl) return cachedDemoWavUrl;

  const sampleRate = 22050;
  const durationSeconds = 26;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Acordes suaves estilo Synthwave / Lo-Fi
  const chords = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66]  // G
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / 3.25) % chords.length;
    const [f1, f2, f3] = chords[chordIdx];
    const env = Math.min(1, (t % 3.25) * 4) * Math.exp(-((t % 3.25) * 0.45));
    const arpFreq = [f1 * 2, f2 * 2, f3 * 2, f2 * 2][Math.floor(t * 4) % 4];
    const arpEnv = Math.exp(-((t * 4) % 1) * 4);

    const signal =
      (Math.sin(2 * Math.PI * f1 * t) +
        Math.sin(2 * Math.PI * f2 * t) * 0.8 +
        Math.sin(2 * Math.PI * f3 * t) * 0.7) *
        0.15 *
        env +
      Math.sin(2 * Math.PI * arpFreq * t) * 0.12 * arpEnv;

    const sample = Math.max(-1, Math.min(1, signal));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  cachedDemoWavUrl = URL.createObjectURL(blob);
  return cachedDemoWavUrl;
}

/* =========================================================================
   5. SINCRONIZACIÓN CON GOOGLE DRIVE (5 TB) & CATÁLOGO DEL SERVIDOR
   ========================================================================= */

function extractDriveId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return trimmed;
}

function isStaticHost() {
  return window.location.hostname.includes('github.io') || window.location.protocol === 'file:';
}

function getPlayableUrl(track) {
  if (track.blobUrl) return track.blobUrl;
  if (track.source === 'demo') return getDemoSynthesizedWavUrl();
  if (track.driveFileId) {
    if (isStaticHost()) {
      if (state.settings.driveApiKey) {
        return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(track.driveFileId)}?alt=media&key=${encodeURIComponent(state.settings.driveApiKey)}`;
      }
      return `https://docs.google.com/uc?export=download&id=${encodeURIComponent(track.driveFileId)}`;
    }
    const keyParam = state.settings.driveApiKey
      ? `?key=${encodeURIComponent(state.settings.driveApiKey)}`
      : '';
    return `/api/drive/stream/${encodeURIComponent(track.driveFileId)}${keyParam}`;
  }
  return track.streamUrl || '';
}

async function loadInitialCatalog() {
  await refreshOfflineTrackIds();
  const offlineSavedTracks = await loadOfflineStoredTracks();

  // 1. Cargar primero lo guardado en localStorage (funciona en GitHub Pages y Offline)
  let localCatalog = null;
  try {
    const rawLocal = localStorage.getItem('spotidrive_catalog_v1');
    if (rawLocal) localCatalog = JSON.parse(rawLocal);
  } catch {
    localCatalog = null;
  }

  if (localCatalog) {
    if (localCatalog.settings) state.settings = { ...state.settings, ...localCatalog.settings };
    if (Array.isArray(localCatalog.playlists) && localCatalog.playlists.length > 0) {
      state.playlists = localCatalog.playlists;
    }
    if (Array.isArray(localCatalog.tracks) && localCatalog.tracks.length > 0) {
      state.tracks = localCatalog.tracks;
    }
  }

  // 2. Leer parámetros compartidos en el Link (para que tus amigos en GitHub Pages reciban tu carpeta de Drive automáticamente)
  const params = new URLSearchParams(window.location.search);
  const sharedFolder = params.get('folder');
  const sharedKey = params.get('k');
  const sharedAppName = params.get('app');
  const sharedView = params.get('view');

  if (sharedFolder) state.settings.driveFolderId = sharedFolder;
  if (sharedKey) {
    try {
      state.settings.driveApiKey = atob(sharedKey);
    } catch {
      state.settings.driveApiKey = sharedKey;
    }
  }
  if (sharedAppName) state.settings.appName = sharedAppName;
  if (sharedView) state.currentView = sharedView;

  // 3. Si estamos en servidor local, sincronizar también con /api/catalog
  if (!isStaticHost()) {
    const savedPasscode = sessionStorage.getItem('spotidrive_passcode') || '';
    try {
      const resp = await fetch('/api/catalog', {
        headers: { 'x-friend-passcode': savedPasscode }
      });

      if (resp.status === 401) {
        document.getElementById('passcodeGate').hidden = false;
        return;
      }

      if (resp.ok) {
        const data = await resp.json();
        document.getElementById('passcodeGate').hidden = true;
        if (data.settings && data.settings.driveFolderId) {
          state.settings = { ...state.settings, ...data.settings };
        }
        if (Array.isArray(data.playlists) && data.playlists.length > 0) {
          state.playlists = data.playlists;
        }
        if (Array.isArray(data.tracks) && data.tracks.length > 0) {
          state.tracks = data.tracks;
        }
      }
    } catch {
      // Sin backend activo (ej. GitHub Pages)
    }
  }

  // Actualizar UI de configuración
  document.getElementById('sidebarAppName').innerHTML = `${escapeHtml(state.settings.appName || 'SpotiDrive 5TB')}`;
  document.getElementById('inputAppName').value = state.settings.appName || 'SpotiDrive 5TB';
  document.getElementById('inputDriveFolder').value = state.settings.driveFolderId || '';
  if (state.settings.driveFolderId) {
    document.getElementById('driveBtnLabel').textContent = 'Google Drive Conectado ✓';
  }

  // Combinar canciones con modo Offline + Demo si está vacío
  const mergedMap = new Map();
  for (const t of state.tracks) mergedMap.set(t.id, t);
  for (const t of offlineSavedTracks) {
    if (!mergedMap.has(t.id)) mergedMap.set(t.id, t);
  }
  if (mergedMap.size === 0) {
    for (const d of DEMO_TRACKS) mergedMap.set(d.id, d);
  }
  state.tracks = Array.from(mergedMap.values());

  renderAll();

  // Si un amigo entró con link compartido de carpeta de Drive y aún no tiene las canciones cargadas, sincronizar automáticamente
  if (sharedFolder && state.settings.driveApiKey && state.tracks.every((t) => t.source === 'demo')) {
    syncGoogleDriveFolder();
  }
}

async function persistCatalogToServer() {
  const cleanTracks = state.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    cover: t.cover && t.cover.length < 150000 ? t.cover : DEFAULT_COVER,
    driveFileId: t.driveFileId || '',
    streamUrl: t.streamUrl || '',
    source: t.source || 'cloud',
    playlistId: t.playlistId || '',
    lyrics: t.lyrics || ''
  }));

  const payload = {
    settings: state.settings,
    tracks: cleanTracks,
    playlists: state.playlists
  };

  try {
    localStorage.setItem('spotidrive_catalog_v1', JSON.stringify(payload));
  } catch {
    // Cuota de localStorage llena
  }

  if (!isStaticHost()) {
    try {
      await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      // Guardado silencioso en modo estático/offline
    }
  }
}

function isDriveAudioFile(file) {
  const mime = (file.mimeType || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    mime.startsWith('audio/') ||
    name.endsWith('.mp3') ||
    name.endsWith('.flac') ||
    name.endsWith('.wav') ||
    name.endsWith('.m4a') ||
    name.endsWith('.ogg') ||
    name.endsWith('.aac')
  );
}

async function fetchDriveFolderDirectFromBrowser(folderId, apiKey) {
  const fields = encodeURIComponent('files(id,name,mimeType,size,thumbnailLink)');
  const qMain = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const mainUrl = `https://www.googleapis.com/drive/v3/files?q=${qMain}&fields=${fields}&pageSize=500&key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(mainUrl);
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error((data.error && data.error.message) || 'Error consultando Google Drive API');
  }

  const audioFiles = [];
  const subfolders = [];

  for (const f of data.files || []) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      subfolders.push(f);
    } else if (isDriveAudioFile(f)) {
      audioFiles.push({ ...f, folderName: 'Biblioteca Principal' });
    }
  }

  for (const sub of subfolders.slice(0, 10)) {
    const qSub = encodeURIComponent(`'${sub.id}' in parents and trashed = false`);
    const subUrl = `https://www.googleapis.com/drive/v3/files?q=${qSub}&fields=${fields}&pageSize=300&key=${encodeURIComponent(apiKey)}`;
    try {
      const subResp = await fetch(subUrl);
      const subData = await subResp.json();
      for (const sf of subData.files || []) {
        if (isDriveAudioFile(sf)) {
          audioFiles.push({ ...sf, folderName: sub.name, folderId: sub.id });
        }
      }
    } catch {
      // Ignorar subcarpeta con error
    }
  }

  return audioFiles;
}

async function syncGoogleDriveFolder() {
  const folderId = extractDriveId(state.settings.driveFolderId);
  const apiKey = state.settings.driveApiKey;

  if (!folderId || !apiKey) {
    document.getElementById('driveModal').showModal();
    showToast('☁️ Ingresa el Link de tu carpeta de Drive y tu API Key para sincronizar');
    return;
  }

  showToast('🔄 Escaneando tu carpeta de Google Drive (5 TB)...');

  try {
    // Llamamos directamente a la API oficial de Google Drive desde el navegador (funciona en GitHub Pages y en Local)
    const driveFiles = await fetchDriveFolderDirectFromBrowser(folderId, apiKey);

    if (driveFiles.length === 0) {
      showToast('ℹ️ No se encontraron archivos MP3/FLAC/WAV en esa carpeta de Drive.');
      return;
    }

    // Crear playlists automáticas por cada subcarpeta encontrada en Google Drive
    const folderPlaylistMap = new Map();
    for (const f of driveFiles) {
      if (f.folderName && f.folderName !== 'Biblioteca Principal') {
        const plId = `drive-folder-${f.folderId || f.folderName}`;
        if (!state.playlists.some((p) => p.id === plId)) {
          state.playlists.push({
            id: plId,
            name: `📁 ${f.folderName}`,
            description: 'Sincronizada desde Google Drive'
          });
        }
        folderPlaylistMap.set(f.folderName, plId);
      }
    }

    let added = 0;
    for (const file of driveFiles) {
      const trackId = `drive-${file.id}`;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const parts = cleanName.split(' - ');
      const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanName;
      const artist = parts.length > 1 ? parts[0].trim() : 'Google Drive 5TB';

      const existingIdx = state.tracks.findIndex((t) => t.id === trackId);
      const trackObj = {
        id: trackId,
        title,
        artist,
        album: file.folderName || 'Google Drive',
        driveFileId: file.id,
        source: 'drive',
        playlistId: folderPlaylistMap.get(file.folderName) || '',
        cover: file.thumbnailLink || DEFAULT_COVER
      };

      if (existingIdx >= 0) {
        state.tracks[existingIdx] = { ...state.tracks[existingIdx], ...trackObj };
      } else {
        state.tracks.unshift(trackObj);
        added++;
      }
    }

    // Quitar pistas demo si ya sincronizamos canciones reales de Drive
    state.tracks = state.tracks.filter((t) => t.source !== 'demo');

    await persistCatalogToServer();
    renderAll();
    showToast(`✅ ¡Sincronización exitosa! ${driveFiles.length} canciones de Drive (${added} nuevas)`);
  } catch (err) {
    showToast(`⚠️ ${err.message}`);
  }
}

/* =========================================================================
   6. REPRODUCTOR DE AUDIO + CONTROLES DE PANTALLA DE BLOQUEO (MediaSession)
   ========================================================================= */

async function playTrackByIndex(index, customQueue = null) {
  if (customQueue) {
    state.currentQueue = [...customQueue];
  } else if (state.currentQueue.length === 0) {
    state.currentQueue = getFilteredTracks();
  }

  if (index < 0 || index >= state.currentQueue.length) return;

  state.currentIndex = index;
  const track = state.currentQueue[index];
  if (!track) return;

  // 1. Verificar primero si la canción está guardada en Modo Offline (IndexedDB)
  let playUrl = await getOfflineBlobUrl(track.id);
  if (!playUrl) {
    playUrl = getPlayableUrl(track);
  }

  if (!playUrl) {
    showToast('⚠️ Esta canción requiere estar en el dispositivo donde se subió o en Google Drive.');
    return;
  }

  audio.src = playUrl;
  try {
    await audio.play();
    state.isPlaying = true;
  } catch (err) {
    console.warn('Reproducción esperando interacción:', err);
    state.isPlaying = false;
  }

  updatePlayerBarUI(track);
  setupMediaSession(track);
  loadLyricsForTrack(track);
  renderTracksList();
}

function togglePlayPause() {
  if (!audio.src || state.currentIndex === -1) {
    const visible = getFilteredTracks();
    if (visible.length > 0) {
      playTrackByIndex(0, visible);
    }
    return;
  }

  if (audio.paused) {
    audio.play();
    state.isPlaying = true;
  } else {
    audio.pause();
    state.isPlaying = false;
  }
  updatePlayPauseIcons();
}

function playNextTrack() {
  if (state.currentQueue.length === 0) return;

  if (state.repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  let nextIdx = state.currentIndex + 1;
  if (state.isShuffle) {
    nextIdx = Math.floor(Math.random() * state.currentQueue.length);
  } else if (nextIdx >= state.currentQueue.length) {
    if (state.repeatMode === 'all') {
      nextIdx = 0;
    } else {
      state.isPlaying = false;
      updatePlayPauseIcons();
      return;
    }
  }

  playTrackByIndex(nextIdx);
}

function playPrevTrack() {
  if (state.currentQueue.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const prevIdx = (state.currentIndex - 1 + state.currentQueue.length) % state.currentQueue.length;
  playTrackByIndex(prevIdx);
}

function setupMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || 'SpotiDrive 5TB',
    artwork: [{ src: track.cover || DEFAULT_COVER, sizes: '512x512', type: 'image/png' }]
  });

  navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
}

function updatePlayerBarUI(track) {
  document.getElementById('playerTitle').textContent = track.title;
  document.getElementById('playerArtist').textContent = track.artist;
  document.getElementById('playerCover').src = track.cover || DEFAULT_COVER;

  const likeBtn = document.getElementById('btnLikeCurrent');
  likeBtn.classList.toggle('liked', state.likedIds.has(track.id));

  updatePlayPauseIcons();
}

function updatePlayPauseIcons() {
  document.getElementById('iconPlay').hidden = state.isPlaying;
  document.getElementById('iconPause').hidden = !state.isPlaying;
}

/* =========================================================================
   7. MOTOR DE LETRAS SINCRONIZADAS (KARAOKE .LRC + API LRCLIB)
   ========================================================================= */

function parseLrcLyrics(rawText) {
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/);
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/;

  lines.forEach((line, idx) => {
    const match = line.match(timeRegex);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const time = mins * 60 + secs + ms / 1000;
      const text = line.replace(timeRegex, '').trim();
      if (text) parsed.push({ time, text });
    } else if (line.trim()) {
      parsed.push({ time: idx * 4, text: line.trim() });
    }
  });

  return parsed.sort((a, b) => a.time - b.time);
}

async function loadLyricsForTrack(track) {
  document.getElementById('lyricsTrackTitle').textContent = track.title;
  document.getElementById('lyricsTrackArtist').textContent = `${track.artist} • Modo Karaoke Sincronizado`;

  if (track.lyrics) {
    state.parsedLyrics = parseLrcLyrics(track.lyrics);
    renderLyricsLines();
    return;
  }

  const container = document.getElementById('lyricsLinesContainer');
  container.innerHTML = `<p class="lyrics-placeholder">🔍 Buscando letra sincronizada para "${escapeHtml(track.title)}"...</p>`;

  try {
    const q = encodeURIComponent(`${track.title} ${track.artist !== 'Google Drive 5TB' ? track.artist : ''}`.trim());
    const resp = await fetch(`https://lrclib.net/api/search?q=${q}`);
    const results = await resp.json();

    if (Array.isArray(results) && results.length > 0) {
      const best = results.find((r) => r.syncedLyrics) || results[0];
      const lrcText = best.syncedLyrics || best.plainLyrics || '';
      if (lrcText) {
        track.lyrics = lrcText;
        state.parsedLyrics = parseLrcLyrics(lrcText);
        renderLyricsLines();
        return;
      }
    }
    state.parsedLyrics = [];
    container.innerHTML = `<p class="lyrics-placeholder">No se encontró letra automática para "${escapeHtml(track.title)}". Puedes pegarla con el botón "✏️ Pegar / Editar Letra (.LRC)".</p>`;
  } catch {
    state.parsedLyrics = [];
    container.innerHTML = `<p class="lyrics-placeholder">Sin conexión al buscador de letras. Haz clic en "✏️ Pegar / Editar Letra" para agregar tu propia letra.</p>`;
  }
}

function renderLyricsLines() {
  const container = document.getElementById('lyricsLinesContainer');
  if (!state.parsedLyrics.length) {
    container.innerHTML = `<p class="lyrics-placeholder">Selecciona una canción o agrega su letra para activar el modo Karaoke.</p>`;
    return;
  }

  container.innerHTML = state.parsedLyrics
    .map(
      (item, idx) =>
        `<div class="lyric-line" data-lyric-idx="${idx}" data-time="${item.time}">${escapeHtml(item.text)}</div>`
    )
    .join('');

  container.querySelectorAll('.lyric-line').forEach((el) => {
    el.addEventListener('click', () => {
      const targetTime = parseFloat(el.getAttribute('data-time') || '0');
      if (audio.src) {
        audio.currentTime = targetTime;
        audio.play();
      }
    });
  });
}

function syncActiveLyricLine(currentTime) {
  if (!state.parsedLyrics.length) return;
  let activeIdx = -1;
  for (let i = 0; i < state.parsedLyrics.length; i++) {
    if (currentTime >= state.parsedLyrics[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx === state.activeLyricIndex) return;
  state.activeLyricIndex = activeIdx;

  const container = document.getElementById('lyricsLinesContainer');
  const lines = container.querySelectorAll('.lyric-line');
  lines.forEach((line, idx) => {
    const isCurrent = idx === activeIdx;
    line.classList.toggle('active', isCurrent);
    if (isCurrent && !document.getElementById('lyricsViewSection').hidden) {
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

/* =========================================================================
   8. RENDERIZADO DE VISTAS, PLAYLISTS Y TABLA DE CANCIONES
   ========================================================================= */

function getFilteredTracks() {
  let list = [...state.tracks];

  if (state.currentView === 'favorites') {
    list = list.filter((t) => state.likedIds.has(t.id));
  } else if (state.currentView === 'offline') {
    list = list.filter((t) => state.offlineIds.has(t.id));
  } else if (state.currentView.startsWith('playlist:')) {
    const plId = state.currentView.replace('playlist:', '');
    list = list.filter((t) => t.playlistId === plId);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.artist || '').toLowerCase().includes(q) ||
        (t.album || '').toLowerCase().includes(q)
    );
  }

  return list;
}

function renderAll() {
  renderPlaylistsSidebar();
  updateHeroBanner();
  renderTracksList();
}

function renderPlaylistsSidebar() {
  const ul = document.getElementById('playlistSidebarList');
  ul.innerHTML = state.playlists
    .map((pl) => {
      const count = state.tracks.filter((t) => t.playlistId === pl.id).length;
      const isActive = state.currentView === `playlist:${pl.id}`;
      return `
        <li class="playlist-item ${isActive ? 'active' : ''}" data-playlist-id="${escapeHtml(pl.id)}">
          <div class="playlist-thumb">🎵</div>
          <div class="playlist-meta">
            <h4>${escapeHtml(pl.name)}</h4>
            <p>${count} canciones • Compartible</p>
          </div>
        </li>
      `;
    })
    .join('');

  ul.querySelectorAll('.playlist-item').forEach((li) => {
    li.addEventListener('click', () => {
      const plId = li.getAttribute('data-playlist-id');
      switchView(`playlist:${plId}`);
    });
  });
}

function updateHeroBanner() {
  const titleEl = document.getElementById('heroTitle');
  const subEl = document.getElementById('heroSubtitle');
  const badgeEl = document.getElementById('heroTypeBadge');

  if (state.currentView === 'home') {
    badgeEl.textContent = 'CATÁLOGO EN LA NUBE (5 TB) & OFFLINE';
    titleEl.textContent = 'Todas tus Canciones';
    subEl.textContent = `${state.tracks.length} canciones disponibles • Streaming desde Google Drive y Modo Offline`;
  } else if (state.currentView === 'favorites') {
    badgeEl.textContent = 'COLECCIÓN PERSONAL';
    titleEl.textContent = 'Tus Me Gusta ❤️';
    subEl.textContent = `${state.likedIds.size} canciones marcadas como favoritas`;
  } else if (state.currentView === 'offline') {
    badgeEl.textContent = 'DISPONIBLE SIN INTERNET';
    titleEl.textContent = 'Modo Offline ⬇️';
    subEl.textContent = `${state.offlineIds.size} canciones guardadas en la memoria de este dispositivo`;
  } else if (state.currentView === 'lyrics') {
    badgeEl.textContent = 'MODO KARAOKE EN VIVO';
    titleEl.textContent = 'Letras Sincronizadas 🎤';
    subEl.textContent = 'Sigue la letra en tiempo real o toca cualquier verso para adelantar la canción';
  } else if (state.currentView.startsWith('playlist:')) {
    const plId = state.currentView.replace('playlist:', '');
    const pl = state.playlists.find((p) => p.id === plId);
    badgeEl.textContent = 'PLAYLIST COMPARTIBLE CON AMIGOS';
    titleEl.textContent = pl ? pl.name : 'Playlist';
    subEl.textContent = pl && pl.description ? pl.description : 'Comparte el enlace con tus amigos para escuchar juntos';
  }
}

function renderTracksList() {
  const tracksSection = document.getElementById('tracksViewSection');
  const lyricsSection = document.getElementById('lyricsViewSection');

  if (state.currentView === 'lyrics') {
    tracksSection.hidden = true;
    lyricsSection.hidden = false;
    return;
  }

  tracksSection.hidden = false;
  lyricsSection.hidden = true;

  const container = document.getElementById('tracksContainer');
  const tracks = getFilteredTracks();

  if (tracks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 48px 20px; color: var(--text-secondary);">
        <p style="font-size: 1.1rem; margin-bottom: 12px;">No hay canciones en esta vista todavía.</p>
        <button type="button" class="btn-primary" id="btnEmptyAdd">➕ Agregar Canciones o Conectar Drive</button>
      </div>
    `;
    const btnEmpty = document.getElementById('btnEmptyAdd');
    if (btnEmpty) {
      btnEmpty.addEventListener('click', () => document.getElementById('uploadModal').showModal());
    }
    return;
  }

  const currentPlayingId =
    state.currentIndex >= 0 && state.currentQueue[state.currentIndex]
      ? state.currentQueue[state.currentIndex].id
      : null;

  container.innerHTML = tracks
    .map((track, idx) => {
      const isPlayingThis = currentPlayingId === track.id;
      const isLiked = state.likedIds.has(track.id);
      const isOffline = state.offlineIds.has(track.id);

      return `
        <div class="track-row ${isPlayingThis ? 'playing' : ''}" data-track-idx="${idx}">
          <span class="track-num">${isPlayingThis ? '▶' : idx + 1}</span>
          <div class="track-main">
            <img class="track-cover" src="${track.cover || DEFAULT_COVER}" alt="" loading="lazy" />
            <div class="track-text">
              <div class="track-name">${escapeHtml(track.title)}</div>
              <div class="track-artist">${escapeHtml(track.artist)}</div>
            </div>
          </div>
          <div class="track-album">${escapeHtml(track.album || 'Google Drive 5TB')}</div>
          <div class="track-status">
            ${
              isOffline
                ? '<span class="badge-offline-ready">✓ Offline</span>'
                : '<span class="badge-cloud">☁️ Nube</span>'
            }
          </div>
          <div class="track-actions">
            <button type="button" class="icon-btn ${isLiked ? 'liked' : ''}" data-action="like" data-id="${escapeHtml(track.id)}" title="Me gusta">♥</button>
            <button type="button" class="icon-btn" data-action="offline" data-id="${escapeHtml(track.id)}" title="Guardar para escuchar sin internet">⬇️</button>
            <button type="button" class="icon-btn" data-action="add-pl" data-id="${escapeHtml(track.id)}" title="Asignar a Playlist actual">➕</button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.getAttribute('data-action');
        const id = actionBtn.getAttribute('data-id');
        handleTrackAction(action, id);
        return;
      }
      const idx = parseInt(row.getAttribute('data-track-idx'), 10);
      playTrackByIndex(idx, tracks);
    });
  });
}

async function handleTrackAction(action, trackId) {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) return;

  if (action === 'like') {
    if (state.likedIds.has(trackId)) {
      state.likedIds.delete(trackId);
    } else {
      state.likedIds.add(trackId);
      showToast(`❤️ Agregada a Tus Me Gusta`);
    }
    localStorage.setItem('spotidrive_likes', JSON.stringify(Array.from(state.likedIds)));
    renderAll();
  } else if (action === 'offline') {
    await saveTrackOffline(track);
  } else if (action === 'add-pl') {
    if (state.playlists.length === 0) {
      document.getElementById('playlistModal').showModal();
      return;
    }
    const targetPl = state.playlists[state.playlists.length - 1];
    track.playlistId = targetPl.id;
    await persistCatalogToServer();
    renderAll();
    showToast(`➕ "${track.title}" agregada a "${targetPl.name}"`);
  }
}

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.nav-btn, .mob-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });
  renderAll();
}

/* =========================================================================
   9. EVENTOS DE INTERFAZ Y SUBIDA DE ARCHIVOS
   ========================================================================= */

async function handleLocalFilesSelected(fileList) {
  const files = Array.from(fileList).filter((f) =>
    /\.(mp3|flac|wav|m4a|ogg|aac)$/i.test(f.name) || (f.type && f.type.startsWith('audio/'))
  );

  if (files.length === 0) {
    showToast('⚠️ Selecciona archivos de audio válidos (.mp3, .flac, .wav, .m4a)');
    return;
  }

  document.getElementById('uploadModal').close();
  showToast(`⏳ Leyendo portadas y etiquetas ID3 de ${files.length} canción(es)...`);

  // Quitar pistas demo al subir música real
  state.tracks = state.tracks.filter((t) => t.source !== 'demo');

  for (const file of files) {
    const meta = await extractID3Metadata(file);
    const blobUrl = URL.createObjectURL(file);
    const trackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newTrack = {
      id: trackId,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      cover: meta.cover,
      blobUrl,
      source: 'local',
      playlistId: state.currentView.startsWith('playlist:')
        ? state.currentView.replace('playlist:', '')
        : ''
    };

    state.tracks.unshift(newTrack);
    // Guardar automáticamente en IndexedDB para que quede disponible Offline siempre
    await saveTrackOffline(newTrack, file);
  }

  await persistCatalogToServer();
  renderAll();
  showToast(`✅ ¡${files.length} canción(es) cargadas con portada y listas para sonar!`);
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

/* =========================================================================
   10. INICIALIZACIÓN COMPLETA
   ========================================================================= */

window.addEventListener('DOMContentLoaded', () => {
  setupModernDialogsAndSliders();
  loadInitialCatalog();

  // Registrar Service Worker para instalación en Celular y Laptop (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPwaPrompt = e;
    document.getElementById('btnInstallPwa').hidden = false;
  });

  document.getElementById('btnInstallPwa').addEventListener('click', async () => {
    if (!state.deferredPwaPrompt) return;
    state.deferredPwaPrompt.prompt();
    await state.deferredPwaPrompt.userChoice;
    state.deferredPwaPrompt = null;
    document.getElementById('btnInstallPwa').hidden = true;
  });

  // Estado Online / Offline en tiempo real
  const updateNetBadge = () => {
    const badge = document.getElementById('networkStatusBadge');
    if (navigator.onLine) {
      badge.textContent = 'Online';
      badge.className = 'status-pill online';
    } else {
      badge.textContent = 'Modo Offline';
      badge.className = 'status-pill offline';
      showToast('📡 Sin internet: Reproduciendo tus canciones guardadas en Modo Offline');
    }
  };
  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', updateNetBadge);
  updateNetBadge();

  // Navegación Desktop y Mobile
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });

  document.getElementById('btnMobileDrive').addEventListener('click', () => {
    document.getElementById('driveModal').showModal();
  });

  // Buscador en tiempo real
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value || '';
    renderTracksList();
  });

  // Botones de reproducción
  document.getElementById('btnPlayPause').addEventListener('click', togglePlayPause);
  document.getElementById('btnNext').addEventListener('click', playNextTrack);
  document.getElementById('btnPrev').addEventListener('click', playPrevTrack);

  document.getElementById('btnShuffle').addEventListener('click', (e) => {
    state.isShuffle = !state.isShuffle;
    e.currentTarget.classList.toggle('active', state.isShuffle);
    showToast(state.isShuffle ? '🔀 Modo aleatorio activado' : '🔀 Modo aleatorio desactivado');
  });

  document.getElementById('btnRepeat').addEventListener('click', (e) => {
    const modes = ['off', 'all', 'one'];
    state.repeatMode = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
    e.currentTarget.classList.toggle('active', state.repeatMode !== 'off');
    showToast(
      state.repeatMode === 'one'
        ? '🔂 Repetir canción actual'
        : state.repeatMode === 'all'
        ? '🔁 Repetir toda la lista'
        : '🔁 Repetición desactivada'
    );
  });

  document.getElementById('btnPlayAll').addEventListener('click', () => {
    const visible = getFilteredTracks();
    if (visible.length > 0) playTrackByIndex(0, visible);
  });

  document.getElementById('btnDownloadAllOffline').addEventListener('click', async () => {
    const visible = getFilteredTracks();
    for (const t of visible) {
      if (!state.offlineIds.has(t.id)) {
        await saveTrackOffline(t);
      }
    }
    showToast(`✅ Lista completa guardada para escuchar sin internet`);
  });

  document.getElementById('btnLikeCurrent').addEventListener('click', () => {
    const curr = state.currentQueue[state.currentIndex];
    if (curr) handleTrackAction('like', curr.id);
  });

  document.getElementById('btnOfflineCurrent').addEventListener('click', () => {
    const curr = state.currentQueue[state.currentIndex];
    if (curr) saveTrackOffline(curr);
  });

  document.getElementById('btnToggleLyricsBar').addEventListener('click', () => {
    switchView(state.currentView === 'lyrics' ? 'home' : 'lyrics');
  });

  // Eventos del elemento <audio>
  audio.addEventListener('timeupdate', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    seekSlider.value = String(pct);
    syncSliderProperties(seekSlider);
    document.getElementById('currentTimeLabel').textContent = formatTime(audio.currentTime);
    document.getElementById('totalTimeLabel').textContent = formatTime(audio.duration);
    syncActiveLyricLine(audio.currentTime);
  });

  audio.addEventListener('ended', playNextTrack);

  seekSlider.addEventListener('input', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (parseFloat(seekSlider.value) / 100) * audio.duration;
    }
  });

  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value) / 100;
  });

  document.getElementById('btnMute').addEventListener('click', (e) => {
    audio.muted = !audio.muted;
    e.currentTarget.textContent = audio.muted ? '🔇' : '🔊';
  });

  // Abrir Modales
  document.getElementById('btnOpenDriveModal').addEventListener('click', () => {
    document.getElementById('driveModal').showModal();
  });

  document.getElementById('btnOpenUploadModal').addEventListener('click', () => {
    document.getElementById('uploadModal').showModal();
  });

  document.getElementById('btnNewPlaylist').addEventListener('click', () => {
    document.getElementById('playlistModal').showModal();
  });

  document.getElementById('btnSyncNow').addEventListener('click', syncGoogleDriveFolder);

  // Compartir con amigos (Incluye automáticamente la carpeta de Drive para funcionar en GitHub Pages)
  const openShareModal = () => {
    const shareUrl = new URL(window.location.href);
    if (state.settings.driveFolderId) {
      shareUrl.searchParams.set('folder', state.settings.driveFolderId);
    }
    if (state.settings.driveApiKey) {
      try {
        shareUrl.searchParams.set('k', btoa(state.settings.driveApiKey));
      } catch {
        // Ignore encoding error
      }
    }
    if (state.settings.appName && state.settings.appName !== 'SpotiDrive 5TB') {
      shareUrl.searchParams.set('app', state.settings.appName);
    }
    if (state.currentView.startsWith('playlist:')) {
      shareUrl.searchParams.set('view', state.currentView);
    } else {
      shareUrl.searchParams.delete('view');
    }
    document.getElementById('shareLinkOutput').value = shareUrl.toString();
    document.getElementById('shareModal').showModal();
  };

  document.getElementById('btnShareFriends').addEventListener('click', openShareModal);
  document.getElementById('btnShareCurrentView').addEventListener('click', openShareModal);

  document.getElementById('btnCopyShareLink').addEventListener('click', () => {
    const input = document.getElementById('shareLinkOutput');
    navigator.clipboard.writeText(input.value);
    showToast('🔗 ¡Link copiado! Envíalo a tus amigos por WhatsApp o Discord');
  });

  // Guardar Configuración de Google Drive (5 TB)
  document.getElementById('driveConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.settings.appName = document.getElementById('inputAppName').value.trim() || 'SpotiDrive 5TB';
    state.settings.driveFolderId = extractDriveId(document.getElementById('inputDriveFolder').value);
    const apiKeyInput = document.getElementById('inputDriveApiKey').value.trim();
    if (apiKeyInput) state.settings.driveApiKey = apiKeyInput;

    const pass = document.getElementById('inputFriendPasscode').value.trim();
    state.settings.friendPasscode = pass;
    state.settings.requirePasscode = Boolean(pass);

    document.getElementById('sidebarAppName').textContent = state.settings.appName;
    document.getElementById('driveModal').close();

    await persistCatalogToServer();
    if (state.settings.driveFolderId && state.settings.driveApiKey) {
      await syncGoogleDriveFolder();
    } else {
      showToast('✅ Configuración guardada correctamente');
    }
  });

  // Subida de archivos locales y carpetas completas
  document.getElementById('fileInputTracks').addEventListener('change', (e) => {
    if (e.target.files.length) handleLocalFilesSelected(e.target.files);
  });

  document.getElementById('folderInputTracks').addEventListener('change', (e) => {
    if (e.target.files.length) handleLocalFilesSelected(e.target.files);
  });

  const dropzone = document.getElementById('dropzoneArea');
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#fff';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'rgba(29, 185, 84, 0.5)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(29, 185, 84, 0.5)';
    if (e.dataTransfer.files.length) handleLocalFilesSelected(e.dataTransfer.files);
  });

  // Agregar canción individual por Link de Google Drive (sin necesidad de API Key)
  document.getElementById('addDriveFileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('driveSongTitle').value.trim();
    const artist = document.getElementById('driveSongArtist').value.trim();
    const rawUrl = document.getElementById('driveSongUrl').value.trim();
    const album = document.getElementById('driveSongPlaylist').value.trim() || 'Google Drive 5TB';

    const driveId = extractDriveId(rawUrl);
    const isDriveLink = rawUrl.includes('drive.google.com');

    state.tracks = state.tracks.filter((t) => t.source !== 'demo');

    const newTrack = {
      id: `drive-${Date.now()}`,
      title,
      artist,
      album,
      driveFileId: isDriveLink ? driveId : '',
      streamUrl: isDriveLink ? '' : rawUrl,
      source: 'drive',
      cover: DEFAULT_COVER,
      playlistId: state.currentView.startsWith('playlist:')
        ? state.currentView.replace('playlist:', '')
        : ''
    };

    state.tracks.unshift(newTrack);
    await persistCatalogToServer();
    renderAll();
    e.target.reset();
    document.getElementById('uploadModal').close();
    showToast(`✅ "${title}" agregada desde Google Drive`);
  });

  // Crear nueva Playlist
  document.getElementById('createPlaylistForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newPlaylistName').value.trim();
    const description = document.getElementById('newPlaylistDesc').value.trim();
    if (!name) return;

    const newPl = {
      id: `pl-${Date.now()}`,
      name,
      description
    };
    state.playlists.push(newPl);
    await persistCatalogToServer();
    e.target.reset();
    document.getElementById('playlistModal').close();
    switchView(`playlist:${newPl.id}`);
    showToast(`🎵 Playlist "${name}" creada`);
  });

  // Letras personalizadas (.LRC)
  document.getElementById('btnEditCustomLyrics').addEventListener('click', () => {
    const curr = state.currentQueue[state.currentIndex];
    document.getElementById('customLyricsTextarea').value = curr && curr.lyrics ? curr.lyrics : '';
    document.getElementById('lyricsEditModal').showModal();
  });

  document.getElementById('btnSearchLyricsAgain').addEventListener('click', () => {
    const curr = state.currentQueue[state.currentIndex];
    if (curr) {
      curr.lyrics = '';
      loadLyricsForTrack(curr);
    }
  });

  document.getElementById('customLyricsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const curr = state.currentQueue[state.currentIndex];
    if (!curr) {
      showToast('⚠️ Reproduce primero una canción para asignarle la letra');
      return;
    }
    curr.lyrics = document.getElementById('customLyricsTextarea').value;
    state.parsedLyrics = parseLrcLyrics(curr.lyrics);
    renderLyricsLines();
    await persistCatalogToServer();
    document.getElementById('lyricsEditModal').close();
    showToast('🎤 Letra sincronizada guardada');
  });

  // Formulario de código de invitación para amigos
  document.getElementById('passcodeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('friendPasscodeInput').value.trim();
    sessionStorage.setItem('spotidrive_passcode', code);
    await loadInitialCatalog();
    if (!document.getElementById('passcodeGate').hidden) {
      document.getElementById('passcodeError').hidden = false;
    }
  });
});

