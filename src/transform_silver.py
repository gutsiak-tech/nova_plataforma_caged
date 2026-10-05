import pandas as pd
from src.paths import bronze_mes_dir, silver_mes_dir
from src.utils import ensure_dir
from src.dictionaries import mapeamentos
import unicodedata


def remover_acentos(texto):
    return ''.join(
        c for c in unicodedata.normalize('NFKD', texto)
        if not unicodedata.combining(c)
    )


def classificar_faixa_etaria(idade):
    if pd.isna(idade):
        return "Ignorado"
    if idade < 18:
        return "Até 17"
    elif idade <= 24:
        return "18 a 24"
    elif idade <= 29:
        return "25 a 29"
    elif idade <= 39:
        return "30 a 39"
    elif idade <= 49:
        return "40 a 49"
    elif idade <= 64:
        return "50 a 64"
    return "65 ou mais"


def limpar_numero_brasileiro(serie):
    return (
        serie.astype(str)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
    )


def build_silver(ano: int, mes: int) -> pd.DataFrame:

    bronze_dir = bronze_mes_dir(ano, mes)
    silver_dir = silver_mes_dir(ano, mes)
    ensure_dir(silver_dir)

    file_path = bronze_dir / "microdados.txt"

    if not file_path.exists():
        raise FileNotFoundError(f"Arquivo bruto não encontrado: {file_path}")

    # =========================
    # Leitura do microdado
    # =========================
    df = pd.read_csv(
        file_path,
        sep=";",
        encoding="utf-8",
        low_memory=False
    )

    # =========================
    # Padronização dos nomes
    # =========================
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .map(remover_acentos)
    )

    # =========================
    # Colunas de competência
    # =========================
    # cria coluna para visualização
    df["ano"] = ano
    df["mes"] = mes
    df["competencia_str"] = f"{ano}-{mes:02d}"

    # ==========================
    # Colunas de competência (data)
    # ==========================
    df["competencia_date"] = pd.to_datetime(
    df["competenciamov"].astype(str), format="%Y%m")    

    # =========================
    # Conversão de colunas numéricas
    # =========================
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
        "regiao"
    ]

    for col in colunas_numericas:
        if col in df.columns:
            if pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
                df[col] = limpar_numero_brasileiro(df[col])
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # =========================
    # Engenharia de atributos
    # =========================
    if "idade" in df.columns:
        df["faixa_etaria"] = df["idade"].apply(classificar_faixa_etaria)
    else:
        df["faixa_etaria"] = "Ignorado"

    # =========================
    # Validação da movimentação
    # =========================
    if "saldomovimentacao" not in df.columns:
        raise ValueError("A coluna 'saldomovimentacao' não foi encontrada no microdado.")

    df["saldomovimentacao"] = pd.to_numeric(df["saldomovimentacao"], errors="coerce")
    df = df.dropna(subset=["saldomovimentacao"]).copy()

    # =========================
    # Indicadores
    # =========================
    df["admissao"] = (df["saldomovimentacao"] == 1).astype(int)
    df["desligamento"] = (df["saldomovimentacao"] == -1).astype(int)

    # =========================
    # Aplicação dos mapeamentos
    # =========================
    for coluna, dicionario in mapeamentos.items():
        if coluna in df.columns:
            df[coluna] = df[coluna].map(dicionario).fillna(df[coluna])

    # =========================
    # Limpeza final das colunas textuais
    # =========================
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].astype(str).str.strip()

    # =========================
    # Salva silver
    # =========================
    output = silver_dir / "caged_tratado.parquet"
    df.to_parquet(output, index=False)

    return df