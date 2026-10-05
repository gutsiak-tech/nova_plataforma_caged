# Runbook operacional — CAGED Dashboard

Este runbook orienta a **universidade receptora** na atualização mensal do CAGED Dashboard, validação das camadas de dados e diagnóstico de problemas operacionais.

Documentação complementar: [`handoff_institucional.md`](handoff_institucional.md), [`checklist_handoff.md`](checklist_handoff.md), [`entrega_institucional.md`](entrega_institucional.md), [`pipeline.md`](pipeline.md).

---

## 1. Objetivo

Garantir que cada nova competência (ano/mês) do Novo CAGED seja:

1. Ingerida corretamente na Bronze
2. Transformada na Silver
3. Agregada na Gold
4. Catalogada e exposta pela API
5. Visível no dashboard

A rotina automatizada principal é o script [`scripts/monthly_run.ps1`](../scripts/monthly_run.ps1).

---

## 2. Fluxo mensal recomendado

1. **Obter** o arquivo `microdados.txt` do Novo CAGED (fonte oficial).
2. **Colocar** em:
   ```text
   data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt
   ```
3. **Executar** a rotina mensal (na raiz do projeto):
   ```powershell
   .\scripts\monthly_run.ps1 -Ano 2026 -Mes 3
   ```
4. **Subir API e dashboard** (se o smoke test não rodou ou para uso contínuo):
   ```powershell
   .\scripts\start_stack.ps1
   ```
   Alternativa manual: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` e `cd dashboard; npm run dev`
5. **Smoke test** (opcional, se não incluído no passo 3):
   ```powershell
   .\scripts\smoke_api.ps1 -Ano 2026 -Mes 3
   ```
6. **Conferir** no navegador se a competência `YYYY-MM` aparece no seletor e se KPIs carregam.

---

## 3. Comandos manuais equivalentes

| Etapa | Comando |
|---|---|
| Validar Bronze | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-bronze-only` |
| Validar Silver | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-silver-only` |
| Pipeline completo + catálogo | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog` |
| Validar Gold | `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --validate-gold-only` |
| Só catálogo | `python -m pipelines.jobs.run_monthly_pipeline --catalog-only --validate-catalog --ano YYYY --mes MM` |
| API viva | `GET /health` |
| API pronta | `GET /ready` |

---

## 4. Como saber se deu certo

| Verificação | Esperado |
|---|---|
| `data-lake/bronze/.../metadata.json` | `validation_status`: `ok` ou `warning` |
| `data-lake/silver/.../metadata.json` | `validation_status`: `ok` ou `warning` |
| `data-lake/gold/.../metadata.json` | `validation_status`: `ok` ou `warning` |
| `data-lake/catalog/gold_catalog.json` | `generated_at` recente |
| `GET /ready` | `status`: `ready` (HTTP 200) |
| `GET /api/gold/v1/competencias` | Nova competência listada |
| Dashboard | Competência no seletor; sem erros 4xx/5xx no console |

---

## 5. Problemas comuns e soluções

### microdados.txt ausente

**Sintoma:** Bronze falha com mensagem de arquivo não encontrado.  
**Solução:** Baixar o arquivo da fonte oficial e colocar na pasta Bronze correta (`ano=YYYY/mes=MM`).

### Competência divergente (arquivo vs pasta)

**Sintoma:** `metadata.json` Bronze com `competencia_matches_path: false` ou erro `GOLD_COMPETENCIA_NOT_FOUND`.  
**Solução:** Mover o arquivo para a pasta do mês correto ou ajustar `--ano`/`--mes`.

### Coluna obrigatória ausente

**Sintoma:** Bronze ou Silver com `missing_required_columns` no metadata.  
**Solução:** Verificar se o download do microdados está completo; não editar o arquivo manualmente.

### metadata Bronze com `validation_status: error`

**Sintoma:** Pipeline interrompe na Bronze; Silver bloqueada se metadata tiver error.  
**Solução:** Corrigir o microdados e rodar `--validate-bronze-only` novamente.

### metadata Silver com `validation_status: error`

**Sintoma:** Gold bloqueada no gate Silver.  
**Solução:** Reprocessar Silver (`--validate-silver-only`) após corrigir Bronze.

### Gold sem tabela_resumo

**Sintoma:** `--validate-gold-only` ou metadata Gold com `tabela_resumo_ok: false`.  
**Solução:** Reexecutar pipeline completo para a competência.

### Catálogo ausente

**Sintoma:** `/ready` com `catalog_exists: false`.  
**Solução:** `python -m pipelines.jobs.run_monthly_pipeline --catalog-only --build-catalog` ou incluir `--build-catalog` no pipeline.

### `/ready` retorna `not_ready`

**Sintoma:** HTTP 503; campo `problems` lista itens faltantes.  
**Solução:** Ler cada item em `problems` (Gold, catálogo, metadata Gold da competência default, etc.).

### Competência não aparece no dashboard

**Sintoma:** Seletor sem o mês novo; erros na API no console do navegador.  
**Solução:** Confirmar `/competencias`; verificar se API está rodando; conferir proxy Vite (`/api` → porta 8000).

### API fora do ar

**Sintoma:** `smoke_api.ps1` falha com erro de conexão.  
**Solução:** Iniciar `uvicorn app.main:app --host 127.0.0.1 --port 8000`.

### Vite em porta diferente

**Sintoma:** Dashboard em `http://localhost:5174` em vez de 5173.  
**Solução:** Normal quando 5173 está ocupada; CORS da API já inclui 5174.

---

## 6. Reprocessamento de competência

Reprocesse quando:

- O microdados foi substituído por versão corrigida
- Houve falha na Silver ou Gold
- Indicadores da competência estão inconsistentes

**Procedimento:**

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

Ou, etapa a etapa, conforme a seção 3.

Após reprocessar, regenere o catálogo se necessário e rode o smoke test.

**Cache em memória da API:** a leitura Gold usa `@lru_cache` no processo uvicorn. Se a API permaneceu ativa durante o reprocessamento, **reinicie o uvicorn** antes de publicar o dashboard (isso descarta o cache). A função `clear_gold_read_cache()` em `app/services/gold_service.py` limpa o cache no mesmo processo — útil em testes; em produção, reiniciar o serviço é o procedimento operacional padrão.

---

## 7. Rollback simples

Procedimento conservador:

1. **Antes de reprocessar**, copie a pasta da competência:
   ```text
   data-lake/gold/caged/ano=YYYY/mes=MM/   → backup/
   data-lake/silver/caged/ano=YYYY/mes=MM/ → backup/
   data-lake/bronze/caged/ano=YYYY/mes=MM/ → backup/
   ```
2. **Não apague** `data-lake/` sem backup.
3. Coloque o microdados correto na Bronze e execute `monthly_run.ps1`.
4. Regenere catálogo (`--build-catalog` ou `--catalog-only`).
5. Rode `smoke_api.ps1` e confira `/ready`.

---

## 8. Checklist mensal

- [ ] `microdados.txt` obtido da fonte oficial
- [ ] Arquivo na pasta Bronze `ano=YYYY/mes=MM/`
- [ ] `monthly_run.ps1` concluído sem erro
- [ ] `metadata.json` Bronze/Silver/Gold com `validation_status` aceitável
- [ ] `gold_catalog.json` atualizado
- [ ] API rodando
- [ ] `smoke_api.ps1` OK (ou `/ready` = ready)
- [ ] Dashboard aberto; competência no seletor
- [ ] KPIs e gráficos sem erro no console

---

## Scripts de automação

| Script | Função |
|---|---|
| [`scripts/start_stack.ps1`](../scripts/start_stack.ps1) | Inicia API e dashboard em janelas separadas (demonstração) |
| [`scripts/monthly_run.ps1`](../scripts/monthly_run.ps1) | Rotina completa Bronze → smoke API |
| [`scripts/smoke_api.ps1`](../scripts/smoke_api.ps1) | Testa endpoints principais da API |

Parâmetros úteis de `monthly_run.ps1`:

- `-SkipSmokeTest` — pula smoke test (API pode ser testada depois)
- `-SkipCatalogValidation` — gera catálogo sem `--validate-catalog`
- `-ApiBaseUrl` — URL da API (default `http://127.0.0.1:8000`)

**Compatibilidade Windows:** os scripts em `scripts/` usam mensagens em ASCII simples (sem travessões Unicode) para evitar falhas de parser no PowerShell padrão. Requer PowerShell 5.1 ou superior (`#Requires -Version 5.1`).
