import pytest

from app.services.territorial_response_cache import clear_territorial_response_cache


@pytest.fixture(autouse=True)
def clear_response_cache():
    clear_territorial_response_cache()
    yield
    clear_territorial_response_cache()
