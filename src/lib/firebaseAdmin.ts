import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function firebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  )
}

function normalizePrivateKey(privateKey: string | undefined) {
  return privateKey
    ?.replace(/\\n/g, '\n')
    .trim()
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
}

export function getFirebaseAdminDb() {
  if (!firebaseConfigured()) return null

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      }),
    })
  }

  return getFirestore()
}
