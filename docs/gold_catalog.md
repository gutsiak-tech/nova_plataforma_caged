# Catálogo da camada Gold

_Gerado em: 2026-10-05T15:21:55.966666+00:00_

## O que é a camada Gold

A camada Gold é a camada analítica do projeto CAGED, produzida pelo pipeline `pipelines/gold/aggregate_indicators.py` a partir da Silver. Seus artefatos são consumidos pela API FastAPI e pelo dashboard React.

## Competência

Os dados são particionados por competência no padrão Hive:

```
data-lake/gold/caged/ano=YYYY/mes=MM/
```

Cada competência válida contém tabelas analíticas em CSV e Parquet, além de um Excel consolidado opcional.

## Escopos territoriais

| Escopo no catálogo | Significado | Sufixo de arquivo |
|---|---|---|
| `brasil` | Brasil (sem recorte estadual/metropolitano) | sem sufixo |
| `parana` | Paraná | `_pr` |
| `rmc` | Região Metropolitana de Curitiba | `_rmc` |

## Sufixos de tabelas

- Sem sufixo: escopo Brasil.
- `_pr`: recorte Paraná.
- `_rmc`: recorte RMC.

## Formatos

- **CSV**: formato primário lido pela API.
- **Parquet**: formato colunar espelhado, gerado pelo pipeline.
- **Excel consolidado**: `tabelas_caged_YYYY_MM.xlsx` (não é tabela analítica unitária).

## Granularidades

| Granularidade | Descrição |
|---|---|
| `resumo` | Indicadores agregados da competência |
| `uf` | Agregação por UF |
| `municipio` | Agregação por município |
| `setor` | Agregação por seção/setor |
| `ocupacao` | Agregação por ocupação (CBO) |
| `salario` | Indicadores de salário por recorte |
| `perfil` | Perfil demográfico genérico |
| `perfil_sexo` | Perfil por sexo |
| `perfil_faixa_etaria` | Perfil por faixa etária |
| `perfil_instrucao` | Perfil por grau de instrução |
| `desconhecida` | Não classificada automaticamente |

## Resumo por competência

| Competência | CSV | Parquet | Excel | Suspeitos | Observações |
|---|---:|---:|---:|---|---|
| 2026-02 | 50 | 50 | 1 | — | CSV/Parquet alinhados com pipeline atual (50 tabelas). |
| 2026-03 | 50 | 50 | 1 | — | CSV/Parquet alinhados com pipeline atual (50 tabelas). |
| 2026-04 | 50 | 50 | 1 | — | CSV/Parquet alinhados com pipeline atual (50 tabelas). |
| 2026-05 | 50 | 50 | 1 | — | CSV/Parquet alinhados com pipeline atual (50 tabelas). |
| 2026-06 | 50 | 50 | 1 | — | CSV/Parquet alinhados com pipeline atual (50 tabelas). |

## Tabelas encontradas

| table_name | competências | scope | granularity | row_count | column_count | has_csv | has_parquet | suspected_legacy |
|---|---|---|---|---:|---:|---|---|---|
| tabela_municipio | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | municipio | 5503 | 5 | sim | sim | não |
| tabela_municipio_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | municipio | 399 | 5 | sim | sim | não |
| tabela_municipio_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | municipio | 29 | 5 | sim | sim | não |
| tabela_ocupacao | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | ocupacao | 2498 | 4 | sim | sim | não |
| tabela_ocupacao_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | ocupacao | 1808 | 4 | sim | sim | não |
| tabela_ocupacao_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | ocupacao | 1469 | 4 | sim | sim | não |
| tabela_perfil_faixa_etaria | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_faixa_etaria | 8 | 4 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_faixa_etaria | 90 | 5 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_faixa_etaria | 83 | 5 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_faixa_etaria | 81 | 5 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 172 | 13 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 164 | 13 | sim | sim | não |
| tabela_perfil_faixa_etaria_instrucao_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 160 | 13 | sim | sim | não |
| tabela_perfil_faixa_etaria_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_faixa_etaria | 8 | 4 | sim | sim | não |
| tabela_perfil_faixa_etaria_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_faixa_etaria | 8 | 4 | sim | sim | não |
| tabela_perfil_faixa_etaria_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 16 | 12 | sim | sim | não |
| tabela_perfil_faixa_etaria_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 16 | 12 | sim | sim | não |
| tabela_perfil_faixa_etaria_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 16 | 12 | sim | sim | não |
| tabela_perfil_graudeinstrucao | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_instrucao | 12 | 4 | sim | sim | não |
| tabela_perfil_graudeinstrucao_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_instrucao | 12 | 4 | sim | sim | não |
| tabela_perfil_graudeinstrucao_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_instrucao | 12 | 4 | sim | sim | não |
| tabela_perfil_graudeinstrucao_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 24 | 12 | sim | sim | não |
| tabela_perfil_graudeinstrucao_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 24 | 12 | sim | sim | não |
| tabela_perfil_graudeinstrucao_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 24 | 12 | sim | sim | não |
| tabela_perfil_sexo | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_sexo | 2 | 4 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_sexo | 16 | 5 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_sexo | 15 | 5 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_sexo | 15 | 5 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 32 | 13 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 30 | 13 | sim | sim | não |
| tabela_perfil_sexo_faixa_etaria_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 30 | 13 | sim | sim | não |
| tabela_perfil_sexo_instrucao | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | perfil_sexo | 24 | 5 | sim | sim | não |
| tabela_perfil_sexo_instrucao_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_sexo | 24 | 5 | sim | sim | não |
| tabela_perfil_sexo_instrucao_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_sexo | 24 | 5 | sim | sim | não |
| tabela_perfil_sexo_instrucao_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 48 | 13 | sim | sim | não |
| tabela_perfil_sexo_instrucao_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 48 | 13 | sim | sim | não |
| tabela_perfil_sexo_instrucao_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 48 | 13 | sim | sim | não |
| tabela_perfil_sexo_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | perfil_sexo | 2 | 4 | sim | sim | não |
| tabela_perfil_sexo_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | perfil_sexo | 2 | 4 | sim | sim | não |
| tabela_perfil_sexo_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 4 | 12 | sim | sim | não |
| tabela_perfil_sexo_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 4 | 12 | sim | sim | não |
| tabela_perfil_sexo_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 4 | 12 | sim | sim | não |
| tabela_resumo | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | resumo | 1 | 4 | sim | sim | não |
| tabela_resumo_salario | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | salario | 2 | 4 | sim | sim | não |
| tabela_resumo_salario_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | salario | 2 | 4 | sim | sim | não |
| tabela_resumo_salario_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | salario | 2 | 4 | sim | sim | não |
| tabela_setor | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | setor | 22 | 4 | sim | sim | não |
| tabela_setor_pr | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | parana | setor | 21 | 4 | sim | sim | não |
| tabela_setor_rmc | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | rmc | setor | 21 | 4 | sim | sim | não |
| tabela_uf | 2026-02, 2026-03, 2026-04, 2026-05, 2026-06 | brasil | uf | 28 | 4 | sim | sim | não |

## Artefatos suspeitos

Nenhum artefato suspeito identificado nas competências atuais.

## Observações

- Regenerar o catálogo após cada processamento mensal com `python -m pipelines.jobs.build_gold_catalog`.
- O catálogo não altera arquivos Gold; apenas documenta metadados.
- Tabelas legadas `tabela_perfil`, `tabela_perfil_pr` e `tabela_perfil_rmc` devem ser marcadas como suspeitas caso reapareçam.
- Integração futura recomendada: executar o job de catálogo ao final do pipeline mensal.
