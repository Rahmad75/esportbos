import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore,
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
// Gunakan experimentalForceLongPolling agar koneksi Firestore stabil di browser/iframe/proxy
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    useFetchStreams: false
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

// Helper: Ambil profile user sekali dengan getDoc (buat default jika belum ada)
export async function getOrCreateProfile(user, defaults = {}) {
  if (!user || !user.uid) return null;
  const path = `profiles/${user.uid}`;
  const profileRef = doc(db, 'profiles', user.uid);
  let snap;
  try {
    snap = await getDoc(profileRef);
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
    await setDoc(profileRef, newProfile);
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Helper: Ambil team milik user sekali dengan getDocs (buat default jika belum ada)
export async function getOrCreateTeam(user, clubNameFallback = null) {
  if (!user || !user.uid) return null;
  const path = 'teams';
  let snap;
  try {
    const q = query(collection(db, 'teams'), where('user_id', '==', user.uid));
    snap = await getDocs(q);
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
    const teamRef = await addDoc(collection(db, 'teams'), newTeam);
    return { id: teamRef.id, ...newTeam };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
