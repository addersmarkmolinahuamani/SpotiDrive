# 🎧 SpotiDrive 5TB — Guía de Uso y Conexión con Google Drive

¡Tu propio Spotify conectado a tus **5 TB de Google Drive** está listo! Funciona en **Laptop** y en **Celular** (con soporte instalable PWA y **Modo Offline**).

---

## 🚀 1. Cómo encender tu aplicación

En la terminal dentro de esta carpeta (`Spotify Adders`), ejecuta:

```bash
npm install
npm start
```

Luego abre en tu navegador:
👉 **http://localhost:3000**

---

## ☁️ 2. Dos formas de usar tus 5 TB de Google Drive

### Forma A: Sincronizar una Carpeta Completa de Google Drive (Automático)
Ideal cuando tienes cientos o miles de canciones organizadas en carpetas dentro de tu Google Drive:

1. Entra a tu **Google Drive** y crea una carpeta (por ejemplo: `Mi Musica Spotify`).
2. Sube ahí tus archivos `.mp3`, `.flac`, `.wav` o `.m4a` (incluso puedes crear subcarpetas adentro; **cada subcarpeta se convertirá automáticamente en una Playlist**).
3. Haz clic derecho sobre esa carpeta en Google Drive → **Compartir** → Cambia el acceso general a **"Cualquier persona con el enlace (Lector)"** y copia el enlace.
4. Obtén tu clave gratuita de lectura (`API Key`) en 1 minuto:
   - Ve a https://console.cloud.google.com/apis/library/drive.googleapis.com y dale a **Habilitar (Enable)**.
   - Luego ve a https://console.cloud.google.com/apis/credentials → **Crear credenciales** → **Clave de API (API Key)**.
5. En tu aplicación **SpotiDrive 5TB**, haz clic en **"Conectar Google Drive (5TB)"**, pega el link de tu carpeta y tu API Key, y dale a **Guardar y Sincronizar**.
   - 💡 *Consejo:* Si nombras tus archivos en Drive como `Artista - Titulo.mp3` (ej. `Bad Bunny - Monaco.mp3`), SpotiDrive separará automáticamente el nombre del artista y la canción.

### Forma B: Agregar canciones por Link directo o Arrastrando Archivos (Sin API Key)
- Haz clic en **"Agregar / Subir Canciones"**:
  - **Desde tu PC o Celular:** Arrastra tus archivos `.mp3` / `.flac` o selecciona una carpeta entera. La aplicación leerá automáticamente la **portada original incrustada (ID3), título, artista y álbum**, y además los dejará guardados en **Modo Offline**.
  - **Desde Google Drive por link:** Pega cualquier link de un archivo de audio compartido de tu Google Drive y se reproducirá a través del túnel de streaming sin bloqueos.

---

## 📱 3. Cómo abrirlo en tu Celular y Compartir con Amigos

### Opción 1: Dentro de tu casa (Mismo Wi-Fi)
Mira la dirección IP de tu laptop (ejecutando `ipconfig` en Windows, por ejemplo `192.168.1.15`) y abre en tu celular:
`http://192.168.1.15:3000`

### Opción 2: Desde cualquier lugar del mundo (Link Público Gratis)
- **Rápido desde tu laptop (Túnel instantáneo):**
  Ejecuta en otra terminal:
  ```bash
  npx localtunnel --port 3000
  ```
  Te dará un link `https://....loca.lt` que puedes mandar por WhatsApp a tus amigos al instante.
- **24/7 en la Nube sin tener tu laptop encendida:**
  Sube esta carpeta a un repositorio de GitHub y conéctalo gratis en **Render.com** o **Railway.app**. Como toda la música pesada vive en tus **5 TB de Google Drive**, el servidor web no gasta almacenamiento.

