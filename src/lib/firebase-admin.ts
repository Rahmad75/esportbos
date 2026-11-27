import { createRemoteJWKSet, jwtVerify } from 'jose';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedFirebaseAuthPromise: Promise<{ verifyIdToken: (token: string) => Promise<DecodedFirebaseUser> } | null> | null = null;

export interface DecodedFirebaseUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  auth_time?: number;
}

function getFirebaseJwks() {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(FIREBASE_JWKS_URL);
  }
  return cachedJwks;
}

async function getLazyFirebaseAdminAuth() {
  if (!cachedFirebaseAuthPromise) {
    cachedFirebaseAuthPromise = (async () => {
      try {
        const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
          import('firebase-admin/app'),
          import('firebase-admin/auth')
        ]);
        if (!getApps().length) {
          initializeApp({ projectId: firebaseConfig.projectId });
        }
        return getAuth();
      } catch (err) {
        // Fallback otomatis ke verifikasi JWT ESM murni (jose) jika runtime Node < 22 memicu ERR_REQUIRE_ESM di jwks-rsa
        console.warn('[Auth] Lazy firebase-admin fallback to ESM jose verifier:', (err as Error)?.message || err);
        return null;
      }
    })();
  }
  return cachedFirebaseAuthPromise;
}

export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseUser> {
  const adminAuth = await getLazyFirebaseAdminAuth();
  if (adminAuth) {
    return adminAuth.verifyIdToken(idToken);
  }

  const projectId = firebaseConfig.projectId;
  const { payload } = await jwtVerify(idToken, getFirebaseJwks(), {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId
  });

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Firebase token subject (sub) missing');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    email_verified: Boolean(payload.email_verified),
    auth_time: typeof payload.auth_time === 'number' ? payload.auth_time : undefined
  };
}
