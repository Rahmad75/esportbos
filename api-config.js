// Jika frontend dan backend berjalan di 1 domain yang sama (misal Vercel / AI Studio / Render fullstack),
// biarkan API_BASE_URL kosong ('') agar otomatis memakai /api/... di domain yang sama.
// Jika suatu saat backend dipisah ke domain lain (misal https://esportbos-api.onrender.com), isi URL-nya di sini.
export const API_BASE_URL = '';

export function getApiBase() {
  if (typeof window !== 'undefined' && typeof window.__ESPORTBOS_API_BASE__ === 'string') {
    return window.__ESPORTBOS_API_BASE__;
  }
  return API_BASE_URL;
}

export function resolveApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase().replace(/\/+$/, '');
  if (!base) return cleanPath;
  if (base.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return base + cleanPath.slice(4);
  }
  if (base.endsWith('/api') && cleanPath === '/api') {
    return base;
  }
  return base + cleanPath;
}

export async function apiFetch(path, options = {}) {
  return fetch(resolveApiUrl(path), options);
}
