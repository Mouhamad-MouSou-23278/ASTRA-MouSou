"""Layer 3a - data quality assessment.

The assessor answers one question per sensor per tick: *can this reading be
trusted?* It sees only sensor output (never ground truth) plus datasheet
metadata, exactly as a real monitoring system would.

`DataQualityAssessor` is the seam for a future ML Trust Layer: any object with
the same `assess` signature can replace `RuleBasedQualityAssessor` without
touching the engine, the medical rules, or the API.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Mapping, Optional, Protocol, Sequence, runtime_checkable

from .sensors import SensorSpec
from .util import linear_slope

GOOD, SUSPECT, BAD, MISSING = "good", "suspect", "bad", "missing"

FLAG_DISCONNECTED = "DISCONNECTED"
FLAG_OUT_OF_RANGE = "OUT_OF_RANGE"
FLAG_STUCK = "STUCK"
FLAG_SPIKE = "SPIKE"
FLAG_EXCESS_NOISE = "EXCESS_NOISE"
FLAG_IMPLAUSIBLE_TREND = "IMPLAUSIBLE_TREND"

FLAG_INFO: dict[str, tuple[str, str]] = {
    # flag: (severity, human explanation)
    FLAG_DISCONNECTED: ("caution", "no data received (sensor disconnected or link dropout)"),
    FLAG_OUT_OF_RANGE: ("caution", "reading outside the sensor's valid range"),
    FLAG_STUCK: ("caution", "reading frozen at a constant value"),
    FLAG_SPIKE: ("info", "isolated jump larger than physically plausible"),
    FLAG_EXCESS_NOISE: ("info", "noise far above the datasheet accuracy"),
    FLAG_IMPLAUSIBLE_TREND: ("caution", "sustained trend faster than physically plausible (drift suspected)"),
}


@dataclass(frozen=True)
class RawSample:
    t: float
    value: Optional[float]


@dataclass(frozen=True)
class QualityAssessment:
    status: str = GOOD
    flags: tuple[str, ...] = ()
    confidence: float = 1.0

    @property
    def usable(self) -> bool:
        return self.status == GOOD


@runtime_checkable
class DataQualityAssessor(Protocol):
    """Interface for anything that scores the trustworthiness of sensor output."""

    name: str

    def assess(
        self,
        sensor: SensorSpec,
        samples: Sequence[RawSample],
        context: Mapping[str, Sequence[RawSample]],
    ) -> QualityAssessment:
        """Assess the newest sample of `samples` (ordered oldest -> newest).

        `context` gives the recent raw windows of every sensor, for
        cross-sensor models. Ground truth is never provided.
        """
        ...


@dataclass
class RuleBasedQualityAssessor:
    """Deterministic, explainable baseline assessor."""

    name: str = "rule-based-v1"
    stuck_window_s: float = 12.0
    spike_window: int = 8
    noise_window_s: float = 10.0
    trend_window_s: float = 60.0
    trend_min_span_s: float = 40.0

    def assess(
        self,
        sensor: SensorSpec,
        samples: Sequence[RawSample],
        context: Mapping[str, Sequence[RawSample]],
    ) -> QualityAssessment:
        samples = list(samples)   # callers may pass a deque; slicing needs a list
        cur = samples[-1]
        if cur.value is None:
            return QualityAssessment(MISSING, (FLAG_DISCONNECTED,), 0.0)
        if not (sensor.min_valid <= cur.value <= sensor.max_valid):
            return QualityAssessment(BAD, (FLAG_OUT_OF_RANGE,), 0.0)

        sigma = max(sensor.accuracy, 1e-9)

        # Stuck: an exactly repeated value for the whole window, when the sensor
        # is expected to show measurable noise at its resolution.
        # Skipped when the datasheet gives no accuracy or the resolution is coarser
        # than the noise, because a healthy reading can then legitimately repeat.
        expects_variation = sensor.accuracy > 0 and (
            sensor.resolution == 0 or sensor.accuracy >= sensor.resolution
        )
        if expects_variation:
            window = [s for s in samples if s.t > cur.t - self.stuck_window_s]
            if (
                len(window) >= 6
                and cur.t - window[0].t >= self.stuck_window_s * 0.8
                and all(s.value is not None and abs(s.value - cur.value) < 1e-12 for s in window)
            ):
                return QualityAssessment(BAD, (FLAG_STUCK,), 0.0)

        # Spike: far from the median of the preceding readings, beyond what
        # noise plus the fastest plausible physical change could explain.
        prev = [s for s in samples[-(self.spike_window + 1):-1] if s.value is not None]
        if len(prev) >= 4:
            med = statistics.median(s.value for s in prev)
            span_s = cur.t - prev[0].t
            limit = 6.0 * sigma + sensor.max_rate_per_min / 60.0 * span_s + sensor.resolution
            if abs(cur.value - med) > limit:
                return QualityAssessment(BAD, (FLAG_SPIKE,), 0.1)

        flags: list[str] = []

        # Excess noise: scatter of first differences far above the datasheet.
        recent = [s for s in samples if s.t > cur.t - self.noise_window_s and s.value is not None]
        if len(recent) >= 10:
            diffs = [b.value - a.value for a, b in zip(recent, recent[1:])]
            # std of a first difference of white noise is sigma * sqrt(2)
            if statistics.pstdev(diffs) > 4.0 * sigma * 1.4142 + sensor.resolution:
                flags.append(FLAG_EXCESS_NOISE)

        # Implausible trend: sustained slope beyond the physical rate limit.
        trend = [(s.t, s.value) for s in samples
                 if s.t > cur.t - self.trend_window_s and s.value is not None]
        if len(trend) >= 20 and trend[-1][0] - trend[0][0] >= self.trend_min_span_s:
            slope = linear_slope(trend)
            if slope is not None and abs(slope) * 60.0 > 1.5 * sensor.max_rate_per_min:
                flags.append(FLAG_IMPLAUSIBLE_TREND)

        if flags:
            return QualityAssessment(SUSPECT, tuple(flags), 0.5)
        return QualityAssessment(GOOD, (), 1.0)


# How long a flag must persist before a data-quality warning is raised, and how
# long it must be absent before the warning clears (simulated seconds).
RAISE_AFTER_S = {
    FLAG_DISCONNECTED: 2.0,
    FLAG_OUT_OF_RANGE: 1.0,
    FLAG_STUCK: 0.0,
    FLAG_SPIKE: 0.0,
    FLAG_EXCESS_NOISE: 3.0,
    FLAG_IMPLAUSIBLE_TREND: 5.0,
}
CLEAR_AFTER_S = 10.0


class QualityMonitor:
    """Turns per-tick flags into data-quality warnings with raise/clear hysteresis."""

    def __init__(self) -> None:
        self._first_seen: dict[tuple[str, str], float] = {}
        self._last_seen: dict[tuple[str, str], float] = {}
        self.active: dict[tuple[str, str], dict] = {}
        self._counter = 0

    def update(self, t: float, sensor: SensorSpec, qa: QualityAssessment) -> list[dict]:
        """Returns timeline events (raised / cleared) produced this tick."""
        events: list[dict] = []
        for flag in qa.flags:
            key = (sensor.key, flag)
            self._first_seen.setdefault(key, t)
            self._last_seen[key] = t
            if key not in self.active and t - self._first_seen[key] >= RAISE_AFTER_S[flag]:
                self._counter += 1
                severity, why = FLAG_INFO[flag]
                warning = {
                    "id": f"dq:{sensor.key}:{flag}:{self._counter}",
                    "kind": "data_quality",
                    "key": flag,
                    "sensor_key": sensor.key,
                    "sensor_name": sensor.name,
                    "severity": severity,
                    "message": f"{sensor.name}: {why}.",
                    "raised_at": t,
                    "cleared_at": None,
                }
                self.active[key] = warning
                events.append({"type": "DQ_WARNING_RAISED", "warning": dict(warning)})
        for key in [k for k in self.active if k[0] == sensor.key]:
            if key[1] not in qa.flags and t - self._last_seen.get(key, t) >= CLEAR_AFTER_S:
                warning = self.active.pop(key)
                warning["cleared_at"] = t
                self._first_seen.pop(key, None)
                events.append({"type": "DQ_WARNING_CLEARED", "warning": dict(warning)})
        for key in [k for k in self._first_seen if k[0] == sensor.key and k not in self.active]:
            if key[1] not in qa.flags and t - self._last_seen.get(key, t) >= CLEAR_AFTER_S:
                self._first_seen.pop(key, None)
        return events
