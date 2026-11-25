export const CLOUD_FUNCTIONS_API_BASE = 'https://asia-southeast1-eighth-thought-94cnq.cloudfunctions.net/api';

function isStaticMirrorHost() {
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  return host === 'esportbos.com' || host.endsWith('.esportbos.com') || host.endsWith('.github.io');
}

export function getApiBase() {
  if (typeof window !== 'undefined' && typeof window.__ESPORTBOS_API_BASE__ === 'string') {
    return window.__ESPORTBOS_API_BASE__;
  }
  return '';
}

export function setApiBase(base) {
  if (typeof window !== 'undefined' && typeof base === 'string') {
    window.__ESPORTBOS_API_BASE__ = base;
  }
}

export function resolveApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBase();
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
  const primaryUrl = resolveApiUrl(path);
  let res;
  try {
    res = await fetch(primaryUrl, options);
  } catch (err) {
    if (!getApiBase() && isStaticMirrorHost()) {
      setApiBase(CLOUD_FUNCTIONS_API_BASE);
      return fetch(resolveApiUrl(path), options);
    }
    throw err;
  }

  // Jika host static (misal GitHub Pages esportbos.com sebelum pindah ke Firebase Hosting) mengembalikan 404 pada /api/*,
  // otomatis arahkan ke Firebase Cloud Functions endpoint.
  if (res.status === 404 && !getApiBase() && isStaticMirrorHost()) {
    setApiBase(CLOUD_FUNCTIONS_API_BASE);
    return fetch(resolveApiUrl(path), options);
  }
  return res;
}
