import json
from pathlib import Path


def ensure_dir(path: Path) -> None:
    """
    Garante que o diretório exista.
    Se não existir, cria toda a árvore necessária.
    """
    path.mkdir(parents=True, exist_ok=True)


def save_json(data: dict, path: Path) -> None:
    """
    Salva um dicionário Python em arquivo JSON.
    """
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)