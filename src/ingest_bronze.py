from datetime import datetime
from src.paths import bronze_mes_dir
from src.utils import ensure_dir, save_json


def register_bronze(ano: int, mes: int) -> None:
    """
    Registra a camada bronze para uma competência específica.
    Espera encontrar, na pasta de origem:
      - microdados.txt
      - dicionario.pdf (opcional)

    Gera:
      - metadata.json
    """
    pasta = bronze_mes_dir(ano, mes)
    ensure_dir(pasta)

    microdados = pasta / "microdados.txt"
    dicionario = pasta / "dicionario.pdf"

    if not microdados.exists():
        raise FileNotFoundError(
            f"Arquivo obrigatório não encontrado: {microdados}"
        )

    metadata = {
        "fonte": "Novo CAGED",
        "ano": ano,
        "mes": mes,
        "arquivo_microdados": "microdados.txt",
        "arquivo_dicionario": "dicionario.pdf" if dicionario.exists() else None,
        "data_ingestao": datetime.now().isoformat(),
        "separador": ";",
        "encoding": "utf-8",
        "status": "bronze_ok"
    }

    save_json(metadata, pasta / "metadata.json")