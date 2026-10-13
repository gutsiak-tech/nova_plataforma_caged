# Guia de handoff institucional — Plataforma Becker / CAGED

Este é o documento principal de transferência. Ele descreve o produto que existe na branch `frontend/entrada-territorial`: como os dados nascem, como a API os serve e como o dashboard os mostra.

Uma equipe nova deve conseguir instalar, operar e atualizar a plataforma com este guia, o [`README.md`](../README.md) e o [`runbook_operacional.md`](runbook_operacional.md). Não depende de conhecimento oral do desenvolvimento original.

| Documento | Conteúdo |
|---|---|
| [`README.md`](../README.md) | Comandos e visão curta |
| [`entrega_institucional.md`](entrega_institucional.md) | O que entra e o que fica de fora do pacote |
| [`checklist_handoff.md`](checklist_handoff.md) | Aceite da equipe receptora |
| [`runbook_operacional.md`](runbook_operacional.md) | Falha, cache e publicação |
| [`pipeline.md`](pipeline.md) | Flags do job mensal |
| [`DATA_CONTRACT.md`](DATA_CONTRACT.md) | Tabelas, colunas e endpoints |
| [`CONFIG.md`](CONFIG.md) | Portas, proxy e CORS |

---

## 1. O produto de hoje

A entrada é **`/`**. O React redireciona para **`/territorial`**.

Ali estão Brasil, Paraná, RMC e o Feature Focus (uma UF ou um município). **`/legacy`** abre a visão executiva anterior. As rotas `/territorio`, `/setores`, `/ocupacoes`, `/perfil`, `/salario` e `/sobre` continuam disponíveis.

O painel lê arquivos no disco. Não precisa de banco, PostGIS nem Tegola. O mapa usa GeoJSON versionado em `dashboard/public/geo/`.

Há Gold territorial e Feature Gold para **janeiro a junho de 2026**. Esses meses já publicados estão no layout flat, explicado na seção 4.

---

## 2. Arquitetura

```
fonte oficial (microdados.txt)
        ↓
     Bronze                 valida e grava metadata; não baixa o arquivo
        ↓
     Silver                 caged_tratado.parquet
        ↓
 staging mensal            Gold territorial + staging/feature/
        ↓
 validação
        ↓
 published_at
        ↓
 um rename                 mes=NN vira o canônico; a geração anterior vai para previous
        ↓
 API                      lê o canônico, ou a previous se o canônico estiver inválido
        ↓
 cache e warm             memória do processo uvicorn
        ↓
 frontend                 / → /territorial
```

Funções centrais:

| Passo | Onde |
|---|---|
| Orquestração | `pipelines/jobs/run_monthly_pipeline.py` |
| Bronze | `pipelines/bronze/ingest_caged.py` |
| Silver | `pipelines/silver/clean_caged.py` |
| Gold + Feature no mesmo staging | `publicar_tabelas_gold` em `pipelines/gold/aggregate_indicators.py` |
| Selo da Feature | `stage_monthly_feature` em `pipelines/gold/aggregate_feature_indicators.py` |
| Validação e `published_at` | `validate_and_publish_gold` em `pipelines/gold/validate_gold.py` |
| Rename | `publish_gold_directory` em `pipelines/gold/publication.py` |
| API | `app/main.py` |
| Leitura | `app/services/gold_service.py` e `app/services/feature_gold_service.py` |

A rotina operacional recomendada é:

```powershell
.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
```

O equivalente direto, com catálogo:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog
```

---

## 3. Publicação atômica

O mês que a API enxerga é uma pasta. O commit é o rename dessa pasta, não a escrita arquivo a arquivo.

- **Staging.** Pasta temporária irmã, invisível para a API (`.mes=NN.staging-...`). Território e `feature/` são escritos ali.
- **Canônico.** `data-lake/gold/caged/ano=YYYY/mes=NN`. É o nome que a listagem de competências trata como mês.
- **Previous.** `mes=NN.__previous__`. Guarda uma geração. A API só a escolhe se o canônico existir e estiver inválido, ou se o canônico não for uma Gold válida.
- **Retiring.** `.mes=NN.retiring`. Existe só durante o swap. A API não o seleciona. Depois do commit, o código tenta apagá-lo. Se a limpeza falha, a publicação nova permanece e o log registra `gold_publication_cleanup_warning`.
- **Atomic rename.** O commit visível é `staging` tomando o lugar de `mes=NN`. Antes disso, a previous antiga sai para retiring e o canônico atual vira previous.
- **`published_at`.** Instantâneo gravado no `metadata.json` do staging imediatamente antes do rename. Viaja dentro do snapshot.
- **`feature_generated_at`.** Instantâneo gravado em `feature/feature_gold_report.json` quando a Feature do staging é aceita, ainda antes do rename. Não é o `published_at`.

Território e Feature entram juntos porque a API só passa a ver o mês nesse rename. Feature incompleta impede o rename. Não fica visível um território novo com Feature velha, nem o contrário, na publicação mensal.

### Layout flat e layout `feature/`

Os dois são lidos pelo código atual.

- **Flat.** Os 12 Parquets de Feature estão na raiz de `mes=NN`. O leitor usa essa raiz quando não existem `feature/` nem `feature.__previous__/`. Janeiro a junho de 2026 estão assim. Esses arquivos não têm `published_at` nem `feature_generated_at`. Continuam servíveis: `validation_status` `ok` ou `warning` e os arquivos mínimos bastam. Janeiro está `warning` por causa de `tabela_municipio_ocupacao`, que é Parquet sem CSV de propósito.
- **`feature/`.** A publicação mensal deste código grava a Feature dentro do staging e, depois do rename, em `mes=NN/feature/`. Quando `feature/` ou `feature.__previous__/` existe, a raiz deixa de ser fonte de Feature.

### Feature avulsa

Este comando não é a rotina mensal:

```powershell
python -m pipelines.gold.aggregate_feature_indicators --ano YYYY --mes MM
```

Ele publica só `feature/`, com commit próprio, e não altera o `published_at` territorial. A Gold territorial precisa já existir.

---

## 4. O que a transferência inclui

O repositório traz código, testes, documentação, `requirements.txt`, `requirements-dev.txt`, `dashboard/package.json`, `dashboard/package-lock.json`, `.env.example`, `dashboard/.env.example` e os GeoJSON em `dashboard/public/geo/`.

O data-lake não está no Git. Para servir o painel, a cópia precisa trazer:

- `data-lake/gold/caged`
- `data-lake/gold/geo/dim_uf.csv` e `.parquet`
- `data-lake/gold/geo/dim_municipio.csv` e `.parquet`
- `data-lake/catalog/gold_catalog.json` (e o CSV irmão)

Bronze, Silver, shapefiles em `data-lake/geodata/` e a planilha de layout em `data-lake/metadata/` ajudam a reproduzir e a atualizar. Não são necessários só para abrir o dashboard em cima da Gold já pronta.

Não enviar `.env` local, `.venv`, `node_modules`, `dashboard/dist`, `logs`, caches, `__pycache__`, `.pytest_cache` nem relatórios `RELATORIO_*.md`. A lista fechada está em [`entrega_institucional.md`](entrega_institucional.md).

`docs/gold_catalog.md` é gerado pelo job de catálogo. Não edite esse arquivo à mão. O JSON atualmente no data-lake foi gerado em 2026-10-05 e não lista janeiro nem as tabelas de Feature. Regenerar o catálogo corrige a consulta `/catalog` sem reprocessar a Gold:

```powershell
python -m pipelines.jobs.run_monthly_pipeline --catalog-only
```

---

## 5. Instalação

Pré-requisitos: **Python 3.11+**, **Node.js 20.19+** e npm.

```powershell
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt

cd dashboard
npm install
cd ..
```

`DEFAULT_ANO` e `DEFAULT_MES` são um override opcional e só valem juntos, apontando para uma Gold válida. Sem eles, a API usa a Gold válida mais recente. Par incompleto ou inválido deixa `/ready` não pronto. `DEFAULT_UF` padrão é `PR`. `POSTGRES_*` não entram no painel atual.

API:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend, em outro terminal:

```powershell
cd dashboard
npm run dev
```

Atalho no Windows: `.\scripts\start_stack.ps1`. Ele abre os dois processos e não instala dependências.

Confira `GET http://127.0.0.1:8000/health` e `GET http://127.0.0.1:8000/ready`. Abra `http://localhost:5173/`. O proxy do Vite manda `/api` para `127.0.0.1:8000`.

---

## 6. Atualização mensal

1. Obter `microdados.txt` da fonte oficial.
2. Colocar em `data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt`.
3. Rodar `.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM`.
4. Se a API já estava no ar, reiniciar o uvicorn. O cache é memória daquele processo.
5. Conferir `/ready`, o seletor e um Feature Focus.

O script valida Bronze, refaz Bronze e Silver, publica o snapshot com catálogo, valida a Gold de novo e, se a API responder, faz o smoke test. Falha em qualquer etapa encerra com exit 1. O canônico só muda quando o rename acontece. Staging incompleto é apagado. O catálogo é escrito depois, fora do snapshot: se a Gold publicou e o catálogo falhou, o mês novo já está visível e o catálogo pode estar velho.

Detalhe de falha, previous e cache: [`runbook_operacional.md`](runbook_operacional.md). Flags: [`pipeline.md`](pipeline.md).

---

## 7. Rotas e Feature Focus

| URL | Uso |
|---|---|
| `http://localhost:5173/` | entra e vai para `/territorial` |
| `/territorial/brasil` | Brasil |
| `/territorial/parana` | Paraná |
| `/territorial/rmc` | RMC |
| `/territorial/brasil/pr` | Feature Focus da UF, sigla na URL |
| `/territorial/parana/4106902` | exemplo de município; o código real vem do mapa |
| `/legacy` | visão executiva anterior |

Competência na URL: `?ano=2026&mes=1`. Prioridade: URL válida, depois `localStorage`, depois default da API, depois a última Gold válida. Na primeira visita sem query e sem storage, vale o default da API, e a URL passa a carregar o par.

Endpoints que a experiência territorial chama: `/api/gold/v1/competencias`, `/overview`, `/table/{base_name}`, `/feature/uf/{uf}` e `/feature/municipality/{código}`. `/health`, `/ready`, `/catalog` e `/meta` existem para operação. O frontend não busca catálogo nem meta para desenhar a tela.

---

## 8. Cache, fingerprint e warm

Tudo isso vive no processo do uvicorn. Não há TTL.

- **Response cache.** Guarda o JSON de overview e de Feature. Capacidade 128, ou `TERRITORIAL_RESPONSE_CACHE_MAX_ENTRIES`.
- **LRU de DataFrame.** Até 256 CSV e 256 Parquet em `gold_service.py`.
- **Fingerprint.** `path|mtime_ns|size` das fontes. Arquivo novo muda a chave. O pedido seguinte recalcula. A entrada antiga daquela chave lógica sai.
- **Single-flight.** Dois pedidos iguais ao mesmo tempo compartilham um cálculo. Chaves diferentes seguem em paralelo. Erro não fica gravado.
- **Warm.** No startup, uma thread calcula o overview de admissão de Brasil, Paraná e RMC para cada competência válida. Não há segundo cache. `TERRITORIAL_WARM_ON_STARTUP=0` desliga. Publicar uma Gold **não** dispara outro warm; isso só volta no próximo startup.

Procedimento operacional depois de publicar: reiniciar o uvicorn. `clear_gold_read_cache()` limpa os dois caches no mesmo processo. Um arquivo reescrito com o mesmo mtime e o mesmo tamanho pode continuar servindo o payload antigo até essa limpeza.

---

## 9. Testes

```powershell
python -m pytest tests/ -v
python -m pytest tests/ --collect-only -q

cd dashboard
npm test
npm run build
```

Há pytest no backend, inclusive `tests/test_gold_frontend_contract.py`, e Vitest no frontend (`npm test`). A contagem muda com o código; use `--collect-only` em vez de um número fixo.

---

## 10. Limitações conhecidas

Não são falhas do painel que está no ar. São limites do desenho atual.

- O catálogo fica em `data-lake/catalog/`, fora do snapshot mensal, e é escrito direto em JSON, CSV e `docs/gold_catalog.md`.
- `GET /meta` olha CSV na raiz de `mes=NN`. Não desce em `feature/`. `tabela_municipio_ocupacao` não aparece, porque não tem CSV.
- `data-lake/gold/geo` é uma dimensão global. A última Feature reescreve `dim_uf` e `dim_municipio` depois do commit. Falha nessa escrita não desfaz o mês.
- A Feature avulsa tem publicação própria e não muda `published_at`.
- Não há lock entre dois publishers ao mesmo tempo.
- O cache é local ao processo.
- Janeiro a junho de 2026 continuam no layout flat, sem `published_at` e sem `feature_generated_at`.
- O dashboard anterior permanece em `/legacy` e nas rotas antigas do shell.

Ainda não fazem parte desta entrega: deploy institucional com HTTPS, CI e o consumo programático de `/catalog` na página Sobre. Persistência de competência, mapa territorial e Feature Focus **já estão** no produto.

---

## 11. Responsabilidades depois do handoff

- Manter Python, Node e as dependências com cautela.
- Obter o microdados oficial de cada mês novo.
- Rodar `monthly_run.ps1`, reiniciar a API e conferir `/ready`.
- Guardar cópia da Gold e do catálogo antes de reprocessar um mês.
- Definir hospedagem, se o painel sair da máquina local.
- Acompanhar mudança de layout do Novo CAGED.

| Campo | Responsável |
|---|---|
| Equipe técnica | _a definir_ |
| Contato para dados CAGED | _a definir_ |
| Servidor / infraestrutura | _a definir_ |
| Data do handoff | _a definir_ |
