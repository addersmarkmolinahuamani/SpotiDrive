const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Directorio de datos persistentes (catálogo compartido para amigos)
const DATA_DIR = path.join(__dirname, 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_CATALOG = {
  settings: {
    appName: 'SpotiDrive 5TB',
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    driveApiKey: process.env.GOOGLE_DRIVE_API_KEY || '',
    friendPasscode: process.env.FRIEND_PASSCODE || '', // Vacío = acceso directo sin contraseña
    requirePasscode: false
  },
  tracks: [],
  playlists: []
};

function readCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error leyendo catalog.json:', err.message);
  }
  return DEFAULT_CATALOG;
}

function saveCatalog(data) {
  try {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error guardando catalog.json:', err.message);
    return false;
  }
}

// 1. Obtener catálogo compartido (para que los amigos vean todas las canciones y playlists al entrar al link)
app.get('/api/catalog', (req, res) => {
  const catalog = readCatalog();
  const passcodeHeader = req.headers['x-friend-passcode'] || req.query.passcode || '';

  if (catalog.settings.requirePasscode && catalog.settings.friendPasscode) {
    if (passcodeHeader !== catalog.settings.friendPasscode) {
      return res.status(401).json({
        locked: true,
        appName: catalog.settings.appName || 'SpotiDrive 5TB',
        message: 'Ingresa el código de invitación para acceder al catálogo.'
      });
    }
  }

  res.json({
    locked: false,
    settings: {
      appName: catalog.settings.appName,
      driveFolderId: catalog.settings.driveFolderId,
      hasApiKey: Boolean(catalog.settings.driveApiKey || process.env.GOOGLE_DRIVE_API_KEY),
      requirePasscode: Boolean(catalog.settings.requirePasscode)
    },
    tracks: catalog.tracks || [],
    playlists: catalog.playlists || []
  });
});

// 2. Guardar configuración, canciones sincronizadas y playlists en el servidor
app.post('/api/catalog', (req, res) => {
  const current = readCatalog();
  const { settings, tracks, playlists } = req.body;

  if (settings) {
    current.settings = {
      ...current.settings,
      ...settings,
      driveApiKey: settings.driveApiKey !== undefined ? settings.driveApiKey : current.settings.driveApiKey
    };
  }
  if (Array.isArray(tracks)) {
    current.tracks = tracks;
  }
  if (Array.isArray(playlists)) {
    current.playlists = playlists;
  }

  saveCatalog(current);
  res.json({ ok: true, count: current.tracks.length, playlistsCount: current.playlists.length });
});

// 3. Escanear carpeta de Google Drive (Soporta subcarpetas como Playlists/Álbumes)
app.get('/api/drive/sync', async (req, res) => {
  const catalog = readCatalog();
  const folderId = req.query.folderId || catalog.settings.driveFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  const apiKey = req.query.apiKey || catalog.settings.driveApiKey || process.env.GOOGLE_DRIVE_API_KEY;

  if (!folderId || !apiKey) {
    return res.status(400).json({
      error: 'Falta el ID de la carpeta de Google Drive o la API Key de Google Drive.'
    });
  }

  try {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('files(id,name,mimeType,size,thumbnailLink,createdTime,videoMediaMetadata)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=500&key=${apiKey}`;

    const data = await fetchJson(url);
    if (data.error) {
      return res.status(data.error.code || 400).json({ error: data.error.message });
    }

    const files = data.files || [];
    const audioFiles = [];
    const folders = [];

    for (const f of files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        folders.push(f);
      } else if (isAudioFile(f)) {
        audioFiles.push({ ...f, folderName: 'Biblioteca Principal' });
      }
    }

    // Escanear hasta 10 subcarpetas (cada subcarpeta se convierte en Playlist/Álbum automáticamente)
    for (const sub of folders.slice(0, 10)) {
      const subQuery = encodeURIComponent(`'${sub.id}' in parents and trashed = false`);
      const subUrl = `https://www.googleapis.com/drive/v3/files?q=${subQuery}&fields=${fields}&pageSize=300&key=${apiKey}`;
      try {
        const subData = await fetchJson(subUrl);
        for (const sf of (subData.files || [])) {
          if (isAudioFile(sf)) {
            audioFiles.push({ ...sf, folderName: sub.name, folderId: sub.id });
          }
        }
      } catch (e) {
        console.warn('No se pudo leer subcarpeta:', sub.name);
      }
    }

    res.json({ ok: true, files: audioFiles, folders });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al sincronizar con Google Drive' });
  }
});

// 4. Proxy de Streaming de Audio desde Google Drive con soporte HTTP Range (permite adelantar/atrasar en celular y laptop sin bloqueo CORS ni aviso de tamaño de Drive)
app.get('/api/drive/stream/:fileId', (req, res) => {
  const { fileId } = req.params;
  const catalog = readCatalog();
  const apiKey = req.query.key || catalog.settings.driveApiKey || process.env.GOOGLE_DRIVE_API_KEY;

  let targetUrl = '';
  if (apiKey) {
    targetUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  } else {
    targetUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  }

  const headers = {};
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  const proxyRequest = (urlToFetch, redirectCount = 0) => {
    if (redirectCount > 5) {
      return res.status(502).send('Demasiadas redirecciones desde Google Drive');
    }

    https.get(urlToFetch, { headers }, (driveRes) => {
      if ([301, 302, 303, 307, 308].includes(driveRes.statusCode) && driveRes.headers.location) {
        driveRes.resume();
        return proxyRequest(driveRes.headers.location, redirectCount + 1);
      }

      const forwardHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control'
      ];

      forwardHeaders.forEach((h) => {
        if (driveRes.headers[h]) {
          res.setHeader(h, driveRes.headers[h]);
        }
      });

      if (!res.getHeader('accept-ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
      }

      res.status(driveRes.statusCode || 200);
      driveRes.pipe(res);
    }).on('error', (err) => {
      console.error('Error en stream de Drive:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Error transmitiendo audio desde Google Drive');
      }
    });
  };

  proxyRequest(targetUrl);
});

function isAudioFile(file) {
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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let raw = '';
      resp.on('data', (chunk) => { raw += chunk; });
      resp.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Respuesta inválida de Google Drive API'));
        }
      });
    }).on('error', reject);
  });
}

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🎧 SpotiDrive 5TB ejecutándose en: http://localhost:${PORT}`);
  console.log(`📱 Abre este enlace en tu navegador de Laptop o Celular`);
  console.log(`======================================================\n`);
});

