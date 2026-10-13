# Mapa territorial — assets GeoJSON

Documentação da estratégia de mapa adotada na etapa **M3** e preparação de assets na **M3.1**.

## Estratégia

O dashboard usa **GeoJSON estático** servido por `dashboard/public/geo/`. Métricas (saldo, admissões, desligamentos) vêm da **camada Gold** via API. O mapa fornece as geometrias. PostGIS e Tegola não entram nesse caminho.

| Escopo | GeoJSON | Dados Gold |
|--------|---------|------------|
| Brasil (`br`) | `ufs.geojson` | `tabela_uf` |
| Paraná (`pr`) | `municipios_pr.geojson` | `tabela_municipio_pr` |
| RMC (`rmc`) | `municipios_rmc.geojson` | `tabela_municipio_rmc` |

A fonte do Brasil continua `ufs.geojson`. A experiência territorial (entrada e detalhe) renderiza `ufs.presentation.geojson`, gerada uma vez por `node pipelines/geo/prepare_ufs_presentation.mjs`. O fundo e a página Território seguem na fonte original. Paraná e RMC não são simplificados.

## Shapefiles necessários

1. UFs/estados do Brasil
2. Municípios do Paraná

Não é necessário shapefile da RMC — ela é filtrada a partir dos municípios paranaenses.

## Preparar assets

Ver instruções completas em [`data-lake/geo/README.md`](../data-lake/geo/README.md).

```bash
python -m pipelines.geo.prepare_geo_assets --help
```

## Chaves de join

Propriedades geradas nos GeoJSONs:

- `uf`, `uf_sigla`, `uf_norm`, `cod_uf`
- `municipio`, `municipio_norm`, `cod_municipio`

Join com a Gold por **nome normalizado** (`*_norm`). O código IBGE (`cod_municipio`) também vai no GeoJSON e é o identificador do Feature Focus municipal.

## PostGIS e Tegola

A infraestrutura em `infra/docker-compose.yml` e `services/tileserver/` existe e não é usada pelo mapa atual.

## Estado do mapa

`TerritoryMap` (Leaflet) já está no dashboard. `MapPlaceholder` aparece quando o GeoJSON não carrega. A experiência territorial do Brasil renderiza `ufs.presentation.geojson`.
