import pandas as pd

from app.db.connection import get_connection
from app.core.config import GOLD_CAGED_DIR, DEFAULT_ANO, DEFAULT_MES
from app.core.logging import setup_logger
from app.core.config import PIPELINE_LOG_FILE

logger = setup_logger("load_fact", PIPELINE_LOG_FILE)


def load_fact_emprego_municipio(ano: int = DEFAULT_ANO, mes: int = DEFAULT_MES):
    logger.info(f"[LOAD] Iniciando carga de fatos | ano={ano} mes={mes}")

    path = (
        GOLD_CAGED_DIR
        / f"ano={ano}"
        / f"mes={mes:02d}"
        / "tabela_municipio.parquet"
    )

    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")

    df = pd.read_parquet(path)

    colunas_necessarias = ["uf", "municipio", "admissoes", "desligamentos", "saldo"]
    faltantes = [c for c in colunas_necessarias if c not in df.columns]
    if faltantes:
        raise ValueError(f"Colunas ausentes no parquet: {faltantes}")

    df["ano"] = ano
    df["mes"] = mes

    df["uf"] = df["uf"].astype(str).str.strip()
    df["municipio"] = df["municipio"].astype(str).str.strip()

    conn = get_connection()
    cur = conn.cursor()

    insert_query = """
        INSERT INTO serving.fact_emprego_municipio_mes
        (uf, municipio, ano, mes, admissoes, desligamentos, saldo)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """

    for _, row in df.iterrows():
        cur.execute(
            insert_query,
            (
                row["uf"],
                row["municipio"],
                int(row["ano"]),
                int(row["mes"]),
                int(row["admissoes"]),
                int(row["desligamentos"]),
                int(row["saldo"]),
            )
        )

    conn.commit()
    cur.close()
    conn.close()

    logger.info(f"[LOAD] Carga concluída com sucesso | linhas={len(df)}")