"""Testes estáticos de alinhamento de configuração (Etapa 3C).

Protege Tailwind único, limite de tabela, defaults de competência,
proxy/API base URL, CORS documentado e referências ao contrato de dados.
Não depende de data-lake, npm ou API em execução.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent

README_MD = PROJECT_ROOT / "README.md"
CONFIG_MD = PROJECT_ROOT / "docs" / "CONFIG.md"
DATA_CONTRACT_MD = PROJECT_ROOT / "docs" / "DATA_CONTRACT.md"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"

TAILWIND_CJS = PROJECT_ROOT / "dashboard" / "tailwind.config.cjs"
TAILWIND_TS = PROJECT_ROOT / "dashboard" / "tailwind.config.ts"
POSTCSS_CJS = PROJECT_ROOT / "dashboard" / "postcss.config.cjs"
VITE_CONFIG = PROJECT_ROOT / "dashboard" / "vite.config.ts"

API_LIMITS_TS = PROJECT_ROOT / "dashboard" / "src" / "lib" / "apiLimits.ts"
GOLD_TS = PROJECT_ROOT / "dashboard" / "src" / "api" / "gold.ts"
CONSTANTS_TS = PROJECT_ROOT / "dashboard" / "src" / "api" / "constants.ts"
HTTP_TS = PROJECT_ROOT / "dashboard" / "src" / "api" / "http.ts"

ROUTES_GOLD_PY = PROJECT_ROOT / "app" / "api" / "routes_gold.py"
CONFIG_PY = PROJECT_ROOT / "app" / "core" / "config.py"
MAIN_PY = PROJECT_ROOT / "app" / "main.py"

FRONTEND_CONTRACT_TEST = PROJECT_ROOT / "tests" / "test_gold_frontend_contract.py"
CONFIG_ALIGNMENT_TEST = PROJECT_ROOT / "tests" / "test_config_alignment.py"

TABLE_MAX_LIMIT = 2000

STALE_FIXED_TEST_COUNT_PHRASES = (
    "128 testes",
    "183 testes",
    "216 testes",
)


def _read(path: Path) -> str:
    assert path.is_file(), f"Arquivo esperado ausente: {path}"
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def readme_text() -> str:
    return _read(README_MD)


@pytest.fixture(scope="module")
def config_md_text() -> str:
    return _read(CONFIG_MD)


# --- 1. Tailwind único ---


def test_tailwind_cjs_exists() -> None:
    assert TAILWIND_CJS.is_file(), "dashboard/tailwind.config.cjs deve existir"


def test_tailwind_ts_must_not_exist() -> None:
    assert not TAILWIND_TS.is_file(), (
        "dashboard/tailwind.config.ts não deve existir (Etapa 3B — config único .cjs)"
    )


def test_postcss_uses_tailwindcss() -> None:
    text = _read(POSTCSS_CJS)
    assert "tailwindcss" in text, "postcss.config.cjs deve referenciar tailwindcss"


def test_config_md_documents_tailwind_cjs(config_md_text: str) -> None:
    assert "tailwind.config.cjs" in config_md_text


def test_readme_documents_tailwind_cjs(readme_text: str) -> None:
    assert "tailwind.config.cjs" in readme_text


# --- 2. Limite máximo de tabela ---


def test_api_limits_ts_max_limit() -> None:
    text = _read(API_LIMITS_TS)
    assert re.search(r"API_TABLE_MAX_LIMIT\s*=\s*2000", text), (
        "apiLimits.ts deve definir API_TABLE_MAX_LIMIT = 2000"
    )


def test_routes_gold_limit_ceiling() -> None:
    text = _read(ROUTES_GOLD_PY)
    assert "le=2000" in text, "routes_gold.py deve limitar limit com le=2000"


def test_gold_ts_default_limit_coherent() -> None:
    text = _read(GOLD_TS)
    assert re.search(r"limit:\s*opts\?\.limit\s*\?\?\s*2000", text), (
        "gold.ts deve usar default limit 2000 em fetchTable"
    )


def test_config_md_documents_table_limit(config_md_text: str) -> None:
    assert "2000" in config_md_text
    assert "apiLimits.ts" in config_md_text or "API_TABLE_MAX_LIMIT" in config_md_text


# --- 3. Defaults de competência ---


def test_constants_ts_default_ano() -> None:
    text = _read(CONSTANTS_TS)
    assert re.search(r"DEFAULT_API_ANO\s*=\s*2026", text)


def test_constants_ts_default_mes() -> None:
    text = _read(CONSTANTS_TS)
    assert re.search(r"DEFAULT_API_MES\s*=\s*1", text)


def test_env_example_default_ano() -> None:
    text = _read(ENV_EXAMPLE)
    assert re.search(r"^DEFAULT_ANO=2026\s*$", text, re.MULTILINE)


def test_env_example_default_mes() -> None:
    text = _read(ENV_EXAMPLE)
    assert re.search(r"^DEFAULT_MES=1\s*$", text, re.MULTILINE)


def test_config_py_default_ano_fallback() -> None:
    text = _read(CONFIG_PY)
    assert re.search(r'DEFAULT_ANO\s*=\s*int\(os\.getenv\("DEFAULT_ANO",\s*"2026"\)\)', text)


def test_config_py_default_mes_fallback() -> None:
    text = _read(CONFIG_PY)
    assert re.search(r'DEFAULT_MES\s*=\s*int\(os\.getenv\("DEFAULT_MES",\s*"1"\)\)', text)


def test_readme_no_conflicting_default_mes_example(readme_text: str) -> None:
    assert not re.search(r"DEFAULT_MES=2", readme_text), (
        "README não deve conter exemplo conflitante DEFAULT_MES=2"
    )
    assert not re.search(r"DEFAULT_MES`[^\n]*ex\.:\s*`2`", readme_text), (
        "README não deve sugerir DEFAULT_MES=2 como exemplo"
    )


def test_config_md_documents_defaults(config_md_text: str) -> None:
    assert "DEFAULT_ANO" in config_md_text
    assert "DEFAULT_MES" in config_md_text


# --- 4. API base URL e proxy ---


def test_http_ts_references_vite_api_base_url() -> None:
    text = _read(HTTP_TS)
    assert "VITE_API_BASE_URL" in text


def test_vite_config_api_proxy() -> None:
    text = _read(VITE_CONFIG)
    assert re.search(r"['\"]/api['\"]", text), "vite.config.ts deve configurar proxy /api"
    assert "8000" in text, "vite.config.ts deve apontar proxy para porta 8000"


def test_config_md_documents_vite_api_base_url(config_md_text: str) -> None:
    assert "VITE_API_BASE_URL" in config_md_text


def test_readme_documents_vite_api_base_url(readme_text: str) -> None:
    assert "VITE_API_BASE_URL" in readme_text


def test_dashboard_env_example_exists() -> None:
    path = PROJECT_ROOT / "dashboard" / ".env.example"
    assert path.is_file(), "dashboard/.env.example deve existir"
    text = path.read_text(encoding="utf-8")
    assert "VITE_API_BASE_URL" in text


# --- 5. CORS documentado ---


def test_main_py_uses_cors_middleware() -> None:
    text = _read(MAIN_PY)
    assert "CORSMiddleware" in text


def test_main_py_uses_cors_origins_from_config() -> None:
    text = _read(MAIN_PY)
    assert "CORS_ORIGINS" in text


def test_config_py_default_cors_dev_ports() -> None:
    text = _read(CONFIG_PY)
    for port in ("5173", "5174", "4173"):
        assert port in text, f"app/core/config.py deve incluir porta CORS default {port}"


def test_config_py_parse_cors_origins() -> None:
    text = _read(CONFIG_PY)
    assert "parse_cors_origins" in text
    assert "CORS_ORIGINS" in text


def test_env_example_documents_cors_origins() -> None:
    text = _read(ENV_EXAMPLE)
    assert "CORS_ORIGINS" in text


def test_config_md_documents_cors(config_md_text: str) -> None:
    assert "CORS" in config_md_text
    assert "CORS_ORIGINS" in config_md_text


# --- 6. Documentação de contrato ---


def test_data_contract_md_exists() -> None:
    assert DATA_CONTRACT_MD.is_file()


def test_readme_references_data_contract(readme_text: str) -> None:
    assert "DATA_CONTRACT.md" in readme_text


def test_readme_references_frontend_contract_test(readme_text: str) -> None:
    assert "test_gold_frontend_contract.py" in readme_text


def test_config_md_references_data_contract(config_md_text: str) -> None:
    assert "DATA_CONTRACT.md" in config_md_text


# --- 7. Documentação de testes (contagem dinâmica) ---


def test_readme_documents_dynamic_test_collection(readme_text: str) -> None:
    assert "python -m pytest tests/ --collect-only -q" in readme_text
    assert "testes" in readme_text.lower()


def test_readme_no_stale_fixed_test_counts(readme_text: str) -> None:
    for phrase in STALE_FIXED_TEST_COUNT_PHRASES:
        assert phrase not in readme_text, (
            f"README não deve fixar contagem obsoleta: {phrase!r}"
        )


def test_readme_documents_collect_only_command(readme_text: str) -> None:
    assert "python -m pytest tests/ --collect-only -q" in readme_text


def test_readme_references_config_alignment_test(readme_text: str) -> None:
    assert "test_config_alignment.py" in readme_text


def test_readme_references_config_md(readme_text: str) -> None:
    assert "CONFIG.md" in readme_text


def test_config_md_documents_collect_only_command(config_md_text: str) -> None:
    assert "python -m pytest tests/ --collect-only -q" in config_md_text


def test_config_md_references_config_alignment_test(config_md_text: str) -> None:
    assert "test_config_alignment.py" in config_md_text


def test_config_md_references_frontend_contract_test(config_md_text: str) -> None:
    assert "test_gold_frontend_contract.py" in config_md_text


def test_config_md_no_stale_fixed_test_counts(config_md_text: str) -> None:
    for phrase in STALE_FIXED_TEST_COUNT_PHRASES:
        assert phrase not in config_md_text, (
            f"CONFIG.md não deve fixar contagem obsoleta: {phrase!r}"
        )


def test_config_alignment_test_file_exists() -> None:
    assert CONFIG_ALIGNMENT_TEST.is_file()


def test_frontend_contract_test_file_exists() -> None:
    assert FRONTEND_CONTRACT_TEST.is_file()
