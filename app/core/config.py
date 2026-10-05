from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

# =========================
# Raiz do projeto
# =========================
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# =========================
# Diretórios principais
# =========================
DATA_LAKE_DIR = PROJECT_ROOT / "data-lake"
BRONZE_DIR = DATA_LAKE_DIR / "bronze"
SILVER_DIR = DATA_LAKE_DIR / "silver"
GOLD_DIR = DATA_LAKE_DIR / "gold"

APP_DIR = PROJECT_ROOT / "app"
PIPELINES_DIR = PROJECT_ROOT / "pipelines"
SQL_DIR = PROJECT_ROOT / "sql"
INFRA_DIR = PROJECT_ROOT / "infra"
LOGS_DIR = PROJECT_ROOT / "logs"
TESTS_DIR = PROJECT_ROOT / "tests"
NOTEBOOKS_DIR = PROJECT_ROOT / "notebooks"
SRC_LEGACY_DIR = PROJECT_ROOT / "src"

# =========================
# Subárvores de dados
# =========================
BRONZE_CAGED_DIR = BRONZE_DIR / "caged"
SILVER_CAGED_DIR = SILVER_DIR / "caged"
GOLD_CAGED_DIR = GOLD_DIR / "caged"

# =========================
# Configurações gerais
# =========================
DEFAULT_ANO = int(os.getenv("DEFAULT_ANO", "2026"))
DEFAULT_MES = int(os.getenv("DEFAULT_MES", "1"))
DEFAULT_UF = os.getenv("DEFAULT_UF", "PR")

# =========================
# Bronze — validação de ingestão
# =========================
BRONZE_MIN_FILE_SIZE_WARNING_BYTES = int(
    os.getenv("BRONZE_MIN_FILE_SIZE_WARNING_BYTES", "50000")
)
BRONZE_SAMPLE_ROWS = int(os.getenv("BRONZE_SAMPLE_ROWS", "100"))

# =========================
# Banco de dados
# =========================
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "plataforma")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")

# =========================
# CORS (API FastAPI)
# =========================
_DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
)


def parse_cors_origins(raw: str | None = None) -> list[str]:
    """
    Origens CORS permitidas. Use CORS_ORIGINS (CSV) no .env; vazio = defaults de dev Vite.
    """
    if raw is None:
        raw = os.getenv("CORS_ORIGINS")
    if raw is None or not str(raw).strip():
        return list(_DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in str(raw).split(",") if origin.strip()]


CORS_ORIGINS: list[str] = parse_cors_origins()

# =========================
# Logs
# =========================
PIPELINE_LOG_FILE = LOGS_DIR / "pipeline.log"
API_LOG_FILE = LOGS_DIR / "api.log"