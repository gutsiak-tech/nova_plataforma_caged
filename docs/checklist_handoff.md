# Checklist de handoff institucional

Use este checklist na **recepção do projeto** e antes de colocar o CAGED Dashboard em operação na universidade.

Documentação relacionada:

- [`handoff_institucional.md`](handoff_institucional.md) — guia completo de recebimento
- [`entrega_institucional.md`](entrega_institucional.md) — documento de entrega
- [`runbook_operacional.md`](runbook_operacional.md) — operação mensal

---

## 1. Código e versionamento

- [ ] `README.md` atualizado
- [ ] `.env.example` presente
- [ ] `data-lake/` fora do Git (não versionado)
- [ ] `.gitignore` configurado (`.env`, `data-lake/`, `.venv/`, `node_modules/`)
- [ ] `scripts/` presentes (`monthly_run.ps1`, `smoke_api.ps1`, `start_stack.ps1`)
- [ ] `docs/` presentes (pipeline, catálogo, runbook, handoff)

---

## 2. Ambiente

- [ ] Python 3 instalado
- [ ] Node.js e npm instalados
- [ ] Ambiente virtual criado (`.venv`)
- [ ] `pip install -r requirements.txt` executado
- [ ] `pip install -r requirements-dev.txt` executado (testes)
- [ ] `npm install` executado em `dashboard/`

---

## 3. Dados

- [ ] `microdados.txt` disponível para competência de demonstração
- [ ] Bronze validada (`metadata.json` com `validation_status` aceitável)
- [ ] Silver gerada para a competência
- [ ] Gold gerada para a competência
- [ ] Catálogo Gold gerado (`data-lake/catalog/gold_catalog.json`)
- [ ] `metadata.json` presente em Bronze, Silver e Gold da competência

---

## 4. API

- [ ] API iniciada (`uvicorn` ou `.\scripts\start_stack.ps1`)
- [ ] `GET /health` retorna `status: ok`
- [ ] `GET /ready` retorna `status: ready` (HTTP 200)
- [ ] `GET /api/gold/v1/competencias` lista competências
- [ ] `GET /api/gold/v1/catalog?ano=YYYY&mes=MM` responde

---

## 5. Dashboard

- [ ] Dashboard abre (`npm run dev` ou `start_stack.ps1`)
- [ ] Seletor de competência aparece
- [ ] KPIs carregam sem erro
- [ ] Páginas principais carregam (overview, tabelas, recortes)
- [ ] Console do navegador sem erros 4xx/5xx na API

---

## 6. Operação mensal

- [ ] `.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM` testado em ambiente de homologação
- [ ] `.\scripts\smoke_api.ps1 -Ano YYYY -Mes MM` testado com API ativa
- [ ] [`runbook_operacional.md`](runbook_operacional.md) lido pela equipe responsável
- [ ] Responsável institucional designado para atualização mensal

---

## 7. Pendências conhecidas

Marque como revisado (não necessariamente resolvido):

- [ ] **Deploy institucional** — estratégia de publicação em servidor a definir pela universidade
- [ ] **Mapas / PostGIS** — integração parcial ou em estágio separado (`infra/`, variáveis `POSTGRES_*`)
- [ ] **CI/CD** — pipeline de testes automatizados em PR, se ainda não implementado
- [ ] **Persistência de competência no dashboard** — seleção pode não persistir entre sessões (evolução futura)
- [ ] **Página “Sobre os Dados”** — consumo do catálogo no frontend (evolução futura)

---

## Validação rápida (comandos)

```powershell
# Testes automatizados
python -m pytest tests/ -v

# Smoke da API (API deve estar rodando)
.\scripts\smoke_api.ps1 -Ano 2026 -Mes 2

# Stack local para demonstração
.\scripts\start_stack.ps1
```
