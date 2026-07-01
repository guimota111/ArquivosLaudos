// Configuração do Firebase (backend simples via Firestore).
// A apiKey do Firebase Web é pública por design — o que protege os dados
// são as Regras de Segurança do Firestore (ver firestore.rules).
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCodngtcz1DXxzMSsMwLfjZagm0DRX-6KM',
  authDomain: 'arquivolaudos.firebaseapp.com',
  projectId: 'arquivolaudos',
  storageBucket: 'arquivolaudos.firebasestorage.app',
  messagingSenderId: '847169527171',
  appId: '1:847169527171:web:7f62e7d2b5e703f369eab6',
  measurementId: 'G-Z24LF0YFKR',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
