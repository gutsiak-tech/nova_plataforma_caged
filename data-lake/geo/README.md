# Dados geográficos — CAGED Dashboard

Esta pasta contém a malha cartográfica usada pelo mapa da página **Território** (estratégia GeoJSON estático, etapa M3/M3.1).

## Objetivo

Converter shapefiles oficiais em GeoJSONs leves e padronizados para consumo futuro pelo dashboard, **sem depender de PostGIS ou Tegola** na primeira versão do mapa.

## Estrutura

```
data-lake/geo/
├── README.md                 # este arquivo
├── raw/                      # shapefiles brutos (NÃO versionados no Git)
│   ├── ufs/                  # malha de UFs/estados do Brasil
│   └── municipios_pr/        # malha municipal do Paraná
└── processed/                # GeoJSONs gerados pelo script
    ├── ufs.geojson
    ├── municipios_pr.geojson
    ├── municipios_rmc.geojson
    └── geo_assets.metadata.json
```

Cópia para o frontend:

```
dashboard/public/geo/
├── ufs.geojson
├── municipios_pr.geojson
├── municipios_rmc.geojson
└── geo_assets.metadata.json
```

## Shapefiles brutos

Coloque os arquivos `.shp` (e sidecars `.dbf`, `.shx`, `.prj`, etc.) em:

- `data-lake/geo/raw/ufs/`
- `data-lake/geo/raw/municipios_pr/`

**Os shapefiles brutos não entram no Git** (ver `.gitignore`).

## Como gerar os GeoJSONs

Na raiz do projeto, com o ambiente virtual ativo e dependências instaladas (`geopandas` já está em `requirements.txt`):

```bash
python -m pipelines.geo.prepare_geo_assets \
  --ufs-shp "data-lake/geo/raw/ufs/BR_UF_2024.shp" \
  --mun-pr-shp "data-lake/geo/raw/municipios_pr/PR_Municipios_2024.shp" \
  --out-dir "data-lake/geo/processed" \
  --dashboard-copy-dir "dashboard/public/geo" \
  --simplify-tolerance 0.0005
```

Ajuda:

```bash
python -m pipelines.geo.prepare_geo_assets --help
```

## Saídas geradas

| Arquivo | Uso futuro no dashboard |
|---------|-------------------------|
| `ufs.geojson` | Mapa por UF quando `scope=br` |
| `municipios_pr.geojson` | Mapa municipal quando `scope=pr` |
| `municipios_rmc.geojson` | Mapa da RMC quando `scope=rmc` |
| `geo_assets.metadata.json` | Metadados, contagens, warnings |

## RMC sem shapefile dedicado

A **RMC** não possui shapefile próprio neste projeto. O arquivo `municipios_rmc.geojson` é derivado filtrando `municipios_pr.geojson` pela lista `MUNICIPIOS_RMC` definida em `pipelines/gold/aggregate_indicators.py` (29 municípios), usando a chave `municipio_norm`.

## CRS

Todos os GeoJSONs são gerados em **EPSG:4326** (WGS84). Shapefiles em outro CRS são reprojetados automaticamente.

## Fonte e licença

Utilize malhas oficiais do **IBGE** ou fonte institucional autorizada. Documente a versão da malha (ano, escala) no repositório interno da universidade. Este repositório não distribui shapefiles brutos.

## Próximas etapas

- **M4** — implementar mapa mínimo no dashboard (Leaflet + join com dados Gold)
- **M6** — PostGIS/Tegola, após código IBGE estável na camada Gold
