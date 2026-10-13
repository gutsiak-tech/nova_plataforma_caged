# Runbook operacional — CAGED Dashboard

Atualização mensal, publicação, cache e diagnóstico. O fluxo principal é o snapshot atômico descrito em [`handoff_institucional.md`](handoff_institucional.md) e [`pipeline.md`](pipeline.md).

---

## 1. Objetivo

Cada competência nova deve:

1. entrar como `microdados.txt` na Bronze
2. virar Silver
3. ser publicada num snapshot único: Gold territorial e Feature
4. aparecer como `mes=NN`, com a geração anterior em `mes=NN.__previous__` quando já existia um canônico
5. ser lida pela API depois do restart do processo
6. aparecer no dashboard

Rotina recomendada: [`scripts/monthly_run.ps1`](../scripts/monthly_run.ps1).

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

---

## 2. Passos

1. Colocar o arquivo em `data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt`.
2. Rodar `monthly_run.ps1` na raiz do projeto.
3. Se a API estava ligada durante o job, **reiniciar o uvicorn**. Esse é o procedimento operacional atual. O cache não observa a pasta sozinho depois do warm inicial.
4. Subir de novo API e dashboard (`.\scripts\start_stack.ps1`, ou uvicorn em `127.0.0.1:8000` e `npm run dev`).
5. Conferir `GET /ready` e o mês no seletor, inclusive um Feature Focus.

Smoke avulso, com a API no ar:

```powershell
.\scripts\smoke_api.ps1 -Ano YYYY -Mes MM
```

### Comandos manuais

| Etapa | Comando |
|---|---|
| Validar Bronze | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-bronze-only` |
| Validar Silver | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-silver-only` |
| Publicar snapshot + catálogo | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog` |
| Validar Gold já gravada | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-gold-only` |
| Só catálogo | `python -m pipelines.jobs.run_monthly_pipeline --catalog-only` |
| Catálogo validando um mês | `python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano YYYY --mes MM` |

`--validate-gold-only` não reconstrói tabelas.

---

## 3. Current, previous, staging e retiring

Em repouso, o mês publicado é `data-lake/gold/caged/ano=YYYY/mes=NN`. Se já houve uma republicação, pode existir `mes=NN.__previous__` com a geração anterior.

Durante o job existe um staging (`.mes=NN.staging-...`) e, no instante do swap, `.mes=NN.retiring`. A API não lista staging nem retiring como competência. Ela lê o canônico. Se o canônico não for uma Gold válida, usa a previous válida.

O commit é o rename do staging para `mes=NN`. `published_at` é gravado no metadata imediatamente antes. `feature_generated_at` é gravado no relatório da Feature ainda no staging. Os meses janeiro–junho de 2026 que já estão no disco foram publicados no layout flat e não têm esses dois campos. Uma publicação nova com este código passa a tê-los e a colocar a Feature em `feature/`.

O catálogo não entra nesse rename. `write_gold_catalog` grava `data-lake/catalog/` e `docs/gold_catalog.md` à parte. Gold nova com catálogo velho é um estado possível se o job morre depois do rename e antes do catálogo.

---

## 4. O que acontece se falhar

- Erro de Bronze ou Silver: o comando para. O canônico daquele mês não é substituído.
- Erro ao montar o staging, ou Feature que não sela: o staging é removido. O canônico continua o anterior.
- Erro no rename: o código tenta devolver canônico e previous ao par de antes. Se a restauração também falha, o log descreve o que sobrou em cada pasta. Não continue outro publish por cima sem olhar essas pastas.
- Falha só ao apagar `.retiring`: a publicação nova fica valendo. O warning é `gold_publication_cleanup_warning` ou `feature_publication_cleanup_warning`.
- Falha ao reescrever `data-lake/gold/geo` depois do commit: o snapshot do mês permanece. As dimensões globais podem ficar desatualizadas. O log avisa.
- `monthly_run.ps1` mostra quais etapas já tinham passado e sai com código 1.

`--validate-gold-only` escreve metadata direto na pasta canônica. Não cria `published_at` se ele não existia.

---

## 5. Cache

Dois caches no processo do uvicorn, sem TTL.

| Peça | Comportamento |
|---|---|
| Response cache | JSON de overview e Feature. Até 128 entradas, ou `TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES` |
| LRU | DataFrames CSV e Parquet, 256 cada, em `gold_service.py` |
| Fingerprint | `path\|mtime_ns\|size`. Muda o arquivo, muda a chave, o próximo pedido recalcula |
| Single-flight | Pedidos simultâneos da mesma chave esperam um cálculo. Falha não é armazenada |
| Warm | No startup, overview de admissão para Brasil, Paraná e RMC, em cada competência válida. `TERRITORIAL_WARM_ON_STARTUP=0` desliga. Publicar não reaquece |

Reiniciar o uvicorn descarta os dois caches e roda o warm de novo. `clear_gold_read_cache()` faz a limpeza dentro do processo. Se o arquivo substituído conservar mtime e tamanho, o fingerprint pode não mudar até essa limpeza.

---

## 6. Como saber que deu certo

| Verificação | Esperado |
|---|---|
| metadata Bronze, Silver e Gold | `validation_status` `ok` ou `warning` |
| pasta do mês | `mes=NN` presente; staging e retiring ausentes depois do job |
| `data-lake/catalog/gold_catalog.json` | `generated_at` da execução, se o catálogo rodou |
| `GET /ready` | `ready`, HTTP 200 |
| `GET /api/gold/v1/competencias` | o mês listado |
| Dashboard | seletor, Brasil/Paraná/RMC e um Feature Focus sem 4xx/5xx |

`warning` continua servível. Janeiro de 2026 está `warning` por `tabela_municipio_ocupacao` sem CSV. Isso é o contrato dessa tabela.

---

## 7. Problemas comuns

### microdados.txt ausente

Baixar da fonte oficial e colocar em `ano=YYYY/mes=MM`.

### Competência do arquivo diferente da pasta

`competencia_matches_path` falso, ou a validação Bronze em erro. Mover o arquivo para o mês certo ou ajustar `--ano` e `--mes`.

### Coluna obrigatória ausente

Metadata Bronze ou Silver lista `missing_required_columns`. Trocar o download. Não editar o TXT à mão.

### metadata com `validation_status: error`

Bronze em erro bloqueia a Silver. Silver em erro bloqueia a agregação. Corrigir a camada e repetir a partir dela. A Gold já publicada não é apagada por essa falha.

### Catálogo ausente ou velho

`/ready` exige o arquivo. Conteúdo desatualizado não derruba `/ready`. Regenerar com `--catalog-only`. Não usar `--build-catalog` junto: nesse modo ele é ignorado.

### `/ready` retorna `not_ready`

HTTP 503 e a lista `problems`: diretório Gold, competências, catálogo ilegível, ou default inválido (`DEFAULT_ANO`/`DEFAULT_MES` incompletos ou apontando para Gold inválida).

### Competência não aparece no dashboard

`/competencias` é quem alimenta o seletor, não o catálogo. Confirmar a API, o proxy `/api` → `127.0.0.1:8000` e se o metadata da Gold está `ok` ou `warning` com as tabelas mínimas.

### API fora do ar no smoke

`uvicorn app.main:app --host 127.0.0.1 --port 8000`.

### Vite em outra porta

5174 quando 5173 está ocupada. O CORS padrão já inclui 5174.

### Dois jobs no mesmo mês

Não há lock. Não rode duas publicações da mesma competência ao mesmo tempo.

---

## 8. Reprocessar e voltar atrás

Antes de reprocessar um mês que já está bom, copie `mes=NN` para um backup fora de `data-lake/gold/caged/`. A previous que o código guarda é uma geração, e o próximo publish a substitui. A cópia manual é a rede de segurança. Não é o mecanismo do commit.

O mecanismo do código, numa publicação que falha antes do rename, é manter o canônico e descartar o staging. Numa publicação que conclui o rename, o canônico novo fica em `mes=NN` e o antigo em `mes=NN.__previous__`, até a limpeza do retiring. A API usa a previous só se o canônico deixar de ser válido.

Depois do reprocessamento: catálogo (`--catalog-only` ou já incluso no `monthly_run`), restart do uvicorn, smoke e `/ready`.

Não apague `data-lake/` inteiro para “limpar” um mês.

---

## 9. Checklist mensal

- [ ] `microdados.txt` da fonte oficial na pasta Bronze certa
- [ ] `monthly_run.ps1` sem erro
- [ ] `mes=NN` no lugar; sem staging nem retiring sobrando
- [ ] metadata Bronze, Silver e Gold em `ok` ou `warning`
- [ ] catálogo regenerado (`generated_at` novo)
- [ ] uvicorn reiniciado
- [ ] `/ready` pronto
- [ ] dashboard: competência, um território e um Feature Focus

---

## Scripts

| Script | Função |
|---|---|
| `scripts/start_stack.ps1` | API e Vite em janelas separadas |
| `scripts/monthly_run.ps1` | Rotina Bronze → snapshot → catálogo → smoke |
| `scripts/smoke_api.ps1` | `/health`, `/ready`, competências, meta, overview, tabela e catálogo |

`monthly_run.ps1` aceita `-SkipSmokeTest`, `-SkipCatalogValidation` e `-ApiBaseUrl` (padrão `http://127.0.0.1:8000`). Os scripts pedem PowerShell 5.1 ou superior.
