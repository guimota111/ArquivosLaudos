# Guia de Deploy — Arquivo de Laudos

O site é estático (build do Vite em `dist/`) + Firestore. Há dois caminhos.
Escolha **um**. O manual é o mais rápido para publicar agora; o automático
publica sozinho a cada push depois de configurado uma vez.

---

## Opção A — Deploy manual (da sua máquina)

Feito na sua máquina porque o deploy exige login na sua conta Google/Firebase.

**1. Instale o Firebase CLI (uma vez):**

```bash
npm install -g firebase-tools
```

**2. Faça login (uma vez):**

```bash
firebase login
```

**3. Na pasta do projeto, instale as dependências (uma vez):**

```bash
npm install
```

**4. Publique:**

```bash
npm run deploy          # build + publica o site E as regras do Firestore
npm run deploy:rules    # publica só as regras do Firestore
```

Ao final, o CLI mostra a URL pública (algo como
`https://arquivolaudos.web.app`).

> Se aparecer "Hosting não configurado" para o projeto, rode uma vez
> `firebase experiments:enable webframeworks` **não é necessário** aqui —
> o `firebase.json` já aponta `public: "dist"`. Basta ter feito `firebase login`.

---

## Opção B — Deploy automático (GitHub Actions)

O workflow `.github/workflows/deploy.yml` publica o site a cada push na
branch principal. Configure o acesso **uma única vez**:

**1. Gere uma chave de conta de serviço no Firebase:**

- Console do Firebase → ⚙️ **Configurações do projeto** → aba **Contas de serviço**
- Clique em **Gerar nova chave privada** → baixa um arquivo `.json`.

**2. Crie o secret no GitHub:**

- Repositório no GitHub → **Settings** → **Secrets and variables** → **Actions**
- **New repository secret**
  - Nome: `FIREBASE_SERVICE_ACCOUNT`
  - Valor: cole **todo o conteúdo** do arquivo `.json` baixado.

**3. Pronto.** No próximo push para `main`/`master` (ou rodando o workflow
manualmente em **Actions → Deploy no Firebase** → **Run workflow**), o site
**e as regras do Firestore** são publicados automaticamente.

> O passo das regras usa o mesmo secret `FIREBASE_SERVICE_ACCOUNT`. A conta de
> serviço precisa poder publicar regras (a chave gerada em **Configurações do
> projeto → Contas de serviço** já tem essa permissão).

---

## Primeira publicação das regras do Firestore

Independente da opção escolhida, publique as regras ao menos uma vez para que
o banco aceite leituras/escritas conforme definido em `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

Ou cole o conteúdo de `firestore.rules` no Console do Firebase →
**Firestore Database** → aba **Regras** → **Publicar**.

> **Publique as regras sempre que `firestore.rules` mudar.** Editar as regras
> só pelo Console do Firebase faz o arquivo do repositório e a produção
> divergirem — foi assim que a coleção `favorites` ficou sem permissão e a
> seção **Favoritas** parou de funcionar sem dar erro na tela.
