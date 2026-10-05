import pandas as pd
import unicodedata
from pathlib import Path

from app.core.config import GOLD_CAGED_DIR, SILVER_CAGED_DIR, DEFAULT_ANO, DEFAULT_MES
from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE
from pipelines.common.utils import ensure_dir
from pipelines.gold.validate_gold import (
    ensure_gold_output_valid,
    ensure_silver_input_valid,
    load_silver_metadata,
    validate_gold_outputs,
    validate_silver_input_for_gold,
    write_gold_metadata,
)

logger = setup_logger("gold", PIPELINE_LOG_FILE)


# =========================================================
# PATHS
# =========================================================
def silver_mes_dir(ano: int, mes: int) -> Path:
    return SILVER_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


def gold_mes_dir(ano: int, mes: int) -> Path:
    return GOLD_CAGED_DIR / f"ano={ano}" / f"mes={mes:02d}"


# =========================================================
# CONFIG RMC
# =========================================================
MUNICIPIOS_RMC = {
    "ADRIANOPOLIS",
    "AGUDOS DO SUL",
    "ALMIRANTE TAMANDARE",
    "ARAUCARIA",
    "BALSA NOVA",
    "BOCAIUVA DO SUL",
    "CAMPINA GRANDE DO SUL",
    "CAMPO DO TENENTE",
    "CAMPO LARGO",
    "CAMPO MAGRO",
    "CERRO AZUL",
    "COLOMBO",
    "CONTENDA",
    "CURITIBA",
    "DOUTOR ULYSSES",
    "FAZENDA RIO GRANDE",
    "ITAPERUCU",
    "LAPA",
    "MANDIRITUBA",
    "PIEN",
    "PINHAIS",
    "PIRAQUARA",
    "QUATRO BARRAS",
    "QUITANDINHA",
    "RIO BRANCO DO SUL",
    "RIO NEGRO",
    "SAO JOSE DOS PINHAIS",
    "TIJUCAS DO SUL",
    "TUNAS DO PARANA",
}


# =========================================================
# UTILITÁRIOS
# =========================================================
def remover_acentos(texto: str) -> str:
    if texto is None:
        return texto
    return "".join(
        c for c in unicodedata.normalize("NFKD", str(texto))
        if not unicodedata.combining(c)
    )


def normalizar_texto(txt):
    if pd.isna(txt):
        return pd.NA
    txt = str(txt).strip()
    txt = " ".join(txt.split())
    return txt


def normalizar_texto_upper_sem_acento(txt):
    if pd.isna(txt):
        return pd.NA
    txt = normalizar_texto(txt)
    txt = remover_acentos(txt).upper()
    return txt


def preparar_texto(df: pd.DataFrame, colunas: list[str]) -> pd.DataFrame:
    for col in colunas:
        if col in df.columns:
            df[col] = df[col].astype("string").map(normalizar_texto)
    return df


def salvar_tabela(df: pd.DataFrame, output_dir: Path, nome_arquivo: str) -> None:
    df.to_parquet(output_dir / f"{nome_arquivo}.parquet", index=False)
    df.to_csv(output_dir / f"{nome_arquivo}.csv", index=False, encoding="utf-8-sig")


def escrever_aba_se_nao_vazia(writer, df: pd.DataFrame, sheet_name: str) -> None:
    if df is not None and not df.empty:
        df.to_excel(writer, sheet_name=sheet_name[:31], index=False)


def ordenar_tabela(df: pd.DataFrame, colunas_ordem=None) -> pd.DataFrame:
    if df.empty:
        return df

    cols = [c for c in (colunas_ordem or ["saldo", "admissoes", "desligamentos"]) if c in df.columns]
    if not cols:
        return df.reset_index(drop=True)

    ascending = []
    for c in cols:
        if c == "desligamentos":
            ascending.append(True)
        else:
            ascending.append(False)

    return df.sort_values(cols, ascending=ascending).reset_index(drop=True)


def agregar_movimentacao(df: pd.DataFrame, group_cols: list[str]) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=group_cols + ["admissoes", "desligamentos", "saldo"])

    tabela = (
        df.groupby(group_cols, dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum"),
        )
        .reset_index()
    )
    return ordenar_tabela(tabela)


def agregar_movimentacao_salario(
    df: pd.DataFrame,
    group_cols: list[str],
    salario_col: str = "salario",
) -> pd.DataFrame:
    """
    Agrega movimentação e estatísticas salariais.
    Usa a coluna `salario` por padrão.
    """
    cols_out = group_cols + [
        "admissoes",
        "desligamentos",
        "saldo",
        "n_salarios_validos",
        "salario_medio",
        "salario_mediano",
        "salario_p25",
        "salario_p75",
        "salario_min",
        "salario_max",
    ]

    if df.empty or salario_col not in df.columns:
        return pd.DataFrame(columns=cols_out)

    def q25(x):
        x = x.dropna()
        return x.quantile(0.25) if not x.empty else pd.NA

    def q75(x):
        x = x.dropna()
        return x.quantile(0.75) if not x.empty else pd.NA

    tabela = (
        df.groupby(group_cols, dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum"),
            n_salarios_validos=(salario_col, lambda x: x.notna().sum()),
            salario_medio=(salario_col, "mean"),
            salario_mediano=(salario_col, "median"),
            salario_p25=(salario_col, q25),
            salario_p75=(salario_col, q75),
            salario_min=(salario_col, "min"),
            salario_max=(salario_col, "max"),
        )
        .reset_index()
    )
    return ordenar_tabela(tabela)


def salvar_se_nao_vazia(df: pd.DataFrame, output_dir: Path, nome_arquivo: str) -> None:
    if df is not None and not df.empty:
        salvar_tabela(df, output_dir, nome_arquivo)


# =========================================================
# FUNÇÃO PRINCIPAL
# =========================================================
def run_aggregate_indicators(ano: int = DEFAULT_ANO, mes: int = DEFAULT_MES) -> None:
    logger.info(f"[GOLD] Iniciando | ano={ano} mes={mes}")

    silver_input = ensure_silver_input_valid(validate_silver_input_for_gold(ano, mes))

    silver_file = silver_mes_dir(ano, mes) / "caged_tratado.parquet"
    if not silver_file.exists():
        raise FileNotFoundError(f"Arquivo silver não encontrado: {silver_file}")

    df = pd.read_parquet(silver_file)

    output_dir = gold_mes_dir(ano, mes)
    ensure_dir(output_dir)

    competencia = f"{ano}-{mes:02d}"

    # -----------------------------------------------------
    # Padronização leve
    # -----------------------------------------------------
    colunas_textuais = [
        "uf",
        "municipio",
        "secao",
        "cbo2002ocupacao",
        "sexo",
        "faixa_etaria",
        "graudeinstrucao",
    ]
    df = preparar_texto(df, colunas_textuais)

    if "uf" in df.columns:
        df["uf_norm"] = df["uf"].map(normalizar_texto_upper_sem_acento)
    else:
        df["uf_norm"] = pd.NA

    if "municipio" in df.columns:
        df["municipio_norm"] = df["municipio"].map(normalizar_texto_upper_sem_acento)
    else:
        df["municipio_norm"] = pd.NA

    # -----------------------------------------------------
    # Recortes
    # -----------------------------------------------------
    df_pr = df[df["uf_norm"] == "PARANA"].copy()

    df_rmc = df[
        (df["uf_norm"] == "PARANA")
        & (df["municipio_norm"].isin(MUNICIPIOS_RMC))
    ].copy()

    logger.info(f"[GOLD] Linhas Brasil: {len(df)}")
    logger.info(f"[GOLD] Linhas Paraná: {len(df_pr)}")
    logger.info(f"[GOLD] Linhas RMC: {len(df_rmc)}")

    # -----------------------------------------------------
    # Resumo geral
    # -----------------------------------------------------
    tabela_resumo = pd.DataFrame({
        "competencia": [competencia],
        "admissoes": [df["admissao"].sum() if "admissao" in df.columns else 0],
        "desligamentos": [df["desligamento"].sum() if "desligamento" in df.columns else 0],
        "saldo": [df["saldomovimentacao"].sum() if "saldomovimentacao" in df.columns else 0],
    })

    tabela_uf = agregar_movimentacao(df, ["uf"]) if "uf" in df.columns else pd.DataFrame()
    tabela_municipio = agregar_movimentacao(df, ["uf", "municipio"]) if {"uf", "municipio"}.issubset(df.columns) else pd.DataFrame()
    tabela_municipio_pr = agregar_movimentacao(df_pr, ["uf", "municipio"]) if {"uf", "municipio"}.issubset(df_pr.columns) else pd.DataFrame()
    tabela_municipio_rmc = agregar_movimentacao(df_rmc, ["uf", "municipio"]) if {"uf", "municipio"}.issubset(df_rmc.columns) else pd.DataFrame()

    tabela_setor = agregar_movimentacao(df, ["secao"]) if "secao" in df.columns else pd.DataFrame()
    tabela_setor_pr = agregar_movimentacao(df_pr, ["secao"]) if "secao" in df_pr.columns else pd.DataFrame()
    tabela_setor_rmc = agregar_movimentacao(df_rmc, ["secao"]) if "secao" in df_rmc.columns else pd.DataFrame()

    # -----------------------------------------------------
    # Perfis sem salário
    # -----------------------------------------------------
    tabela_perfil_sexo = agregar_movimentacao(df, ["sexo"]) if "sexo" in df.columns else pd.DataFrame()
    tabela_perfil_sexo_pr = agregar_movimentacao(df_pr, ["sexo"]) if "sexo" in df_pr.columns else pd.DataFrame()
    tabela_perfil_sexo_rmc = agregar_movimentacao(df_rmc, ["sexo"]) if "sexo" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_faixa_etaria = agregar_movimentacao(df, ["faixa_etaria"]) if "faixa_etaria" in df.columns else pd.DataFrame()
    tabela_perfil_faixa_etaria_pr = agregar_movimentacao(df_pr, ["faixa_etaria"]) if "faixa_etaria" in df_pr.columns else pd.DataFrame()
    tabela_perfil_faixa_etaria_rmc = agregar_movimentacao(df_rmc, ["faixa_etaria"]) if "faixa_etaria" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_graudeinstrucao = agregar_movimentacao(df, ["graudeinstrucao"]) if "graudeinstrucao" in df.columns else pd.DataFrame()
    tabela_perfil_graudeinstrucao_pr = agregar_movimentacao(df_pr, ["graudeinstrucao"]) if "graudeinstrucao" in df_pr.columns else pd.DataFrame()
    tabela_perfil_graudeinstrucao_rmc = agregar_movimentacao(df_rmc, ["graudeinstrucao"]) if "graudeinstrucao" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_sexo_faixa_etaria = agregar_movimentacao(df, ["sexo", "faixa_etaria"]) if {"sexo", "faixa_etaria"}.issubset(df.columns) else pd.DataFrame()
    tabela_perfil_sexo_faixa_etaria_pr = agregar_movimentacao(df_pr, ["sexo", "faixa_etaria"]) if {"sexo", "faixa_etaria"}.issubset(df_pr.columns) else pd.DataFrame()
    tabela_perfil_sexo_faixa_etaria_rmc = agregar_movimentacao(df_rmc, ["sexo", "faixa_etaria"]) if {"sexo", "faixa_etaria"}.issubset(df_rmc.columns) else pd.DataFrame()

    tabela_perfil_sexo_instrucao = agregar_movimentacao(df, ["sexo", "graudeinstrucao"]) if {"sexo", "graudeinstrucao"}.issubset(df.columns) else pd.DataFrame()
    tabela_perfil_sexo_instrucao_pr = agregar_movimentacao(df_pr, ["sexo", "graudeinstrucao"]) if {"sexo", "graudeinstrucao"}.issubset(df_pr.columns) else pd.DataFrame()
    tabela_perfil_sexo_instrucao_rmc = agregar_movimentacao(df_rmc, ["sexo", "graudeinstrucao"]) if {"sexo", "graudeinstrucao"}.issubset(df_rmc.columns) else pd.DataFrame()

    tabela_perfil_faixa_etaria_instrucao = agregar_movimentacao(df, ["faixa_etaria", "graudeinstrucao"]) if {"faixa_etaria", "graudeinstrucao"}.issubset(df.columns) else pd.DataFrame()
    tabela_perfil_faixa_etaria_instrucao_pr = agregar_movimentacao(df_pr, ["faixa_etaria", "graudeinstrucao"]) if {"faixa_etaria", "graudeinstrucao"}.issubset(df_pr.columns) else pd.DataFrame()
    tabela_perfil_faixa_etaria_instrucao_rmc = agregar_movimentacao(df_rmc, ["faixa_etaria", "graudeinstrucao"]) if {"faixa_etaria", "graudeinstrucao"}.issubset(df_rmc.columns) else pd.DataFrame()

    # -----------------------------------------------------
    # Perfis com salário
    # -----------------------------------------------------
    tabela_perfil_sexo_salario = agregar_movimentacao_salario(df, ["sexo"]) if "sexo" in df.columns else pd.DataFrame()
    tabela_perfil_sexo_salario_pr = agregar_movimentacao_salario(df_pr, ["sexo"]) if "sexo" in df_pr.columns else pd.DataFrame()
    tabela_perfil_sexo_salario_rmc = agregar_movimentacao_salario(df_rmc, ["sexo"]) if "sexo" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_faixa_etaria_salario = agregar_movimentacao_salario(df, ["faixa_etaria"]) if "faixa_etaria" in df.columns else pd.DataFrame()
    tabela_perfil_faixa_etaria_salario_pr = agregar_movimentacao_salario(df_pr, ["faixa_etaria"]) if "faixa_etaria" in df_pr.columns else pd.DataFrame()
    tabela_perfil_faixa_etaria_salario_rmc = agregar_movimentacao_salario(df_rmc, ["faixa_etaria"]) if "faixa_etaria" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_graudeinstrucao_salario = agregar_movimentacao_salario(df, ["graudeinstrucao"]) if "graudeinstrucao" in df.columns else pd.DataFrame()
    tabela_perfil_graudeinstrucao_salario_pr = agregar_movimentacao_salario(df_pr, ["graudeinstrucao"]) if "graudeinstrucao" in df_pr.columns else pd.DataFrame()
    tabela_perfil_graudeinstrucao_salario_rmc = agregar_movimentacao_salario(df_rmc, ["graudeinstrucao"]) if "graudeinstrucao" in df_rmc.columns else pd.DataFrame()

    tabela_perfil_sexo_faixa_etaria_salario = (
        agregar_movimentacao_salario(df, ["sexo", "faixa_etaria"])
        if {"sexo", "faixa_etaria"}.issubset(df.columns) else pd.DataFrame()
    )
    tabela_perfil_sexo_faixa_etaria_salario_pr = (
        agregar_movimentacao_salario(df_pr, ["sexo", "faixa_etaria"])
        if {"sexo", "faixa_etaria"}.issubset(df_pr.columns) else pd.DataFrame()
    )
    tabela_perfil_sexo_faixa_etaria_salario_rmc = (
        agregar_movimentacao_salario(df_rmc, ["sexo", "faixa_etaria"])
        if {"sexo", "faixa_etaria"}.issubset(df_rmc.columns) else pd.DataFrame()
    )

    tabela_perfil_sexo_instrucao_salario = (
        agregar_movimentacao_salario(df, ["sexo", "graudeinstrucao"])
        if {"sexo", "graudeinstrucao"}.issubset(df.columns) else pd.DataFrame()
    )
    tabela_perfil_sexo_instrucao_salario_pr = (
        agregar_movimentacao_salario(df_pr, ["sexo", "graudeinstrucao"])
        if {"sexo", "graudeinstrucao"}.issubset(df_pr.columns) else pd.DataFrame()
    )
    tabela_perfil_sexo_instrucao_salario_rmc = (
        agregar_movimentacao_salario(df_rmc, ["sexo", "graudeinstrucao"])
        if {"sexo", "graudeinstrucao"}.issubset(df_rmc.columns) else pd.DataFrame()
    )

    tabela_perfil_faixa_etaria_instrucao_salario = (
        agregar_movimentacao_salario(df, ["faixa_etaria", "graudeinstrucao"])
        if {"faixa_etaria", "graudeinstrucao"}.issubset(df.columns) else pd.DataFrame()
    )
    tabela_perfil_faixa_etaria_instrucao_salario_pr = (
        agregar_movimentacao_salario(df_pr, ["faixa_etaria", "graudeinstrucao"])
        if {"faixa_etaria", "graudeinstrucao"}.issubset(df_pr.columns) else pd.DataFrame()
    )
    tabela_perfil_faixa_etaria_instrucao_salario_rmc = (
        agregar_movimentacao_salario(df_rmc, ["faixa_etaria", "graudeinstrucao"])
        if {"faixa_etaria", "graudeinstrucao"}.issubset(df_rmc.columns) else pd.DataFrame()
    )

    # -----------------------------------------------------
    # Ocupação
    # -----------------------------------------------------
    tabela_ocupacao = agregar_movimentacao(df, ["cbo2002ocupacao"]) if "cbo2002ocupacao" in df.columns else pd.DataFrame()
    tabela_ocupacao_pr = agregar_movimentacao(df_pr, ["cbo2002ocupacao"]) if "cbo2002ocupacao" in df_pr.columns else pd.DataFrame()
    tabela_ocupacao_rmc = agregar_movimentacao(df_rmc, ["cbo2002ocupacao"]) if "cbo2002ocupacao" in df_rmc.columns else pd.DataFrame()

    # -----------------------------------------------------
    # Salvar parquet + csv
    # -----------------------------------------------------
    tabelas = {
        "tabela_resumo": tabela_resumo,
        "tabela_uf": tabela_uf,
        "tabela_municipio": tabela_municipio,
        "tabela_municipio_pr": tabela_municipio_pr,
        "tabela_municipio_rmc": tabela_municipio_rmc,
        "tabela_setor": tabela_setor,
        "tabela_setor_pr": tabela_setor_pr,
        "tabela_setor_rmc": tabela_setor_rmc,
        "tabela_ocupacao": tabela_ocupacao,
        "tabela_ocupacao_pr": tabela_ocupacao_pr,
        "tabela_ocupacao_rmc": tabela_ocupacao_rmc,

        "tabela_perfil_sexo": tabela_perfil_sexo,
        "tabela_perfil_sexo_pr": tabela_perfil_sexo_pr,
        "tabela_perfil_sexo_rmc": tabela_perfil_sexo_rmc,

        "tabela_perfil_faixa_etaria": tabela_perfil_faixa_etaria,
        "tabela_perfil_faixa_etaria_pr": tabela_perfil_faixa_etaria_pr,
        "tabela_perfil_faixa_etaria_rmc": tabela_perfil_faixa_etaria_rmc,

        "tabela_perfil_graudeinstrucao": tabela_perfil_graudeinstrucao,
        "tabela_perfil_graudeinstrucao_pr": tabela_perfil_graudeinstrucao_pr,
        "tabela_perfil_graudeinstrucao_rmc": tabela_perfil_graudeinstrucao_rmc,

        "tabela_perfil_sexo_faixa_etaria": tabela_perfil_sexo_faixa_etaria,
        "tabela_perfil_sexo_faixa_etaria_pr": tabela_perfil_sexo_faixa_etaria_pr,
        "tabela_perfil_sexo_faixa_etaria_rmc": tabela_perfil_sexo_faixa_etaria_rmc,

        "tabela_perfil_sexo_instrucao": tabela_perfil_sexo_instrucao,
        "tabela_perfil_sexo_instrucao_pr": tabela_perfil_sexo_instrucao_pr,
        "tabela_perfil_sexo_instrucao_rmc": tabela_perfil_sexo_instrucao_rmc,

        "tabela_perfil_faixa_etaria_instrucao": tabela_perfil_faixa_etaria_instrucao,
        "tabela_perfil_faixa_etaria_instrucao_pr": tabela_perfil_faixa_etaria_instrucao_pr,
        "tabela_perfil_faixa_etaria_instrucao_rmc": tabela_perfil_faixa_etaria_instrucao_rmc,

        "tabela_perfil_sexo_salario": tabela_perfil_sexo_salario,
        "tabela_perfil_sexo_salario_pr": tabela_perfil_sexo_salario_pr,
        "tabela_perfil_sexo_salario_rmc": tabela_perfil_sexo_salario_rmc,

        "tabela_perfil_faixa_etaria_salario": tabela_perfil_faixa_etaria_salario,
        "tabela_perfil_faixa_etaria_salario_pr": tabela_perfil_faixa_etaria_salario_pr,
        "tabela_perfil_faixa_etaria_salario_rmc": tabela_perfil_faixa_etaria_salario_rmc,

        "tabela_perfil_graudeinstrucao_salario": tabela_perfil_graudeinstrucao_salario,
        "tabela_perfil_graudeinstrucao_salario_pr": tabela_perfil_graudeinstrucao_salario_pr,
        "tabela_perfil_graudeinstrucao_salario_rmc": tabela_perfil_graudeinstrucao_salario_rmc,

        "tabela_perfil_sexo_faixa_etaria_salario": tabela_perfil_sexo_faixa_etaria_salario,
        "tabela_perfil_sexo_faixa_etaria_salario_pr": tabela_perfil_sexo_faixa_etaria_salario_pr,
        "tabela_perfil_sexo_faixa_etaria_salario_rmc": tabela_perfil_sexo_faixa_etaria_salario_rmc,

        "tabela_perfil_sexo_instrucao_salario": tabela_perfil_sexo_instrucao_salario,
        "tabela_perfil_sexo_instrucao_salario_pr": tabela_perfil_sexo_instrucao_salario_pr,
        "tabela_perfil_sexo_instrucao_salario_rmc": tabela_perfil_sexo_instrucao_salario_rmc,

        "tabela_perfil_faixa_etaria_instrucao_salario": tabela_perfil_faixa_etaria_instrucao_salario,
        "tabela_perfil_faixa_etaria_instrucao_salario_pr": tabela_perfil_faixa_etaria_instrucao_salario_pr,
        "tabela_perfil_faixa_etaria_instrucao_salario_rmc": tabela_perfil_faixa_etaria_instrucao_salario_rmc,
    }

    for nome, tabela in tabelas.items():
        salvar_se_nao_vazia(tabela, output_dir, nome)

    # -----------------------------------------------------
    # Excel consolidado
    # -----------------------------------------------------
    excel_path = output_dir / f"tabelas_caged_{ano}_{mes:02d}.xlsx"

    sheet_map = {
        "resumo": tabela_resumo,
        "uf": tabela_uf,
        "municipio": tabela_municipio,
        "municipio_pr": tabela_municipio_pr,
        "municipio_rmc": tabela_municipio_rmc,
        "setor": tabela_setor,
        "setor_pr": tabela_setor_pr,
        "setor_rmc": tabela_setor_rmc,
        "ocupacao": tabela_ocupacao,
        "ocupacao_pr": tabela_ocupacao_pr,
        "ocupacao_rmc": tabela_ocupacao_rmc,

        "perf_sexo": tabela_perfil_sexo,
        "perf_sexo_pr": tabela_perfil_sexo_pr,
        "perf_sexo_rmc": tabela_perfil_sexo_rmc,

        "perf_faixa": tabela_perfil_faixa_etaria,
        "perf_faixa_pr": tabela_perfil_faixa_etaria_pr,
        "perf_faixa_rmc": tabela_perfil_faixa_etaria_rmc,

        "perf_instr": tabela_perfil_graudeinstrucao,
        "perf_instr_pr": tabela_perfil_graudeinstrucao_pr,
        "perf_instr_rmc": tabela_perfil_graudeinstrucao_rmc,

        "perf_sx_fx": tabela_perfil_sexo_faixa_etaria,
        "perf_sx_fx_pr": tabela_perfil_sexo_faixa_etaria_pr,
        "perf_sx_fx_rmc": tabela_perfil_sexo_faixa_etaria_rmc,

        "perf_sx_ins": tabela_perfil_sexo_instrucao,
        "perf_sx_ins_pr": tabela_perfil_sexo_instrucao_pr,
        "perf_sx_ins_rmc": tabela_perfil_sexo_instrucao_rmc,

        "perf_fx_ins": tabela_perfil_faixa_etaria_instrucao,
        "perf_fx_ins_pr": tabela_perfil_faixa_etaria_instrucao_pr,
        "perf_fx_ins_rmc": tabela_perfil_faixa_etaria_instrucao_rmc,

        "sx_sal": tabela_perfil_sexo_salario,
        "sx_sal_pr": tabela_perfil_sexo_salario_pr,
        "sx_sal_rmc": tabela_perfil_sexo_salario_rmc,

        "fx_sal": tabela_perfil_faixa_etaria_salario,
        "fx_sal_pr": tabela_perfil_faixa_etaria_salario_pr,
        "fx_sal_rmc": tabela_perfil_faixa_etaria_salario_rmc,

        "ins_sal": tabela_perfil_graudeinstrucao_salario,
        "ins_sal_pr": tabela_perfil_graudeinstrucao_salario_pr,
        "ins_sal_rmc": tabela_perfil_graudeinstrucao_salario_rmc,

        "sx_fx_sal": tabela_perfil_sexo_faixa_etaria_salario,
        "sx_fx_sal_pr": tabela_perfil_sexo_faixa_etaria_salario_pr,
        "sx_fx_sal_rmc": tabela_perfil_sexo_faixa_etaria_salario_rmc,

        "sx_ins_sal": tabela_perfil_sexo_instrucao_salario,
        "sx_ins_sal_pr": tabela_perfil_sexo_instrucao_salario_pr,
        "sx_ins_sal_rmc": tabela_perfil_sexo_instrucao_salario_rmc,

        "fx_ins_sal": tabela_perfil_faixa_etaria_instrucao_salario,
        "fx_ins_sal_pr": tabela_perfil_faixa_etaria_instrucao_salario_pr,
        "fx_ins_sal_rmc": tabela_perfil_faixa_etaria_instrucao_salario_rmc,
    }

    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        for sheet_name, tabela in sheet_map.items():
            escrever_aba_se_nao_vazia(writer, tabela, sheet_name)

    gold_output = validate_gold_outputs(
        ano,
        mes,
        silver_metadata=load_silver_metadata(ano, mes),
    )
    write_gold_metadata(ano, mes, silver_input, gold_output)
    ensure_gold_output_valid(gold_output)

    logger.info(
        f"[GOLD] Concluído | output={output_dir} | validation={gold_output.validation_status}"
    )