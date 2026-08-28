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
  increment,
  setDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
} from 'firebase/firestore'

// Dois arquivos separados (roots virtuais): laudos e notas.
export const ROOT_ID = 'root'
export const ROOT_NOTAS_ID = 'root_notas'

const nodesCol = collection(db, 'nodes')

// Categorias iniciais criadas na primeira vez que o arquivo é aberto.
const INITIAL_CATEGORIES = [
  'Cabeça e pescoço',
  'Neuro',
  'Gastro',
  'Hemato',
  'Dermato',
]

// Observa em tempo real TODOS os nós (usado pelo menu em árvore, que monta
// a hierarquia completa no cliente). O acervo é pequeno, então uma única
// assinatura da coleção é suficiente.
export function subscribeAll(cb, onError) {
  return onSnapshot(
    nodesCol,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => onError?.(err),
  )
}

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

export function addNode({
  parentId,
  type,
  label,
  content = '',
  icon = '',
  tags = [],
  createdBy = '',
}) {
  return addDoc(nodesCol, {
    parentId,
    type,
    label: label.trim(),
    content,
    icon,
    tags,
    copyCount: 0,
    createdBy,
    createdAt: serverTimestamp(),
  })
}

// Incrementa (atômico) o contador de vezes que a máscara foi copiada.
export function incrementCopy(id) {
  return updateDoc(doc(db, 'nodes', id), { copyCount: increment(1) })
}

// ----- Favoritas por usuário (coleção `favorites`, 1 doc por usuário) -----
//
//   {
//     nodeIds: string[],                   // tudo que o usuário favoritou
//     folders: [{ id, name, icon }],       // pastas criadas por ele
//     folderOf: { [nodeId]: folderId }     // em que pasta cada favorita está
//   }
//
// Uma favorita sem entrada em `folderOf` fica no grupo "Sem pasta".
const favDoc = (userId) => doc(db, 'favorites', userId)

export const emptyFavData = () => ({ nodeIds: [], folders: [], folderOf: {} })

export function subscribeFavorites(userId, cb, onError) {
  return onSnapshot(
    favDoc(userId),
    (snap) => {
      const d = snap.exists() ? snap.data() : {}
      cb({
        nodeIds: Array.isArray(d.nodeIds) ? d.nodeIds : [],
        folders: Array.isArray(d.folders) ? d.folders : [],
        folderOf: d.folderOf && typeof d.folderOf === 'object' ? d.folderOf : {},
      })
    },
    (err) => onError?.(err),
  )
}

export function setFavorite(userId, nodeId, isFav) {
  const data = { nodeIds: isFav ? arrayUnion(nodeId) : arrayRemove(nodeId) }
  // Ao desfavoritar, some também o vínculo com a pasta.
  if (!isFav) data.folderOf = { [nodeId]: deleteField() }
  return setDoc(favDoc(userId), data, { merge: true })
}

// Salva a lista de pastas. `unassignIds` desvincula favoritas de sua pasta —
// usado ao excluir uma pasta, cujos itens voltam para "Sem pasta".
export function saveFavFolders(userId, folders, unassignIds = []) {
  const data = { folders }
  if (unassignIds.length) {
    data.folderOf = Object.fromEntries(
      unassignIds.map((id) => [id, deleteField()]),
    )
  }
  return setDoc(favDoc(userId), data, { merge: true })
}

// Move uma favorita para uma pasta (folderId vazio = "Sem pasta").
export function setFavFolderOf(userId, nodeId, folderId) {
  return setDoc(
    favDoc(userId),
    { folderOf: { [nodeId]: folderId || deleteField() } },
    { merge: true },
  )
}

export function updateNode(id, data) {
  return updateDoc(doc(db, 'nodes', id), data)
}

// Move um nó para dentro de outro pai (arrastar-e-soltar no modo edição).
export function moveNode(id, newParentId) {
  return updateDoc(doc(db, 'nodes', id), { parentId: newParentId })
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
