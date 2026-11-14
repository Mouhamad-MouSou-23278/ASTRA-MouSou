"""Base protocol and types for physical sensor transducer models."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BasePhysicsModel(ABC):
    key: str
    name: str
    description: str
    scientific_reference: str
    default_parameters: dict[str, Any]

    @abstractmethod
    def evaluate(
        self,
        inputs: dict[str, float],
        parameters: dict[str, Any],
        dt: float,
        state: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, Any]]:
        """Calculate transducer physical response.

        Args:
            inputs: Physical quantities (e.g., ground truth temperature, pressure, supply voltage).
            parameters: Scientific parameters (e.g., R0, alpha, sensitivity, time constant).
            dt: Simulation time step in seconds.
            state: Persistent state between ticks (e.g., internal sensor temperature for lag).

        Returns:
            outputs: Evaluated physical outputs (e.g., primary reading, raw bridge mV, current).
            new_state: Updated internal state for the next simulation tick.
        """
        raise NotImplementedError
