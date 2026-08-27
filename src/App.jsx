import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'

import { auth } from './firebase'
import Modal from './Modal.jsx'
import {
  ROOT_ID,
  ROOT_NOTAS_ID,
  subscribeAll,
  addNode,
  updateNode,
  moveNode,
  incrementCopy,
  subscribeFavorites,
  setFavorite,
  deleteNodeCascade,
  seedIfEmpty,
} from './db'

// Arquivos de topo (roots virtuais), separados entre si.
const ROOTS = [
  { id: ROOT_ID, label: 'LAUDOS', icon: '📁' },
  { id: ROOT_NOTAS_ID, label: 'NOTAS', icon: '📝' },
]
const ROOT_IDS = new Set(ROOTS.map((r) => r.id))
const rootLabelOf = (id) => ROOTS.find((r) => r.id === id)?.label || 'LAUDOS'

// Ícones disponíveis para as pastas (categorias).
const FOLDER_ICONS = [
  // Pastas e organização
  '📁', '📂', '🗂️', '📋', '🗃️', '📑', '📌', '📎', '⭐', '🏷️',
  // Anatomia / especialidades
  '🧠', '🫀', '🫁', '🩺', '🦴', '🩻', '🧬', '🩸', '👁️', '👂',
  '👃', '👄', '🦷', '🦵', '🦶', '🫄', '🤰', '🧒', '👶', '🦻',
  // Medicina geral
  '💊', '💉', '🔬', '🧪', '🩹', '🩼', '🚑', '🏥', '⚕️', '🧫',
  // Sistemas / regiões
  '🫃', '🦿', '🫆', '🧑‍⚕️', '👩‍⚕️', '👨‍⚕️',
  // Marcadores coloridos
  '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
  // Diversos úteis
  '📝', '📄', '🔖', '📊', '📈', '🗒️', '💡', '❤️', '⚠️', '✅',
]

// Ordena os itens de uma pasta: categorias primeiro (alfabéticas); depois as
// máscaras (laudos/notas) da MAIS copiada para a menos copiada, com desempate
// alfabético — premiando as máscaras mais usadas.
const labelCmp = (a, b) =>
  (a.label || '').localeCompare(b.label || '', 'pt-BR')

const compareSiblings = (a, b) => {
  const aCat = a.type === 'category'
  const bCat = b.type === 'category'
  if (aCat !== bCat) return aCat ? -1 : 1
  if (aCat) return labelCmp(a, b)
  const diff = (b.copyCount || 0) - (a.copyCount || 0)
  return diff || labelCmp(a, b)
}

// Ícone e rótulo de cada tipo de folha (laudo / nota).
const LEAF_META = {
  laudo: { icon: '📄', singular: 'laudo', artigo: 'o laudo' },
  nota: { icon: '📝', singular: 'nota', artigo: 'a nota' },
}

// Copia texto para a área de transferência, com fallback para navegadores
// sem a API Clipboard (ex.: contextos sem HTTPS).
function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      resolve()
    } catch (e) {
      reject(e)
    }
  })
}

// Normaliza texto para busca: sem acentos e em minúsculas.
const norm = (s) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Trecho do conteúdo ao redor do termo encontrado, com reticências.
function snippet(content, q) {
  const c = content || ''
  const i = norm(c).indexOf(q)
  if (i < 0) return ''
  const start = Math.max(0, i - 30)
  const end = Math.min(c.length, i + q.length + 30)
  return (start > 0 ? '…' : '') + c.slice(start, end) + (end < c.length ? '…' : '')
}

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = carregando
  // Nome do usuário mantido em estado próprio: logo após o cadastro o
  // `updateProfile` ainda não refletiu no objeto entregue pelo listener.
  const [name, setName] = useState('')

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u || null)
      // Ao sair, limpa; enquanto logado, preserva o nome já conhecido.
      setName((prev) => u?.displayName || (u ? prev : ''))
    })
  }, [])

  if (user === undefined) {
    return (
      <div className="landing">
        <p className="landing-hint">Carregando…</p>
      </div>
    )
  }
  if (!user) {
    return <AuthScreen onNameSet={setName} />
  }
  return <MenuApp user={user} displayName={name} onNameChange={setName} />
}

// Traduz os códigos de erro do Firebase Auth para mensagens em português.
function authErrorMessage(code, isSignup) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos.'
    case 'auth/invalid-email':
      return 'E-mail inválido.'
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail. Use "Entrar".'
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'auth/operation-not-allowed':
      return 'Cadastro por e-mail/senha não está habilitado no Firebase.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente novamente mais tarde.'
    default:
      return isSignup
        ? 'Não foi possível criar a conta. Tente novamente.'
        : 'Não foi possível entrar. Tente novamente.'
  }
}

// Tela inicial: entrar com e-mail/senha ou criar uma conta (nome + e-mail +
// senha). O nome informado no cadastro é o que identifica as contribuições.
function AuthScreen({ onNameSet }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isSignup = mode === 'signup'
  const canSubmit =
    !!email.trim() && !!password && (!isSignup || (!!name.trim() && !!confirm))

  const switchMode = (next) => {
    if (next === mode) return
    setMode(next)
    setError('')
    setPassword('')
    setConfirm('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    if (isSignup && password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (isSignup && password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (isSignup) {
        const nome = name.trim()
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        )
        await updateProfile(cred.user, { displayName: nome })
        onNameSet(nome)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
      // onAuthStateChanged assume daqui e troca de tela.
    } catch (err) {
      console.error(err)
      setError(authErrorMessage(err?.code, isSignup))
      setBusy(false)
    }
  }

  return (
    <div className="landing">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">🗂️ Arquivo de Laudos</h1>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isSignup ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`auth-tab ${isSignup ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Criar conta
          </button>
        </div>
        <p className="login-sub">
          {isSignup
            ? 'Seu nome aparece nas máscaras que você adicionar'
            : 'Entre com seu e-mail e senha'}
        </p>
        {isSignup && (
          <input
            className="field"
            type="text"
            autoComplete="name"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
        <input
          className="field"
          type="email"
          autoComplete="username"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus={!isSignup}
        />
        <input
          className="field"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          placeholder={isSignup ? 'Senha (mínimo 6 caracteres)' : 'Senha'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isSignup && (
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        {error && <p className="login-error">{error}</p>}
        <button
          className="btn primary login-btn"
          type="submit"
          disabled={busy || !canSubmit}
        >
          {busy
            ? isSignup
              ? 'Criando…'
              : 'Entrando…'
            : isSignup
              ? 'Criar conta'
              : 'Entrar'}
        </button>
        <p className="auth-switch">
          {isSignup ? 'Já tem uma conta?' : 'Ainda não tem conta?'}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(isSignup ? 'login' : 'signup')}
          >
            {isSignup ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </form>
    </div>
  )
}

// Modal para definir/alterar o nome exibido nas contribuições.
function ProfileModal({ currentName, email, onSaved, onClose }) {
  const [name, setName] = useState(currentName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const nome = name.trim()
    if (!nome || busy) return
    setBusy(true)
    setError('')
    try {
      await updateProfile(auth.currentUser, { displayName: nome })
      onSaved(nome)
      onClose()
    } catch (e) {
      console.error(e)
      setError('Não foi possível salvar o nome. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <Modal title="Seu nome" onClose={onClose}>
      <p className="target-note">
        É o nome que aparece nas máscaras que você adiciona (<b>{email}</b>).
      </p>
      <input
        className="field"
        autoFocus
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      {error && <p className="login-error">{error}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn primary"
          disabled={!name.trim() || busy}
          onClick={save}
        >
          Salvar
        </button>
      </div>
    </Modal>
  )
}

function MenuApp({ user, displayName, onNameChange }) {
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  // Nome usado para creditar as contribuições (cai no e-mail se ainda não
  // houver nome definido — contas antigas, criadas pelo console).
  const authorName = displayName || user?.email || ''
  // Categorias abertas (submenus expandidos). Os dois arquivos começam abertos.
  const [expanded, setExpanded] = useState(
    () => new Set([...ROOT_IDS, 'favorites']),
  )
  // Categoria selecionada: onde novos itens serão criados (um root = topo do arquivo).
  const [selectedId, setSelectedId] = useState(ROOT_ID)
  const [modal, setModal] = useState(null) // { kind, node? }
  const [search, setSearch] = useState('')
  // Máscara (laudo/nota) aberta no painel à direita.
  const [viewId, setViewId] = useState(null)
  // Modo edição: habilita arrastar itens para outra categoria.
  const [editMode, setEditMode] = useState(false)
  const [dragId, setDragId] = useState(null) // item sendo arrastado
  const [dropId, setDropId] = useState(null) // categoria destino sob o cursor
  const [favIds, setFavIds] = useState([]) // ids favoritados por este usuário

  // Cria as categorias iniciais na primeira abertura.
  useEffect(() => {
    seedIfEmpty().catch((e) => console.error('Falha ao inicializar:', e))
  }, [])

  // Assina todos os nós em tempo real.
  useEffect(() => {
    const unsub = subscribeAll((items) => {
      setNodes(items)
      setLoading(false)
    })
    return unsub
  }, [])

  // Assina as favoritas deste usuário.
  useEffect(() => {
    if (!user?.uid) return
    return subscribeFavorites(user.uid, setFavIds)
  }, [user?.uid])

  // Índice por id e mapa pai -> filhos (ordenados: categorias antes de laudos).
  const { nodeById, childrenOf } = useMemo(() => {
    const byId = new Map()
    const kids = new Map()
    for (const n of nodes) {
      byId.set(n.id, n)
      if (!kids.has(n.parentId)) kids.set(n.parentId, [])
      kids.get(n.parentId).push(n)
    }
    for (const arr of kids.values()) {
      arr.sort(compareSiblings)
    }
    return { nodeById: byId, childrenOf: kids }
  }, [nodes])

  // Se a categoria selecionada deixar de existir (ex.: foi excluída), volta à raiz.
  useEffect(() => {
    if (!ROOT_IDS.has(selectedId) && !nodeById.has(selectedId)) {
      setSelectedId(ROOT_ID)
    }
  }, [nodeById, selectedId])

  // Se a máscara aberta deixar de existir, fecha o painel.
  useEffect(() => {
    if (viewId && !nodeById.has(viewId)) setViewId(null)
  }, [nodeById, viewId])

  const selectedNode = ROOT_IDS.has(selectedId) ? null : nodeById.get(selectedId)
  const viewNode = viewId ? nodeById.get(viewId) : null

  // Favoritas: conjunto de ids + lista resolvida (ignora ids que já não existem).
  const favSet = useMemo(() => new Set(favIds), [favIds])
  const favNodes = useMemo(
    () => favIds.map((id) => nodeById.get(id)).filter(Boolean).sort(compareSiblings),
    [favIds, nodeById],
  )
  const toggleFav = (id) => {
    if (user?.uid) setFavorite(user.uid, id, !favSet.has(id))
  }
  const addTargetLabel = selectedNode ? selectedNode.label : rootLabelOf(selectedId)

  // Root (arquivo) a que a seleção pertence; define se novos itens são laudos ou notas.
  const rootOf = (id) => {
    let p = id
    while (p && !ROOT_IDS.has(p)) p = nodeById.get(p)?.parentId
    return p || ROOT_ID
  }
  const currentArchive = ROOT_IDS.has(selectedId) ? selectedId : rootOf(selectedId)
  const isNotas = currentArchive === ROOT_NOTAS_ID

  // Caminho de um nó (rótulos dos ancestrais) para exibir nos resultados.
  const pathOf = (node) => {
    const parts = []
    let p = node.parentId
    while (p && !ROOT_IDS.has(p)) {
      const par = nodeById.get(p)
      if (!par) break
      parts.unshift(par.label)
      p = par.parentId
    }
    return [rootLabelOf(ROOT_IDS.has(p) ? p : ROOT_ID), ...parts]
  }

  // Resultados da busca (null = sem busca ativa). Casa título, categoria e
  // texto do laudo, ignorando acentos e maiúsculas.
  const results = useMemo(() => {
    const q = norm(search.trim())
    if (!q) return null
    const out = []
    for (const n of nodes) {
      const inLabel = norm(n.label).includes(q)
      const inContent = n.type !== 'category' && norm(n.content).includes(q)
      const inTags = (n.tags || []).some((t) => norm(t).includes(q))
      if (inLabel || inContent || inTags) {
        out.push({ node: n, matchContent: !inLabel && inContent })
      }
    }
    out.sort((a, b) => compareSiblings(a.node, b.node))
    return { q, items: out }
  }, [search, nodes])

  // Abre a categoria no menu: expande os ancestrais, seleciona e limpa a busca.
  const revealCategory = (node) => {
    setExpanded((s) => {
      const next = new Set(s)
      let p = node.parentId
      while (p && !ROOT_IDS.has(p)) {
        next.add(p)
        p = nodeById.get(p)?.parentId
      }
      if (p) next.add(p) // o root do arquivo
      next.add(node.id)
      return next
    })
    setSelectedId(node.id)
    setSearch('')
  }

  // Pode soltar o item arrastado dentro da categoria de destino?
  const canDrop = (targetCatId) => {
    const d = dragId && nodeById.get(dragId)
    if (!d) return false
    if (targetCatId === d.parentId) return false // já está aqui
    // Uma categoria não pode ir para dentro dela mesma ou de um descendente.
    if (d.type === 'category') {
      let p = targetCatId
      while (p && !ROOT_IDS.has(p)) {
        if (p === dragId) return false
        p = nodeById.get(p)?.parentId
      }
    }
    return true
  }

  // Efetua a movimentação ao soltar sobre uma categoria (ou a raiz).
  const handleDrop = (targetCatId) => {
    if (canDrop(targetCatId)) {
      moveNode(dragId, targetCatId).catch((e) => {
        console.error(e)
        alert('Não foi possível mover o item.')
      })
      expand(targetCatId)
    }
    setDragId(null)
    setDropId(null)
  }

  // Props de arrasto para um item (laudo/nota/categoria).
  const dragProps = (node) =>
    editMode
      ? {
          draggable: true,
          onDragStart: (e) => {
            e.stopPropagation()
            setDragId(node.id)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', node.id)
          },
          onDragEnd: () => {
            setDragId(null)
            setDropId(null)
          },
        }
      : {}

  // Props de "soltar aqui" para uma categoria (ou a raiz).
  const dropProps = (targetCatId) =>
    editMode
      ? {
          onDragOver: (e) => {
            if (canDrop(targetCatId)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dropId !== targetCatId) setDropId(targetCatId)
            }
          },
          onDragLeave: () =>
            setDropId((d) => (d === targetCatId ? null : d)),
          onDrop: (e) => {
            e.preventDefault()
            e.stopPropagation()
            handleDrop(targetCatId)
          },
        }
      : {}

  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const expand = (id) => setExpanded((s) => new Set(s).add(id))

  // Renderiza recursivamente os filhos de um nó como linhas do menu.
  const renderRows = (parentId, depth) => {
    const kids = childrenOf.get(parentId) || []
    return kids.map((node) => {
      const indent = { paddingLeft: 12 + depth * 20 }

      if (node.type === 'category') {
        const isOpen = expanded.has(node.id)
        const count = (childrenOf.get(node.id) || []).length
        return (
          <div key={node.id}>
            <div
              className={`menu-row cat ${
                selectedId === node.id ? 'selected' : ''
              } ${dragId === node.id ? 'dragging' : ''} ${
                dropId === node.id ? 'drop-target' : ''
              }`}
              style={indent}
              {...dragProps(node)}
              {...dropProps(node.id)}
            >
              <button
                className="twist"
                title={isOpen ? 'Recolher' : 'Expandir'}
                onClick={() => toggle(node.id)}
              >
                {count > 0 ? (isOpen ? '▾' : '▸') : '·'}
              </button>
              <button
                className="menu-main"
                onClick={() => setSelectedId(node.id)}
                onDoubleClick={() => toggle(node.id)}
                title="Clique para selecionar · duplo-clique para abrir"
              >
                <span className="menu-icon">{node.icon || '📁'}</span>
                <span className="menu-label">{node.label}</span>
                {count > 0 && <span className="menu-count">{count}</span>}
              </button>
              <div className="menu-actions">
                <button
                  title="Renomear"
                  onClick={() => setModal({ kind: 'rename', node })}
                >
                  ✎
                </button>
                <button
                  title="Excluir"
                  onClick={() => setModal({ kind: 'delete', node })}
                >
                  🗑
                </button>
              </div>
            </div>
            {isOpen && renderRows(node.id, depth + 1)}
          </div>
        )
      }

      // Folha: laudo ou nota.
      const meta = LEAF_META[node.type] || LEAF_META.laudo
      return (
        <div
          key={node.id}
          className={`menu-row ${node.type} ${
            viewId === node.id ? 'viewing' : ''
          } ${dragId === node.id ? 'dragging' : ''}`}
          style={indent}
          {...dragProps(node)}
        >
          <span className="twist ghosted">·</span>
          <button
            className="menu-main"
            onClick={() => setViewId(node.id)}
            title={`Ver ${meta.singular}`}
          >
            <span className="menu-icon">{meta.icon}</span>
            <span className="menu-label">{node.label}</span>
            {node.copyCount > 0 && (
              <span className="copy-badge" title="Vezes copiado">
                📋 {node.copyCount}
              </span>
            )}
          </button>
          <div className="menu-actions">
            <button
              className={`fav-btn ${favSet.has(node.id) ? 'on' : ''}`}
              title={favSet.has(node.id) ? 'Desfavoritar' : 'Favoritar'}
              onClick={() => toggleFav(node.id)}
            >
              {favSet.has(node.id) ? '★' : '☆'}
            </button>
            <button
              title="Renomear"
              onClick={() => setModal({ kind: 'rename', node })}
            >
              ✎
            </button>
            <button
              title="Excluir"
              onClick={() => setModal({ kind: 'delete', node })}
            >
              🗑
            </button>
          </div>
        </div>
      )
    })
  }

  return (
    <div className={`menu-app ${editMode ? 'edit-mode' : ''}`}>
      <header className="menubar">
        <h1 className="app-title">🗂️ Laudos &amp; Notas</h1>
        <div className="search-box">
          <span className="search-icon">🔎</span>
          <input
            className="search-input"
            placeholder="Buscar categoria, título ou texto do laudo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear"
              title="Limpar busca"
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>
        <div className="add-target">
          Adicionar em: <b>{addTargetLabel}</b>
          {selectedNode && (
            <button
              className="clear-select"
              title="Voltar a adicionar no topo do arquivo"
              onClick={() => setSelectedId(currentArchive)}
            >
              ✕
            </button>
          )}
        </div>
        <div className="toolbar">
          <button
            className="btn btn-cat"
            onClick={() => setModal({ kind: 'add-category' })}
          >
            + {selectedNode ? 'Subcategoria' : 'Categoria'}
          </button>
          <button
            className={`btn ${isNotas ? 'btn-nota' : 'btn-laudo'}`}
            onClick={() =>
              setModal({ kind: isNotas ? 'add-nota' : 'add-laudo' })
            }
          >
            + {isNotas ? 'Nota' : 'Laudo'}
          </button>
          <button
            className={`btn ${editMode ? 'primary' : ''}`}
            onClick={() => {
              setEditMode((m) => !m)
              setDragId(null)
              setDropId(null)
            }}
            title="Ativar/desativar mover itens arrastando"
          >
            {editMode ? '✓ Concluir' : '✏️ Mover itens'}
          </button>
        </div>
        <div className="user-box">
          <button
            className="user-name"
            onClick={() => setProfileOpen(true)}
            title={`${user?.email || ''} — clique para alterar seu nome`}
          >
            {displayName || 'Definir meu nome'}
          </button>
          <button
            className="btn ghost logout-btn"
            onClick={() => signOut(auth)}
            title="Sair"
          >
            Sair
          </button>
        </div>
      </header>

      {editMode && (
        <div className="edit-banner">
          ✏️ <b>Modo edição:</b> arraste itens e categorias para dentro de outra
          categoria (ou para <b>LAUDOS</b>/<b>NOTAS</b> para levar ao topo do
          arquivo). Clique em <b>Concluir</b> ao terminar.
        </div>
      )}

      <div className="menu-body">
        <div className="menu-scroll">
          {loading ? (
            <p className="menu-status">Carregando…</p>
          ) : results ? (
            <SearchResults
              results={results}
              pathOf={pathOf}
              viewId={viewId}
              onOpenCategory={revealCategory}
              onOpenLaudo={(node) => setViewId(node.id)}
              onRename={(node) => setModal({ kind: 'rename', node })}
              onDelete={(node) => setModal({ kind: 'delete', node })}
            />
          ) : (
            <>
              {/* Seção de favoritas do usuário. */}
              <div className="root-block fav-block">
                <div
                  className="menu-row cat root fav-header"
                  style={{ paddingLeft: 12 }}
                >
                  <button
                    className="twist"
                    title={expanded.has('favorites') ? 'Recolher' : 'Expandir'}
                    onClick={() => toggle('favorites')}
                  >
                    {favNodes.length > 0
                      ? expanded.has('favorites')
                        ? '▾'
                        : '▸'
                      : '·'}
                  </button>
                  <span className="menu-main static">
                    <span className="menu-icon">⭐</span>
                    <span className="menu-label">Favoritas</span>
                    {favNodes.length > 0 && (
                      <span className="menu-count">{favNodes.length}</span>
                    )}
                  </span>
                </div>
                {expanded.has('favorites') &&
                  (favNodes.length === 0 ? (
                    <p className="fav-empty">
                      Marque uma máscara com ☆ para vê-la aqui.
                    </p>
                  ) : (
                    favNodes.map((n) => {
                      const meta = LEAF_META[n.type] || LEAF_META.laudo
                      return (
                        <div
                          key={n.id}
                          className={`menu-row ${n.type} ${
                            viewId === n.id ? 'viewing' : ''
                          }`}
                          style={{ paddingLeft: 32 }}
                        >
                          <span className="twist ghosted">·</span>
                          <button
                            className="menu-main"
                            onClick={() => setViewId(n.id)}
                            title={pathOf(n).join(' › ')}
                          >
                            <span className="menu-icon">{meta.icon}</span>
                            <span className="menu-label">{n.label}</span>
                            {n.copyCount > 0 && (
                              <span className="copy-badge">
                                📋 {n.copyCount}
                              </span>
                            )}
                          </button>
                          <div className="menu-actions">
                            <button
                              className="fav-btn on"
                              title="Desfavoritar"
                              onClick={() => toggleFav(n.id)}
                            >
                              ★
                            </button>
                          </div>
                        </div>
                      )
                    })
                  ))}
              </div>

              {ROOTS.map((root) => {
                const isOpen = expanded.has(root.id)
                const count = (childrenOf.get(root.id) || []).length
                return (
                  <div key={root.id} className="root-block">
                    <div
                      className={`menu-row cat root ${
                        selectedId === root.id ? 'selected' : ''
                      } ${dropId === root.id ? 'drop-target' : ''}`}
                      style={{ paddingLeft: 12 }}
                      {...dropProps(root.id)}
                    >
                      <button
                        className="twist"
                        title={isOpen ? 'Recolher' : 'Expandir'}
                        onClick={() => toggle(root.id)}
                      >
                        {count > 0 ? (isOpen ? '▾' : '▸') : '·'}
                      </button>
                      <button
                        className="menu-main"
                        onClick={() => setSelectedId(root.id)}
                        onDoubleClick={() => toggle(root.id)}
                        title={`Arquivo de ${root.label}`}
                      >
                        <span className="menu-icon">{root.icon}</span>
                        <span className="menu-label">{root.label}</span>
                        {count > 0 && <span className="menu-count">{count}</span>}
                      </button>
                    </div>
                    {isOpen && renderRows(root.id, 1)}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <MaskPanel
          node={viewNode}
          pathOf={pathOf}
          onEdit={(node) => setModal({ kind: 'edit', node })}
          onDelete={(node) => setModal({ kind: 'delete', node })}
          onClose={() => setViewId(null)}
          onTagClick={(t) => setSearch(t)}
          onCopied={(n) => incrementCopy(n.id).catch((e) => console.error(e))}
          isFav={viewNode ? favSet.has(viewNode.id) : false}
          onToggleFav={(n) => toggleFav(n.id)}
        />
      </div>

      {modal && (
        <NodeModal
          modal={modal}
          parentId={selectedId}
          targetLabel={addTargetLabel}
          authorName={authorName}
          onAfterAdd={() => expand(selectedId)}
          onClose={() => setModal(null)}
        />
      )}

      {profileOpen && (
        <ProfileModal
          currentName={displayName}
          email={user?.email || ''}
          onSaved={onNameChange}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  )
}

// Editor de tags (chips + campo de digitação).
function TagInput({ tags, setTags }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const t = draft.trim()
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTags([...tags, t])
    }
    setDraft('')
  }

  return (
    <div className="tag-editor">
      {tags.length > 0 && (
        <div className="tag-chips">
          {tags.map((t) => (
            <span key={t} className="tag-chip">
              #{t}
              <button
                type="button"
                title="Remover"
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="field tag-input"
        placeholder="Adicionar tag e apertar Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
      />
    </div>
  )
}

// Painel à direita: mostra a máscara (laudo/nota) selecionada, com botão de
// copiar o conteúdo, editar e excluir.
function MaskPanel({
  node,
  pathOf,
  onEdit,
  onDelete,
  onClose,
  onTagClick,
  onCopied,
  isFav,
  onToggleFav,
}) {
  const [copied, setCopied] = useState(false)

  // Zera o aviso de "copiado" ao trocar de máscara.
  useEffect(() => {
    setCopied(false)
  }, [node?.id])

  if (!node) {
    return (
      <div className="mask-panel empty">
        <p>
          Selecione um <b>laudo</b> ou uma <b>nota</b> à esquerda para
          visualizar a máscara aqui.
        </p>
      </div>
    )
  }

  const meta = LEAF_META[node.type] || LEAF_META.laudo
  const trail = pathOf(node)

  const copy = async () => {
    try {
      await copyText(node.content || '')
      onCopied?.(node) // registra +1 no contador de cópias
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      console.error(e)
      alert('Não foi possível copiar. Selecione e copie manualmente.')
    }
  }

  const copies = node.copyCount || 0

  return (
    <div className="mask-panel">
      <div className="mask-head">
        <div className="mask-titles">
          <span className="mask-path">{trail.join(' › ')}</span>
          <h2 className="mask-title">
            <span className="menu-icon">{meta.icon}</span>
            {node.label}
          </h2>
          {node.tags?.length > 0 && (
            <div className="tag-chips view">
              {node.tags.map((t) => (
                <button
                  key={t}
                  className="tag-chip clickable"
                  onClick={() => onTagClick?.(t)}
                  title="Buscar por esta tag"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="btn primary copy-btn"
          onClick={copy}
          disabled={!node.content}
          title="Copiar o conteúdo da máscara"
        >
          {copied ? '✓ Copiado!' : '📋 Copiar máscara'}
        </button>
      </div>

      <p className="copy-stat">
        📋 Copiado <b>{copies}</b> {copies === 1 ? 'vez' : 'vezes'}
        {node.createdBy && (
          <span className="mask-author"> · adicionado por {node.createdBy}</span>
        )}
      </p>

      <pre className="mask-content">
        {node.content ||
          (node.type === 'nota'
            ? 'Esta nota ainda não tem conteúdo.'
            : 'Este laudo ainda não tem conteúdo.')}
      </pre>

      <div className="mask-actions">
        <button
          className={`btn fav-toggle ${isFav ? 'on' : ''}`}
          onClick={() => onToggleFav(node)}
        >
          {isFav ? '★ Favorito' : '☆ Favoritar'}
        </button>
        <button className="btn" onClick={() => onEdit(node)}>
          ✎ Editar
        </button>
        <button className="btn danger" onClick={() => onDelete(node)}>
          🗑 Excluir
        </button>
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}

// Lista plana de resultados da busca, cada um com seu caminho.
function SearchResults({
  results,
  pathOf,
  viewId,
  onOpenCategory,
  onOpenLaudo,
  onRename,
  onDelete,
}) {
  const { q, items } = results

  if (items.length === 0) {
    return <p className="menu-status">Nenhum resultado para essa busca.</p>
  }

  return (
    <div className="results">
      <p className="results-count">
        {items.length} resultado{items.length > 1 ? 's' : ''}
      </p>
      {items.map(({ node, matchContent }) => {
        const isCat = node.type === 'category'
        const meta = LEAF_META[node.type] || LEAF_META.laudo
        const trail = pathOf(node)
        return (
          <div
            key={node.id}
            className={`menu-row result ${node.type} ${
              viewId === node.id ? 'viewing' : ''
            }`}
          >
            <button
              className="menu-main"
              onClick={() =>
                isCat ? onOpenCategory(node) : onOpenLaudo(node)
              }
              title={isCat ? 'Abrir no menu' : `Ver ${meta.singular}`}
            >
              <span className="menu-icon">
                {isCat ? node.icon || '📁' : meta.icon}
              </span>
              <span className="result-body">
                <span className="menu-label">{node.label}</span>
                <span className="result-path">{trail.join(' › ')}</span>
                {node.tags?.length > 0 && (
                  <span className="tag-chips small">
                    {node.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        #{t}
                      </span>
                    ))}
                  </span>
                )}
                {matchContent && (
                  <span className="result-snippet">{snippet(node.content, q)}</span>
                )}
              </span>
            </button>
            <div className="menu-actions">
              <button title="Renomear" onClick={() => onRename(node)}>
                ✎
              </button>
              <button title="Excluir" onClick={() => onDelete(node)}>
                🗑
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Modais de criação / edição / visualização / exclusão.
function NodeModal({
  modal,
  parentId,
  targetLabel,
  authorName,
  onAfterAdd,
  onClose,
}) {
  const { kind, node } = modal
  const [label, setLabel] = useState(node?.label || '')
  const [content, setContent] = useState(node?.content || '')
  const [icon, setIcon] = useState(node?.icon || '📁')
  const [tags, setTags] = useState(node?.tags || [])
  const [editing, setEditing] = useState(
    kind === 'add-laudo' || kind === 'add-nota' || kind === 'edit',
  )
  const [busy, setBusy] = useState(false)

  // `post` roda após salvar com sucesso (ex.: expandir a categoria de destino).
  const save = async (fn, post) => {
    setBusy(true)
    try {
      await fn()
      post?.()
      onClose()
    } catch (e) {
      console.error(e)
      alert('Ocorreu um erro. Tente novamente.')
      setBusy(false)
    }
  }

  if (kind === 'add-category' || kind === 'rename') {
    const isRename = kind === 'rename'
    // Ícone só se aplica a categorias (não a laudos/notas).
    const isCategory = isRename ? node?.type === 'category' : true
    return (
      <Modal title={isRename ? 'Renomear' : 'Nova categoria'} onClose={onClose}>
        {!isRename && (
          <p className="target-note">
            Será criada dentro de <b>{targetLabel}</b>
          </p>
        )}
        <input
          className="field"
          autoFocus
          placeholder="Nome"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && label.trim() && submitName()}
        />
        {isCategory && (
          <>
            <p className="picker-label">Ícone da pasta</p>
            <div className="icon-picker">
              {FOLDER_ICONS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  className={`icon-option ${icon === emo ? 'selected' : ''}`}
                  onClick={() => setIcon(emo)}
                >
                  {emo}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!label.trim() || busy}
            onClick={submitName}
          >
            {isRename ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </Modal>
    )

    function submitName() {
      if (!label.trim()) return
      save(
        () =>
          isRename
            ? updateNode(
                node.id,
                isCategory ? { label: label.trim(), icon } : { label: label.trim() },
              )
            : addNode({
                parentId,
                type: 'category',
                label,
                icon,
                createdBy: authorName,
              }),
        isRename ? undefined : onAfterAdd,
      )
    }
  }

  if (
    kind === 'add-laudo' ||
    kind === 'add-nota' ||
    kind === 'view' ||
    kind === 'edit'
  ) {
    const isNew = kind === 'add-laudo' || kind === 'add-nota'
    const type =
      kind === 'add-nota' ? 'nota' : kind === 'add-laudo' ? 'laudo' : node.type
    const meta = LEAF_META[type] || LEAF_META.laudo
    const capSingular = meta.singular.charAt(0).toUpperCase() + meta.singular.slice(1)
    const newTitle = type === 'nota' ? 'Nova nota' : 'Novo laudo'
    const createdVerb = type === 'nota' ? 'criada' : 'criado'
    return (
      <Modal
        title={isNew ? newTitle : editing ? `Editar ${meta.singular}` : node.label}
        onClose={onClose}
      >
        {isNew && (
          <p className="target-note">
            Será {createdVerb} dentro de <b>{targetLabel}</b>
          </p>
        )}
        {(isNew || editing) && (
          <input
            className="field"
            autoFocus={isNew}
            placeholder={`Título d${meta.artigo}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        {editing ? (
          <textarea
            className="field textarea"
            placeholder={`Digite o conteúdo d${meta.artigo}...`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <pre className="laudo-content">
            {content || `${capSingular} ainda sem conteúdo.`}
          </pre>
        )}
        {editing && (
          <>
            <p className="picker-label">Tags</p>
            <TagInput tags={tags} setTags={setTags} />
          </>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fechar
          </button>
          {editing ? (
            <button
              className="btn primary"
              disabled={!label.trim() || busy}
              onClick={() =>
                save(
                  () =>
                    isNew
                      ? addNode({
                          parentId,
                          type,
                          label,
                          content,
                          tags,
                          createdBy: authorName,
                        })
                      : updateNode(node.id, {
                          label: label.trim(),
                          content,
                          tags,
                        }),
                  isNew ? onAfterAdd : undefined,
                )
              }
            >
              Salvar
            </button>
          ) : (
            <button className="btn primary" onClick={() => setEditing(true)}>
              Editar
            </button>
          )}
        </div>
      </Modal>
    )
  }

  if (kind === 'delete') {
    const isCat = node.type === 'category'
    return (
      <Modal title="Confirmar exclusão" onClose={onClose}>
        <p className="confirm-text">
          Excluir <b>{node.label}</b>?
          {isCat && (
            <>
              {' '}
              Todas as subcategorias, laudos e notas dentro dela também serão
              removidos.
            </>
          )}
        </p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={() => save(() => deleteNodeCascade(node.id))}
          >
            Excluir
          </button>
        </div>
      </Modal>
    )
  }

  return null
}
