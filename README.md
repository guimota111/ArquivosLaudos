# Arquivo de Laudos

Site em formato de **mapa mental / fluxograma** para organizar laudos.

A página inicial mostra apenas um botão central **LAUDOS**. Ao clicar, abre-se
um mapa mental onde cada categoria aparece ligada ao centro. O usuário pode:

- Criar novas categorias e **ramificar categorias dentro de categorias** (sem limite de profundidade);
- Entrar em uma categoria para vê-la como novo centro do mapa;
- **Armazenar laudos** em qualquer nível, com título e conteúdo;
- Renomear e excluir categorias/laudos (excluir uma categoria remove tudo dentro dela).

Exemplo de navegação:
`LAUDOS → Gastro → Estômago → Gastrite → Erosiva` → laudo "Gastrite erosiva".

Categorias iniciais criadas automaticamente na primeira abertura:
**Cabeça e pescoço, Neuro, Gastro, Hemato, Dermato**.

## Stack

- **React + Vite** (frontend)
- **React Flow** (visual de mapa mental)
- **Firebase Firestore** (backend simples, dados em tempo real)

O acervo é **único e compartilhado**: todos os usuários veem e editam o mesmo
mapa. O acesso é **aberto (sem login)** conforme configurado.

## Modelo de dados (Firestore)

Coleção única `nodes`. Cada documento é uma categoria ou um laudo:

```
{
  parentId: "root" | "<id do pai>",   // "root" = nível de topo (filhos do botão LAUDOS)
  type: "category" | "laudo",
  label: "Gastrite",
  content: "texto do laudo (só para type = laudo)",
  createdAt: <timestamp>
}
```

## Rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço exibido (por padrão http://localhost:5173).

## Build de produção

```bash
npm run build      # gera a pasta dist/
npm run preview    # pré-visualiza o build
```

## Deploy (Firebase Hosting)

Pré-requisito: `npm install -g firebase-tools` e `firebase login`.

```bash
npm run build
firebase deploy --only firestore:rules   # publica as regras de segurança
firebase deploy --only hosting           # publica o site
```

> **Segurança:** as regras em `firestore.rules` estão **abertas** (qualquer um
> lê/escreve), conforme a opção "sem login". Se um dia quiser restringir,
> habilite o Firebase Authentication e troque `allow read, write: if true;`
> por `if request.auth != null;`.
