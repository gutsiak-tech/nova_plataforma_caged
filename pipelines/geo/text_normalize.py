from __future__ import annotations

import unicodedata


def remover_acentos(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(texto)) if not unicodedata.combining(c)
    )


def normalizar_texto(txt: object) -> str | None:
    if txt is None:
        return None
    text = str(txt).strip()
    if not text or text.lower() == "nan":
        return None
    return " ".join(text.split())


def normalizar_texto_upper_sem_acento(txt: object) -> str | None:
    base = normalizar_texto(txt)
    if base is None:
        return None
    return remover_acentos(base).upper()
