// Camada de acesso ao Firestore.
//
// Modelo de dados: uma única coleção `nodes`. Cada documento é um nó do
// fluxograma (uma categoria ou um laudo) e aponta para o pai via `parentId`.
// A raiz "LAUDOS" é virtual (não existe no banco): os nós de topo usam
// parentId === ROOT_ID.
//
//   {
//     parentId: string,        // ROOT_ID para o topo, ou o id do nó pai
//     type: 'category' | 'laudo',
//     label: string,           // nome exibido
//     content: string,         // texto do laudo (vazio para categorias)
//     createdAt: Timestamp
//   }
import { db } from './firebase'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore'

export const ROOT_ID = 'root'

const nodesCol = collection(db, 'nodes')

// Categorias iniciais criadas na primeira vez que o arquivo é aberto.
const INITIAL_CATEGORIES = [
  'Cabeça e pescoço',
  'Neuro',
  'Gastro',
  'Hemato',
  'Dermato',
]

// Observa em tempo real os filhos diretos de um nó pai.
export function subscribeChildren(parentId, cb) {
  const q = query(nodesCol, where('parentId', '==', parentId))
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    // categorias antes de laudos; dentro do mesmo tipo, ordem alfabética.
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'category' ? -1 : 1
      return (a.label || '').localeCompare(b.label || '', 'pt-BR')
    })
    cb(items)
  })
}

export function addNode({ parentId, type, label, content = '' }) {
  return addDoc(nodesCol, {
    parentId,
    type,
    label: label.trim(),
    content,
    createdAt: serverTimestamp(),
  })
}

export function updateNode(id, data) {
  return updateDoc(doc(db, 'nodes', id), data)
}

// Remove um nó e, recursivamente, todos os seus descendentes.
export async function deleteNodeCascade(id) {
  const childrenSnap = await getDocs(query(nodesCol, where('parentId', '==', id)))
  await Promise.all(childrenSnap.docs.map((d) => deleteNodeCascade(d.id)))
  await deleteDoc(doc(db, 'nodes', id))
}

// Cria as categorias iniciais apenas se o arquivo estiver vazio.
export async function seedIfEmpty() {
  const snap = await getDocs(query(nodesCol, where('parentId', '==', ROOT_ID)))
  if (!snap.empty) return
  const batch = writeBatch(db)
  INITIAL_CATEGORIES.forEach((label) => {
    const ref = doc(nodesCol)
    batch.set(ref, {
      parentId: ROOT_ID,
      type: 'category',
      label,
      content: '',
      createdAt: serverTimestamp(),
    })
  })
  await batch.commit()
}
