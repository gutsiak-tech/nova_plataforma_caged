from app.db.queries import fetch_map_municipios


def get_map_municipios(ano: int, mes: int, uf: str):
    dados = fetch_map_municipios(ano=ano, mes=mes, uf=uf)

    return {
        "filtros": {
            "ano": ano,
            "mes": mes,
            "uf": uf,
        },
        "total": len(dados),
        "dados": dados,
    }