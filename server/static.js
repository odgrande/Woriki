// Minimal static file server for the built game (dist/), so one free web service can
// host both the page and the WebSocket. Safe path resolution, ETags, gzip for text.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|javascript)|image\/svg|model\/gltf\+json)/;
const HASHED = /[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/**
 * @param {string} root absolute directory to serve
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean} false when not handled
 */
export function createStatic(root) {
  const base = path.resolve(root);
  const gzCache = new Map(); // path → {mtime, buf}

  const resolve = (urlPath) => {
    let rel;
    try { rel = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
    if (rel.includes('\0')) return null;
    const file = path.resolve(base, '.' + path.posix.normalize('/' + rel));
    return file === base || file.startsWith(base + path.sep) ? file : null;
  };
  const statFile = (f) => { try { const s = fs.statSync(f); return s.isFile() ? s : null; } catch { return null; } };

  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let file = resolve(req.url || '/');
    if (!file) { res.writeHead(400).end(); return true; }
    let st = statFile(file);
    if (!st && statFile(path.join(file, 'index.html'))) { file = path.join(file, 'index.html'); st = statFile(file); }
    // SPA fallback: extensionless paths get index.html.
    if (!st && !path.extname(file)) { file = path.join(base, 'index.html'); st = statFile(file); }
    if (!st) return false;

    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': type,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : HASHED.test(path.basename(file)) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return true; }

    const gzip = COMPRESSIBLE.test(type) && st.size > 1024 && st.size < 8 * 1024 * 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (gzip) {
      let c = gzCache.get(file);
      if (!c || c.mtime !== st.mtimeMs) {
        c = { mtime: st.mtimeMs, buf: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) };
        gzCache.set(file, c);
      }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': c.buf.length });
      res.end(req.method === 'HEAD' ? undefined : c.buf);
      return true;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return true;
  };
}
