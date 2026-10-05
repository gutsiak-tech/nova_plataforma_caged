"""Garante que módulos comuns e wrappers legados em src/ permanecem importáveis."""


def test_import_pipelines_common_dictionaries() -> None:
    from pipelines.common import dictionaries

    assert hasattr(dictionaries, "mapeamentos")
    assert isinstance(dictionaries.mapeamentos, dict)
    assert "uf" in dictionaries.mapeamentos


def test_import_pipelines_common_utils() -> None:
    from pipelines.common import utils

    assert callable(utils.ensure_dir)
    assert callable(utils.save_json)


def test_import_src_dictionaries_wrapper() -> None:
    from src import dictionaries

    assert hasattr(dictionaries, "mapeamentos")
    assert dictionaries.mapeamentos is not None


def test_import_src_utils_wrapper() -> None:
    from src import utils

    assert callable(utils.ensure_dir)
    assert callable(utils.save_json)
