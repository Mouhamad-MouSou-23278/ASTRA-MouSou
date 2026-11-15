"""Radiation dosimeter sensor physics model.

Grounded in Mars Science Laboratory Radiation Assessment Detector (MSL/RAD)
surface data (Hassler et al., 2014). Models silicon diode charge collection,
temperature-dependent leakage current, and numerical dose integration.
"""
from __future__ import annotations

from typing import Any
from .base import BasePhysicsModel


class SiliconDosimeterModel(BasePhysicsModel):
    key = "silicon_dosimeter"
    name = "Silicon PIN Diode Space Radiation Dosimeter"
    description = (
        "Models electron-hole pair generation from galactic cosmic rays (GCR) and solar energetic particles (SEP). "
        "Computes ionization current, instantaneous dose-equivalent rate, and cumulative EVA dose."
    )
    scientific_reference = (
        "Hassler et al. (2014), Science 343(6169), 1244797 / NASA HRP / NASA-STD-3001"
    )
    default_parameters = {
        "sensitivity_pa_per_usv_h": 0.42,
        "leakage_current_base_pa": 2.5,
        "leakage_doubling_temp_c": 8.0,
        "t0_c": 20.0,
    }

    def evaluate(
        self,
        inputs: dict[str, float],
        parameters: dict[str, Any],
        dt: float,
        state: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, Any]]:
        # Ambient dose rate (baseline ~27.9 uSv/h on Mars Jezero surface)
        dose_rate = float(
            inputs.get("dose_rate", inputs.get("rad_dose_rate_usv_h", 27.9))
        )
        t_c = float(inputs.get("temperature", inputs.get("ext_temp_c", -27.0)))

        sens = float(parameters.get("sensitivity_pa_per_usv_h", 0.42))
        leak_base = float(parameters.get("leakage_current_base_pa", 2.5))
        doubling_temp = float(parameters.get("leakage_doubling_temp_c", 8.0))
        t0 = float(parameters.get("t0_c", 20.0))

        # Silicon diode temperature-dependent leakage current
        # I_leak doubles every ~8 degC
        delta_t = t_c - t0
        leakage_pa = leak_base * (2.0 ** (delta_t / doubling_temp))

        # Radiation ionization photocurrent
        photo_pa = dose_rate * sens
        total_current_pa = photo_pa + leakage_pa

        # Accumulated dose integration
        cum_dose = state.get("cum_dose_usv", 0.0)
        # dt is in seconds; dose_rate is in uSv / hour (3600 seconds)
        delta_dose = (dose_rate / 3600.0) * dt
        new_cum_dose = cum_dose + delta_dose

        outputs = {
            "dose_rate_usv_h": round(dose_rate, 3),
            "cum_dose_usv": round(new_cum_dose, 4),
            "ionization_current_pa": round(total_current_pa, 4),
            "diode_leakage_pa": round(leakage_pa, 4),
        }
        new_state = {"cum_dose_usv": new_cum_dose}
        return outputs, new_state
