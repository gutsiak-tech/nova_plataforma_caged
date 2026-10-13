# CAGED — Painel analítico

Dashboard **React + TypeScript + Vite** que consome a API FastAPI em `app/` (`/api/gold/v1/*`), lendo a Gold publicada em `data-lake/gold/caged/`.

A competência inicial não é um mês fixo no frontend. A ordem é: query `ano`/`mes` válida, última competência válida no `localStorage` e, por fim, o `default` de `GET /api/gold/v1/competencias`. Sem `DEFAULT_ANO` e `DEFAULT_MES`, esse default é a Gold válida mais recente.

## Pré-requisitos

- Python com dependências do projeto (`requirements.txt`), incluindo **FastAPI** e **pandas**
- Node.js + npm

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

Abra `http://localhost:5173`. O Vite faz **proxy** de `/api` → `http://127.0.0.1:8000` (veja `vite.config.ts`).

## Variáveis opcionais

- `VITE_API_BASE_URL`: se definida, o axios usa essa base (útil se servir o build estático em outro host). Em dev, deixe vazio para usar o proxy.

## Build de produção (frontend)

```bash
cd dashboard
npm run build
npm run preview
```

Ajuste CORS em `app/main.py` se o origin for diferente.

## Escopos

O seletor **Brasil / Paraná / RMC** alterna o sufixo dos arquivos Gold (`_pr`, `_rmc`) via query `scope` na API.

## Próximos passos (arquitetura)

- A API já recebe `ano` e `mes`. Sem override, a competência padrão é a Gold válida mais recente.
- Endpoints de diff (`mes=02` vs `mes=01`) reutilizando o mesmo layout do dashboard.
