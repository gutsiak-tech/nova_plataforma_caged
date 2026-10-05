from pathlib import Path
from src.config import BRONZE_DIR, SILVER_DIR, GOLD_DIR


def bronze_mes_dir(ano: int, mes: int) -> Path:
    return BRONZE_DIR / f"ano={ano}" / f"mes={mes:02d}" / "origem"


def silver_mes_dir(ano: int, mes: int) -> Path:
    return SILVER_DIR / f"ano={ano}" / f"mes={mes:02d}"


def gold_mes_dir(ano: int, mes: int) -> Path:
    return GOLD_DIR / f"ano={ano}" / f"mes={mes:02d}"