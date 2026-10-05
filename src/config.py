from pathlib import Path

# Raiz do projeto: .../projeto_caged
BASE_DIR = Path(__file__).resolve().parent.parent

# Data lake
DATA_LAKE_DIR = BASE_DIR / "data-lake"

# Camadas
BRONZE_DIR = DATA_LAKE_DIR / "bronze" / "caged"
SILVER_DIR = DATA_LAKE_DIR / "silver" / "caged"
GOLD_DIR = DATA_LAKE_DIR / "gold" / "caged" / "tabelas"