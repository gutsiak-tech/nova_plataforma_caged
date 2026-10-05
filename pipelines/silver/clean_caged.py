import pandas as pd
import unicodedata
from pathlib import Path
from typing import Iterable, Optional

from app.core.config import (
    SILVER_CAGED_DIR,
    BRONZE_CAGED_DIR,
    DEFAULT_ANO,
    DEFAULT_MES,
    PIPELINE_LOG_FILE,
)
from app.core.logging import setup_logger
from pipelines.common.dictionaries import mapeamentos
from pipelines.common.utils import ensure_dir, save_json
from pipelines.silver.validate_silver import (
    SilverValidationError,
    check_bronze_metadata_gate,
    ensure_silver_valid,
    validate_silver_dataframe,
)

logger = setup_logger("silver", PIPELINE_LOG_FILE)


# =========================================================
# PATHS
# =========================================================
def bronze_mes_dir(ano: int, mes: int) -> Path:
    return BRONZE_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


def silver_mes_dir(ano: int, mes: int) -> Path:
    return SILVER_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


# =========================================================
# NORMALIZAÇÃO DE TEXTO
# =========================================================
def remover_acentos(texto: str) -> str:
    if texto is None:
        return texto
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(texto))
        if not unicodedata.combining(c)
    )


def normalizar_nome_coluna(col: str) -> str:
    """
    Padroniza nomes de colunas:
    - strip
    - lowercase
    - remoção de acentos
    - troca espaços por underscore
    """
    col = str(col).strip().lower()
    col = remover_acentos(col)
    col = col.replace(" ", "_")
    return col


def limpar_texto_geral(serie: pd.Series) -> pd.Series:
    """
    Limpeza leve para colunas textuais:
    - strip
    - colapsa múltiplos espaços
    - preserva nulos
    """
    s = serie.astype("string")
    s = s.str.strip()
    s = s.str.replace(r"\s+", " ", regex=True)
    return s


# =========================================================
# LIMPEZA NUMÉRICA
# =========================================================
def limpar_numero_brasileiro(serie: pd.Series) -> pd.Series:
    """
    Converte números em formato brasileiro para formato parseável.

    Exemplos:
    '1.234,56' -> '1234.56'
    '44,00'    -> '44.00'
    """
    s = serie.astype("string").str.strip()

    s = s.replace(
        {
            "": pd.NA,
            "nan": pd.NA,
            "None": pd.NA,
            "NA": pd.NA,
            "N/A": pd.NA,
            "<NA>": pd.NA,
            "-": pd.NA,
            "--": pd.NA,
        }
    )

    s = s.str.replace(r"\s+", "", regex=True)
    s = s.str.replace("R$", "", regex=False)

    # padrão brasileiro -> padrão com ponto decimal
    s = s.str.replace(".", "", regex=False)
    s = s.str.replace(",", ".", regex=False)

    return s


def converter_coluna_numerica(
    df: pd.DataFrame,
    col: str,
    *,
    diagnosticar: bool = False,
) -> None:
    """
    Converte uma coluna para numérico com segurança.
    Modifica o dataframe in-place.
    """
    if col not in df.columns:
        return

    if diagnosticar:
        logger.info(
            f"[DEBUG_NUM] Antes | col={col} dtype={df[col].dtype} "
            f"nulos={int(df[col].isna().sum())}"
        )

    if pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
        df[col] = limpar_numero_brasileiro(df[col])

    df[col] = pd.to_numeric(df[col], errors="coerce")

    if diagnosticar:
        logger.info(
            f"[DEBUG_NUM] Depois | col={col} dtype={df[col].dtype} "
            f"nulos={int(df[col].isna().sum())}"
        )


# =========================================================
# REGRAS DE NEGÓCIO
# =========================================================
def classificar_faixa_etaria(idade: Optional[float]) -> str:
    if pd.isna(idade):
        return "Ignorado"
    if idade < 18:
        return "Até 17 anos"
    elif idade <= 24:
        return "18 a 24 anos"
    elif idade <= 29:
        return "25 a 29 anos"
    elif idade <= 39:
        return "30 a 39 anos"
    elif idade <= 49:
        return "40 a 49 anos"
    elif idade <= 64:
        return "50 a 64 anos"
    return "65 anos ou mais"


def aplicar_mapeamentos_categoricos(
    df: pd.DataFrame,
    mapeamentos_dict: dict,
    *,
    excluir_colunas: Optional[Iterable[str]] = None,
) -> pd.DataFrame:
    """
    Aplica mapeamentos apenas em colunas categóricas/codificadas.
    Garante tipo textual homogêneo ao final para evitar erros no parquet.
    """
    excluir = set(excluir_colunas or [])

    for coluna, dicionario in mapeamentos_dict.items():
        if coluna in df.columns and coluna not in excluir:
            original = df[coluna].copy()
            mapeada = df[coluna].map(dicionario)

            # preserva o original se não existir no dicionário
            df[coluna] = mapeada.fillna(original)

            # força tudo para texto homogêneo
            df[coluna] = df[coluna].astype("string").str.strip()

    return df


def validar_colunas_criticas(df: pd.DataFrame) -> None:
    """
    Faz checks básicos antes de salvar.
    """
    colunas_criticas = ["horascontratuais", "salario", "valorsalariofixo"]
    presentes = [c for c in colunas_criticas if c in df.columns]

    if not presentes:
        logger.warning("[VALIDACAO] Nenhuma coluna crítica encontrada.")
        return

    resumo_nulos = df[presentes].isna().sum().to_dict()
    logger.info(f"[VALIDACAO] Nulos colunas críticas: {resumo_nulos}")

    for col in presentes:
        if df[col].notna().sum() == 0:
            raise ValueError(
                f"[ERRO] A coluna '{col}' ficou totalmente nula após a limpeza."
            )


def log_resumo_colunas(df: pd.DataFrame, colunas: list[str], titulo: str) -> None:
    logger.info(f"[RESUMO] {titulo}")
    for col in colunas:
        if col in df.columns:
            logger.info(
                f"[RESUMO] col={col} dtype={df[col].dtype} "
                f"nulos={int(df[col].isna().sum())}"
            )


# =========================================================
# PIPELINE PRINCIPAL
# =========================================================
def run_clean_caged(
    ano: int = DEFAULT_ANO,
    mes: int = DEFAULT_MES,
    *,
    diagnosticar: bool = True,
) -> pd.DataFrame:
    logger.info(f"[SILVER] Iniciando | ano={ano} mes={mes}")

    bronze_dir = bronze_mes_dir(ano, mes)
    silver_dir = silver_mes_dir(ano, mes)
    ensure_dir(silver_dir)

    bronze_gate_warnings = check_bronze_metadata_gate(ano, mes)
    for warning in bronze_gate_warnings:
        logger.warning("[SILVER] %s", warning)

    file_path = bronze_dir / "microdados.txt"

    if not file_path.exists():
        raise FileNotFoundError(f"Arquivo bruto não encontrado: {file_path}")

    # -----------------------------------------------------
    # 1) Leitura
    # -----------------------------------------------------
    df = pd.read_csv(
        file_path,
        sep=";",
        encoding="utf-8",
        low_memory=False,
    )

    logger.info(f"[SILVER] Arquivo lido | shape={df.shape}")

    # -----------------------------------------------------
    # 2) Padronização dos nomes de colunas
    # -----------------------------------------------------
    df.columns = [normalizar_nome_coluna(c) for c in df.columns]
    logger.info(f"[SILVER] Colunas padronizadas | total={len(df.columns)}")

    # -----------------------------------------------------
    # 3) Metadados
    # -----------------------------------------------------
    df["ano"] = ano
    df["mes"] = mes
    df["competencia_str"] = f"{ano}-{mes:02d}"

    if "competenciamov" in df.columns:
        df["competencia_date"] = pd.to_datetime(
            df["competenciamov"].astype(str),
            format="%Y%m",
            errors="coerce",
        )
    else:
        df["competencia_date"] = pd.NaT
        logger.warning("[SILVER] Coluna 'competenciamov' não encontrada.")

    # -----------------------------------------------------
    # 4) Conversão numérica
    # -----------------------------------------------------
    colunas_numericas = [
        "idade",
        "horascontratuais",
        "salario",
        "valorsalariofixo",
        "saldomovimentacao",
        "subclasse",
        "cbo2002ocupacao",
        "municipio",
        "uf",
        "racacor",
        "categoria",
        "sexo",
        "graudeinstrucao",
        "indtrabparcial",
        "indtrabintermitente",
        "tamestabjan",
        "indicadoraprendiz",
        "tipoempregador",
        "tipoestabelecimento",
        "tipomovimentacao",
        "tipodedeficiencia",
        "origemdainformacao",
        "indicadordeforadoprazo",
        "unidadesalariocodigo",
        "regiao",
    ]

    colunas_debug = {"horascontratuais", "salario", "valorsalariofixo"}

    for col in colunas_numericas:
        if col in df.columns:
            converter_coluna_numerica(
                df,
                col,
                diagnosticar=diagnosticar and col in colunas_debug,
            )

    if diagnosticar:
        log_resumo_colunas(
            df,
            ["horascontratuais", "salario", "valorsalariofixo", "municipio", "uf"],
            "Após conversão numérica",
        )

    # -----------------------------------------------------
    # 5) Variáveis derivadas
    # -----------------------------------------------------
    if "idade" in df.columns:
        df["faixa_etaria"] = df["idade"].apply(classificar_faixa_etaria)
    else:
        df["faixa_etaria"] = "Ignorado"

    if "saldomovimentacao" not in df.columns:
        raise ValueError("A coluna 'saldomovimentacao' é obrigatória.")

    df = df.dropna(subset=["saldomovimentacao"]).copy()

    df["admissao"] = (df["saldomovimentacao"] == 1).astype(int)
    df["desligamento"] = (df["saldomovimentacao"] == -1).astype(int)

    # -----------------------------------------------------
    # 6) Limpeza leve de colunas textuais pré-mapeamento
    # -----------------------------------------------------
    cols_obj = df.select_dtypes(include=["object", "string"]).columns.tolist()
    for col in cols_obj:
        df[col] = limpar_texto_geral(df[col])

    # -----------------------------------------------------
    # 7) Aplicação dos dicionários
    # -----------------------------------------------------
    colunas_excluidas_do_mapeamento = [
        "horascontratuais",
        "salario",
        "valorsalariofixo",
        "idade",
        "ano",
        "mes",
        "competencia_str",
        "competencia_date",
        "admissao",
        "desligamento",
        "saldomovimentacao",
    ]

    df = aplicar_mapeamentos_categoricos(
        df,
        mapeamentos,
        excluir_colunas=colunas_excluidas_do_mapeamento,
    )

    # -----------------------------------------------------
    # 8) Garantia extra de tipo textual homogêneo
    #    nas colunas categóricas mapeadas
    # -----------------------------------------------------
    colunas_mapeadas_textuais = [
        "regiao",
        "uf",
        "municipio",
        "secao",
        "subclasse",
        "categoria",
        "cbo2002ocupacao",
        "graudeinstrucao",
        "racacor",
        "sexo",
        "tipoempregador",
        "tipoestabelecimento",
        "tipomovimentacao",
        "tipodedeficiencia",
        "indtrabintermitente",
        "indtrabparcial",
        "tamestabjan",
        "indicadoraprendiz",
        "origemdainformacao",
        "indicadordeforadoprazo",
        "unidadesalariocodigo",
        "faixa_etaria",
    ]

    for col in colunas_mapeadas_textuais:
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()

    if diagnosticar:
        log_resumo_colunas(
            df,
            ["municipio", "uf", "subclasse", "cbo2002ocupacao"],
            "Após mapeamentos categóricos",
        )

    # -----------------------------------------------------
    # 9) Validação final
    # -----------------------------------------------------
    validar_colunas_criticas(df)

    validation = validate_silver_dataframe(df, ano, mes)
    metadata_path = silver_dir / "metadata.json"
    try:
        save_json(validation.to_metadata(), metadata_path)
    except OSError as exc:
        raise SilverValidationError(
            f"Falha ao gravar metadata.json da Silver em {metadata_path}: {exc}"
        ) from exc

    ensure_silver_valid(validation)

    if diagnosticar:
        logger.info(
            f"[SILVER] Shape final antes de salvar: {df.shape}"
        )
        logger.info(
            f"[SILVER] Nulos finais colunas críticas: "
            f"{df[['horascontratuais', 'salario', 'valorsalariofixo']].isna().sum().to_dict()}"
        )

    # -----------------------------------------------------
    # 10) Salvamento
    # -----------------------------------------------------
    output = silver_dir / "caged_tratado.parquet"
    try:
        df.to_parquet(output, index=False)
    except OSError as exc:
        raise SilverValidationError(
            f"Falha ao salvar parquet Silver em {output}: {exc}"
        ) from exc

    logger.info(
        f"[SILVER] Concluído | output={output} | shape={df.shape} | "
        f"validation={validation.validation_status}"
    )

    return df