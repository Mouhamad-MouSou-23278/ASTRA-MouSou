"""Static world description: terrain height field, lander pose and waypoints.

Coordinates are local and metric: x = east, y = north, origin at the landing
site. Headings are compass degrees (clockwise from north).
"""
from __future__ import annotations

import json
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .util import heading_vec

LANDER_RAMP_KEY = "LANDER_RAMP"


class HeightField:
    """Bilinear sampler over a square uint16 height grid (row 0 = north edge)."""

    def __init__(self, values: array, n: int, size_m: float, min_m: float, max_m: float) -> None:
        if len(values) != n * n:
            raise ValueError("height grid size mismatch")
        self._v = values
        self.n = n
        self.size_m = size_m
        self._lo = min_m
        self._scale = (max_m - min_m) / 65535.0

    @classmethod
    def load(cls, terrain_dir: Path) -> "HeightField":
        meta = json.loads((terrain_dir / "terrain.json").read_text(encoding="utf-8"))["near"]
        values = array("H")
        values.frombytes((terrain_dir / meta["file"]).read_bytes())
        if array("H", [1]).tobytes() != b"\x01\x00":  # file is little-endian
            values.byteswap()
        return cls(values, int(meta["n"]), float(meta["size_m"]), float(meta["min_m"]), float(meta["max_m"]))

    def height(self, x: float, y: float) -> float:
        half = self.size_m / 2.0
        step = self.size_m / (self.n - 1)
        col = min(max((x + half) / step, 0.0), self.n - 1.0001)
        row = min(max((half - y) / step, 0.0), self.n - 1.0001)
        c0, r0 = int(col), int(row)
        fc, fr = col - c0, row - r0
        v = self._v
        i = r0 * self.n + c0
        top = v[i] * (1 - fc) + v[i + 1] * fc
        bot = v[i + self.n] * (1 - fc) + v[i + self.n + 1] * fc
        return self._lo + (top * (1 - fr) + bot * fr) * self._scale

    def grade(self, x: float, y: float, heading: float, probe_m: float = 2.0) -> float:
        """Rise over run along a heading (positive = uphill)."""
        ex, ny = heading_vec(heading)
        return (self.height(x + ex * probe_m, y + ny * probe_m) - self.height(x, y)) / probe_m


@dataclass(frozen=True)
class Waypoint:
    key: str
    name: str
    x: float
    y: float
    kind: str = "route"  # route | sample_site | egress | poi


@dataclass
class World:
    lander_x: float = 0.0
    lander_y: float = 0.0
    hatch_heading: float = 90.0     # the egress ramp points this way
    door_offset_m: float = 1.6      # hatch door distance from the lander centre
    ramp_length_m: float = 4.6
    waypoints: dict[str, Waypoint] = field(default_factory=dict)
    heightfield: Optional[HeightField] = None

    def __post_init__(self) -> None:
        fx, fy = self.ramp_foot
        self.waypoints = dict(self.waypoints)
        self.waypoints[LANDER_RAMP_KEY] = Waypoint(
            LANDER_RAMP_KEY, "Lander egress ramp", fx, fy, "egress"
        )

    @property
    def door(self) -> tuple[float, float]:
        ex, ny = heading_vec(self.hatch_heading)
        return self.lander_x + ex * self.door_offset_m, self.lander_y + ny * self.door_offset_m

    @property
    def ramp_foot(self) -> tuple[float, float]:
        ex, ny = heading_vec(self.hatch_heading)
        d = self.door_offset_m + self.ramp_length_m
        return self.lander_x + ex * d, self.lander_y + ny * d

    def grade(self, x: float, y: float, heading: float) -> float:
        return self.heightfield.grade(x, y, heading) if self.heightfield else 0.0

    def to_dict(self) -> dict:
        return {
            "lander": {"x": self.lander_x, "y": self.lander_y, "hatch_heading": self.hatch_heading,
                       "door_offset_m": self.door_offset_m, "ramp_length_m": self.ramp_length_m},
            "waypoints": [
                {"key": w.key, "name": w.name, "x": w.x, "y": w.y, "kind": w.kind}
                for w in self.waypoints.values()
            ],
        }
