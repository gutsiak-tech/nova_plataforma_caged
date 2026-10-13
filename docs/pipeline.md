# Pipeline mensal CAGED

O caminho real da publicação mensal é:

```
microdados.txt
    → Bronze
    → Silver
    → staging mensal
        Gold territorial
        + staging/feature/
    → validação
    → um rename
    → current (mes=NN) / previous (mes=NN.__previous__)
    → API
```

A rotina operacional recomendada é:

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

Ela valida a Bronze, executa Bronze+Silver, roda o pipeline completo com catálogo e validação de catálogo, valida a Gold já publicada e, se a API estiver no ar, chama o smoke test.

O comando Python equivalente, quando se quer uma passagem só:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog
```

Isso faz Bronze, Silver, o snapshot único (território e Feature) e o catálogo. Os pipelines mutáveis exigem `--ano` e `--mes`. O override `DEFAULT_ANO` / `DEFAULT_MES` da API não dispara reprocessamento.

Não há flag para gerar somente a Gold a partir da Silver. `--validate-gold-only` não agrega de novo: confere os arquivos que já estão na pasta e regrava `metadata.json` no canônico.

Smoke test separado (API ativa):

```powershell
.\scripts\smoke_api.ps1 -Ano YYYY -Mes MM
```

Publicação, previous e falha: [`runbook_operacional.md`](runbook_operacional.md). Transferência: [`handoff_institucional.md`](handoff_institucional.md).

---

## Feature avulsa

Não é a publicação mensal. Tem commit próprio de `feature/` e não altera `published_at` da Gold territorial. A base territorial da competência precisa existir, e a Silver também.

```powershell
python -m pipelines.gold.aggregate_feature_indicators --ano YYYY --mes MM
```

`--all` percorre competências Silver que já tenham Gold de base. Use para manutenção. O mês novo deve sair de `monthly_run.ps1` ou de `run_monthly_pipeline`, que colocam a Feature dentro do staging territorial.

---

## Validar apenas Bronze

Valida `microdados.txt`, grava `metadata.json` e interrompe se houver erro crítico. Não gera Silver nem Gold.

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-bronze-only
```

O metadata registra SHA256, colunas, competência e `validation_status` (`ok`, `warning` ou `error`). `warning` segue. `error` para.

## Validar Bronze + Silver

Executa Bronze e Silver, grava `caged_tratado.parquet` e o metadata da Silver. Não publica Gold.

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-silver-only
```

`validation_status=error` na Bronze bloqueia a Silver. Metadata Bronze ausente gera warning e a Silver segue.

## Validar Gold existente

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-gold-only
```

Confere tabelas obrigatórias, pares CSV/Parquet onde o contrato exige os dois, `tabela_resumo` e totais. Com `--build-catalog`, regenera o catálogo depois. Não reconstrói as tabelas.

## Pipeline sem regenerar o catálogo

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM
```

Bronze, Silver e o snapshot Gold+Feature. O catálogo antigo permanece até um `--build-catalog` ou `--catalog-only`.

## Somente catálogo

Não toca Bronze, Silver nem Gold. Lê a Gold já publicada e reescreve:

- `data-lake/catalog/gold_catalog.json`
- `data-lake/catalog/gold_catalog.csv`
- `docs/gold_catalog.md`

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
python -m pipelines.jobs.build_gold_catalog
```

Com validação de uma competência:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano YYYY --mes MM
```

`--catalog-only` ignora `--build-catalog` se os dois vierem juntos. `--validate-catalog` no pipeline completo só age junto de `--build-catalog`. Sem isso, é ignorado.

A validação leve confere se a competência está no catálogo, se há `tabela_resumo`, se não há legado suspeito e se os pares CSV/Parquet do que o catálogo indexa estão coerentes. Erro crítico interrompe. Aviso fica no log.

O catálogo é um arquivo ao lado do snapshot, não uma pasta dentro de `mes=NN`.

---

## Quando usar cada comando

| Cenário | Comando |
|---|---|
| Mês novo, rotina completa | `.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM` |
| A mesma rotina num comando Python | `--ano YYYY --mes MM --build-catalog --validate-catalog` |
| Só publicar, catálogo depois | `--ano YYYY --mes MM` |
| Auditar o TXT antes | `--ano YYYY --mes MM --validate-bronze-only` |
| Bronze + Silver, sem Gold | `--ano YYYY --mes MM --validate-silver-only` |
| Conferir Gold já gravada | `--ano YYYY --mes MM --validate-gold-only` |
| Gold pronta, só catálogo | `--catalog-only` |
| Catálogo e validar um mês | `--catalog-only --validate-catalog --ano YYYY --mes MM` |
| Republicar só a Feature | `python -m pipelines.gold.aggregate_feature_indicators --ano YYYY --mes MM` |

## Consulta

```text
GET /api/gold/v1/catalog
GET /api/gold/v1/competencias
```

`/competencias` lista pastas Gold válidas. `/catalog` lê o JSON. Os dois podem divergir até o catálogo ser regenerado.

A API prefere Parquet e usa CSV se o Parquet não existir ou não puder ser lido. `tabela_municipio_ocupacao` é só Parquet.
