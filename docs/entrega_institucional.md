# Documento de entrega institucional — Plataforma Becker / CAGED

Este documento fixa o pacote que a equipe receptora deve receber. O guia de operação é [`handoff_institucional.md`](handoff_institucional.md).

O produto entregue abre em `/`, redireciona para `/territorial` e lê Gold local. PostGIS e Tegola não fazem parte do caminho de serving.

---

## 1. Repositório

Entregar o código da branch `frontend/entrada-territorial`, não a tag `v1.0.0` em `main`, se o objetivo for o produto territorial atual.

Entram no pacote de código:

- `app/`
- `dashboard/` (código, `package.json`, `package-lock.json` e assets versionados em `dashboard/public/`, inclusive os GeoJSON de `dashboard/public/geo/`)
- `pipelines/`
- `tests/`
- `scripts/`
- `docs/`
- `requirements.txt` e `requirements-dev.txt`
- `.env.example` e `dashboard/.env.example`
- `README.md`

`infra/`, `sql/` e `services/tileserver/` podem acompanhar como material opcional de PostGIS. O painel atual não os executa.

`src/` é código legado. O caminho operacional é `pipelines/` e `app/`.

---

## 2. Data-lake

O data-lake não está no Git. Vai numa cópia separada.

### Obrigatório para serving

- `data-lake/gold/caged` (janeiro a junho de 2026, no estado atual)
- `data-lake/gold/geo/dim_uf.csv` e `dim_uf.parquet`
- `data-lake/gold/geo/dim_municipio.csv` e `dim_municipio.parquet`
- `data-lake/catalog` (`gold_catalog.json` e `gold_catalog.csv`)

Sem essa Gold, a API sobe e `/ready` não fica pronto. Sem as dimensões `gold/geo`, overview e tabelas territoriais ainda respondem; Feature Focus de UF e município não.

O catálogo em disco pode estar atrás da Gold (sem janeiro e sem as tabelas de Feature). Ele basta para o arquivo existir. A equipe deve regenerá-lo com `--catalog-only` quando for usar `/catalog` como inventário. Não editar `docs/gold_catalog.md` à mão: o job o reescreve.

### Recomendado para continuidade

- `data-lake/bronze/caged` — fonte para reprocessar; não é reconstruída pelo pipeline
- `data-lake/silver/caged` — reconstruível a partir da Bronze; evita reler o microdados
- `data-lake/geodata/` — shapefiles para regerar malhas
- `data-lake/metadata/novo_caged_layout_movimentacao.xlsx` — referência de layout; o código não lê esse arquivo

### Não precisa ir para servir o painel

- `data-lake/gold/geo/matches` — diagnóstico; o pipeline recria
- `data-lake/geo/processed` — cópia; os GeoJSON usados pelo dashboard já estão no Git
- `data-lake/geo/raw` — vazio, só `.gitkeep`
- `data-lake/bronze/geodata` — shapefile do Paraná repetido
- `data-lake/bronze/pop` — nenhum módulo do produto lê essa pasta

---

## 3. Não entregar

- `.env` local
- `.venv`
- `dashboard/node_modules`
- `dashboard/dist`
- `logs/`
- caches de ferramenta
- `__pycache__`
- `.pytest_cache`
- relatórios locais ignorados (`RELATORIO_*.md`)
- pastas transitórias de publicação (`staging`, `.retiring`), se aparecerem no meio de um job

A equipe receptora cria o próprio `.env` a partir de `.env.example`. `DEFAULT_ANO` e `DEFAULT_MES` ficam comentados, salvo decisão de fixar uma competência. São um override opcional e só funcionam juntos.

---

## 4. Instalação mínima

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
copy .env.example .env

cd dashboard
npm install
cd ..

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Noutro terminal:

```powershell
cd dashboard
npm run dev
```

Abrir `http://localhost:5173/` e confirmar o redirect para `/territorial`.

---

## 5. Atualização mensal mínima

```text
data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt
```

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

Equivalente com catálogo, se o script não for usado:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog
```

Reiniciar o uvicorn depois da publicação. Conferir `/ready` e o seletor.

Só o catálogo, sem reprocessar dados:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
```

Feature avulsa, fora da rotina mensal:

```powershell
python -m pipelines.gold.aggregate_feature_indicators --ano YYYY --mes MM
```

Esse comando tem commit próprio de `feature/` e não substitui o snapshot mensal.

---

## 6. Como saber que o pacote está completo

- `GET /health` retorna `status: ok`
- `GET /ready` retorna `status: ready`
- `/` abre `/territorial`
- Brasil, Paraná, RMC, uma UF e um município carregam
- janeiro de 2026 aparece entre as competências
- troca de competência e `?ano=&mes=` funcionam
- `/legacy` abre
- `python -m pytest tests/ -v` e `npm test` rodam
- `npm run build` conclui

Checklist item a item: [`checklist_handoff.md`](checklist_handoff.md).

---

## 7. Limitações que viajam com o pacote

Estão descritas em [`handoff_institucional.md`](handoff_institucional.md). Em resumo: catálogo fora do snapshot, `/meta` sem descer em `feature/`, `gold/geo` global, Feature avulsa com publicação própria, sem lock entre publishers, cache local ao processo, meses jan–jun no layout flat sem `published_at`/`feature_generated_at`, e o dashboard anterior em `/legacy`.

Deploy em servidor, CI e o fetch de `/catalog` na página Sobre continuam por fazer. Mapa, persistência de competência e Feature Focus já estão entregues.
