"""Pressure transducer physics model.

Implements piezoresistive silicon micromachined diaphragm bridge response,
temperature coefficient of span and offset, and pressure calibration.
"""
from __future__ import annotations

import math
from typing import Any
from .base import BasePhysicsModel


class PiezoresistivePressureModel(BasePhysicsModel):
    key = "piezoresistive_pressure"
    name = "Piezoresistive Silicon Diaphragm Pressure Transducer"
    description = (
        "Calculates piezoresistive bridge millivolts under pressure and temperature, "
        "modelling temperature coefficient of span (TCS) and temperature coefficient of offset (TCO)."
    )
    scientific_reference = "NASA SP-8088 / IEEE Trans. Electron Devices / EVA-EXP-0034"
    default_parameters = {
        "sensitivity_mv_v_kpa": 1.5,
        "v_supply_v": 5.0,
        "offset_mv": 0.0,
        "tcs_pct_per_c": -0.15,
        "tco_mv_per_c": 0.05,
        "t0_c": 25.0,
        "tau_s": 0.05,
    }

    def evaluate(
        self,
        inputs: dict[str, float],
        parameters: dict[str, Any],
        dt: float,
        state: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, Any]]:
        # Pressure input in kPa or Pa
        raw_p = inputs.get("pressure", inputs.get("suit_pressure_kpa", 34.0))
        # Handle Pa input if given directly in Pa (> 500)
        p_kpa = raw_p / 1000.0 if raw_p > 500.0 else raw_p
        t_ambient = inputs.get("temperature", 20.0)

        s0 = float(parameters.get("sensitivity_mv_v_kpa", 1.5))
        v_supply = float(parameters.get("v_supply_v", 5.0))
        v_offset = float(parameters.get("offset_mv", 0.0))
        tcs = float(parameters.get("tcs_pct_per_c", -0.15)) / 100.0
        tco = float(parameters.get("tco_mv_per_c", 0.05))
        t0 = float(parameters.get("t0_c", 25.0))
        tau = max(float(parameters.get("tau_s", 0.05)), 0.005)

        # Dynamic diaphragm lag
        p_prev = state.get("p_kpa", p_kpa)
        alpha = 1.0 - math.exp(-dt / tau)
        p_internal = p_prev + alpha * (p_kpa - p_prev)

        # Bridge millivolt calculation
        delta_t = t_ambient - t0
        temp_span_factor = 1.0 + tcs * delta_t
        bridge_mv = v_supply * (s0 * p_internal * temp_span_factor) + v_offset + tco * delta_t

        # Transducer inverse calibration calculation
        p_calibrated = (bridge_mv - v_offset - tco * delta_t) / (v_supply * s0 * temp_span_factor)

        outputs = {
            "pressure_kpa": round(p_calibrated, 4),
            "pressure_pa": round(p_calibrated * 1000.0, 2),
            "bridge_voltage_mv": round(bridge_mv, 4),
            "diaphragm_stress_relative": round(p_internal / 100.0, 4),
        }
        new_state = {"p_kpa": p_internal}
        return outputs, new_state
