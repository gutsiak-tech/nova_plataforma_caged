# Pipeline mensal CAGED

Este documento descreve como executar o pipeline Bronze → Silver → Gold e, opcionalmente, regenerar o catálogo formal da camada Gold.

## Rotina automatizada (recomendada)

```powershell
.\scripts\monthly_run.ps1 -Ano 2026 -Mes 3
```

Smoke test separado (API deve estar ativa):

```powershell
.\scripts\smoke_api.ps1 -Ano 2026 -Mes 2
```

Detalhes operacionais: [`runbook_operacional.md`](runbook_operacional.md).

## Pipeline mensal (padrão)

Executa ingestão, limpeza e agregação Gold para a competência informada:

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2
```

Sem flags adicionais: **Bronze (validação + metadata) → Silver → Gold**.

Use quando for processar uma competência nova ou reprocessar Bronze/Silver/Gold.

## Validar apenas Bronze (sem Silver/Gold)

Valida `microdados.txt`, grava `metadata.json` e interrompe se houver erro crítico:

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 3 --validate-bronze-only
```

Use após colocar o arquivo bruto na pasta Bronze e **antes** do processamento mensal.

O `metadata.json` registra SHA256, colunas, competência, `validation_status` (`ok` / `warning` / `error`), `warnings` e `errors`.

## Validar Bronze + Silver (sem Gold)

Executa Bronze, processa Silver, valida qualidade e grava `metadata.json` na Silver — sem Gold nem catálogo:

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --validate-silver-only
```

A Silver verifica colunas críticas, competência, coerência admissão/desligamento e consulta o metadata Bronze (`error` bloqueia; ausência gera warning).

## Validar apenas Gold (sem Bronze/Silver)

Valida artefatos Gold já gerados e grava `metadata.json` na competência:

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --validate-gold-only
```

Verifica tabelas obrigatórias, pares CSV/Parquet, `tabela_resumo` e coerência de totais. Com `--build-catalog`, regenera o catálogo após a validação.

## Pipeline mensal com catálogo Gold

Após processar a competência, regenera os artefatos do catálogo:

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --build-catalog
```

Use após um processamento completo quando quiser atualizar o catálogo na mesma execução.

## Pipeline mensal com catálogo e validação leve

```bash
python -m pipelines.jobs.run_monthly_pipeline --ano 2026 --mes 2 --build-catalog --validate-catalog
```

Executa **Bronze → Silver → Gold → Build Catalog → Validate Catalog**.

## Somente catálogo (sem reprocessar dados)

Regenera o catálogo a partir da Gold existente, sem tocar em Bronze/Silver/Gold:

```bash
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
```

Com validação para uma competência específica:

```bash
python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano 2026 --mes 2
```

Executa **Build Catalog → Validate Catalog** para `2026-02`.

Use após limpezas manuais, auditorias ou quando a Gold já está atualizada e só o catálogo precisa ser regenerado.

> `--catalog-only` é modo exclusivo: `--build-catalog` é ignorado se usado junto.
> `--validate-catalog` sem `--build-catalog` e sem `--catalog-only` continua ignorado no pipeline mensal.

## Quando usar cada comando

| Cenário | Comando |
|---|---|
| Validar microdados antes do processamento | `--ano YYYY --mes M --validate-bronze-only` |
| Validar Bronze + Silver sem Gold | `--ano YYYY --mes M --validate-silver-only` |
| Validar artefatos Gold existentes | `--ano YYYY --mes M --validate-gold-only` |
| Processar competência nova | `--ano YYYY --mes M` |
| Processar + atualizar catálogo | `--ano YYYY --mes M --build-catalog` |
| Processar + catálogo + validação | `--ano YYYY --mes M --build-catalog --validate-catalog` |
| Gold já pronta, só atualizar catálogo | `--catalog-only` |
| Catálogo + validar uma competência | `--catalog-only --validate-catalog --ano YYYY --mes M` |
| Equivalente legado ao catalog-only | `python -m pipelines.jobs.build_gold_catalog` |

## Validação leve do catálogo

A validação verifica:

- se a competência processada aparece no catálogo;
- se existe `tabela_resumo` para essa competência;
- se `suspected_legacy_count` é zero (warning se > 0);
- se há CSV sem Parquet ou Parquet sem CSV (warning).

Problemas críticos interrompem o job com erro claro. Avisos leves são apenas registrados em log.

## Job isolado de catálogo

```bash
python -m pipelines.jobs.build_gold_catalog
```

Equivalente funcional a `--catalog-only`, disponível como módulo dedicado.

## Consulta via API

O catálogo gerado pode ser consultado em:

```text
GET /api/gold/v1/catalog
GET /api/gold/v1/catalog?ano=2026&mes=2
```

Veja também `docs/gold_catalog.md` para a documentação humana da camada Gold.

A API FastAPI **prefere ler artefatos Parquet** da Gold (`pd.read_parquet`) e usa **CSV como fallback** se o Parquet estiver ausente ou ilegível. O pipeline continua gerando CSV + Parquet; os contratos JSON dos endpoints permanecem iguais.
