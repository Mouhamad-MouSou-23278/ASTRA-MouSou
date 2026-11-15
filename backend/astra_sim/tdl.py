"""Trusted Data Layer (TDL) - Scientific telemetry evaluation and trust assessment.

Calculates instantaneous residuals, error metrics, and explainable trust scores
comparing Ground Truth (Layer 1) with Sensor Telemetry (Layer 2).
"""
from __future__ import annotations

import math
from typing import Optional


def compute_instantaneous_trust(
    y_true: float,
    y_obs: Optional[float],
    accuracy_1sigma: float,
    flags: list[str],
) -> tuple[Optional[float], float]:
    """Computes residual and explainable Trust Score [0.0, 1.0].

    Returns:
        residual: y_obs - y_true (or None if disconnected)
        trust_score: Float in [0.0, 1.0]
    """
    if y_obs is None or "DISCONNECTED" in flags:
        return None, 0.0

    residual = y_obs - y_true
    abs_res = abs(residual)

    # Base flag penalties
    if "OUT_OF_RANGE" in flags:
        return residual, 0.0
    if "STUCK" in flags:
        return residual, 0.15
    if "SPIKE" in flags:
        return residual, 0.25

    sigma = max(accuracy_1sigma, 1e-4)

    # Statistical Gaussian likelihood under datasheet 1-sigma bounds
    # S = exp(-0.5 * (residual / sigma)^2)
    # Scaled gracefully so larger errors taper smoothly
    z_score = abs_res / sigma
    trust = math.exp(-0.5 * min(z_score, 10.0) ** 2)

    if "DRIFT" in flags or "EXCESS_NOISE" in flags:
        trust = min(trust, 0.55)

    return residual, round(max(0.0, min(1.0, trust)), 4)


def compute_benchmark_metrics(
    points: list[dict],
) -> dict[str, float]:
    """Calculates aggregate statistical performance metrics across a run."""
    valid_points = [p for p in points if p.get("residual") is not None]
    total_count = len(points)
    valid_count = len(valid_points)

    if valid_count == 0:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "max_abs_error": 0.0,
            "mean_trust_score": 0.0,
            "availability_pct": 0.0,
        }

    residuals = [abs(p["residual"]) for p in valid_points]
    trust_scores = [p["trust_score"] for p in points]

    mae = sum(residuals) / valid_count
    rmse = math.sqrt(sum(r**2 for r in residuals) / valid_count)
    max_err = max(residuals)
    mean_trust = sum(trust_scores) / total_count
    availability = (valid_count / total_count) * 100.0

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "max_abs_error": round(max_err, 4),
        "mean_trust_score": round(mean_trust, 4),
        "availability_pct": round(availability, 2),
    }
