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

O app abre numa **tela de autenticação** com duas abas:

- **Entrar** — e-mail e senha.
- **Criar conta** — nome, e-mail e senha (mínimo de 6 caracteres, com
  confirmação). O **nome** informado é o que credita as contribuições
  ("adicionado por …") nas máscaras criadas pela pessoa.

Para funcionar:

1. No [console do Firebase](https://console.firebase.google.com/) →
   **Authentication** → **Sign-in method**, habilite o provedor
   **E-mail/senha**.
2. Publique as regras do Firestore (já exigem login):
   `firebase deploy --only firestore:rules`.

> **Atenção:** com o cadastro aberto no app, qualquer pessoa com o endereço do
> site pode criar uma conta e passar a ler/escrever no acervo compartilhado.
> Para voltar ao acesso fechado, desabilite o provedor E-mail/senha (ou
> restrinja o cadastro) e crie os usuários em **Authentication → Users**.

O nome pode ser alterado depois: clique no seu nome no canto superior direito
do app. Contas antigas (criadas pelo console, sem nome) aparecem como
**"Definir meu nome"** até que um nome seja informado.

## Favoritas em pastas

Cada usuário tem sua própria lista de **favoritas** (☆ nas máscaras) e pode
organizá-las em **pastas**:

- **＋** ao lado de *Favoritas* cria uma pasta (nome + ícone);
- **🗂** numa favorita a move para outra pasta — ou cria uma pasta nova já com
  ela dentro;
- **✎** e **🗑** renomeiam e excluem a pasta. Excluir a pasta **não** desfaz as
  favoritas: elas voltam para **Sem pasta**;
- Pastas recolhem/expandem clicando no nome.

As pastas são **privadas** — ficam no documento do próprio usuário, junto das
favoritas.

## Maiores contribuidores

O botão **🏆 Contribuidores** (canto superior direito) abre o ranking de quem
mais alimentou o arquivo, apurado do campo `createdBy` das máscaras:

- **pódio** dos três primeiros (🥇🥈🥉);
- **lista completa** com o total de contribuições de cada pessoa, a divisão
  entre laudos / notas / categorias e quantas vezes suas máscaras foram
  copiadas;
- seu nome vem marcado com **VOCÊ**.

A ordem é pelo total de itens adicionados; empate desempata pelo número de
cópias e, depois, pelo nome. Itens antigos, criados antes de o nome passar a
ser guardado, não têm autor e aparecem só como uma observação no rodapé da
página.

## No celular

Abaixo de 720px de largura o app troca de layout — uma tela por vez, em vez
das duas colunas do desktop:

- **Cabeçalho enxuto** (título + usuário numa linha, busca na outra) e a
  **lista ocupando a tela toda**;
- **Ações fixas no rodapé**, ao alcance do polegar, com o indicador de
  *Adicionar em: …* sempre à vista;
- **Um toque numa pasta abre e seleciona** (no desktop segue clique para
  selecionar, duplo-clique para abrir);
- A **máscara abre em tela cheia**, com *‹ Voltar* no topo;
- Modais sobem como **folha a partir de baixo**, com campos de 16px (evita o
  zoom automático do iOS) e alvos de toque de ~48px;
- Em laudos e notas, ✎ e 🗑 saem da linha (a tela da máscara já os traz) e a
  ☆ fica; categorias mantêm os dois. Nas **favoritas** o 🗂 também fica — é a
  porta para as pastas;
- O botão de contribuidores fica só com o **🏆**.
- **Mover itens** fica oculto: o arrastar-e-soltar depende de eventos de
  mouse e não funciona no toque.

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

As favoritas de cada usuário ficam na coleção `favorites`, um documento por
usuário (id = uid), com as pastas dentro do mesmo documento:

```
{
  nodeIds: ["<id da máscara>", ...],          // tudo que a pessoa favoritou
  folders: [{ id: "f1", name: "Plantão", icon: "🔥" }, ...],
  folderOf: { "<id da máscara>": "f1" }       // sem entrada = "Sem pasta"
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

> **As regras do repositório são a fonte da verdade.** Sempre que
> `firestore.rules` mudar, publique (`npm run deploy:rules`, ou o deploy
> automático do GitHub Actions, que já cuida disso). Editar as regras direto
> no Console do Firebase faz produção e repositório divergirem — a seção
> **Favoritas** ficou fora do ar exatamente assim: o bloco
> `match /favorites/{userId}` existia no arquivo, mas nunca chegou à
> produção.
