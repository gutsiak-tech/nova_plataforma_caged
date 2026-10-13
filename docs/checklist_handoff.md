# Checklist de handoff institucional

Use na recepção da Plataforma Becker / CAGED, no estado da experiência territorial. Guia: [`handoff_institucional.md`](handoff_institucional.md). Pacote: [`entrega_institucional.md`](entrega_institucional.md).

---

## 1. Código

- [ ] Recebido o código da branch atual (`frontend/entrada-territorial`), não só `main` / tag `v1.0.0`
- [ ] `README.md` e `docs/handoff_institucional.md` lidos
- [ ] `.env.example` e `dashboard/.env.example` presentes
- [ ] `requirements.txt`, `requirements-dev.txt`, `dashboard/package.json` e `dashboard/package-lock.json` presentes
- [ ] GeoJSON versionados em `dashboard/public/geo/`
- [ ] `data-lake/` fora do Git

---

## 2. Ambiente

- [ ] Python 3.11+ e Node.js 20.19+ instalados
- [ ] `.venv` criado nesta máquina (não copiar o `.venv` de origem)
- [ ] `pip install -r requirements.txt` e `pip install -r requirements-dev.txt`
- [ ] `npm install` em `dashboard/`
- [ ] `.env` criado a partir de `.env.example`, sem copiar o `.env` da máquina de origem

---

## 3. Dados para servir

- [ ] `data-lake/gold/caged` presente, janeiro a junho de 2026
- [ ] `data-lake/gold/geo/dim_uf.*` e `dim_municipio.*` presentes
- [ ] `data-lake/catalog/gold_catalog.json` presente
- [ ] Bronze e Silver localizados, se a continuidade mensal fizer parte da entrega

---

## 4. API

- [ ] API iniciada: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- [ ] `GET /health` retorna `status: ok`
- [ ] `GET /ready` retorna `status: ready` (HTTP 200)
- [ ] `GET /api/gold/v1/competencias` lista as competências, inclusive janeiro

---

## 5. Dashboard

- [ ] `npm run dev` (ou `.\scripts\start_stack.ps1`)
- [ ] `http://localhost:5173/` redireciona para `/territorial`
- [ ] Brasil abre
- [ ] Paraná abre
- [ ] RMC abre
- [ ] Feature Focus de uma UF abre
- [ ] Feature Focus de um município abre
- [ ] Janeiro de 2026 pode ser selecionado
- [ ] Troca de competência funciona
- [ ] Deep link `?ano=&mes=` abre a competência pedida
- [ ] `/legacy` abre a visão executiva anterior
- [ ] Console sem erros 4xx/5xx da API nas telas acima

---

## 6. Testes e build

- [ ] `python -m pytest tests/ -v`
- [ ] `npm test` em `dashboard/`
- [ ] `npm run build` em `dashboard/`

---

## 7. Operação mensal e catálogo

- [ ] Equipe sabe colocar `microdados.txt` em `data-lake/bronze/caged/ano=YYYY/mes=MM/`
- [ ] `.\scripts\monthly_run.ps1 -Ano YYYY -Mes MM` entendido como rotina recomendada
- [ ] Comando manual conhecido: `python -m pipelines.jobs.run_monthly_pipeline --ano YYYY --mes MM --build-catalog --validate-catalog`
- [ ] Catálogo regenerável: `python -m pipelines.jobs.run_monthly_pipeline --catalog-only`
- [ ] Feature avulsa reconhecida como comando separado, não como a publicação mensal
- [ ] Reinício do uvicorn combinado depois de uma publicação
- [ ] [`runbook_operacional.md`](runbook_operacional.md) lido
- [ ] Responsável da atualização mensal designado

---

## 8. Fora deste produto

Marque como visto. Não são funções pendentes do painel atual.

- [ ] Deploy institucional (servidor, HTTPS, backup) ainda é decisão da equipe receptora
- [ ] CI ainda não está no repositório; os testes são manuais
- [ ] PostGIS/Tegola em `infra/` são opcionais e o mapa atual não depende deles
- [ ] A página Sobre cita `/catalog` e não o busca por código

Persistência de competência, mapa territorial GeoJSON e Feature Focus já fazem parte do produto. Não entram como evolução futura.
