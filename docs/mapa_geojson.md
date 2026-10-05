# Mapa territorial — assets GeoJSON

Documentação da estratégia de mapa adotada na etapa **M3** e preparação de assets na **M3.1**.

## Estratégia

O dashboard usa **GeoJSON estático** servido por `dashboard/public/geo/` antes de integrar PostGIS/Tegola. Métricas (saldo, admissões, desligamentos) continuam vindo da **camada Gold** via API; o mapa apenas fornece geometrias.

| Escopo | GeoJSON | Dados Gold |
|--------|---------|------------|
| Brasil (`br`) | `ufs.geojson` | `tabela_uf` |
| Paraná (`pr`) | `municipios_pr.geojson` | `tabela_municipio_pr` |
| RMC (`rmc`) | `municipios_rmc.geojson` | `tabela_municipio_rmc` |

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

Join inicial com a Gold por **nome normalizado** (`*_norm`). Código IBGE (`cod_municipio`) é preservado quando presente no shapefile para migração futura.

## PostGIS e Tegola

A infraestrutura em `infra/docker-compose.yml` e `services/tileserver/` permanece para etapa futura (**M6**), após integração de código IBGE na Gold e correção das views SQL.

## Próxima etapa

**M4** — implementar `TerritoryMap` com Leaflet/react-leaflet, substituindo `MapPlaceholder`.
