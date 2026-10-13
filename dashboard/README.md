# CAGED — Painel analítico

Dashboard **React + TypeScript + Vite** que consome a API FastAPI em `app/` (`/api/gold/v1/*`). A Gold territorial fica em `data-lake/gold/caged/`. A Feature Focus também lê as dimensões em `data-lake/gold/geo/`.

A entrada da plataforma é **`http://localhost:5173/`**. Essa rota redireciona para **`/territorial`**.

| Rota | O que abre |
|---|---|
| `/` | redireciona para `/territorial`, preservando `?ano=&mes=` |
| `/territorial` | landing Brasil, Paraná e RMC |
| `/territorial/brasil` | detalhe do Brasil |
| `/territorial/parana` | detalhe do Paraná |
| `/territorial/rmc` | detalhe da RMC |
| `/territorial/brasil/{uf}` | Feature Focus da UF |
| `/territorial/parana/{código}` e `/territorial/rmc/{código}` | Feature Focus do município (código IBGE de 7 dígitos) |
| `/legacy` | visão executiva anterior |

As páginas antigas `/territorio`, `/setores`, `/ocupacoes`, `/perfil`, `/salario` e `/sobre` continuam no shell legado.

## Competência

A competência inicial não é um mês fixo no frontend. A ordem em `dashboard/src/lib/competenciaPersistence.ts` é:

1. query `ano`/`mes` válida
2. última competência válida no `localStorage` (`caged-dashboard:last-competencia`)
3. `default` de `GET /api/gold/v1/competencias`
4. última Gold válida da lista

Sem `DEFAULT_ANO` e `DEFAULT_MES` no `.env` da API, esse default é a Gold válida mais recente. A escolha é regravada na URL e no `localStorage`.

## Pré-requisitos

- API no ar em `127.0.0.1:8000` (dependências em `requirements.txt`)
- Node.js 20.19+ e npm
- Gold, dimensões `gold/geo` e catálogo ao lado do código, para o painel mostrar dados

## Como rodar (desenvolvimento)

**1) API (terminal 1)** — na raiz do repositório:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**2) Dashboard (terminal 2)**:

```bash
cd dashboard
npm install
npm run dev
```

Abra `http://localhost:5173/`. O Vite faz **proxy** de `/api` para `http://127.0.0.1:8000` (`vite.config.ts`). Inicie a API antes do frontend.

Testes e build:

```bash
npm test
npm run build
```

`npm test` executa `vitest run`. `npm run build` executa `tsc -b && vite build`.

## Variáveis opcionais

- `VITE_API_BASE_URL`: se definida, o axios usa essa base. Em dev, deixe vazio para usar o proxy. Exemplo versionado: `dashboard/.env.example`.

## CORS

O browser fala com a API. As origens permitidas vêm de **`CORS_ORIGINS`**, lida em `app/core/config.py` e aplicada em `app/main.py`. Vazio usa os defaults locais do Vite (5173, 5174 e 4173). Não há lista de origens fixa para editar dentro de `app/main.py`.

## Build de produção

```bash
cd dashboard
npm run build
npm run preview
```

`npm run preview` não usa o proxy de desenvolvimento. Na mesma origem, um reverse proxy deve encaminhar `/api` para a API. Se a API estiver em outro host, defina `VITE_API_BASE_URL` antes do build e `CORS_ORIGINS` na API.

## Escopos

Brasil, Paraná e RMC na experiência territorial correspondem a `scope=br`, `pr` e `rmc` na API. Nas tabelas territoriais, Paraná e RMC usam os sufixos `_pr` e `_rmc`.
