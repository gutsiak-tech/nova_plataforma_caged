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
  → Bronze → Silver
  → staging mensal (Gold territorial + feature/)
  → um rename para data-lake/gold/caged/ano=*/mes=*/
  → app/services/gold_service.py e feature_gold_service.py (Parquet primeiro, CSV se o Parquet faltar)
  → /api/gold/v1 (overview, table, feature)
  → dashboard: /territorial e, no shell antigo, as páginas em pages/*.tsx
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
| `app/services/gold_catalog_service.py` | `CURRENT_PIPELINE_TABLES`: tabelas territoriais com sufixos e os nomes de `FEATURE_GOLD_TABLE_NAMES`. Gera e valida o catálogo. | O JSON fica em `data-lake/catalog/` (gitignored) e fora do snapshot do mês. O front não busca `/catalog` para desenhar a tela. |
| `app/api/routes_gold.py` | Contrato HTTP: endpoints, shape de `/overview`, lista hardcoded de tabelas internas. | Duplica lista de tabelas sem vínculo automático com `goldTables.ts`. |
| `app/services/gold_service.py` | Resolução `base_name` + scope → `{base_name}{suffix}.parquet` com fallback CSV; `BR_ONLY_TABLES`. Competência válida: metadata com `validation_status` `ok` ou `warning` e tabelas mínimas, entre elas `tabela_resumo`. | Não valida colunas mínimas por tabela na leitura. |
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

**Competência válida:** `inspect_gold_competencia_dir` exige metadata legível com `validation_status` `ok` ou `warning` e os arquivos mínimos (`tabela_resumo` entre eles), em CSV ou Parquet. A API prefere Parquet.

---

## 5. Endpoints Gold usados pelo dashboard

Prefixo do router: `/api/gold/v1` (`app/api/routes_gold.py`).

| Endpoint | Handler | Consumido pelo front-end? | Arquivo front-end | Observações |
|----------|---------|---------------------------|-------------------|-------------|
| `GET /api/gold/v1/competencias` | `competencias()` | **Sim** | `dashboard/src/api/gold.ts` → `fetchCompetencias()`; `MonthContext` | Lista competências Gold válidas. O `default` segue o override ou a mais recente. |
| `GET /api/gold/v1/overview` | `overview()` | **Sim** | `gold.ts` → `fetchOverview()`; experiência territorial e páginas legadas (`ExecutivePage`, `ProfilesPage`, `SalaryPage`) | Params: `scope`, `ano`, `mes`, `movimento`. Resposta pode vir do response cache. |
| `GET /api/gold/v1/table/{base_name}` | `table()` | **Sim** | `gold.ts` → `fetchTable()`; detalhe territorial e páginas legadas | Params: `scope`, `ano`, `mes`, `limit`, `offset`, `sort_by`, `sort_dir`. Default API `limit=50`; front usa `limit=2000` por padrão. |
| `GET /api/gold/v1/feature/uf/{uf_sigla}` | `feature_uf()` | **Sim** | `dashboard/src/api/featureFocus.ts` quando o escopo é Brasil | Sigla de 2 letras. Params: `ano`, `mes`, `movimento`, `limit`. |
| `GET /api/gold/v1/feature/municipality/{cod_municipio}` | `feature_municipality()` | **Sim** | `featureFocus.ts` em Paraná e RMC | Código IBGE de 7 dígitos. Mesmos parâmetros. |
| `GET /api/gold/v1/catalog` | `catalog()` | **Não** (programaticamente) | Mencionado em texto em `AboutDataPage.tsx` | Lê `data-lake/catalog/gold_catalog.json`, fora do snapshot do mês. Erros: `GOLD_CATALOG_NOT_FOUND`, `GOLD_CATALOG_UNREADABLE`. |
| `GET /api/gold/v1/meta` | `meta()` | **Não** | não há cliente no dashboard | Lista CSV na raiz de `mes=NN`. Não entra no diretório `feature/`. |

**Códigos de erro estruturados** (`app/api/errors.py` → `GoldAPIError`): incluem `INVALID_SCOPE`, `INVALID_COMPETENCIA`, `GOLD_COMPETENCIA_NOT_FOUND`, `GOLD_TABLE_NOT_FOUND`, `GOLD_CATALOG_NOT_FOUND`, `FEATURE_NOT_FOUND`, `INVALID_FEATURE_ID`, entre outros.

### Feature Gold

Contrato em `pipelines/gold/feature_contract.py`. São 12 Parquets de serviço. Onze também têm CSV. `tabela_municipio_ocupacao` é só Parquet.

Nomes: `tabela_uf_salario`, `tabela_uf_setor`, `tabela_uf_ocupacao`, `tabela_uf_perfil_sexo`, `tabela_uf_perfil_faixa_etaria`, `tabela_uf_perfil_graudeinstrucao`, `tabela_municipio_salario`, `tabela_municipio_setor`, `tabela_municipio_perfil_sexo`, `tabela_municipio_perfil_faixa_etaria`, `tabela_municipio_perfil_graudeinstrucao`, `tabela_municipio_ocupacao`.

Dois layouts convivem:

- **Flat.** Os Parquets estão na raiz de `mes=NN`. O leitor usa a raiz quando não existem `feature/` nem `feature.__previous__/`. Janeiro a junho de 2026 estão nesse layout.
- **`feature/`.** A publicação mensal atual grava a Feature dentro do snapshot. Se `feature/` ou `feature.__previous__/` existe, a raiz deixa de ser fonte. A ordem de leitura é `feature/` válido, depois `feature.__previous__/`.

A identidade geográfica da Feature vem de `data-lake/gold/geo/dim_uf.parquet` e `dim_municipio.parquet`, dimensão global, não de uma pasta dentro do mês.

O cliente `fetchFeatureFocus` espera um JSON com `identity`, `period`, `kpis` (`admissoes`, `desligamentos`, `saldo`), `salary`, `sectors`, `occupations`, `profiles`, `timeseries` e `comparison`. Implementação: `app/api/routes_feature.py` e `app/services/feature_gold_service.py`.

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
8. Regenerar catálogo Gold se o schema mudou: `python -m pipelines.jobs.build_gold_catalog` ou pipeline com `--build-catalog`.
9. Atualizar `tests/test_gold_frontend_contract.py` e os testes Vitest do dashboard quando o contrato de tela mudar. Os dois já existem.

---

## 14. Lacunas e limites conhecidos

O que já existe:

- Testes de contrato em `tests/test_gold_frontend_contract.py`. Eles conferem tabelas, colunas e termos deste arquivo contra o código, sem depender do data-lake populado. Não comparam cada coluna com um Parquet real.
- Testes de frontend com Vitest. `dashboard/package.json` define `npm test` (`vitest run`), inclusive `dashboard/src/api/featureFocus.test.ts`.
- Feature Gold e os dois layouts (flat e `feature/`), descritos na seção 5.

Limites do desenho, não defeitos da tela atual:

- **`goldTables.ts` não lista** tabelas lidas só pelo `/overview`: `tabela_resumo`, `tabela_perfil_sexo`, `tabela_perfil_faixa_etaria`, `tabela_perfil_graudeinstrucao`.
- **`GoldRow` genérico** — `Record<string, unknown>` em `types.ts`.
- **`/api/gold/v1/catalog` não é buscado** pelo dashboard (`gold.ts` não expõe cliente). O arquivo fica em `data-lake/catalog/`, fora do snapshot mensal.
- **`/api/gold/v1/meta` não é buscado** pelo dashboard e não desce em `feature/`.
- **`gold/geo` é dimensão global**, compartilhada pelas competências.
- A publicação mensal leva território e Feature juntos. A Feature avulsa (`aggregate_feature_indicators`) tem commit próprio.
- Não há lock entre dois publishers simultâneos. O cache da API é local ao processo.
- Meses já publicados em layout flat, como janeiro–junho de 2026, não trazem `published_at` nem `feature_generated_at`.
- **`GOLD_COLUMNS.COMPETENCIA`** está definida e não é a chave que as páginas usam para escolher o mês. O mês vem de `MonthContext`.
- **`gold_contract.py`** lista as tabelas territoriais mínimas. `CURRENT_PIPELINE_TABLES` acrescenta perfis, salários e os nomes de Feature. Não há um tamanho fixo de “50 tabelas” como contrato do produto.
- Não há geração automática de tipos TypeScript a partir do catálogo.

---

## 15. Manutenção deste contrato

Os testes de contrato e o Vitest já cobrem o alinhamento estático. Ao mudar schema ou endpoint, atualize este arquivo e rode:

```powershell
python -m pytest tests/test_gold_frontend_contract.py -q
cd dashboard
npm test
```

Evoluções ainda em aberto: o dashboard buscar `/catalog`, tipos por tabela no lugar de `GoldRow`, e um snapshot de catálogo versionado em `tests/fixtures/` se a equipe quiser travar o schema no CI.
