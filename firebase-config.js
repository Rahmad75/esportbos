import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore,
  memoryLocalCache,
  enableNetwork,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDocFromServer
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { loadEconomyConfig } from './economy-config.js';

// Konfigurasi Firebase (selaras dengan firebase-applet-config.json)
export const firebaseConfig = {
  apiKey: "AIzaSyB90-EyMqNdjgIBLwsPvNiRWldfNtvO3No",
  authDomain: "eighth-thought-94cnq.firebaseapp.com",
  projectId: "eighth-thought-94cnq",
  storageBucket: "eighth-thought-94cnq.firebasestorage.app",
  messagingSenderId: "864331865893",
  appId: "1:864331865893:web:44589629fc8c67f2fc44cc",
  firestoreDatabaseId: "ai-studio-esportbos-a5699ac0-157f-46a0-981e-0d420edc4ad0"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Paksa long-polling dan memoryLocalCache (tanpa IndexedDB persistence) agar stabil di preview iframe
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    localCache: memoryLocalCache()
  },
  firebaseConfig.firestoreDatabaseId || undefined
);
export const storage = getStorage(app);

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
};

export function isFirestoreOfflineError(error) {
  const code = String(error?.code || '').toLowerCase();
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('failed to get document') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('gagal terhubung ke server')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFirestoreRetry(operation, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isFirestoreOfflineError(error) || attempt === maxRetries) {
        throw error;
      }
      try {
        await enableNetwork(db);
      } catch (_) {
        // Abaikan error enableNetwork sementara dan lanjutkan jeda retry
      }
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// Pastikan Firestore backend sudah siap menerima request sebelum query login
export async function ensureFirestoreReady(maxRetries = 3, delayMs = 1000) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await enableNetwork(db);
      await getDocFromServer(doc(db, 'test', 'connection'));
      return true;
    } catch (error) {
      const code = String(error?.code || '').toLowerCase();
      // permission-denied atau not-found berarti server Firestore merespons dan online
      if (code === 'permission-denied' || code === 'not-found') {
        return true;
      }
      lastError = error;
      if (!isFirestoreOfflineError(error)) {
        return true;
      }
      if (attempt < maxRetries) {
        await sleep(delayMs);
      }
    }
  }
  const offlineErr = new Error('Gagal terhubung ke server, cek koneksi / buka di tab baru');
  offlineErr.code = 'unavailable';
  offlineErr.cause = lastError;
  throw offlineErr;
}

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Cek koneksi Firestore sekali saat startup
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Turn-based auth check: hanya jalan SEKALI saat halaman load lalu langsung unsubscribe
export function getCurrentUserOnce() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function overlayServerWalletBalances(user, profileData) {
  try {
    if (!user || typeof user.getIdToken !== 'function' || typeof fetch !== 'function') {
      return profileData;
    }
    const token = await user.getIdToken();
    const res = await fetch('/api/economy/wallet', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return profileData;
    const payload = await res.json();
    if (payload && payload.success && payload.wallet) {
      return {
        ...profileData,
        diamonds: Number(payload.wallet.diamond ?? 0),
        gold: Number(payload.wallet.gold ?? 0),
        currency: Number(payload.wallet.currency ?? 0)
      };
    }
  } catch (_) {
    // Fallback gracefully jika offline sementara
  }
  return profileData;
}

// Helper: Ambil profile user sekali dengan getDoc + retry (buat default jika belum ada)
export async function getOrCreateProfile(user, defaults = {}) {
  if (!user || !user.uid) return null;
  const path = `profiles/${user.uid}`;
  const profileRef = doc(db, 'profiles', user.uid);
  let snap;
  try {
    snap = await withFirestoreRetry(() => getDoc(profileRef), 3, 1000);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap && snap.exists()) {
    return overlayServerWalletBalances(user, { id: snap.id, ...snap.data() });
  }

  const rawUsername = (defaults.username || (user.email ? user.email.split('@')[0] : 'Manager') || 'Manager').trim();
  const fallbackUsername = rawUsername.slice(0, 64) || 'Manager';
  const rawClub = (defaults.club_name || `${fallbackUsername} FC`).trim();
  const safeClubName = rawClub.slice(0, 80) || 'My Club FC';
  const safeReferral = (defaults.referral_code || ('ESB-' + Math.random().toString(36).substring(2, 8).toUpperCase())).slice(0, 32);
  const safeReferredBy = defaults.referred_by ? String(defaults.referred_by).trim().slice(0, 128) : null;

  const economyCfg = await loadEconomyConfig();
  const starter = economyCfg.starterBalance;

  const newProfile = {
    id: user.uid,
    username: fallbackUsername,
    club_name: safeClubName,
    referral_code: safeReferral,
    referred_by: safeReferredBy || null,
    avatar_url: null,
    bio: '',
    country: 'ID',
    city: '',
    diamonds: Number(starter.diamonds),
    gold: Number(starter.gold),
    currency: Number(starter.currency),
    prediction_score: 0,
    prediction_total: 0,
    prediction_correct: 0,
    created_at: new Date().toISOString()
  };

  try {
    await withFirestoreRetry(() => setDoc(profileRef, newProfile), 3, 1000);
    return overlayServerWalletBalances(user, newProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Helper: Ambil team milik user sekali dengan getDocs + retry (buat default jika belum ada)
export async function getOrCreateTeam(user, clubNameFallback = null) {
  if (!user || !user.uid) return null;
  const path = 'teams';
  let snap;
  try {
    const q = query(collection(db, 'teams'), where('user_id', '==', user.uid));
    snap = await withFirestoreRetry(() => getDocs(q), 3, 1000);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  if (snap && !snap.empty) {
    const firstDoc = snap.docs[0];
    return { id: firstDoc.id, ...firstDoc.data() };
  }

  const rawName = (clubNameFallback || (user.email ? `${user.email.split('@')[0]} Esports` : 'My Club')).trim();
  const defaultName = rawName.slice(0, 80) || 'My Club';
  const newTeam = {
    user_id: user.uid,
    team_name: defaultName,
    wins: 0,
    draws: 0,
    losses: 0,
    popularity: 50,
    moral: 70,
    academy_level: 1,
    stadium_level: 1,
    facility_level: 1,
    active_sponsors: [],
    hired_staff: [],
    pending_stadium_income: 0,
    total_home_matches: 0,
    total_stadium_income: 0,
    last_claim_at: null,
    last_match_at: null,
    matches_played_today: 0,
    last_daily_reset: null,
    created_at: new Date().toISOString()
  };

  try {
    const teamRef = await withFirestoreRetry(() => addDoc(collection(db, 'teams'), newTeam), 3, 1000);
    return { id: teamRef.id, ...newTeam };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const FALLBACK_AVATAR_URL = 'https://randomuser.me/api/portraits/men/32.jpg';

export function isIllustrationAvatarUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('dicebear') ||
    lower.includes('avataaars') ||
    lower.includes('bottts') ||
    lower.includes('initials') ||
    lower.includes('.svg') ||
    lower.startsWith('data:image/svg')
  );
}

function computeDeterministicAvatarIndex(seedValue) {
  const str = String(seedValue ?? '1').trim();
  if (!str) return 1;
  if (/^\d+$/.test(str)) {
    return Number(str) % 99;
  }
  const marketIdMatch = str.match(/^m(\d+)$/i);
  if (marketIdMatch) {
    return Number(marketIdMatch[1]) % 99;
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash * 31) + str.charCodeAt(i)) >>> 0;
  }
  return hash % 99;
}

function isFemaleGender(playerOrGender) {
  const g = String(
    typeof playerOrGender === 'object' && playerOrGender !== null
      ? (playerOrGender.gender || playerOrGender.sex || '')
      : (playerOrGender || '')
  ).trim().toLowerCase();
  return g === 'female' || g === 'woman' || g === 'women' || g === 'f' || g === 'p' || g === 'perempuan' || g === 'cewek';
}

// Selalu gunakan foto portrait fotorealistik deterministik dari randomuser.me (abaikan avatar ilustrasi lama)
export function getPlayerAvatarUrl(player, fallbackSeed = '') {
  const idSource = (typeof player === 'object' && player !== null)
    ? (player.id || player.player_id || player.name || fallbackSeed || '1')
    : (player || fallbackSeed || '1');
  const index = computeDeterministicAvatarIndex(idSource);
  const folder = isFemaleGender(player) ? 'women' : 'men';
  return `https://randomuser.me/api/portraits/${folder}/${index}.jpg`;
}

// Untuk profil/navbar user: gunakan foto upload asli jika bukan ilustrasi/SVG, selain itu randomuser.me deterministik
export function getSafeUserAvatarUrl(profile, fallbackSeed = 'manager') {
  if (profile && !isIllustrationAvatarUrl(profile.avatar_url)) {
    return profile.avatar_url;
  }
  const idSource = profile?.id || fallbackSeed || 'manager';
  const index = computeDeterministicAvatarIndex(idSource);
  return `https://randomuser.me/api/portraits/men/${index}.jpg`;
}
