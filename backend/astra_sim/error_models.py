"""Library of parameterized sensor error models and failure injectors.

All stochastic components use seeded PRNGs for bit-identical reproducibility.
"""
from __future__ import annotations

import random
from typing import Any, Optional


def apply_error_pipeline(
    raw_value: Optional[float],
    t: float,
    dt: float,
    configs: list[dict[str, Any]],
    state: dict[str, Any],
    rng: random.Random,
) -> tuple[Optional[float], list[str], dict[str, Any]]:
    """Applies configured error models in sequence to raw physical transducer value.

    Returns:
        corrupted_value: Corrupted measurement, or None if disconnected.
        active_flags: List of triggered error flags (e.g. ['DISCONNECTED', 'SPIKE']).
        new_state: Updated error tracking state (accumulated drift, timers, etc.).
    """
    if raw_value is None:
        return None, ["DISCONNECTED"], state

    val = raw_value
    flags: list[str] = []
    new_state = dict(state)

    for cfg in configs:
        if not cfg.get("enabled", True):
            continue

        etype = cfg.get("error_type")
        params = cfg.get("parameters", {})

        # 1. Bias Offset
        if etype == "bias_offset":
            offset = float(params.get("bias", 0.0))
            val += offset

        # 2. Linear / Exponential Drift
        elif etype == "linear_drift":
            rate_per_min = float(params.get("drift_per_min", 0.0))
            accum = new_state.get("accumulated_drift", 0.0)
            accum += (rate_per_min / 60.0) * dt
            new_state["accumulated_drift"] = accum
            val += accum
            if abs(accum) > 0.001:
                flags.append("DRIFT")

        # 3. Gaussian Noise
        elif etype == "gaussian_noise":
            sigma = float(params.get("noise_std", 0.0))
            if sigma > 0.0:
                g = rng.gauss(0.0, sigma)
                val += g

        # 4. Stuck-at Fault
        elif etype == "stuck_at":
            target_val = params.get("target_value")
            t_start = float(params.get("t_start", 0.0))
            duration = float(params.get("duration_s", 9999.0))
            if t_start <= t < (t_start + duration):
                stuck_val = (
                    float(target_val)
                    if target_val is not None
                    else new_state.get("stuck_sample", val)
                )
                new_state["stuck_sample"] = stuck_val
                val = stuck_val
                flags.append("STUCK")

        # 5. Dropout / Disconnection
        elif etype == "dropout":
            t_start = float(params.get("t_start", 0.0))
            duration = float(params.get("duration_s", 5.0))
            prob_per_s = float(params.get("probability_per_s", 0.0))
            in_window = t_start <= t < (t_start + duration)
            prob_hit = prob_per_s > 0.0 and rng.random() < prob_per_s * dt
            if in_window or prob_hit:
                flags.append("DISCONNECTED")
                return None, flags, new_state

        # 6. Transient Spikes
        elif etype == "spike":
            mag = float(params.get("spike_magnitude", 5.0))
            period = float(params.get("period_s", 10.0))
            prob_per_s = float(params.get("probability_per_s", 0.0))
            due_t = new_state.get("next_spike_t", params.get("t_start", 0.0))
            if (period > 0 and t >= due_t) or (
                prob_per_s > 0 and rng.random() < prob_per_s * dt
            ):
                sign = new_state.get("spike_sign", 1.0)
                val += mag * sign
                new_state["spike_sign"] = -sign
                new_state["next_spike_t"] = t + period
                flags.append("SPIKE")

        # 7. Quantization
        elif etype == "quantization":
            res = float(params.get("resolution", 0.0))
            if res > 0.0:
                val = round(val / res) * res

    return val, flags, new_state


def list_available_error_models() -> list[dict[str, Any]]:
    return [
        {
            "error_type": "gaussian_noise",
            "name": "Gaussian White Noise",
            "description": "Additive Gaussian distribution matched to datasheet precision.",
            "parameters": {"noise_std": 0.05},
        },
        {
            "error_type": "linear_drift",
            "name": "Linear Metrological Drift",
            "description": "Continuous time-integrated drift per minute.",
            "parameters": {"drift_per_min": 0.5},
        },
        {
            "error_type": "bias_offset",
            "name": "Calibration Bias Offset",
            "description": "Constant systematic offset from reference calibration.",
            "parameters": {"bias": 1.2},
        },
        {
            "error_type": "stuck_at",
            "name": "Frozen / Stuck-at Value",
            "description": "Signal locks at a constant reading.",
            "parameters": {"target_value": None, "t_start": 10.0, "duration_s": 20.0},
        },
        {
            "error_type": "dropout",
            "name": "Intermittent Signal Dropout",
            "description": "Complete communication loss or transducer power disruption.",
            "parameters": {"t_start": 15.0, "duration_s": 5.0, "probability_per_s": 0.0},
        },
        {
            "error_type": "spike",
            "name": "Transient Electrical / EMI Spike",
            "description": "Impulsive high-frequency spikes beyond physical maximum rates.",
            "parameters": {"spike_magnitude": 10.0, "period_s": 15.0},
        },
        {
            "error_type": "quantization",
            "name": "ADC Discretization & Quantization",
            "description": "Quantization rounding to discrete sensor ADC LSB steps.",
            "parameters": {"resolution": 0.1},
        },
    ]
