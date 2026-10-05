# Guia de handoff institucional — CAGED Dashboard

Este guia orienta a **universidade receptora** no recebimento, primeira execução, demonstração local e operação contínua do sistema.

Documentação complementar:

| Documento | Conteúdo |
|---|---|
| [`README.md`](../README.md) | Referência técnica e comandos |
| [`entrega_institucional.md`](entrega_institucional.md) | Documento formal de entrega |
| [`checklist_handoff.md`](checklist_handoff.md) | Checklist de recepção |
| [`runbook_operacional.md`](runbook_operacional.md) | Rotina mensal e diagnóstico |
| [`pipeline.md`](pipeline.md) | Pipeline e flags CLI |

---

## 1. O que está sendo entregue

O **CAGED Dashboard** é um sistema analítico para consulta de dados do **Novo CAGED** (movimentação de emprego formal no Brasil). O pacote inclui:

- **Pipeline de dados** em arquitetura Medallion (Bronze → Silver → Gold), com validações e `metadata.json` por camada
- **API REST** (FastAPI) que expõe indicadores, tabelas, competências e catálogo da Gold
- **Dashboard web** (React + Vite) para visualização interativa por competência (ano/mês)
- **Catálogo formal** da camada Gold (`data-lake/catalog/`)
- **Scripts operacionais** (`monthly_run.ps1`, `smoke_api.ps1`, `start_stack.ps1`) — compatíveis com PowerShell 5.1+ no Windows; mensagens operacionais em ASCII simples
- **Testes automatizados** (`pytest`) e documentação institucional

A implementação atual é **local**, com Python/pandas e arquivos no filesystem (`data-lake/`). Não depende de nuvem para funcionar em ambiente de laboratório ou servidor institucional.

---

## 2. O que não está sendo entregue nesta versão

Deixe claro para a equipe receptora:

| Item | Situação |
|---|---|
| **Databricks / Spark / Delta Lake** | Não faz parte da implementação atual; possível evolução futura |
| **Deploy em servidor de produção** | Não configurado neste handoff; a universidade define hospedagem, HTTPS e backup |
| **Mapas / PostGIS / Tegola** | Parcial ou em estágio separado (`infra/`, `sql/`); variáveis `POSTGRES_*` são opcionais |
| **CI/CD** | Pode ficar para etapa posterior (pytest e build ainda são manuais) |
| **Microdados do CAGED** | Devem ser obtidos pela universidade na fonte oficial; não vêm no repositório Git |
| **Persistência de competência no dashboard** | Seleção pode resetar ao recarregar a página (melhoria futura) |

---

## 3. Primeira execução em uma nova máquina

### 3.1 Obter o código

Clone ou copie o repositório para a máquina da universidade.

### 3.2 Configurar ambiente

```powershell
# Na raiz do projeto
copy .env.example .env
# Edite .env: DEFAULT_ANO, DEFAULT_MES, DEFAULT_UF (e APP_ENV/APP_VERSION se desejar)

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt

cd dashboard
npm install
cd ..
```

### 3.3 Preparar dados

1. Obtenha `microdados.txt` do Novo CAGED para a competência desejada.
2. Coloque em:
   ```text
   data-lake/bronze/caged/ano=YYYY/mes=MM/microdados.txt
   ```
3. Execute o pipeline (primeira vez ou nova competência):
   ```powershell
   .\scripts\monthly_run.ps1 -Ano YYYY -Mes MM
   ```
   Ou valide camada a camada conforme [`pipeline.md`](pipeline.md).

### 3.4 Verificar prontidão

Com a API rodando:

```powershell
# Terminal 1 — API
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2 — verificação
curl http://127.0.0.1:8000/ready
.\scripts\smoke_api.ps1 -Ano YYYY -Mes MM
```

`GET /ready` deve retornar HTTP **200** e `"status": "ready"` quando Gold, catálogo e metadata estiverem corretos.

### 3.5 Iniciar interface

```powershell
.\scripts\start_stack.ps1
```

Ou manualmente: API + `cd dashboard; npm run dev`.

---

## 4. Demonstração local

Para apresentações ou validação rápida:

```powershell
.\scripts\start_stack.ps1
```

Acesse:

| URL | Finalidade |
|---|---|
| http://127.0.0.1:8000/docs | Documentação interativa da API |
| http://127.0.0.1:8000/ready | Prontidão (Gold + catálogo) |
| http://127.0.0.1:8000/health | API viva |
| http://localhost:5173/ | Dashboard (porta padrão do Vite) |

**Encerrar:** feche as janelas PowerShell abertas pelo script ou use **Ctrl+C** em cada uma.

Parâmetros úteis:

```powershell
.\scripts\start_stack.ps1 -SkipDashboard    # só API
.\scripts\start_stack.ps1 -SkipApi          # só dashboard (proxy exige API em 8000)
.\scripts\start_stack.ps1 -ApiPort 8080 -DashboardPort 5174
```

---

## 5. Atualização mensal

A rotina operacional padrão está em [`runbook_operacional.md`](runbook_operacional.md).

Resumo:

1. Baixar `microdados.txt` da competência nova
2. Colocar na pasta Bronze
3. Executar `.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM`
4. Subir API e dashboard (`start_stack.ps1` ou manualmente)
5. Validar no navegador e com `smoke_api.ps1`

---

## 6. Validação

| Verificação | Como |
|---|---|
| Testes unitários/integração | `python -m pytest tests/ -v` |
| API viva | `GET /health` |
| Dados prontos | `GET /ready` → `ready` |
| Endpoints Gold | `.\scripts\smoke_api.ps1 -Ano YYYY -Mes MM` |
| Checklist completo | [`checklist_handoff.md`](checklist_handoff.md) |

Logs operacionais:

- `logs/api.log` — API
- `logs/pipeline.log` — pipeline

---

## 7. Responsabilidades da universidade

Após o handoff, recomenda-se designar equipe responsável por:

- **Manter o ambiente** — Python, Node, venv, dependências atualizadas com cautela
- **Obter microdados oficiais** — download mensal do Novo CAGED conforme política da fonte
- **Executar atualização mensal** — `monthly_run.ps1` e conferência de `/ready`
- **Backup do data-lake** — especialmente Gold e catálogo antes de reprocessar competências
- **Definir estratégia de deploy** — servidor interno, reverse proxy, HTTPS, monitoramento
- **Acompanhar mudanças do CAGED** — layout de microdados, novos campos, revisão de validações Bronze
- **Registrar incidentes** — falhas de validação, competências ausentes, erros no dashboard

---

## 8. Próximas evoluções recomendadas

Prioridades sugeridas (não implementadas neste handoff):

1. **Deploy institucional** — API e dashboard acessíveis na rede da universidade
2. **CI/CD** — `pytest` e `npm run build` em cada alteração de código
3. **Página “Sobre os Dados”** — consumir `/api/gold/v1/catalog` no dashboard
4. **Persistência de competência** — `localStorage` ou query string `?ano=&mes=`
5. **Melhorias visuais e acessibilidade** — conforme identidade da universidade
6. **Mapas / PostGIS** — completar integração se houver demanda geoespacial
7. **Migração Spark/Databricks** — se volume ou governança institucional exigir escala

---

## Contato interno

Registre neste documento (preenchido pela universidade na recepção):

| Campo | Responsável |
|---|---|
| Equipe técnica | _a definir_ |
| Contato para dados CAGED | _a definir_ |
| Servidor / infraestrutura | _a definir_ |
| Data do handoff | _a definir_ |
