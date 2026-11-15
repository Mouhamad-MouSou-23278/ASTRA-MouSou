"""Registry and factory for physical sensor simulation models."""
from __future__ import annotations

from typing import Any, Optional
from .base import BasePhysicsModel
from .thermal import RTDTemperatureModel
from .pressure import PiezoresistivePressureModel
from .radiation import SiliconDosimeterModel

MODELS: dict[str, BasePhysicsModel] = {
    RTDTemperatureModel.key: RTDTemperatureModel(),
    PiezoresistivePressureModel.key: PiezoresistivePressureModel(),
    SiliconDosimeterModel.key: SiliconDosimeterModel(),
}


def get_physics_model(key: str) -> Optional[BasePhysicsModel]:
    return MODELS.get(key)


def list_physics_models() -> list[dict[str, Any]]:
    return [
        {
            "key": m.key,
            "name": m.name,
            "description": m.description,
            "scientific_reference": m.scientific_reference,
            "default_parameters": m.default_parameters,
        }
        for m in MODELS.values()
    ]
