import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { nodeTypes } from './nodes.jsx'
import Modal from './Modal.jsx'
import {
  ROOT_ID,
  subscribeChildren,
  addNode,
  updateNode,
  deleteNodeCascade,
  seedIfEmpty,
} from './db'

const ROOT = { id: ROOT_ID, label: 'LAUDOS' }

export default function App() {
  const [started, setStarted] = useState(false)

  if (!started) {
    return <Landing onStart={() => setStarted(true)} />
  }
  return (
    <ReactFlowProvider>
      <MindMap />
    </ReactFlowProvider>
  )
}

// Tela inicial: página vazia com um único botão LAUDOS ao centro.
function Landing({ onStart }) {
  return (
    <div className="landing">
      <button className="laudos-btn" onClick={onStart}>
        LAUDOS
      </button>
      <p className="landing-hint">Clique para abrir seu arquivo de laudos</p>
    </div>
  )
}

function MindMap() {
  // path[0] é sempre a raiz. O último item é o pai atual (nó central).
  const [path, setPath] = useState([ROOT])
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { kind, node? }
  const rfRef = useRef(null)

  const current = path[path.length - 1]

  // Cria as categorias iniciais na primeira abertura.
  useEffect(() => {
    seedIfEmpty().catch((e) => console.error('Falha ao inicializar:', e))
  }, [])

  // Assina os filhos do pai atual em tempo real.
  useEffect(() => {
    setLoading(true)
    const unsub = subscribeChildren(current.id, (items) => {
      setChildren(items)
      setLoading(false)
    })
    return unsub
  }, [current.id])

  const enterCategory = useCallback((node) => {
    setPath((p) => [...p, { id: node.id, label: node.label }])
  }, [])

  const goUp = useCallback(() => {
    setPath((p) => (p.length > 1 ? p.slice(0, -1) : p))
  }, [])

  const goTo = useCallback((index) => {
    setPath((p) => p.slice(0, index + 1))
  }, [])

  // Monta nós e arestas para o React Flow (layout radial ao redor do centro).
  const { rfNodes, rfEdges } = useMemo(() => {
    const centerNode = {
      id: current.id,
      type: 'center',
      position: { x: 0, y: 0 },
      data: {
        label: current.label,
        isRoot: current.id === ROOT_ID,
        onUp: goUp,
      },
      draggable: false,
    }

    const n = children.length
    const radius = Math.max(280, 90 + n * 26)
    const nodes = [centerNode]
    const edges = []

    children.forEach((child, i) => {
      const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius * 0.85
      nodes.push({
        id: child.id,
        type: child.type === 'laudo' ? 'laudo' : 'category',
        position: { x, y },
        draggable: false,
        data: {
          label: child.label,
          onOpen: () =>
            child.type === 'laudo'
              ? setModal({ kind: 'view', node: child })
              : enterCategory(child),
          onRename: () => setModal({ kind: 'rename', node: child }),
          onDelete: () => setModal({ kind: 'delete', node: child }),
        },
      })
      edges.push({
        id: `e-${child.id}`,
        source: current.id,
        target: child.id,
        type: 'straight',
        style: {
          stroke: child.type === 'laudo' ? '#34d399' : '#64748b',
          strokeWidth: 2,
        },
      })
    })

    return { rfNodes: nodes, rfEdges: edges }
  }, [children, current, enterCategory, goUp])

  // Reenquadra a visão sempre que os nós mudam.
  useEffect(() => {
    const t = setTimeout(() => {
      rfRef.current?.fitView({ padding: 0.25, duration: 400 })
    }, 60)
    return () => clearTimeout(t)
  }, [rfNodes])

  return (
    <div className="map-wrap">
      <header className="topbar">
        <nav className="breadcrumb">
          {path.map((p, i) => (
            <span key={p.id}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <button
                className={`crumb ${i === path.length - 1 ? 'current' : ''}`}
                onClick={() => goTo(i)}
              >
                {p.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="toolbar">
          <button
            className="btn btn-cat"
            onClick={() => setModal({ kind: 'add-category' })}
          >
            + Categoria
          </button>
          <button
            className="btn btn-laudo"
            onClick={() => setModal({ kind: 'add-laudo' })}
          >
            + Laudo
          </button>
        </div>
      </header>

      <div className="canvas">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onInit={(inst) => (rfRef.current = inst)}
          fitView
          minZoom={0.2}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={28} />
          <Controls showInteractive={false} />
        </ReactFlow>

        {!loading && children.length === 0 && (
          <div className="empty-hint">
            Nada aqui ainda. Use <b>+ Categoria</b> para ramificar ou{' '}
            <b>+ Laudo</b> para armazenar um laudo.
          </div>
        )}
      </div>

      {modal && (
        <NodeModal
          modal={modal}
          parentId={current.id}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// Modais de criação / edição / visualização / exclusão.
function NodeModal({ modal, parentId, onClose }) {
  const { kind, node } = modal
  const [label, setLabel] = useState(node?.label || '')
  const [content, setContent] = useState(node?.content || '')
  const [editing, setEditing] = useState(kind === 'add-laudo')
  const [busy, setBusy] = useState(false)

  const save = async (fn) => {
    setBusy(true)
    try {
      await fn()
      onClose()
    } catch (e) {
      console.error(e)
      alert('Ocorreu um erro. Tente novamente.')
      setBusy(false)
    }
  }

  if (kind === 'add-category' || kind === 'rename') {
    const isRename = kind === 'rename'
    return (
      <Modal
        title={isRename ? 'Renomear' : 'Nova categoria'}
        onClose={onClose}
      >
        <input
          className="field"
          autoFocus
          placeholder="Nome"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && label.trim() && submitName()}
        />
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
      save(() =>
        isRename
          ? updateNode(node.id, { label: label.trim() })
          : addNode({ parentId, type: 'category', label }),
      )
    }
  }

  if (kind === 'add-laudo' || kind === 'view') {
    const isNew = kind === 'add-laudo'
    return (
      <Modal
        title={isNew ? 'Novo laudo' : editing ? 'Editar laudo' : node.label}
        onClose={onClose}
      >
        {(isNew || editing) && (
          <input
            className="field"
            autoFocus={isNew}
            placeholder="Título do laudo"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        {editing ? (
          <textarea
            className="field textarea"
            placeholder="Digite o conteúdo do laudo..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <pre className="laudo-content">
            {content || 'Este laudo ainda não tem conteúdo.'}
          </pre>
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
                save(() =>
                  isNew
                    ? addNode({ parentId, type: 'laudo', label, content })
                    : updateNode(node.id, { label: label.trim(), content }),
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
              Todas as subcategorias e laudos dentro dela também serão
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
