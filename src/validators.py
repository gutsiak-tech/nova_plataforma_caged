import pandas as pd


def validar_saldo(df: pd.DataFrame) -> None:
    """
    Valida se:
    admissoes - desligamentos = saldo
    """
    adm = df["admissao"].sum()
    desl = df["desligamento"].sum()
    saldo = df["saldomovimentacao"].sum()

    if adm - desl != saldo:
        raise ValueError(
            f"Inconsistência detectada: adm={adm}, deslig={desl}, saldo={saldo}"
        )