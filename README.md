# CAGED Dashboard

Painel analítico para explorar dados do **Novo CAGED** (movimentação de emprego formal no Brasil), com pipeline local em arquitetura Medallion, API FastAPI e dashboard React.

Documentação complementar:

- [`docs/handoff_institucional.md`](docs/handoff_institucional.md) — guia de handoff e primeira execução na universidade
- [`docs/checklist_handoff.md`](docs/checklist_handoff.md) — checklist de recepção institucional
- [`docs/entrega_institucional.md`](docs/entrega_institucional.md) — guia de recebimento, operação e manutenção para a universidade
- [`docs/runbook_operacional.md`](docs/runbook_operacional.md) — runbook mensal, diagnóstico e checklist
- [`docs/pipeline.md`](docs/pipeline.md) — execução do pipeline e flags de catálogo
- [`docs/gold_catalog.md`](docs/gold_catalog.md) — catálogo formal da camada Gold
- [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) — contrato de dados Pipeline Gold / API / front-end
- [`docs/CONFIG.md`](docs/CONFIG.md) — portas, proxy, CORS, defaults e configuração operacional
- [`docs/mapa_geojson.md`](docs/mapa_geojson.md) — estratégia de mapa territorial e preparação de GeoJSON
- [`data-lake/geo/README.md`](data-lake/geo/README.md) — shapefiles e script `prepare_geo_assets`
- [`scripts/start_stack.ps1`](scripts/start_stack.ps1) — inicia API e dashboard localmente (demonstração)

---

## 1. Visão geral

O **CAGED Dashboard** analisa microdados do Novo CAGED e apresenta indicadores de **admissões**, **desligamentos** e **saldo** de empregos formais, com recortes por:

- **Território** — UF e municípios (incluindo Paraná e RMC)
- **Setores** — seção econômica
- **Ocupações** — CBO
- **Perfil demográfico** — sexo, faixa etária, grau de instrução
- **Salários** — indicadores derivados por perfil

O produto trabalha por **competência ano/mês**. A API aceita `ano` e `mes` nos endpoints Gold; o dashboard carrega competências disponíveis via `/api/gold/v1/competencias` e envia `ano`/`mes` em todas as consultas.

No estado atual, o projeto está funcional com dados Gold para competências processadas (por exemplo, `2026-01` e `2026-02`).

---

## 2. Arquitetura

```
Novo CAGED (microdados)
        ↓
     Bronze          ← ingestão e metadados
        ↓
     Silver          ← limpeza, padronização, enriquecimento
        ↓
      Gold           ← indicadores analíticos (CSV + Parquet)
        ↓
    FastAPI          ← leitura da Gold, catálogo e competências
        ↓
 Dashboard React    ← visualização interativa
```

**Implementação atual**

- Pipeline com **Python + pandas**, arquivos no **filesystem** local (`data-lake/`)
- Segue o **conceito Medallion** (Bronze → Silver → Gold)
- **Não** usa Databricks, Spark ou Delta Lake nesta versão

Uma migração futura para Databricks/Spark/Delta Lake é possível como evolução arquitetural, mas **não faz parte da implementação atual**.

---

## 3. Estrutura de pastas

| Pasta | Descrição |
|---|---|
| `data-lake/bronze/` | Microdados brutos e metadados de ingestão |
| `data-lake/silver/` | Dados tratados (Parquet) |
| `data-lake/gold/` | Tabelas analíticas por competência (`ano=YYYY/mes=MM/`) |
| `data-lake/catalog/` | Catálogo formal da Gold (`gold_catalog.json`, `.csv`) |
| `pipelines/` | Jobs Bronze, Silver e Gold |
| `pipelines/common/` | Utilitários e dicionários compartilhados |
| `pipelines/jobs/` | Entrypoints CLI (`run_monthly_pipeline`, `build_gold_catalog`) |
| `app/` | API FastAPI (`app/main.py`, rotas e serviços) |
| `dashboard/` | Frontend React + TypeScript + Vite |
| `docs/` | Documentação (`DATA_CONTRACT.md`, `CONFIG.md`, `pipeline.md`, `gold_catalog.md`, …) |
| `tests/` | Testes automatizados (pytest) |
| `infra/` | Infraestrutura auxiliar (ex.: `docker-compose.yml` para PostGIS) |
| `sql/` | Scripts SQL (schema, views, índices — uso com PostGIS) |
| `src/` | Código legado; preferir `pipelines/` e `pipelines/common/` |

---

## 4. Pré-requisitos

- **Python 3** com suporte a venv
- **Node.js** e **npm** (para o dashboard)
- Dependências Python listadas em [`requirements.txt`](requirements.txt) (ex.: `pandas==3.0.1`, `fastapi==0.135.3`, `uvicorn==0.43.0`)
- Dependências de desenvolvimento em [`requirements-dev.txt`](requirements-dev.txt) (`pytest`, `httpx`)
- Dependências do dashboard em [`dashboard/package.json`](dashboard/package.json)
- **Dados Bronze** do CAGED na estrutura esperada (ver seção 8)

O diretório `data-lake/` não é versionado (ver `.gitignore`). É necessário ter os microdados localmente antes de rodar o pipeline.

---

## 5. Configuração do ambiente

### Python (Windows PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Variáveis de ambiente

1. Copie [`.env.example`](.env.example) para `.env`
2. Preencha, no mínimo:
   - `DEFAULT_ANO` — ano padrão da competência (ex.: `2026`)
   - `DEFAULT_MES` — mês padrão (ex.: `1`, conforme [`.env.example`](.env.example))
   - `DEFAULT_UF` — UF de referência (ex.: `PR`)
   - `APP_ENV` / `APP_VERSION` — identificação nos endpoints `/health` e `/ready` (opcional)
3. Variáveis `BRONZE_*` ajustam validação da Bronze (opcional; há padrões no código)
4. Variáveis `POSTGRES_*` são opcionais e usadas apenas para integração com PostGIS/mapas

**Não** commite o arquivo `.env` nem credenciais reais no repositório.

Detalhes de portas, proxy, CORS, limites de API e Tailwind: [`docs/CONFIG.md`](docs/CONFIG.md).

---

## 6. Como rodar a API e o dashboard (demonstração)

Para subir API e dashboard em janelas separadas (Windows):

```powershell
.\scripts\start_stack.ps1
```

Consulte [`docs/handoff_institucional.md`](docs/handoff_institucional.md) para primeira execução e encerramento dos processos.

### API manualmente

Com o ambiente virtual ativo:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Endpoints úteis

| Endpoint | Descrição |
|---|---|
| `/health` | API viva (não depende da Gold) |
| `/ready` | Prontidão para servir dados (Gold + catálogo) |
| `/docs` | Documentação interativa (Swagger) |
| `/api/gold/v1/competencias` | Competências disponíveis na Gold |
| `/api/gold/v1/meta` | Metadados e tabelas de uma competência |
| `/api/gold/v1/overview` | KPIs e rankings agregados |
| `/api/gold/v1/table/{base_name}` | Tabela Gold paginada |
| `/api/gold/v1/catalog` | Catálogo formal da camada Gold |

### Exemplos

```text
GET /api/gold/v1/overview?scope=br&ano=2026&mes=2
GET /api/gold/v1/table/tabela_resumo?scope=br&ano=2026&mes=2
GET /api/gold/v1/catalog?ano=2026&mes=2
GET /api/gold/v1/competencias
```

Parâmetro `scope`: `br` (Brasil), `pr` (Paraná), `rmc` (Região Metropolitana de Curitiba).

A API lê a camada Gold **preferindo Parquet** (mais eficiente) e faz **fallback para CSV** quando o Parquet não existir ou não puder ser lido. O pipeline continua gerando ambos os formatos; as respostas JSON dos endpoints não mudam.

### Health e readiness

- **`GET /health`** — confirma que a API está viva. Resposta leve, sem verificar `data-lake`.
- **`GET /ready`** — verifica Gold, competências, catálogo e competência default. Retorna **200** quando pronta ou **503** com `problems` quando faltar dado.

Recomenda-se testar `/ready` antes de apresentar ou publicar o dashboard.

### Erros padronizados (Gold)

Competência inexistente, tabela ausente ou catálogo indisponível retornam JSON estruturado:

```json
{
  "error": {
    "code": "GOLD_COMPETENCIA_NOT_FOUND",
    "message": "Competência Gold não encontrada.",
    "details": {
      "ano": 2026,
      "mes": 12,
      "expected_path": "data-lake/gold/caged/ano=2026/mes=12"
    }
  }
}
```

Códigos comuns: `INVALID_COMPETENCIA`, `GOLD_COMPETENCIA_NOT_FOUND`, `GOLD_TABLE_NOT_FOUND`, `GOLD_CATALOG_NOT_FOUND`.

---

## 7. Como rodar o dashboard

```powershell
cd dashboard
npm install
npm run dev
```

O Vite inicia em **http://localhost:5173/** por padrão (configurado em `dashboard/vite.config.ts`). Se a porta estiver ocupada, o Vite pode usar outra (ex.: **5174**).

O dashboard consome a API local via proxy (`/api` → `http://127.0.0.1:8000`, ver `dashboard/vite.config.ts`). **Inicie a API antes** do frontend.

Em desenvolvimento, o cliente HTTP usa `baseURL=''` (`dashboard/src/api/http.ts`) e depende desse proxy.

Build de produção:

```powershell
npm run build
```

Em produção, se **não** houver reverse proxy servindo `/api` na mesma origem do build estático, configure a variável de ambiente **`VITE_API_BASE_URL`** apontando para a API (ex.: `https://api.universidade.edu.br`) antes do `npm run build`. Veja [`dashboard/.env.example`](dashboard/.env.example) e [`docs/CONFIG.md`](docs/CONFIG.md).

### 7.1 Homologação e produção

| Objetivo | Passos resumidos |
|----------|------------------|
| **Mesma origem (recomendado)** | `npm run build` sem `VITE_API_BASE_URL`; servir `dashboard/dist` com reverse proxy encaminhando `/api` → uvicorn `:8000`; ajustar `CORS_ORIGINS` só se o browser acessar a API em outro host |
| **API em outro domínio** | Definir `VITE_API_BASE_URL` antes do build; definir `CORS_ORIGINS` no `.env` da API com a URL do dashboard |
| **Homologação interna** | Copiar `.env.example` → `.env`; `APP_ENV=staging`; incluir URL do painel em `CORS_ORIGINS` se front e API forem origens diferentes |

Detalhes, tabela de cenários e exemplo nginx documental: [`docs/CONFIG.md`](docs/CONFIG.md).

---

## 8. Como rodar o pipeline

### Entrada Bronze esperada

Antes do pipeline, coloque os arquivos em:

```text
data-lake/bronze/caged/ano=YYYY/mes=MM/
  microdados.txt      ← obrigatório
  metadata.json       ← gerado pela validação Bronze
  dicionario.pdf      ← opcional
```

### Validar Bronze antes do processamento

Recomendado após colocar o `microdados.txt` e **antes** de rodar Silver/Gold:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 3 --validate-bronze-only
```

Isso valida header, colunas, competência, tamanho e grava `metadata.json` (com SHA256) sem processar Silver/Gold.

Interpretação do `metadata.json`:

| Campo | Significado |
|---|---|
| `validation_status` | `ok`, `warning` ou `error` |
| `file_sha256` | Checksum do arquivo bruto |
| `competencia_matches_path` | `competênciamov` bate com ano/mês da pasta |
| `missing_required_columns` | Colunas obrigatórias ausentes |
| `warnings` / `errors` | Detalhes operacionais |

`warning` permite seguir o pipeline; `error` interrompe com mensagem clara.

### Validar Silver (Bronze + Silver, sem Gold)

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --validate-silver-only
```

Gera `data-lake/silver/caged/ano=YYYY/mes=MM/caged_tratado.parquet` e `metadata.json` com validação de qualidade.

| Campo Silver | Significado |
|---|---|
| `validation_status` | `ok`, `warning` ou `error` |
| `admissao_sum` / `desligamento_sum` / `saldo_sum` | Totais derivados (saldo = admissões − desligamentos) |
| `saldo_consistency_ok` | `admissao`/`desligamento` coerentes com `saldomovimentacao` |
| `competencia_matches_expected` | Competência bate com ano/mês da pasta |

A Silver consulta o `metadata.json` da Bronze: `error` na Bronze bloqueia a Silver; ausência do arquivo gera apenas warning.

### Validar Gold (artefatos existentes, sem Bronze/Silver)

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --validate-gold-only
```

Valida tabelas obrigatórias, pares CSV/Parquet, `tabela_resumo` e grava `data-lake/gold/caged/ano=YYYY/mes=MM/metadata.json`.

| Campo Gold | Significado |
|---|---|
| `validation_status` | `ok`, `warning` ou `error` |
| `required_tables_ok` | Tabelas mínimas (resumo, UF, município, setor, ocupação × BR/PR/RMC) |
| `totals_consistency_ok` | `saldo = admissoes - desligamentos` em `tabela_resumo` |
| `csv_without_parquet` / `parquet_without_csv` | Pares de artefatos incompletos |
| `suspected_legacy_files` | Ex.: `tabela_perfil` legado |

A Gold consulta metadata Silver: `validation_status=error` **bloqueia** a agregação; ausência gera warning.

### Rotina operacional recomendada

**Automatizada (recomendado):**

```powershell
.\scripts\monthly_run.ps1 -Ano 2026 -Mes 3
```

O script executa validação Bronze → Silver → pipeline completo com catálogo → validação Gold → smoke test da API. Detalhes: [`docs/runbook_operacional.md`](docs/runbook_operacional.md).

**Smoke test da API** (requer API ativa):

```powershell
.\scripts\smoke_api.ps1 -Ano 2026 -Mes 2
```

**Manual (passo a passo):**

1. Colocar `microdados.txt` na Bronze
2. `--validate-bronze-only`
3. `--validate-silver-only` ou pipeline com Silver
4. Pipeline Gold com `--build-catalog --validate-catalog`
5. `--validate-gold-only` após Gold gerada
6. Verificar `GET /ready` na API antes de publicar o dashboard

### Comando padrão

Usa `DEFAULT_ANO` e `DEFAULT_MES` do `.env`:

```powershell
python -m pipelines.jobs.run_monthly_pipeline
```

### Competência explícita

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 1
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2
```

Executa: **Bronze → Silver (com validação + metadata) → Gold (com validação + metadata)**.

### Pipeline com catálogo

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --build-catalog
```

Após a Gold, regenera `data-lake/catalog/gold_catalog.json`, `.csv` e `docs/gold_catalog.md`.

### Pipeline com catálogo e validação leve

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --build-catalog --validate-catalog
```

Executa: **Bronze → Silver → Gold → Build Catalog → Validate Catalog**.

A validação verifica presença da competência, `tabela_resumo`, ausência de legados suspeitos e paridade CSV/Parquet. Problemas críticos interrompem o job; avisos leves ficam apenas no log.

### Somente catálogo (`--catalog-only`)

Regenera o catálogo **sem** executar Bronze, Silver ou Gold — útil quando a Gold já existe:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano 2026 --mes 2
```

> `--catalog-only` é modo exclusivo: se usado junto com `--build-catalog`, o catálogo é gerado uma única vez.

Detalhes adicionais: [`docs/pipeline.md`](docs/pipeline.md).

---

## 9. Catálogo da camada Gold

O catálogo documenta formalmente as tabelas Gold: escopo territorial, granularidade, colunas, tipos, contagens e artefatos suspeitos.

### Artefatos gerados

- `data-lake/catalog/gold_catalog.json`
- `data-lake/catalog/gold_catalog.csv`
- `docs/gold_catalog.md`

### Comando isolado

```powershell
python -m pipelines.jobs.build_gold_catalog
```

Equivalente funcional a `--catalog-only`.

### API

`GET /api/gold/v1/catalog` carrega o JSON persistido em `data-lake/catalog/gold_catalog.json`. Se o arquivo não existir, retorna `GOLD_CATALOG_NOT_FOUND`. Filtros opcionais: `ano`, `mes`, `scope`, `granularity`, `suspected_legacy`.

### Campos principais

| Campo | Descrição |
|---|---|
| `table_name` | Nome da tabela (ex.: `tabela_setor_pr`) |
| `competencia` | `YYYY-MM` |
| `ano` / `mes` | Partição |
| `scope` | `brasil`, `parana` ou `rmc` |
| `granularity` | `resumo`, `uf`, `municipio`, `setor`, `ocupacao`, `salario`, `perfil_*`, etc. |
| `row_count` / `column_count` | Dimensões da tabela |
| `columns` / `dtypes` | Schema |
| `is_suspected_legacy` | Indica possível artefato legado |

Cada competência processada pelo pipeline atual gera **47 tabelas** CSV + 47 Parquet + 1 Excel consolidado.

---

## 10. Competências disponíveis

```text
GET /api/gold/v1/competencias
```

Retorna competências válidas na Gold (diretórios com `tabela_resumo.csv`), incluindo `default` e `items` com `ano`, `mes`, `competencia` e `label`.

O dashboard consome esse endpoint no `MonthProvider` (`dashboard/src/context/MonthContext.tsx`) para montar o seletor de competência e propagar `ano`/`mes` às páginas.

**Persistência da competência selecionada**

- A competência é sincronizada com a query string **`?ano=&mes=`** na URL.
- Também é gravada em **`localStorage`** (chave `caged-dashboard:last-competencia`).
- Prioridade de resolução inicial: URL → localStorage → default da API → último item disponível → fallback local (ver `dashboard/src/lib/competenciaPersistence.ts`).

---

## 11. Testes

Com o ambiente virtual ativo:

```powershell
python -m pytest tests/ -v
```

A contagem atual de testes é **dinâmica**. Verifique com:

```powershell
python -m pytest tests/ --collect-only -q
```

Cobertura principal:

- Tratamento e validação Silver (`test_clean_caged.py`)
- Imports de módulos comuns (`test_common_imports.py`)
- Resolução de competência e serviços Gold (`test_gold_service.py`)
- Rotas da API Gold (`test_routes_gold.py`)
- Competências disponíveis (`test_competencias.py`)
- Catálogo Gold (`test_gold_catalog.py`)
- Validação Bronze e flag `--validate-bronze-only` (`test_bronze_validation.py`)
- Validação Silver e flag `--validate-silver-only` (`test_silver_validation.py`)
- Validação Gold e flag `--validate-gold-only` (`test_gold_validation.py`)
- Integração catálogo ↔ pipeline e flag `--catalog-only` (`test_run_monthly_pipeline_catalog.py`)
- **Contrato Gold/API/front-end** (`test_gold_frontend_contract.py`) — validação estática de tabelas, colunas, regras de scope e alinhamento com [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md); **não depende** de data-lake populado
- **Alinhamento de configuração** (`test_config_alignment.py`) — validação estática de Tailwind único, limite 2000, defaults ano/mês, `VITE_API_BASE_URL`, proxy Vite, CORS documentado, referências a [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) e documentação de testes; **não depende** de data-lake

Documentação do contrato de dados: [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md). Configuração operacional: [`docs/CONFIG.md`](docs/CONFIG.md).

---

## 12. Desenvolvimento e boas práticas

- **Não versionar** `.env` nem `data-lake/` (já no `.gitignore`)
- **Não editar** arquivos Gold manualmente; prefira reprocessar via pipeline
- **Atualize o catálogo** após processar nova competência (`--build-catalog` ou `--catalog-only`)
- No processamento mensal, prefira `--build-catalog --validate-catalog`
- Use `--catalog-only` quando a Gold já estiver atualizada e só o catálogo precisar ser regenerado
- Utilitários compartilhados: `pipelines/common/` (evite duplicar em `src/`)
- Código em `src/` é legado; novas alterações devem ir para `pipelines/`
- Logs do pipeline: `logs/pipeline.log`
- **Tailwind CSS:** config único em [`dashboard/tailwind.config.cjs`](dashboard/tailwind.config.cjs) (PostCSS em `postcss.config.cjs`). Alterações de theme/plugins Tailwind devem ser feitas apenas neste arquivo.
- Contrato Gold/API/front-end: mantenha [`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md) alinhado ao pipeline e ao dashboard; rode `tests/test_gold_frontend_contract.py` após mudanças de schema ou constantes.
- Configuração (portas, limites, defaults, Tailwind): mantenha [`docs/CONFIG.md`](docs/CONFIG.md) alinhado; rode `tests/test_config_alignment.py` após mudanças em config, README ou `.env.example`.

---

## 13. Limitações atuais

- Implementação **local com pandas**, sem Spark/Databricks
- Performance depende do volume dos microdados na máquina local
- Mapas geográficos: estratégia **GeoJSON estático** (`pipelines/geo/prepare_geo_assets.py`, ver [`docs/mapa_geojson.md`](docs/mapa_geojson.md)); PostGIS/Tegola permanecem em estágio separado. O dashboard implementa **`TerritoryMap`** (Leaflet); **`MapPlaceholder`** aparece apenas como fallback (GeoJSON indisponível, erro de carga ou ausência de métricas).
- O catálogo fica desatualizado se não for regenerado após mudanças na Gold
- CORS configurável via **`CORS_ORIGINS`** no `.env` (defaults locais Vite em `app/core/config.py`); ver [`docs/CONFIG.md`](docs/CONFIG.md)
- Em produção sem reverse proxy `/api`, **`VITE_API_BASE_URL`** deve ser definida no build (ver seção 7 e [`dashboard/.env.example`](dashboard/.env.example))
- O pipeline Bronze **não baixa** microdados automaticamente — a universidade deve obter os arquivos da fonte oficial
- Use `--validate-bronze-only` para auditar o arquivo antes do processamento mensal

---

## 14. Roadmap sugerido

- Página “Sobre os dados” consumindo `/api/gold/v1/catalog` programaticamente (hoje menciona o endpoint, mas não há `fetchCatalog` em `dashboard/src/api/gold.ts`)
- Documentação institucional (`docs/entrega_institucional.md`, etc.) alinhada ao estado atual (contagem de testes, persistência, mapa)
- CI com `pytest` e `npm run build`
- Validações automáticas de qualidade da Gold no pipeline
- Diff de catálogo entre execuções (auditoria de schema)
- Integração opcional do job de catálogo ao final de todo processamento mensal (sem flag)
- **Futuro:** migração para Databricks / Spark / Delta Lake, se for decisão do projeto

---

## Licença e dados

Os microdados do CAGED são dados públicos do governo brasileiro. Consulte a fonte oficial para termos de uso e atualizações dos arquivos de entrada.
