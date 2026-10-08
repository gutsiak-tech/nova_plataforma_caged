"""A malha de apresentação do Brasil continua válida e encaixada na fonte."""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "dashboard" / "public" / "geo" / "ufs.geojson"
PRESENTATION = ROOT / "dashboard" / "public" / "geo" / "ufs.presentation.geojson"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_presentation_keeps_valid_states_and_shared_fit():
    source = _load(SOURCE)
    presentation = _load(PRESENTATION)

    assert len(source["features"]) == 27
    assert len(presentation["features"]) == 27

    geoms = []
    originals = []
    for feature, src in zip(presentation["features"], source["features"], strict=True):
        assert feature["properties"] == src["properties"]
        geom = shape(feature["geometry"])
        src_geom = shape(src["geometry"])
        assert geom.is_valid, feature["properties"].get("uf_sigla")
        assert geom.area > 0
        assert abs(geom.area - src_geom.area) / src_geom.area < 0.05
        geoms.append(geom)
        originals.append(src_geom)

    for index, left in enumerate(geoms):
        for other in range(index + 1, len(geoms)):
            grown = left.intersection(geoms[other]).area - originals[index].intersection(originals[other]).area
            assert grown <= 1e-6
