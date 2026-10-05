# Data Contract — Nova Underline plataforma

## 1. Objetivo deste documento

Este arquivo registra o **contrato de dados** entre três camadas do projeto:

- **Pipeline Gold** — gera tabelas agregadas a partir da Silver;
- **API FastAPI** — lê artefatos Gold e expõe endpoints JSON;
- **Dashboard React** — consome a API e renderiza páginas, gráficos e mapas.

O contrato abrange **nomes de tabelas** (`base_name`), **nomes de colunas**, **regras de scope** (`br` / `pr` / `rmc`), **formatos de resposta HTTP** e **mapeamento página → endpoint → tabela**.

Consulte este documento **antes** de:

- alterar tabelas Gold no pipeline;
- renomear colunas nas agregações;
- criar ou modificar endpoints Gold;
- alterar páginas do dashboard que leem dados Gold;
- alterar gráficos, mapas ou heatmaps que referenciam colunas Gold;
- criar ou estender testes de contrato.

**Referências centrais no front-end (Etapas 1 e 1B):**

- `dashboard/src/api/goldTables.ts` — `GOLD_TABLES`
- `dashboard/src/api/goldColumns.ts` — `GOLD_COLUMNS`

---

## 2. Visão geral do fluxo de dados

```
microdados Novo CAGED
  → Silver (pipelines/silver/)
  → Gold (pipelines/gold/aggregate_indicators.py)
  → data-lake/gold/caged/ano=*/mes=*/
  → app/services/gold_service.py (leitura Parquet/CSV, resolução de scope)
  → app/api/routes_gold.py (endpoints REST)
  → dashboard/src/api/gold.ts (fetchCompetencias, fetchOverview, fetchTable)
  → dashboard/src/pages/*.tsx
  → componentes visuais (gráficos, mapa, tabelas, heatmaps)
```

| Etapa | Função |
|-------|--------|
| **Silver** | Trata microdados; colunas de entrada usadas pelo Gold incluem `admissao`, `desligamento`, `saldomovimentacao`, `uf`, `municipio`, `secao`, `cbo2002ocupacao`, `sexo`, `faixa_etaria`, `graudeinstrucao`, `salario` (ver `pipelines/gold/gold_contract.py` → `REQUIRED_SILVER_COLUMNS`). |
| **Gold** | Agrega por dimensões e grava CSV/Parquet por competência (`aggregate_indicators.py`). |
| **data-lake** | Armazena artefatos particionados em `data-lake/gold/caged/ano={ano}/mes={mes:02d}/`. |
| **gold_service.py** | Resolve `base_name` + `scope` → caminho físico; lê Parquet com fallback CSV; serializa para JSON. |
| **routes_gold.py** | Expõe competências, overview agregado, leitura tabular e catálogo. |
| **gold.ts** | Cliente HTTP do dashboard; default `limit=2000` em `fetchTable`. |
| **pages/*.tsx** | Orquestram chamadas e passam colunas via `GOLD_COLUMNS` para componentes. |
| **Componentes** | `MovementSplit`, `BarRank`, `TerritoryMap`, `CategoricalHeatmap`, etc. leem colunas Gold por chave. |

---

## 3. Fontes de verdade atuais

| Fonte | Função | Limitação |
|-------|--------|-----------|
| `pipelines/gold/aggregate_indicators.py` | Define schema real de cada tabela Gold via `agregar_movimentacao()` e `agregar_movimentacao_salario()`. | Não documenta consumo por página; alteração aqui quebra API e front. |
| `pipelines/gold/gold_contract.py` | Contrato operacional mínimo: `MIN_REQUIRED_GOLD_TABLES` (11 tabelas físicas), `TABELA_RESUMO_COLUMNS`, colunas Silver exigidas. | Subconjunto institucional; não cobre tabelas de perfil/salário usadas pelo dashboard. |
| `app/services/gold_catalog_service.py` | `CURRENT_PIPELINE_TABLES` (47 nomes físicos com sufixos); gera/valida catálogo com colunas e dtypes. | Catálogo JSON em `data-lake/` (gitignored); não é consumido pelo front-end. |
| `app/api/routes_gold.py` | Contrato HTTP: endpoints, shape de `/overview`, lista hardcoded de tabelas internas. | Duplica lista de tabelas sem vínculo automático com `goldTables.ts`. |
| `app/services/gold_service.py` | Resolução `base_name` + scope → `{base_name}{suffix}.csv/.parquet`; `BR_ONLY_TABLES`; competências via `tabela_resumo.csv`. | Não valida colunas mínimas por tabela. |
| `dashboard/src/api/goldTables.ts` | 13 `base_name` usados em `fetchTable()`. | Não inclui tabelas consumidas apenas via `/overview`. |
| `dashboard/src/api/goldColumns.ts` | 18 nomes de colunas referenciados no front-end. | `COMPETENCIA` definida mas não referenciada em código TS de páginas/componentes. |
| `dashboard/src/api/types.ts` | Tipos de resposta (`OverviewResponse`, `TableResponse`); `GoldRow = Record<string, unknown>`. | Sem tipagem por coluna; não garante presença de campos em runtime. |
| `GET /api/gold/v1/catalog` | Serve `gold_catalog.json` com colunas, dtypes, scope e granularidade por tabela/competência. | Não consumido programaticamente pelo dashboard (`gold.ts` não expõe `fetchCatalog`). |

---

## 4. Regras de resolução de tabelas por scope

Implementação: `app/services/gold_service.py` → `_suffix_for_scope()`, `_table_stem()`, `resolve_gold_table_paths()`.

| Regra | Detalhe |
|-------|---------|
| **scope `br`** | Sufixo vazio → arquivo `{base_name}.csv` / `{base_name}.parquet` |
| **scope `pr`** | Sufixo `_pr` → `{base_name}_pr.csv` / `.parquet` |
| **scope `rmc`** | Sufixo `_rmc` → `{base_name}_rmc.csv` / `.parquet` |
| **`tabela_resumo`** | BR-only (`BR_ONLY_TABLES`); requisição com `scope != br` retorna erro `INVALID_SCOPE` (400). |
| **`tabela_uf`** | Gerada no recorte Brasil (sem sufixo `_pr`/`_rmc`). A API lê `tabela_uf` com `scope=br` mesmo quando o dashboard filtra Paraná (ex.: KPI de resumo em `scope=pr` em `overview()`; `TerritoryPage` busca UF nacional com `fetchTable(GOLD_TABLES.UF, 'br', ...)`). |

**Diretório base:** `data-lake/gold/caged/ano={ano}/mes={mes:02d}/`

### Exemplos de resolução

| base_name | scope | arquivo físico esperado |
|-----------|-------|---------------------------|
| `tabela_setor` | `br` | `tabela_setor.csv` / `tabela_setor.parquet` |
| `tabela_setor` | `pr` | `tabela_setor_pr.csv` / `tabela_setor_pr.parquet` |
| `tabela_setor` | `rmc` | `tabela_setor_rmc.csv` / `tabela_setor_rmc.parquet` |
| `tabela_resumo` | `br` | `tabela_resumo.csv` / `tabela_resumo.parquet` |
| `tabela_resumo` | `pr` | **não permitido** (erro API) |
| `tabela_municipio` | `pr` | `tabela_municipio_pr.csv` / `.parquet` |
| `tabela_uf` | `br` | `tabela_uf.csv` / `.parquet` (única variante física) |

**Competência válida:** diretório `ano=*/mes=*` deve conter `tabela_resumo.csv` (`gold_service._is_valid_competencia_dir`).

---

## 5. Endpoints Gold usados pelo dashboard

Prefixo do router: `/api/gold/v1` (`app/api/routes_gold.py`).

| Endpoint | Handler | Consumido pelo front-end? | Arquivo front-end | Observações |
|----------|---------|---------------------------|-------------------|-------------|
| `GET /api/gold/v1/competencias` | `competencias()` | **Sim** | `dashboard/src/api/gold.ts` → `fetchCompetencias()`; `AboutDataPage.tsx` | Lista competências disponíveis; default em `items[].default`. Marker de competência: presença de `tabela_resumo.csv`. |
| `GET /api/gold/v1/overview` | `overview()` | **Sim** | `gold.ts` → `fetchOverview()`; `ExecutivePage`, `ProfilesPage`, `SalaryPage` | Params: `scope`, `ano`, `mes`. Agrega rankings, perfis e resumo KPI. |
| `GET /api/gold/v1/table/{base_name}` | `table()` | **Sim** | `gold.ts` → `fetchTable()`; `TerritoryPage`, `SectorPage`, `OccupationPage`, `ProfilesPage`, `SalaryPage` | Params: `scope`, `ano`, `mes`, `limit`, `offset`, `sort_by`, `sort_dir`. Default API `limit=50`; front usa `limit=2000` por padrão. |
| `GET /api/gold/v1/catalog` | `catalog()` | **Não** (programaticamente) | Mencionado em texto em `AboutDataPage.tsx` | Requer `data-lake/catalog/gold_catalog.json`. Erros: `GOLD_CATALOG_NOT_FOUND`, `GOLD_CATALOG_UNREADABLE`. |
| `GET /api/gold/v1/meta` | `meta()` | **Não** | não identificado no repositório | Retorna `month`, `scopes`, `tables` disponíveis no mês. |

**Códigos de erro estruturados** (`app/api/errors.py` → `GoldAPIError`): incluem `INVALID_SCOPE`, `INVALID_COMPETENCIA`, `GOLD_COMPETENCIA_NOT_FOUND`, `GOLD_TABLE_NOT_FOUND`, `GOLD_CATALOG_NOT_FOUND`, entre outros.

---

## 6. Tabelas Gold usadas diretamente pelo front-end

Fonte: `dashboard/src/api/goldTables.ts` → `GOLD_TABLES`.

Colunas mínimas derivadas de `pipelines/gold/aggregate_indicators.py`.

| Constante | base_name | Páginas consumidoras | Endpoint | Colunas mínimas esperadas |
|-----------|-----------|----------------------|----------|---------------------------|
| `MUNICIPIO` | `tabela_municipio` | `TerritoryPage` (+ mapa via `TerritoryMap` / `geoJoin`) | `GET /table/tabela_municipio` | `uf`, `municipio`, `admissoes`, `desligamentos`, `saldo` |
| `UF` | `tabela_uf` | `TerritoryPage` (sempre `scope=br`) | `GET /table/tabela_uf` | `uf`, `admissoes`, `desligamentos`, `saldo` |
| `SETOR` | `tabela_setor` | `SectorPage` | `GET /table/tabela_setor` | `secao`, `admissoes`, `desligamentos`, `saldo` |
| `OCUPACAO` | `tabela_ocupacao` | `OccupationPage` | `GET /table/tabela_ocupacao` | `cbo2002ocupacao`, `admissoes`, `desligamentos`, `saldo` |
| `PERFIL_SEXO_FAIXA_ETARIA` | `tabela_perfil_sexo_faixa_etaria` | `ProfilesPage` (heatmap) | `GET /table/tabela_perfil_sexo_faixa_etaria` | `sexo`, `faixa_etaria`, `admissoes`, `desligamentos`, `saldo` |
| `PERFIL_SEXO_INSTRUCAO` | `tabela_perfil_sexo_instrucao` | `ProfilesPage` (heatmap) | `GET /table/tabela_perfil_sexo_instrucao` | `sexo`, `graudeinstrucao`, `admissoes`, `desligamentos`, `saldo` |
| `PERFIL_FAIXA_ETARIA_INSTRUCAO` | `tabela_perfil_faixa_etaria_instrucao` | `ProfilesPage` (heatmap) | `GET /table/tabela_perfil_faixa_etaria_instrucao` | `faixa_etaria`, `graudeinstrucao`, `admissoes`, `desligamentos`, `saldo` |
| `PERFIL_SEXO_SALARIO` | `tabela_perfil_sexo_salario` | `SalaryPage` | `GET /table/tabela_perfil_sexo_salario` | `sexo` + colunas de movimentação e salário (§10) |
| `PERFIL_FAIXA_ETARIA_SALARIO` | `tabela_perfil_faixa_etaria_salario` | `SalaryPage` | `GET /table/tabela_perfil_faixa_etaria_salario` | `faixa_etaria` + colunas §10 |
| `PERFIL_GRAUDEINSTRUCAO_SALARIO` | `tabela_perfil_graudeinstrucao_salario` | `SalaryPage` | `GET /table/tabela_perfil_graudeinstrucao_salario` | `graudeinstrucao` + colunas §10 |
| `PERFIL_SEXO_FAIXA_ETARIA_SALARIO` | `tabela_perfil_sexo_faixa_etaria_salario` | `SalaryPage` (heatmap) | `GET /table/tabela_perfil_sexo_faixa_etaria_salario` | `sexo`, `faixa_etaria` + colunas §10 |
| `PERFIL_SEXO_INSTRUCAO_SALARIO` | `tabela_perfil_sexo_instrucao_salario` | `SalaryPage` (heatmap) | `GET /table/tabela_perfil_sexo_instrucao_salario` | `sexo`, `graudeinstrucao` + colunas §10 |
| `PERFIL_FAIXA_ETARIA_INSTRUCAO_SALARIO` | `tabela_perfil_faixa_etaria_instrucao_salario` | `SalaryPage` (heatmap) | `GET /table/tabela_perfil_faixa_etaria_instrucao_salario` | `faixa_etaria`, `graudeinstrucao` + colunas §10 |

**Nota:** cada `base_name` acima existe fisicamente também com sufixos `_pr` e `_rmc` quando aplicável (exceto `tabela_resumo` e `tabela_uf`), conforme `CURRENT_PIPELINE_TABLES` em `gold_catalog_service.py`.

---

## 7. Tabelas usadas apenas via `/overview`

Estas tabelas são lidas internamente por `overview()` em `routes_gold.py` e **não** constam em `GOLD_TABLES` (`goldTables.ts`).

| Tabela | Onde é lida na API | Campo da resposta `/overview` | Páginas consumidoras | Observações |
|--------|-------------------|-------------------------------|----------------------|-------------|
| `tabela_resumo` | `read_gold_table(..., scope="br")` quando `scope=br` | `resumo` | `ExecutivePage` (KPIs) | Colunas Gold: `competencia`, `admissoes`, `desligamentos`, `saldo`. BR-only. |
| `tabela_uf` | `read_gold_table(..., scope="br")` filtrando `uf=PR` | `resumo` (quando `scope=pr`) | `ExecutivePage` | Resumo sintetizado por soma de KPIs; não é linha da tabela_resumo. |
| `tabela_municipio` | `read_gold_table(..., scope="rmc")` | `resumo` (quando `scope=rmc`) | `ExecutivePage` | Resumo sintetizado por `_kpi_sums()` sobre municípios RMC. |
| `tabela_uf` | `_safe_top_rows("tabela_uf", ...)` | `rankings.uf` | `ExecutivePage` | Apenas quando `scope=br`; caso contrário `null`. |
| `tabela_municipio` | `_safe_top_rows("tabela_municipio", ...)` | `rankings.municipio` | `ExecutivePage` | Usa scope da requisição. |
| `tabela_setor` | `_safe_top_rows("tabela_setor", ...)` | `rankings.setor` | `ExecutivePage` | |
| `tabela_ocupacao` | `_safe_top_rows("tabela_ocupacao", ...)` | `rankings.ocupacao` | `ExecutivePage` | |
| `tabela_perfil_sexo` | `_safe_top_rows("tabela_perfil_sexo", ...)` | `profiles.sexo` | `ProfilesPage`, `SalaryPage` | Front acessa via `ov.profiles[GOLD_COLUMNS.SEXO]` (`"sexo"`). |
| `tabela_perfil_faixa_etaria` | `_safe_top_rows(...)` | `profiles.faixa_etaria` | `ProfilesPage`, `SalaryPage` | |
| `tabela_perfil_graudeinstrucao` | `_safe_top_rows(...)` | `profiles.graudeinstrucao` | `ProfilesPage`, `SalaryPage` | |
| `tabela_perfil_sexo_faixa_etaria` | `_safe_top_rows(...)` | `profiles.sexo_faixa_etaria` | `ProfilesPage` | Também buscada via `/table` para heatmap. |
| `tabela_perfil_sexo_instrucao` | `_safe_top_rows(...)` | `profiles.sexo_instrucao` | `ProfilesPage` | Idem. |
| `tabela_perfil_faixa_etaria_instrucao` | `_safe_top_rows(...)` | `profiles.faixa_etaria_instrucao` | `ProfilesPage` | Idem. |
| `tabela_perfil_sexo_salario` | `_safe_top_rows(...)` | `salary_profiles.sexo` | `SalaryPage` | Também via `/table`. |
| `tabela_perfil_faixa_etaria_salario` | `_safe_top_rows(...)` | `salary_profiles.faixa_etaria` | `SalaryPage` | |
| `tabela_perfil_graudeinstrucao_salario` | `_safe_top_rows(...)` | `salary_profiles.graudeinstrucao` | `SalaryPage` | |
| `tabela_perfil_sexo_faixa_etaria_salario` | `_safe_top_rows(...)` | `salary_profiles.sexo_faixa_etaria` | `SalaryPage` | |
| `tabela_perfil_sexo_instrucao_salario` | `_safe_top_rows(...)` | `salary_profiles.sexo_instrucao` | `SalaryPage` | |
| `tabela_perfil_faixa_etaria_instrucao_salario` | `_safe_top_rows(...)` | `salary_profiles.faixa_etaria_instrucao` | `SalaryPage` | |

**Chaves de `profiles` e `salary_profiles` na API** (strings literais em `routes_gold.py`): `sexo`, `faixa_etaria`, `graudeinstrucao`, `sexo_faixa_etaria`, `sexo_instrucao`, `faixa_etaria_instrucao`. O front-end usa `GOLD_COLUMNS.SEXO`, `GOLD_COLUMNS.FAIXA_ETARIA` e `GOLD_COLUMNS.GRAUDEINSTRUCAO` como chaves de acesso quando o valor da constante coincide com a chave da API (ex.: `"sexo"`).

---

## 8. Colunas Gold usadas pelo front-end

Fonte: `dashboard/src/api/goldColumns.ts` → `GOLD_COLUMNS`.

| Constante | Coluna real | Usada em | Tabelas onde deve existir | Observações |
|-----------|-------------|----------|---------------------------|-------------|
| `SALDO` | `saldo` | Todas páginas analíticas; `MovementSplit`, `BarRank`, `TerritoryMap`, `geoJoin`, `periodDelta`, heatmaps | Todas tabelas agregadas Gold | Métrica principal de ranking e coroplético do mapa. |
| `ADMISSOES` | `admissoes` | `ExecutivePage`, `MovementSplit`, `mapTooltip`, tooltips de heatmap | Todas tabelas agregadas | |
| `DESLIGAMENTOS` | `desligamentos` | Idem | Todas tabelas agregadas | |
| `COMPETENCIA` | `competencia` | **Não referenciada** em páginas/componentes TS | `tabela_resumo` (pipeline) | Constante definida; competência no UI vem de `/competencias` (`Competencia.competencia` em `types.ts`), não desta coluna Gold. |
| `UF` | `uf` | `ExecutivePage`, `TerritoryPage`, `TerritoryMap`, `geoJoin`, `mapTooltip` | `tabela_uf`, `tabela_municipio*` | Mapa BR usa `uf` como chave de join. |
| `MUNICIPIO` | `municipio` | `ExecutivePage`, `TerritoryPage`, `TerritoryMap`, `geoJoin`, `mapTooltip` | `tabela_municipio*` | Mapa PR/RMC usa `municipio` como chave. |
| `SECAO` | `secao` | `ExecutivePage`, `SectorPage`, `MovementSplit` | `tabela_setor*` | Coluna de setor econômico (não renomear para alias “setor”). |
| `CBO_OCUPACAO` | `cbo2002ocupacao` | `ExecutivePage`, `OccupationPage` | `tabela_ocupacao*` | Coluna de ocupação CBO 2002. |
| `SEXO` | `sexo` | `ProfilesPage`, `SalaryPage`, heatmaps | `tabela_perfil_sexo*`, cruzamentos de perfil, tabelas `*_salario*` | Também chave em `profiles` / `salary_profiles` do overview. |
| `FAIXA_ETARIA` | `faixa_etaria` | `ProfilesPage`, `SalaryPage`, `categoricalHeatmap.ts` | `tabela_perfil_faixa_etaria*`, cruzamentos, tabelas salariais | |
| `GRAUDEINSTRUCAO` | `graudeinstrucao` | `ProfilesPage`, `SalaryPage`, heatmaps | `tabela_perfil_graudeinstrucao*`, cruzamentos, tabelas salariais | |
| `MOVIMENTO` | `movimento` | `SalaryPage` e API salarial | Tabelas `*_salario` | `admissao` ou `desligamento`. |
| `SALARIO_MEDIO` | `salario_medio` | `SalaryPage` e tooltip dos heatmaps | Tabelas `*_salario` | Valor nominal. |
| `SALARIO_MEDIANO` | `salario_mediano` | `SalaryPage` e intensidade dos heatmaps | Tabelas `*_salario` | Valor nominal; `HEATMAP_VALUE_KEY`. |
| `SALARIO_P25` | `salario_p25` | Tooltips de heatmap (`HEATMAP_TOOLTIP_METRICS`) | Tabelas `*_salario` | |
| `SALARIO_P75` | `salario_p75` | Idem | Tabelas `*_salario` | |
| `SALARIO_MIN` | `salario_min` | Não exibido como indicador institucional | Tabelas `*_salario` | |
| `SALARIO_MAX` | `salario_max` | Não exibido como indicador institucional | Tabelas `*_salario` | |
| `N_SALARIOS_VALIDOS` | `n_salarios_validos` | Tooltips de heatmap | Tabelas `*_salario` | |

---

## 9. Contrato de movimentação

Função: `agregar_movimentacao(df, group_cols)` em `aggregate_indicators.py`.

**Padrão de colunas de saída:**

```
{dimensões de group_cols} + admissoes + desligamentos + saldo
```

Origem Silver → Gold:

| Coluna Gold | Origem Silver |
|-------------|---------------|
| `admissoes` | soma de `admissao` |
| `desligamentos` | soma de `desligamento` |
| `saldo` | soma de `saldomovimentacao` |

### Exemplos

| Tabela (base_name) | group_cols | Colunas resultantes |
|--------------------|------------|---------------------|
| `tabela_municipio` | `uf`, `municipio` | `uf`, `municipio`, `admissoes`, `desligamentos`, `saldo` |
| `tabela_setor` | `secao` | `secao`, `admissoes`, `desligamentos`, `saldo` |
| `tabela_ocupacao` | `cbo2002ocupacao` | `cbo2002ocupacao`, `admissoes`, `desligamentos`, `saldo` |
| `tabela_perfil_sexo_faixa_etaria` | `sexo`, `faixa_etaria` | `sexo`, `faixa_etaria`, `admissoes`, `desligamentos`, `saldo` |

**Exceção — `tabela_resumo`:** gerada manualmente (não via `agregar_movimentacao`); colunas: `competencia`, `admissoes`, `desligamentos`, `saldo`.

---

## 10. Contrato de salário

População: `eligible_salary_population(df, year, movement)` em `salary_eligibility.py`.

- movimentos separados pelo sinal de `saldomovimentacao`;
- `0,3 × salário mínimo <= salario <= 150 × salário mínimo`;
- exclusão de `indtrabintermitente == "Sim"`;
- sem reconversão de `salario` e sem filtro específico por unidade salarial;
- valores monetários nominais.

Agregação: `agregar_perfil_salario_institucional(df, ano, group_cols)` em `aggregate_indicators.py`.

**Padrão de colunas de saída:**

```
movimento
  + {dimensões de group_cols}
  + admissoes
  + desligamentos
  + saldo
  + n_salarios_validos
  + salario_medio
  + salario_mediano
  + salario_p25
  + salario_p75
  + salario_min
  + salario_max
```

`tabela_resumo_salario*` contém uma linha por movimento com `n_salarios_validos`, `salario_medio` e `salario_mediano`, calculados diretamente sobre o território.

### Exemplos

| Tabela (base_name) | Dimensões | Uso no front |
|--------------------|-----------|--------------|
| `tabela_perfil_sexo_salario` | `sexo` | `SalaryPage` — gráficos e overview `salary_profiles.sexo` |
| `tabela_perfil_faixa_etaria_salario` | `faixa_etaria` | `SalaryPage` |
| `tabela_perfil_graudeinstrucao_salario` | `graudeinstrucao` | `SalaryPage` |
| `tabela_perfil_sexo_faixa_etaria_salario` | `sexo`, `faixa_etaria` | `SalaryPage` — heatmap cruzado |

---

## 11. Contrato do `/overview`

Tipo TypeScript: `OverviewResponse` em `dashboard/src/api/types.ts`.

```typescript
{
  month: { ano: number; mes: number }
  scope: 'br' | 'pr' | 'rmc'
  resumo: GoldRow | null
  salary_summary: {
    movement: 'admissao' | 'desligamento'
    n: number | null
    mean: number | null
    median: number | null
  }
  rankings: {
    uf: GoldRow[] | null
    municipio: GoldRow[]
    setor: GoldRow[]
    ocupacao: GoldRow[]
  }
  profiles: Record<string, GoldRow[]>
  salary_profiles: Record<string, GoldRow[]>
}
```

### Semântica por campo

| Campo | Conteúdo | Origem na API |
|-------|----------|---------------|
| `month` | Competência resolvida | Parâmetros `ano`/`mes` ou defaults de config |
| `scope` | Recorte geográfico | Query `scope` |
| `resumo` | KPI `{ admissoes, desligamentos, saldo }` | `tabela_resumo` (br), soma UF PR (pr), soma municípios RMC (rmc) |
| `salary_summary` | N, média e mediana territoriais nominais do movimento solicitado | `tabela_resumo_salario*` |
| `rankings.uf` | Top UFs por saldo | `tabela_uf` — **somente `scope=br`** |
| `rankings.municipio` | Top municípios | `tabela_municipio` |
| `rankings.setor` | Top setores | `tabela_setor` |
| `rankings.ocupacao` | Top ocupações | `tabela_ocupacao` |
| `profiles.*` | Séries de perfil (movimentação) | Tabelas `tabela_perfil_*` sem sufixo salário |
| `salary_profiles.*` | Séries salariais do movimento solicitado | Tabelas `tabela_perfil_*_salario` |

**Contrato híbrido:** chaves como `rankings.uf`, `profiles.sexo` e `salary_profiles.sexo` são **campos da resposta JSON da API**, não colunas Gold literais. As linhas dentro desses arrays **são** registros Gold e devem conter as colunas documentadas nas seções 8–10.

Ordenação padrão em `_top_rows()`: `sort_by="saldo"` descendente; fallback automático se coluna ausente.

---

## 12. Pontos sensíveis

| Risco | Impacto |
|-------|---------|
| Renomear `saldo`, `admissoes` ou `desligamentos` | Quebra KPIs, rankings, mapa, deltas, `MovementSplit` e overview. |
| Renomear `secao` | Quebra `SectorPage` e ranking de setores no overview. |
| Renomear `cbo2002ocupacao` | Quebra `OccupationPage` e ranking de ocupações. |
| Renomear `municipio` ou `uf` | Quebra mapa territorial, join GeoJSON (`geoJoin.ts`) e rankings. |
| Renomear colunas salariais (`salario_medio`, etc.) | Quebra `SalaryPage`, heatmaps e tooltips. |
| Alterar sufixos `_pr` / `_rmc` | Quebra resolução de paths em `gold_service.py` e todos os `fetchTable` com scope. |
| Alterar ou remover `tabela_resumo` | Afeta listagem de competências, KPIs nacionais e readiness (`/ready`). |
| Editar manualmente `data-lake/` | Artefatos gerados pelo pipeline; sobrescritos na próxima execução. |
| `GoldRow = Record<string, unknown>` | Sem validação estática de colunas; erros de schema só aparecem em runtime. |
| Catálogo Gold existente mas não consumido pelo front | `GET /catalog` disponível; dashboard não valida schema em tempo de build. |
| Duplicação de listas de tabelas | `overview()`, `goldTables.ts`, `gold_contract.py` e testes podem divergir. |

---

## 13. Como atualizar este contrato

Atualize `DATA_CONTRACT.md` sempre que:

- uma nova tabela Gold for criada ou removida;
- uma coluna Gold for renomeada ou adicionada;
- uma página passar a consumir dados Gold;
- um endpoint Gold mudar parâmetros ou shape de resposta;
- `goldTables.ts` ou `goldColumns.ts` forem alterados;
- `/overview` mudar chaves ou tabelas internas.

### Checklist

1. Atualizar pipeline Gold (`aggregate_indicators.py`), se necessário.
2. Atualizar `goldTables.ts`, se nova tabela for usada via `/table`.
3. Atualizar `goldColumns.ts`, se nova coluna for lida no front-end.
4. Atualizar `types.ts`, se shape da API mudar.
5. Atualizar **`docs/DATA_CONTRACT.md`** (este arquivo).
6. Rodar `npm run build` no dashboard.
7. Rodar testes Python (`pytest`).
8. Regenerar catálogo Gold se schema mudou: `python -m pipelines.jobs.build_gold_catalog` ou pipeline com `--build-catalog`.
9. *(Etapa futura)* Atualizar testes de contrato em `tests/test_gold_frontend_contract.py`.

---

## 14. Lacunas conhecidas

- **Sem testes formais** que validem todas as colunas usadas pelo front-end contra o schema Gold.
- **`goldTables.ts` incompleto** em relação ao `/overview` — não lista `tabela_resumo`, `tabela_perfil_sexo`, `tabela_perfil_faixa_etaria`, `tabela_perfil_graudeinstrucao`.
- **`GoldRow` genérico** — `Record<string, unknown>` em `types.ts`; sem tipos por tabela.
- **`/api/gold/v1/catalog` não consumido** programaticamente pelo dashboard (`gold.ts` não expõe cliente).
- **`/api/gold/v1/meta` não consumido** pelo dashboard.
- **Catálogo depende do data-lake** — `gold_catalog.json` em `data-lake/catalog/` (gitignored); geração via `write_gold_catalog()` em `gold_catalog_service.py`.
- **Sem geração automática** de tipos TypeScript a partir do catálogo.
- **Sem testes front-end** — `dashboard/package.json` não define script `test`.
- **`GOLD_COLUMNS.COMPETENCIA`** definida sem uso no código de páginas/componentes.
- **`gold_contract.py`** cobre apenas 11 tabelas mínimas; pipeline gera 47 nomes físicos (`CURRENT_PIPELINE_TABLES`).

---

## 15. Próxima etapa recomendada

**Etapa 2B:** criar testes mínimos de contrato, provavelmente em:

```
tests/test_gold_frontend_contract.py
```

Esses testes devem validar que as tabelas referenciadas por `GOLD_TABLES` / consumo via `/overview` possuem as **colunas mínimas esperadas** documentadas neste arquivo, preferencialmente usando **DataFrames sintéticos** (padrão já usado em `tests/test_gold_table_read.py`) para **não depender obrigatoriamente** do data-lake completo em CI.

Possível evolução posterior (Etapa 2C): cruzar contrato com snapshot de `gold_catalog.json` versionado em `tests/fixtures/`.
