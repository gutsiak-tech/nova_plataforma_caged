from app.db.connection import get_connection


def test_connection():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT version();")
    version = cur.fetchone()
    cur.close()
    conn.close()
    return version


def fetch_map_municipios(ano: int, mes: int, uf: str):
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT
            cod_municipio,
            municipio,
            uf,
            ano,
            mes,
            admissoes,
            desligamentos,
            saldo
        FROM serving.vw_emprego_municipio_mes
        WHERE ano = %s
          AND mes = %s
          AND uf = %s
        ORDER BY municipio;
    """

    cur.execute(query, (ano, mes, uf))
    rows = cur.fetchall()

    colunas = [desc[0] for desc in cur.description]
    resultado = [dict(zip(colunas, row)) for row in rows]

    cur.close()
    conn.close()

    return resultado