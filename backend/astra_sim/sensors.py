"""Layer 2 - sensor output.

A sensor observes one ground-truth channel and corrupts it according to its
simulation profile (noise, drift, random spikes, stuck values, dropouts,
quantisation) plus any faults injected by the plan. Sensor output is the only
thing the analytical layer is ever allowed to see.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .util import stable_rng


@dataclass(frozen=True)
class SensorProfile:
    """How a sensor misbehaves. Probabilities are per second of simulated time."""

    baseline: Optional[float] = None   # truth value for sensors with no physics channel
    bias: float = 0.0
    noise_std: float = 0.0
    drift_per_min: float = 0.0
    spike_probability: float = 0.0
    spike_magnitude: float = 0.0
    stuck_probability: float = 0.0
    stuck_duration_s: float = 10.0
    dropout_probability: float = 0.0
    dropout_duration_s: float = 5.0


@dataclass(frozen=True)
class SensorSpec:
    key: str
    name: str
    category: str
    unit: str
    channel: Optional[str]            # ground-truth channel observed, or None
    min_valid: float
    max_valid: float
    accuracy: float                   # datasheet 1-sigma accuracy (used by data quality)
    max_rate_per_min: float           # largest physically plausible rate of change
    resolution: float = 0.0           # quantisation step, 0 = continuous
    profile: SensorProfile = field(default_factory=SensorProfile)

    @property
    def span(self) -> float:
        return self.max_valid - self.min_valid


@dataclass
class Fault:
    """A plan-injected fault window."""

    step_id: str
    fault: str                 # spike | drift | stuck | disconnect | noise_burst | bias
    t_start: float
    t_end: float
    magnitude: Optional[float] = None

    def active(self, t: float) -> bool:
        return self.t_start <= t < self.t_end


SPIKE_PERIOD_S = 4.0


def default_fault_magnitude(spec: SensorSpec, fault: str) -> float:
    """Magnitudes chosen so a default injected fault is clearly detectable."""
    if fault == "spike":
        return max(0.25 * spec.span, 14.0 * spec.accuracy)
    if fault == "drift":           # units per minute
        return 2.5 * spec.max_rate_per_min
    if fault == "bias":
        return 0.06 * spec.span
    if fault == "noise_burst":     # multiplier on the noise standard deviation
        return 8.0
    return 0.0


class SensorModel:
    def __init__(self, spec: SensorSpec, seed: int) -> None:
        self.spec = spec
        self._rng = stable_rng(seed, f"sensor:{spec.key}")
        self._faults: list[Fault] = []
        self._drift = 0.0
        self._last: Optional[float] = None
        self._stuck_until = -1.0
        self._dropout_until = -1.0
        self._spike_sign = 1.0
        self._next_fault_spike: dict[str, float] = {}

    def add_fault(self, fault: Fault) -> None:
        self._faults.append(fault)

    def sample(self, t: float, dt: float, truth: Optional[float]) -> Optional[float]:
        """Return the sensor reading at time t, or None when disconnected."""
        spec, prof, rng = self.spec, self.spec.profile, self._rng
        # Draw the same number of random variates every tick so the stream stays
        # aligned regardless of which branches fire.
        g_noise = rng.gauss(0.0, 1.0)
        u_spike, u_stuck, u_drop = rng.random(), rng.random(), rng.random()

        base = truth if truth is not None else prof.baseline
        active = [f for f in self._faults if f.active(t)]

        def mag(f: Fault) -> float:
            return f.magnitude if f.magnitude is not None else default_fault_magnitude(spec, f.fault)

        # --- drift accumulates whether or not a reading is produced -----------
        drift_rate = prof.drift_per_min + sum(mag(f) for f in active if f.fault == "drift")
        self._drift += drift_rate / 60.0 * dt

        # --- disconnection ----------------------------------------------------
        if prof.dropout_probability > 0 and u_drop < prof.dropout_probability * dt:
            self._dropout_until = t + prof.dropout_duration_s
        if base is None or t < self._dropout_until or any(f.fault == "disconnect" for f in active):
            return None

        # --- stuck value ------------------------------------------------------
        if prof.stuck_probability > 0 and u_stuck < prof.stuck_probability * dt:
            self._stuck_until = t + prof.stuck_duration_s
        if self._last is not None and (
            t < self._stuck_until or any(f.fault == "stuck" for f in active)
        ):
            return self._last

        # --- nominal measurement chain ---------------------------------------
        noise_std = prof.noise_std
        for f in active:
            if f.fault == "noise_burst":
                noise_std = max(noise_std, spec.accuracy) * mag(f)
        value = base + prof.bias + self._drift + g_noise * noise_std
        value += sum(mag(f) for f in active if f.fault == "bias")

        if prof.spike_probability > 0 and u_spike < prof.spike_probability * dt:
            value += prof.spike_magnitude if u_spike * 2 < prof.spike_probability * dt else -prof.spike_magnitude
        for f in active:
            if f.fault == "spike":
                due = self._next_fault_spike.get(f.step_id, f.t_start)
                if t >= due:
                    value += mag(f) * self._spike_sign
                    self._spike_sign = -self._spike_sign
                    self._next_fault_spike[f.step_id] = due + SPIKE_PERIOD_S

        if spec.resolution > 0:
            value = round(value / spec.resolution) * spec.resolution
        self._last = value
        return value
