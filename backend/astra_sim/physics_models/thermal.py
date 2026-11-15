"""Thermal sensor transducer physics models.

Implements:
- Callendar-Van Dusen RTD Platinum Thermometer (IEC 60751 standard, Pt100 / Pt1000)
- First-order thermal time constant dynamic response
- Wheatstone bridge transducer voltage output
"""
from __future__ import annotations

import math
from typing import Any
from .base import BasePhysicsModel

# IEC 60751 standard coefficients for platinum RTD
IEC_A = 3.9083e-3
IEC_B = -5.7750e-7
IEC_C = -4.1830e-12


class RTDTemperatureModel(BasePhysicsModel):
    key = "rtd_temperature"
    name = "Callendar-Van Dusen RTD Platinum Thermometer"
    description = (
        "Precision RTD model based on IEC 60751. Computes physical resistance, "
        "first-order thermal response lag (tau), Wheatstone bridge voltage, and calibrated temperature."
    )
    scientific_reference = "IEC 60751:2008 / ASTM E1137 / NASA-STD-3001"
    default_parameters = {
        "r0_ohms": 100.0,
        "tau_seconds": 0.4,
        "v_supply_v": 3.3,
        "r_ref_ohms": 100.0,
        "self_heating_mw_per_c": 10.0,
    }

    def evaluate(
        self,
        inputs: dict[str, float],
        parameters: dict[str, Any],
        dt: float,
        state: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, Any]]:
        # Target environment or body temperature
        t_env = inputs.get("temperature", inputs.get("temp", 37.0))
        r0 = float(parameters.get("r0_ohms", 100.0))
        tau = max(float(parameters.get("tau_seconds", 0.4)), 0.01)
        v_supply = float(parameters.get("v_supply_v", 3.3))
        r_ref = float(parameters.get("r_ref_ohms", 100.0))

        # Dynamic lag state integration
        t_current = state.get("t_sensor", t_env)
        alpha_lag = 1.0 - math.exp(-dt / tau)
        t_sensor = t_current + alpha_lag * (t_env - t_current)

        # Callendar-Van Dusen Equation
        t = t_sensor
        if t >= 0.0:
            resistance = r0 * (1.0 + IEC_A * t + IEC_B * (t**2))
        else:
            resistance = r0 * (1.0 + IEC_A * t + IEC_B * (t**2) + IEC_C * (t - 100.0) * (t**3))

        # Wheatstone bridge differential output (mV)
        # V_out = V_supply * (R / (R + R_ref) - R0 / (R0 + R_ref))
        bridge_frac = resistance / (resistance + r_ref)
        bridge_balanced = r0 / (r0 + r_ref)
        v_bridge_mv = (bridge_frac - bridge_balanced) * v_supply * 1000.0

        # Output calibrated temperature derived from measured resistance
        # Quadratic inversion for T >= 0
        disc = (IEC_A**2) - 4.0 * IEC_B * (1.0 - resistance / r0)
        if disc >= 0.0:
            t_calibrated = (-IEC_A + math.sqrt(disc)) / (2.0 * IEC_B)
        else:
            t_calibrated = t_sensor

        outputs = {
            "temperature_c": round(t_calibrated, 4),
            "resistance_ohms": round(resistance, 4),
            "bridge_voltage_mv": round(v_bridge_mv, 4),
            "sensor_body_temp_c": round(t_sensor, 4),
        }
        new_state = {"t_sensor": t_sensor}
        return outputs, new_state
