"""Utilitários compartilhados do pipeline (módulo oficial)."""

from pipelines.common.dictionaries import mapeamentos
from pipelines.common.utils import ensure_dir, save_json

__all__ = ["mapeamentos", "ensure_dir", "save_json"]
