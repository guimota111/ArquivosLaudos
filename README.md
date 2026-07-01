# Arquivo de Laudos

Site em formato de **menu com submenus** (árvore) para organizar laudos.

A página inicial mostra apenas um botão central **LAUDOS**. Ao clicar, abre-se
um menu em árvore onde as categorias podem ser expandidas/recolhidas. O usuário
pode:

- Criar novas categorias e **subcategorias dentro de categorias** (sem limite de profundidade);
- Expandir/recolher qualquer submenu;
- **Selecionar** uma categoria (clique) para que novos itens sejam criados dentro dela;
- **Armazenar laudos** em qualquer nível, com título e conteúdo;
- Renomear e excluir categorias/laudos (excluir uma categoria remove tudo dentro dela).

Exemplo de hierarquia:
`LAUDOS → Gastro → Estômago → Gastrite → Erosiva` → laudo "Gastrite erosiva".

Categorias iniciais criadas automaticamente na primeira abertura:
**Cabeça e pescoço, Neuro, Gastro, Hemato, Dermato**.

## Stack

- **React + Vite** (frontend)
- **Firebase Firestore** (backend simples, dados em tempo real)
- **Firebase Authentication** (login por e-mail/senha)

O acervo é **único e compartilhado** entre os usuários autenticados. O acesso
exige **login por e-mail e senha**.

## Autenticação (obrigatória)

O app agora abre numa **tela de login**. Para funcionar:

1. No [console do Firebase](https://console.firebase.google.com/) →
   **Authentication** → **Sign-in method**, habilite o provedor
   **E-mail/senha**.
2. Em **Authentication → Users**, clique em **Add user** e cadastre o
   e-mail/senha de cada pessoa que terá acesso (não há cadastro público — o
   acesso é controlado por você).
3. Publique as regras do Firestore (já exigem login):
   `firebase deploy --only firestore:rules`.

> Não há tela de cadastro no app, de propósito: o acesso é fechado, pensado
> para ser cobrado no futuro. Você cria/remove usuários pelo console.

## Modelo de dados (Firestore)

Coleção única `nodes`. Cada documento é uma **categoria**, um **laudo** ou uma
**nota**:

```
{
  parentId: "root" | "root_notas" | "<id do pai>",
  type: "category" | "laudo" | "nota",
  label: "Gastrite",
  content: "texto da máscara (laudo/nota)",
  icon: "🧠",          // ícone da pasta (só categorias)
  tags: ["urgente"],   // etiquetas (laudos/notas)
  createdAt: <timestamp>
}
```

`root` = topo do arquivo **LAUDOS**; `root_notas` = topo do arquivo **NOTAS**.

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
