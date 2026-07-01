// Componentes de nó customizados usados pelo React Flow.
import { Handle, Position } from 'reactflow'

// Handles ficam no centro do nó e invisíveis: as arestas saem do centro do
// pai para o centro de cada filho, dando o visual de mapa mental.
const hiddenHandle = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 'none',
  background: 'transparent',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
}

function Handles({ source, target }) {
  return (
    <>
      {target && <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />}
      {source && <Handle type="source" position={Position.Bottom} style={hiddenHandle} isConnectable={false} />}
    </>
  )
}

// Nó central: o pai atual (a raiz "LAUDOS" ou a categoria em que se está).
export function CenterNode({ data }) {
  return (
    <div className={`node center ${data.isRoot ? 'is-root' : ''}`}>
      <Handles source />
      {!data.isRoot && (
        <button
          className="node-up"
          title="Voltar um nível"
          onClick={(e) => {
            e.stopPropagation()
            data.onUp?.()
          }}
        >
          ↑
        </button>
      )}
      <span className="center-label">{data.label}</span>
    </div>
  )
}

export function CategoryNode({ data }) {
  return (
    <div className="node category" onClick={() => data.onOpen?.()} title="Abrir categoria">
      <Handles target />
      <span className="node-icon">📁</span>
      <span className="node-label">{data.label}</span>
      {data.count > 0 && <span className="node-count">{data.count}</span>}
      <div className="node-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Renomear" onClick={() => data.onRename?.()}>✎</button>
        <button title="Excluir" onClick={() => data.onDelete?.()}>🗑</button>
      </div>
    </div>
  )
}

export function LaudoNode({ data }) {
  return (
    <div className="node laudo" onClick={() => data.onOpen?.()} title="Ver laudo">
      <Handles target />
      <span className="node-icon">📄</span>
      <span className="node-label">{data.label}</span>
      <div className="node-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Renomear" onClick={() => data.onRename?.()}>✎</button>
        <button title="Excluir" onClick={() => data.onDelete?.()}>🗑</button>
      </div>
    </div>
  )
}

export const nodeTypes = {
  center: CenterNode,
  category: CategoryNode,
  laudo: LaudoNode,
}
