import pandas as pd
from src.paths import silver_mes_dir, gold_mes_dir
from src.utils import ensure_dir


def salvar_tabela(df: pd.DataFrame, output_dir, nome_arquivo: str) -> None:
    """
    Salva uma tabela em parquet e csv.
    """
    df.to_parquet(output_dir / f"{nome_arquivo}.parquet", index=False)
    df.to_csv(output_dir / f"{nome_arquivo}.csv", index=False, encoding="utf-8-sig")


def build_gold(ano: int, mes: int) -> None:
    """
    Gera tabelas analíticas na camada gold a partir da silver.
    Também gera tabelas específicas para o Paraná (uf == 'PR')
    e um arquivo Excel consolidado com múltiplas abas.
    """
    silver_file = silver_mes_dir(ano, mes) / "caged_tratado.parquet"
    if not silver_file.exists():
        raise FileNotFoundError(f"Arquivo silver não encontrado: {silver_file}")

    df = pd.read_parquet(silver_file)

    output_dir = gold_mes_dir(ano, mes)
    ensure_dir(output_dir)

    competencia = f"{ano}-{mes:02d}"

    # Padronização mínima da UF para evitar problemas
    if "uf" in df.columns:
        df["uf"] = df["uf"].astype(str).str.strip().str.upper()

    df_pr = df[df["uf"] == "PR"].copy() if "uf" in df.columns else pd.DataFrame()

    # =========================
    # Tabelas gerais
    # =========================

    tabela_resumo = pd.DataFrame({
        "competencia": [competencia],
        "admissoes": [df["admissao"].sum()],
        "desligamentos": [df["desligamento"].sum()],
        "saldo": [df["saldomovimentacao"].sum()]
    })

    tabela_uf = (
        df.groupby("uf", dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum")
        )
        .reset_index()
        .sort_values("saldo", ascending=False)
    )

    tabela_municipio = (
        df.groupby(["uf", "municipio"], dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum")
        )
        .reset_index()
        .sort_values("saldo", ascending=False)
    )

    tabela_setor = (
        df.groupby("secao", dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum")
        )
        .reset_index()
        .sort_values("saldo", ascending=False)
    )

    perfil_cols = [c for c in ["sexo", "faixa_etaria", "nivel_instrucao"] if c in df.columns]

    tabela_perfil = (
        df.groupby(perfil_cols, dropna=False)
        .agg(
            admissoes=("admissao", "sum"),
            desligamentos=("desligamento", "sum"),
            saldo=("saldomovimentacao", "sum")
        )
        .reset_index()
        .sort_values("saldo", ascending=False)
    )

    tabela_ocupacao = None
    if "cbo2002ocupacao" in df.columns:
        tabela_ocupacao = (
            df.groupby("cbo2002ocupacao", dropna=False)
            .agg(
                admissoes=("admissao", "sum"),
                desligamentos=("desligamento", "sum"),
                saldo=("saldomovimentacao", "sum")
            )
            .reset_index()
            .sort_values("saldo", ascending=False)
        )

    # =========================
    # Tabelas específicas do Paraná
    # =========================

    tabela_municipio_pr = pd.DataFrame()
    tabela_setor_pr = pd.DataFrame()
    tabela_perfil_pr = pd.DataFrame()
    tabela_ocupacao_pr = None

    if not df_pr.empty:
        tabela_municipio_pr = (
            df_pr.groupby(["uf", "municipio"], dropna=False)
            .agg(
                admissoes=("admissao", "sum"),
                desligamentos=("desligamento", "sum"),
                saldo=("saldomovimentacao", "sum")
            )
            .reset_index()
            .sort_values("saldo", ascending=False)
        )

        tabela_setor_pr = (
            df_pr.groupby("secao", dropna=False)
            .agg(
                admissoes=("admissao", "sum"),
                desligamentos=("desligamento", "sum"),
                saldo=("saldomovimentacao", "sum")
            )
            .reset_index()
            .sort_values("saldo", ascending=False)
        )

        perfil_cols_pr = [c for c in ["sexo", "faixa_etaria", "nivel_instrucao"] if c in df_pr.columns]

        tabela_perfil_pr = (
            df_pr.groupby(perfil_cols_pr, dropna=False)
            .agg(
                admissoes=("admissao", "sum"),
                desligamentos=("desligamento", "sum"),
                saldo=("saldomovimentacao", "sum")
            )
            .reset_index()
            .sort_values("saldo", ascending=False)
        )

        if "cbo2002ocupacao" in df_pr.columns:
            tabela_ocupacao_pr = (
                df_pr.groupby("cbo2002ocupacao", dropna=False)
                .agg(
                    admissoes=("admissao", "sum"),
                    desligamentos=("desligamento", "sum"),
                    saldo=("saldomovimentacao", "sum")
                )
                .reset_index()
                .sort_values("saldo", ascending=False)
            )

    # =========================
    # Salvar parquet + csv
    # =========================

    salvar_tabela(tabela_resumo, output_dir, "tabela_resumo")
    salvar_tabela(tabela_uf, output_dir, "tabela_uf")
    salvar_tabela(tabela_municipio, output_dir, "tabela_municipio")
    salvar_tabela(tabela_setor, output_dir, "tabela_setor")
    salvar_tabela(tabela_perfil, output_dir, "tabela_perfil")

    if tabela_ocupacao is not None:
        salvar_tabela(tabela_ocupacao, output_dir, "tabela_ocupacao")

    if not tabela_municipio_pr.empty:
        salvar_tabela(tabela_municipio_pr, output_dir, "tabela_municipio_pr")

    if not tabela_setor_pr.empty:
        salvar_tabela(tabela_setor_pr, output_dir, "tabela_setor_pr")

    if not tabela_perfil_pr.empty:
        salvar_tabela(tabela_perfil_pr, output_dir, "tabela_perfil_pr")

    if tabela_ocupacao_pr is not None:
        salvar_tabela(tabela_ocupacao_pr, output_dir, "tabela_ocupacao_pr")

    # =========================
    # Exportação Excel
    # =========================

    excel_path = output_dir / f"tabelas_caged_{ano}_{mes:02d}.xlsx"

    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        tabela_resumo.to_excel(writer, sheet_name="resumo", index=False)
        tabela_uf.to_excel(writer, sheet_name="uf", index=False)
        tabela_municipio.to_excel(writer, sheet_name="municipio", index=False)
        tabela_setor.to_excel(writer, sheet_name="setor", index=False)
        tabela_perfil.to_excel(writer, sheet_name="perfil", index=False)

        if tabela_ocupacao is not None:
            tabela_ocupacao.to_excel(writer, sheet_name="ocupacao", index=False)

        if not tabela_municipio_pr.empty:
            tabela_municipio_pr.to_excel(writer, sheet_name="municipio_pr", index=False)

        if not tabela_setor_pr.empty:
            tabela_setor_pr.to_excel(writer, sheet_name="setor_pr", index=False)

        if not tabela_perfil_pr.empty:
            tabela_perfil_pr.to_excel(writer, sheet_name="perfil_pr", index=False)

        if tabela_ocupacao_pr is not None:
            tabela_ocupacao_pr.to_excel(writer, sheet_name="ocupacao_pr", index=False)