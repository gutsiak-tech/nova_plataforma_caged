from fastapi import APIRouter
from app.services.map_service import get_map_municipios

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/municipios")
def municipios(ano: int, mes: int, uf: str):
    return get_map_municipios(ano=ano, mes=mes, uf=uf)