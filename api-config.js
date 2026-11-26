// URL backend Vercel yang aktif untuk semua request /api/... saat diakses dari domain Cloudflare (esportbos.com).
// Saat dijalankan di preview lokal / AI Studio (*.run.app, localhost), otomatis tetap memakai /api/... lokal.
export const API_BASE_URL = 'https://esportbos-i2du.vercel.app';

function isLocalPreviewHost() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app') ||
    host.endsWith('.aistudio.google.com')
  );
}

export function getApiBase() {
  if (typeof window !== 'undefined' && typeof window.__ESPORTBOS_API_BASE__ === 'string') {
    return window.__ESPORTBOS_API_BASE__;
  }
  return isLocalPreviewHost() ? '' : API_BASE_URL;
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
