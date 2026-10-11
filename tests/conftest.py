import os

import pytest

from app.services.territorial_response_cache import clear_territorial_response_cache

# O warm real só começa no startup do servidor. A suíte desliga esse disparo
# para o TestClient não calcular os 18 panoramas. Os testes do warm religam.
os.environ["TERRITORIAL_WARM_ON_STARTUP"] = "0"


@pytest.fixture(autouse=True)
def clear_response_cache():
    clear_territorial_response_cache()
    yield
    clear_territorial_response_cache()
