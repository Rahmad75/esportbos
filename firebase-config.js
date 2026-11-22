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
    return { id: snap.id, ...snap.data() };
  }

  const rawUsername = (defaults.username || (user.email ? user.email.split('@')[0] : 'Manager') || 'Manager').trim();
  const fallbackUsername = rawUsername.slice(0, 64) || 'Manager';
  const rawClub = (defaults.club_name || `${fallbackUsername} FC`).trim();
  const safeClubName = rawClub.slice(0, 80) || 'My Club FC';
  const safeReferral = (defaults.referral_code || ('ESB-' + Math.random().toString(36).substring(2, 8).toUpperCase())).slice(0, 32);
  const safeReferredBy = defaults.referred_by ? String(defaults.referred_by).trim().slice(0, 128) : null;

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
    diamonds: 0,
    gold: 10000,
    currency: 5000,
    prediction_score: 0,
    prediction_total: 0,
    prediction_correct: 0,
    created_at: new Date().toISOString()
  };

  try {
    await withFirestoreRetry(() => setDoc(profileRef, newProfile), 3, 1000);
    return newProfile;
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
