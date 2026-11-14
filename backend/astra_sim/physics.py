"""Layer 1 - simulation ground truth.

Deterministic models of the astronaut's physiology, the suit, and the Mars
environment. Everything here is the *actual simulated state*; sensors never
feed back into it.

Scientific constraint (enforced structurally, verified by tests): radiation
exposure and thermal stress are independent channels. The radiation multiplier
only ever touches `rad_dose_rate_usv_h` / `rad_dose_cum_usv`. No physiological
or thermal variable reads a radiation value, so short-term radiation exposure
cannot raise simulated body temperature.

All numbers are plausible engineering approximations for a demonstration,
not validated medical models. Every output is SIMULATED DATA.
"""
from __future__ import annotations

from dataclasses import dataclass

from .util import OUNoise, approach, clamp, stable_rng


@dataclass(frozen=True)
class Channel:
    key: str
    name: str
    unit: str
    category: str  # physiological | spacesuit | environmental
    description: str


CHANNELS: dict[str, Channel] = {
    c.key: c
    for c in [
        Channel("heart_rate_bpm", "Heart rate", "bpm", "physiological",
                "Driven by metabolic rate and thermal strain."),
        Channel("respiration_rate_bpm", "Respiration rate", "breaths/min", "physiological",
                "Driven by metabolic rate."),
        Channel("spo2_pct", "Blood oxygen saturation", "%", "physiological",
                "Slight dip with heavy exertion."),
        Channel("core_temp_c", "Core body temperature", "degC", "physiological",
                "Heat balance: metabolic heat + external load - suit cooling."),
        Channel("skin_temp_c", "Mean skin temperature", "degC", "physiological",
                "Follows core temperature, cooling performance and external load."),
        Channel("metabolic_rate_w", "Metabolic rate", "W", "physiological",
                "Set by the current activity, walking speed and terrain grade."),
        Channel("suit_pressure_kpa", "Suit internal pressure", "kPa", "spacesuit",
                "Regulated suit pressure."),
        Channel("o2_tank_pct", "Primary O2 remaining", "%", "spacesuit",
                "Depletes with metabolic rate."),
        Channel("ppco2_mmhg", "Helmet CO2 partial pressure", "mmHg", "spacesuit",
                "Rises with metabolic rate."),
        Channel("suit_gas_temp_c", "Suit internal gas temperature", "degC", "spacesuit",
                "Rises with external heat load and degraded cooling."),
        Channel("lcg_outlet_temp_c", "Cooling garment outlet temperature", "degC", "spacesuit",
                "Coolant temperature leaving the garment; rises when cooling is saturated."),
        Channel("battery_pct", "Suit battery", "%", "spacesuit",
                "Depletes over time; faster under high cooling demand."),
        Channel("ext_temp_c", "External air temperature", "degC", "environmental",
                "Ambient Mars near-surface temperature."),
        Channel("ext_pressure_pa", "External pressure", "Pa", "environmental",
                "Ambient Mars surface pressure."),
        Channel("wind_speed_ms", "Wind speed", "m/s", "environmental",
                "Near-surface wind."),
        Channel("rad_dose_rate_usv_h", "Radiation dose rate", "uSv/h", "environmental",
                "Ambient dose-equivalent rate. Independent of all thermal variables."),
        Channel("rad_dose_cum_usv", "Cumulative EVA radiation dose", "uSv", "spacesuit",
                "Time integral of the dose rate since mission start."),
    ]
}

# Baseline surface dose-equivalent rate, ~0.67 mSv/day as measured by MSL/RAD
# on the Martian surface (Hassler et al., 2014).
BASE_DOSE_RATE_USV_H = 27.9

REST_W = 105.0
BODY_SPECIFIC_HEAT = 3470.0   # J/(kg K)
COOLING_CAPACITY_W = 620.0    # nominal liquid-cooling garment heat removal
COOLANT_W_PER_K = 125.0       # coolant mass flow x specific heat
EVA_O2_HOURS = 8.0
BATTERY_HOURS = 9.0


@dataclass(frozen=True)
class AstronautParams:
    callsign: str = "ARES-1"
    mass_kg: float = 80.0
    resting_hr: float = 62.0
    baseline_core_temp_c: float = 37.0
    vo2max: float = 48.0


@dataclass
class ActivityInput:
    """What the astronaut is doing during this tick (from the timeline)."""

    action: str = "INSIDE"     # INSIDE | OPEN_HATCH | ASTRONAUT_EXIT | TURN | WALK | KNEEL |
                               # COLLECT_SOIL_SAMPLE | STAND_UP | WAIT | IDLE
    speed_mps: float = 0.0
    grade: float = 0.0
    outside: bool = False


@dataclass
class OverlayInput:
    """Externally imposed conditions for this tick (already ramped)."""

    external_heat_w: float = 0.0
    cooling_efficiency: float = 1.0
    radiation_multiplier: float = 1.0


def metabolic_target_w(act: ActivityInput) -> float:
    a = act.action
    if a == "WALK":
        return 150.0 + 230.0 * act.speed_mps * (1.0 + 5.0 * clamp(act.grade, -0.10, 0.30))
    return {
        "INSIDE": REST_W,
        "OPEN_HATCH": 150.0,
        "ASTRONAUT_EXIT": 260.0,
        "TURN": 185.0,
        "KNEEL": 230.0,
        "STAND_UP": 240.0,
        "COLLECT_SOIL_SAMPLE": 290.0,
        "WAIT": 135.0 if act.outside else REST_W,
        "IDLE": 135.0 if act.outside else REST_W,
    }.get(a, REST_W)


class GroundTruthModel:
    """Integrates the true physiological, suit and environmental state."""

    def __init__(self, astronaut: AstronautParams, seed: int) -> None:
        self.p = astronaut
        phys = stable_rng(seed, "truth:physiology")
        env = stable_rng(seed, "truth:environment")
        rad = stable_rng(seed, "truth:radiation")
        base = astronaut.baseline_core_temp_c
        self.s: dict[str, float] = {
            "heart_rate_bpm": astronaut.resting_hr,
            "respiration_rate_bpm": 13.5,
            "spo2_pct": 98.6,
            "core_temp_c": base,
            "skin_temp_c": 33.2,
            "metabolic_rate_w": REST_W,
            "suit_pressure_kpa": 29.6,
            "o2_tank_pct": 98.5,   # some O2 already used during suit checkout
            "ppco2_mmhg": 1.6,
            "suit_gas_temp_c": 21.0,
            "lcg_outlet_temp_c": 14.5 + 0.9 * REST_W / COOLANT_W_PER_K,
            "battery_pct": 97.0,
            "ext_temp_c": -27.0,
            "ext_pressure_pa": 735.0,
            "wind_speed_ms": 6.0,
            "rad_dose_rate_usv_h": BASE_DOSE_RATE_USV_H,
            "rad_dose_cum_usv": 0.0,
        }
        # Smooth state without natural variability; variability is added on output.
        self._hr = astronaut.resting_hr
        self._rr = 13.5
        self._spo2 = 98.6
        self._skin = 33.2
        self._hr_var = OUNoise(phys, 1.2, 8.0)
        self._rr_var = OUNoise(phys, 0.35, 12.0)
        self._spo2_var = OUNoise(phys, 0.12, 20.0)
        self._skin_var = OUNoise(phys, 0.04, 30.0)
        self._press_var = OUNoise(phys, 0.025, 15.0)
        self._ext_temp_var = OUNoise(env, 0.6, 60.0)
        self._ext_press_var = OUNoise(env, 2.0, 120.0)
        self._wind_var = OUNoise(env, 1.0, 20.0)
        self._rad_var = OUNoise(rad, 0.04, 30.0)
        self.cooling_w = 0.0      # diagnostics: heat currently removed by the suit
        self.heat_storage_w = 0.0  # diagnostics: net heat being stored in the body

    def step(self, dt: float, act: ActivityInput, ov: OverlayInput) -> dict[str, float]:
        s, p = self.s, self.p
        base = p.baseline_core_temp_c

        # --- metabolism ------------------------------------------------------
        m = approach(s["metabolic_rate_w"], metabolic_target_w(act), 18.0, dt)
        s["metabolic_rate_w"] = m
        dm = m - REST_W

        # --- thermal balance (independent of radiation by construction) -------
        heat_gen = 0.9 * m
        setpoint = base + 0.0012 * dm          # mild exercise-induced rise
        core = s["core_temp_c"]
        capacity = COOLING_CAPACITY_W * ov.cooling_efficiency
        demand = max(0.0, heat_gen + ov.external_heat_w + 450.0 * (core - setpoint))
        cooling = min(demand, capacity)
        storage = heat_gen + ov.external_heat_w - cooling
        core += storage / (p.mass_kg * BODY_SPECIFIC_HEAT) * dt
        s["core_temp_c"] = core
        self.cooling_w = cooling
        self.heat_storage_w = storage
        strain = max(0.0, core - base)

        lost = 1.0 - ov.cooling_efficiency
        self._skin = approach(
            self._skin,
            33.2 + 0.5 * (core - base) + 0.0035 * ov.external_heat_w + 3.0 * lost + 0.002 * dm,
            50.0, dt,
        )
        s["skin_temp_c"] = self._skin + self._skin_var.step(dt)
        s["suit_gas_temp_c"] = approach(
            s["suit_gas_temp_c"],
            21.0 + 0.004 * ov.external_heat_w + 5.0 * lost + 0.003 * dm,
            80.0, dt,
        )
        inlet = 14.5 + 11.0 * lost + 0.003 * ov.external_heat_w
        s["lcg_outlet_temp_c"] = approach(
            s["lcg_outlet_temp_c"], inlet + cooling / COOLANT_W_PER_K, 25.0, dt
        )

        # --- cardio-respiratory ----------------------------------------------
        fitness = clamp(48.0 / p.vo2max, 0.7, 1.4)
        self._hr = approach(self._hr, p.resting_hr + fitness * 0.21 * dm + 32.0 * strain, 22.0, dt)
        s["heart_rate_bpm"] = self._hr + self._hr_var.step(dt)
        self._rr = approach(self._rr, 13.5 + 0.034 * dm + 2.5 * strain, 30.0, dt)
        s["respiration_rate_bpm"] = self._rr + self._rr_var.step(dt)
        self._spo2 = approach(
            self._spo2, 98.6 - 0.0035 * dm - 0.4 * max(0.0, strain - 0.8), 45.0, dt
        )
        s["spo2_pct"] = min(100.0, self._spo2 + self._spo2_var.step(dt))

        # --- suit consumables -------------------------------------------------
        s["suit_pressure_kpa"] = 29.6 + self._press_var.step(dt)
        s["o2_tank_pct"] = max(0.0, s["o2_tank_pct"] - (m / 300.0) * (100.0 / (EVA_O2_HOURS * 3600.0)) * dt)
        s["ppco2_mmhg"] = approach(s["ppco2_mmhg"], 1.6 + 0.011 * dm, 60.0, dt)
        drain = (100.0 / (BATTERY_HOURS * 3600.0)) * (1.0 + 0.35 * cooling / COOLING_CAPACITY_W)
        s["battery_pct"] = max(0.0, s["battery_pct"] - drain * dt)

        # --- environment ------------------------------------------------------
        s["ext_temp_c"] = -27.0 + self._ext_temp_var.step(dt)
        s["ext_pressure_pa"] = 735.0 + self._ext_press_var.step(dt)
        s["wind_speed_ms"] = max(0.0, 6.0 + self._wind_var.step(dt))

        # --- radiation (reads nothing above, feeds nothing above) -------------
        rate = BASE_DOSE_RATE_USV_H * ov.radiation_multiplier * (1.0 + self._rad_var.step(dt))
        s["rad_dose_rate_usv_h"] = max(0.0, rate)
        s["rad_dose_cum_usv"] += s["rad_dose_rate_usv_h"] / 3600.0 * dt

        return dict(s)
