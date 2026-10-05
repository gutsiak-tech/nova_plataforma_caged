# Configuração — nova_plataforma

Referência operacional curta para desenvolvimento local e deploy. Detalhes de dados Gold/API/front-end: [`DATA_CONTRACT.md`](DATA_CONTRACT.md).

---

## Portas principais

| Serviço | Porta | Onde |
|---------|-------|------|
| API FastAPI | **8000** | `uvicorn app.main:app --host 127.0.0.1 --port 8000`; `scripts/start_stack.ps1` |
| Dashboard Vite (dev) | **5173** | `dashboard/vite.config.ts` (`server.port`) |
| Vite preview | **4173** | `npm run preview` (padrão Vite); incluída no CORS da API |
| Vite alternativa | **5174** | Usada quando 5173 está ocupada; incluída no CORS da API |

---

## Dev proxy

Em desenvolvimento, `dashboard/vite.config.ts` define:

```text
/api  →  http://127.0.0.1:8000
```

O cliente axios (`dashboard/src/api/http.ts`) usa `baseURL=''`, então chamadas a `/api/gold/v1/...` passam pelo proxy do Vite. **A API deve estar ativa antes do dashboard.**

---

## API base URL (`VITE_API_BASE_URL`)

| Ambiente | Comportamento |
|----------|---------------|
| **Dev** | `baseURL=''` + proxy Vite (acima) |
| **Produção (mesma origem)** | Reverse proxy encaminha `/api` → API; `VITE_API_BASE_URL` vazio no build |
| **Produção (API separada)** | Defina **`VITE_API_BASE_URL`** (ex.: `https://api.universidade.edu.br`) **antes** de `npm run build` |

Implementação: `dashboard/src/api/http.ts` → `import.meta.env.VITE_API_BASE_URL ?? ''`.

Exemplo versionado: [`dashboard/.env.example`](../dashboard/.env.example). Copie para `dashboard/.env.local` (dev) ou exporte no CI antes do build.

---

## Cenários de deploy

| Cenário | Front-end | API | `VITE_API_BASE_URL` | `CORS_ORIGINS` | Observação |
|---------|-----------|-----|---------------------|----------------|------------|
| **Dev local** | Vite `:5173` | uvicorn `:8000` | vazio | defaults (ou omitir) | Proxy Vite `/api` |
| **Preview Vite** | `npm run preview` `:4173` | uvicorn `:8000` | vazio | defaults incluem 4173 | Mesmo proxy só em `npm run dev`; preview pode precisar de `VITE_API_BASE_URL` ou proxy externo |
| **Homologação — mesma origem** | estático + nginx/Caddy | atrás de `/api` | vazio no build | URL pública do dashboard | Recomendado |
| **Homologação — origens separadas** | `https://caged...` | `https://api...` | URL da API no build | URL do dashboard | CORS obrigatório |
| **Produção** | CDN ou servidor estático | API dedicada | conforme cenário | origens reais | Reiniciar API após pipeline Gold |

### Exemplo documental — reverse proxy (nginx)

Não versionado como infra; apenas referência para homologação/produção **mesma origem**:

```nginx
server {
    listen 80;
    server_name caged.exemplo.local;

    root /var/www/caged-dashboard/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Com esse layout, o build do dashboard **não** precisa de `VITE_API_BASE_URL`.

---

## CORS

Origens permitidas vêm de **`CORS_ORIGINS`** no `.env` da raiz (CSV). Se vazio ou ausente, `app/core/config.py` usa defaults de desenvolvimento Vite:

- `http://localhost:5173`, `http://127.0.0.1:5173`
- `http://localhost:5174`, `http://127.0.0.1:5174`
- `http://localhost:4173`, `http://127.0.0.1:4173`

`app/main.py` aplica `allow_origins=CORS_ORIGINS`.

**Homologação/produção com front e API em hosts diferentes:** defina `CORS_ORIGINS` com a URL exata do dashboard (protocolo + host + porta).

**Mesma origem com reverse proxy `/api`:** o browser chama `/api` no mesmo host do front; CORS extra costuma não ser necessário para o dashboard (requisições same-origin).

---

## Defaults (back-end e front-end)

| Variável | Back-end (`.env` / `app/core/config.py`) | Front-end |
|----------|------------------------------------------|-----------|
| `DEFAULT_ANO` | Override opcional; só é aceito junto de `DEFAULT_MES` e se a Gold for válida | Usa `default` de `/competencias`; não possui fallback local |
| `DEFAULT_MES` | Override opcional; quando o par é omitido, usa a Gold válida mais recente | A lista vazia ou erro da API produz estado seguro, sem competência fictícia |
| `DEFAULT_UF` | `PR` | não identificado uso direto no dashboard |
| `CORS_ORIGINS` | CSV no `.env`; defaults Vite em `config.py` se vazio | não aplicável (CORS é do back-end) |
| `VITE_API_BASE_URL` | não aplicável | `dashboard/.env.example`; vazio = `/api` relativo (proxy ou reverse proxy) |
| **Scope** | `br` default em `GET /table` e `GET /overview` | `ScopeContext.tsx` → `useState<Scope>('br')` |

Competência no UI: URL `?ano=&mes=` + `localStorage` — ver `dashboard/src/lib/competenciaPersistence.ts` e `MonthContext.tsx`.

Os pipelines mutáveis não inferem uma competência: `--ano` e `--mes` são
obrigatórios, evitando reprocessamento acidental da Gold padrão de leitura.

---

## Limites de tabela (`/api/gold/v1/table/{base_name}`)

| Local | Valor |
|-------|-------|
| `app/api/routes_gold.py` | `limit` query: default **50**, máximo **2000** (`ge=1, le=2000`) |
| `dashboard/src/lib/apiLimits.ts` | `API_TABLE_MAX_LIMIT = 2000` |
| `dashboard/src/api/gold.ts` | `fetchTable` default `limit: 2000` |

O front-end envia até 2000 linhas por padrão; a API aceita no máximo 2000. O alinhamento entre esses valores é verificado estaticamente por `tests/test_config_alignment.py`.

---

## Tailwind CSS

| Arquivo | Papel |
|---------|-------|
| **`dashboard/tailwind.config.cjs`** | **Única fonte de verdade** — PostCSS (`postcss.config.cjs`) carrega este arquivo no build |

Alterações de theme/plugins Tailwind devem ir apenas no `.cjs`. Tokens de cor para charts: `dashboard/src/index.css` (CSS variables) → `tokens.ts` → `chartTheme.ts`; classes de layout: `theme.ts`.

---

## Documentos relacionados

- [`README.md`](../README.md) — visão geral e execução
- [`DATA_CONTRACT.md`](DATA_CONTRACT.md) — contrato Pipeline Gold / API / front-end
- [`gold_catalog.md`](gold_catalog.md) — catálogo formal da camada Gold
- [`runbook_operacional.md`](runbook_operacional.md) — rotina mensal e diagnóstico

---

## Testes estáticos de configuração e contrato

| Arquivo | O que protege |
|---------|---------------|
| [`tests/test_gold_frontend_contract.py`](../tests/test_gold_frontend_contract.py) | Contrato de dados Gold/API/front-end vs [`DATA_CONTRACT.md`](DATA_CONTRACT.md) |
| [`tests/test_config_alignment.py`](../tests/test_config_alignment.py) | Alinhamento documentado deste arquivo e do README: Tailwind único (`tailwind.config.cjs`), limite **2000**, override opcional `DEFAULT_ANO`/`DEFAULT_MES`, `VITE_API_BASE_URL`, proxy Vite, `CORS_ORIGINS` / CORS em `app/core/config.py`, referências cruzadas |

Ambos são **estáticos** (leitura de arquivos com `pathlib`/regex), **não dependem** de data-lake populado e **não validam**:

- CORS em runtime (requisições reais do browser)
- deploy ou build de produção (`npm run build`)
- API em execução (smoke HTTP)
- aparência visual / CSS gerado

A contagem total de testes é **dinâmica** (varia conforme novos arquivos em `tests/`). Obtenha a contagem atual com:

```powershell
python -m pytest tests/ --collect-only -q
```
