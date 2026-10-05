# Documento de entrega institucional — CAGED Dashboard

Este documento orienta a **universidade receptora** na instalação, operação, atualização mensal e manutenção do sistema CAGED Dashboard.

Documentação técnica complementar:

- [`README.md`](../README.md) — visão geral e referência rápida
- [`handoff_institucional.md`](handoff_institucional.md) — guia de handoff e primeira execução
- [`checklist_handoff.md`](checklist_handoff.md) — checklist de recepção institucional
- [`runbook_operacional.md`](runbook_operacional.md) — rotina mensal e diagnóstico
- [`pipeline.md`](pipeline.md) — detalhes do pipeline e flags de catálogo
- [`gold_catalog.md`](gold_catalog.md) — catálogo formal da camada Gold
- [`../scripts/start_stack.ps1`](../scripts/start_stack.ps1) — inicia API e dashboard localmente

---

## 1. Objetivo da entrega

O **CAGED Dashboard** é entregue como um **sistema analítico completo** para consulta de dados do **Novo CAGED** (movimentação de emprego formal no Brasil). O pacote inclui:

- um **pipeline de dados** em arquitetura Medallion (Bronze → Silver → Gold);
- uma **API REST** (FastAPI) que expõe indicadores e tabelas da camada Gold;
- um **dashboard web** (React) para visualização interativa;
- um **catálogo formal** das tabelas Gold, com metadados e validações;
- **testes automatizados** e documentação operacional.

A implementação atual é **local**, com Python/pandas e arquivos no filesystem. **Não utiliza Databricks, Spark ou Delta Lake** nesta versão.

---

## 2. Componentes entregues

| Componente | Descrição | Localização principal |
|---|---|---|
| Pipeline de dados | Orquestra Bronze, Silver e Gold | `pipelines/` |
| Camada Bronze | Ingestão de microdados brutos | `data-lake/bronze/caged/` |
| Camada Silver | Limpeza e padronização | `data-lake/silver/caged/` |
| Camada Gold | Indicadores analíticos (CSV + Parquet) | `data-lake/gold/caged/` |
| API FastAPI | Leitura da Gold, competências e catálogo | `app/` |
| Dashboard React | Interface analítica | `dashboard/` |
| Catálogo Gold | Metadados das tabelas | `data-lake/catalog/`, `docs/gold_catalog.md` |
| Documentação | README, pipeline, catálogo, este documento | `docs/`, `README.md` |
| Testes automatizados | Validação de pipeline, API e catálogo | `tests/` |

---

## 3. O que a universidade precisa para operar

### Ambiente de software

- **Python 3** com ambiente virtual (dependências em `requirements.txt` e `requirements-dev.txt`)
- **Node.js** e **npm** (dependências em `dashboard/package.json`)
- Editor de texto e terminal (PowerShell no Windows, ou equivalente em Linux/macOS)

### Dados

- Arquivos mensais do **Novo CAGED**, em especial `microdados.txt`, obtidos da fonte oficial
- Estrutura Bronze esperada (ver seção 4)

### Configuração

1. Copiar `.env.example` para `.env`
2. Preencher `DEFAULT_ANO`, `DEFAULT_MES` e `DEFAULT_UF`
3. Variáveis `POSTGRES_*` são opcionais (apenas para mapas/PostGIS, estágio separado)

### Procedimento mensal

Após a configuração inicial, a rotina principal é: **obter microdados → rodar pipeline → subir API e dashboard → validar competência**.

---

## 4. Procedimento mensal recomendado

### Passo a passo

**1.** Baixar ou obter o arquivo `microdados.txt` do Novo CAGED para a competência desejada (ano/mês).

**2.** Colocar o arquivo na pasta Bronze:

```text
data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt
```

Exemplo para março de 2026:

```text
data-lake/bronze/caged/ano=2026/mes=03/microdados.txt
```

Opcional: incluir `dicionario.pdf` na mesma pasta.

**2b.** (Recomendado) Validar a Bronze antes do processamento completo:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-bronze-only
```

Confira `metadata.json` na mesma pasta (`validation_status`, `file_sha256`, `warnings`, `errors`).

**2c.** (Opcional) Validar Bronze + Silver sem Gold:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-silver-only
```

Confira `data-lake/silver/caged/ano=YYYY/mes=MM/metadata.json` (`validation_status`, `admissao_sum`, `saldo_consistency_ok`).

**2d.** (Opcional) Validar artefatos Gold sem reprocessar:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-gold-only
```

Confira `data-lake/gold/caged/ano=YYYY/mes=MM/metadata.json` (`required_tables_ok`, `totals_consistency_ok`).

**3.** (Recomendado) Executar a rotina automatizada:

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

Equivalente aos passos 2b–2d + pipeline + smoke test. Ver [`runbook_operacional.md`](runbook_operacional.md).

**4.** (Alternativa manual) Executar o pipeline com geração e validação do catálogo:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog
```

Exemplo:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 3 --build-catalog --validate-catalog
```

**5.** Subir a API (em um terminal):

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**6.** Subir o dashboard (em outro terminal):

```powershell
cd dashboard
npm run dev
```

**7.** Verificar `GET /ready` na API antes de apresentar o dashboard.

**8.** Abrir o dashboard no navegador (geralmente `http://localhost:5173/`) e verificar se a nova competência aparece no seletor.

### Quando usar `--catalog-only`

Se a camada Gold já existir e apenas o catálogo precisar ser atualizado (ex.: após limpeza de artefatos legados):

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano 2026 --mes 3
```

Este modo **não** executa Bronze, Silver ou Gold.

---

## 5. Como validar se deu certo

### Pipeline

- Saída do comando sem erros críticos
- Log em `logs/pipeline.log` com mensagem de conclusão
- Validação do catálogo sem erros críticos (warnings leves podem aparecer no log)

### Camadas de dados

| Camada | O que verificar |
|---|---|
| Silver | `data-lake/silver/caged/ano=YYYY/mes=MM/caged_tratado.parquet` existe |
| Gold | `data-lake/gold/caged/ano=YYYY/mes=MM/` com 47 CSV + 47 Parquet + 1 Excel |
| Catálogo | `data-lake/catalog/gold_catalog.json` atualizado (`generated_at` recente) |

A API **prefere Parquet** na leitura das tabelas Gold e mantém **CSV como fallback** e formato institucional legível. Os endpoints e respostas JSON não mudam.

### API

```text
GET http://127.0.0.1:8000/health
GET http://127.0.0.1:8000/ready
GET http://127.0.0.1:8000/api/gold/v1/competencias
GET http://127.0.0.1:8000/api/gold/v1/overview?scope=br&ano=YYYY&mes=MM
GET http://127.0.0.1:8000/api/gold/v1/catalog?ano=YYYY&mes=MM
```

- **`/health`** — API viva; não exige `data-lake`.
- **`/ready`** — prontidão operacional (Gold, competências, catálogo). Use **antes de demonstrações**; **503** lista `problems` se algo faltar.

Competência inexistente nos endpoints Gold retorna erro estruturado com `error.code` (ex.: `GOLD_COMPETENCIA_NOT_FOUND`).

A nova competência deve aparecer em `/competencias` e retornar dados em `/overview`.

### Dashboard

- Seletor de competência exibe a nova entrada (ex.: `jan`, `fev`, `mar`)
- KPIs e gráficos carregam sem erro no console do navegador
- Nenhum erro 404/500 nas chamadas `/api/gold/v1/*`

---

## 6. Rotina de testes

```powershell
python -m pytest tests/ -v
```

No estado atual, a suíte possui **128 testes** automatizados.

### Quando executar

| Momento | Motivo |
|---|---|
| Antes de colocar em uso / deploy | Confirmar integridade do pacote |
| Depois de alterações no pipeline | Evitar regressão em Silver/Gold |
| Depois de alterações na API | Validar contratos dos endpoints |
| Depois de limpeza ou manutenção na Gold | Garantir que catálogo e rotas continuam corretos |
| Após atualizar dependências Python | Detectar incompatibilidades |

Os testes **não** substituem a validação com microdados reais; complementam com fixtures controladas.

---

## 7. Cuidados importantes

- **Não editar** arquivos da camada Gold manualmente — use o pipeline para regenerar
- **Não versionar** `data-lake/` (dados locais, listados no `.gitignore`)
- **Não versionar** `.env` (credenciais e configuração local)
- **Manter** `.env.example` atualizado quando novas variáveis forem adicionadas
- **Manter** `README.md` e `docs/` alinhados após mudanças operacionais
- **Regenerar o catálogo** após qualquer alteração na Gold (`--build-catalog` ou `--catalog-only`)
- **Preferir** `pipelines/` e `pipelines/common/` em vez de `src/` (código legado)
- **Consultar** `docs/gold_catalog.md` para entender escopos (`brasil`, `parana`, `rmc`) e granularidades

---

## 8. Limitações da versão atual

- Arquitetura **local com pandas**; performance depende da máquina e do tamanho dos microdados
- **Não usa Databricks/Spark/Delta Lake** — migração futura possível, mas não implementada
- **Mapas geográficos** (PostGIS/Tegola) em estágio separado; o dashboard usa placeholder para mapas
- O pipeline Bronze **não baixa** microdados automaticamente — a universidade deve obter os arquivos da fonte oficial
- O catálogo pode **ficar desatualizado** se não for regenerado após mudanças na Gold
- A competência selecionada no dashboard **não persiste** entre reloads da página
- **Deploy institucional** (servidor, domínio, HTTPS, backup) ainda precisa ser definido pela universidade

---

## 9. Evoluções recomendadas

Prioridades sugeridas para a universidade, após a recepção:

1. **CI/CD** — executar `pytest` e `npm run build` automaticamente em cada alteração
2. **Deploy em servidor institucional** — API e dashboard acessíveis na rede da universidade
3. **Página “Sobre os dados”** — consumir `/api/gold/v1/catalog` no dashboard
4. **Persistência da competência** — `localStorage` ou parâmetro na URL (`?ano=&mes=`)
5. **Deep-link por ano/mês** — compartilhar links diretos para uma competência
6. **Automação de ingestão** — script para download periódico do CAGED (se a fonte permitir)
7. **Diff de catálogo** — comparar execuções para auditoria de schema
8. **Futuro:** migração para Databricks/Spark/Delta Lake, se o volume ou a governança institucional exigir

---

## 10. Checklist de entrega

Checklist detalhado de handoff: [`checklist_handoff.md`](checklist_handoff.md).

Use também este resumo na recepção e antes de colocar o sistema em operação:

- [ ] `README.md` atualizado
- [ ] `.env.example` presente
- [ ] `requirements.txt` presente
- [ ] `requirements-dev.txt` presente
- [ ] `docs/pipeline.md` presente
- [ ] `docs/gold_catalog.md` presente
- [ ] `docs/entrega_institucional.md` presente
- [ ] Testes passando (`python -m pytest tests/ -v`)
- [ ] API rodando (`/health` retorna 200; `/ready` retorna 200 quando Gold e catálogo existem)
- [ ] Dashboard rodando (página carrega sem erro)
- [ ] Pipeline documentado e executável
- [ ] Catálogo documentado e regenerável
- [ ] Microdados Bronze disponíveis para pelo menos uma competência
- [ ] Gold processada para competências de demonstração
- [ ] Responsável institucional designado para manutenção mensal

---

## Contato e manutenção

Recomenda-se que a universidade designe um **responsável técnico** (equipe de TI, laboratório ou projeto de pesquisa) para:

- executar o procedimento mensal da seção 4;
- acompanhar logs em `logs/pipeline.log`;
- manter o ambiente Python e Node atualizados;
- reportar problemas e evoluções conforme a seção 9.

Para referência rápida de comandos, consulte o [`README.md`](../README.md).
