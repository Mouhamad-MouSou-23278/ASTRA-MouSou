"""Small deterministic helpers shared by the simulation engine."""
from __future__ import annotations

import hashlib
import math
import random


def stable_rng(seed: int, name: str) -> random.Random:
    """Return an RNG whose stream depends only on (seed, name).

    Every stochastic component (each sensor, the physiology model, the
    environment) gets its own named stream, so adding or removing one component
    never perturbs the random sequence of another. This is what makes a session
    reproducible from its seed.
    """
    digest = hashlib.sha256(f"{seed}:{name}".encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


class OUNoise:
    """Ornstein-Uhlenbeck process: smooth, mean-reverting natural variability."""

    def __init__(self, rng: random.Random, sigma: float, tau_s: float) -> None:
        self._rng = rng
        self.sigma = sigma
        self.tau_s = tau_s
        self.x = 0.0

    def step(self, dt: float) -> float:
        a = math.exp(-dt / self.tau_s)
        self.x = self.x * a + self.sigma * math.sqrt(1.0 - a * a) * self._rng.gauss(0.0, 1.0)
        return self.x


def approach(current: float, target: float, tau_s: float, dt: float) -> float:
    """First-order lag of `current` toward `target` with time constant tau_s."""
    return target + (current - target) * math.exp(-dt / tau_s)


def clamp(value: float, lo: float, hi: float) -> float:
    return lo if value < lo else hi if value > hi else value


def heading_deg(dx_east: float, dy_north: float) -> float:
    """Compass heading (degrees clockwise from north) of a displacement."""
    return math.degrees(math.atan2(dx_east, dy_north)) % 360.0


def heading_vec(heading: float) -> tuple[float, float]:
    """Unit (east, north) vector for a compass heading in degrees."""
    r = math.radians(heading)
    return math.sin(r), math.cos(r)


def angle_diff(a: float, b: float) -> float:
    """Signed smallest rotation in degrees taking heading a to heading b."""
    return (b - a + 180.0) % 360.0 - 180.0


def linear_slope(points: list[tuple[float, float]]) -> float | None:
    """Least-squares slope dy/dx of (x, y) points, or None if undetermined."""
    n = len(points)
    if n < 3:
        return None
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    sxx = sum((p[0] - mx) ** 2 for p in points)
    if sxx <= 1e-12:
        return None
    sxy = sum((p[0] - mx) * (p[1] - my) for p in points)
    return sxy / sxx
