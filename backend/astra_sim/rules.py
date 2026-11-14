"""Layer 3b - medical rule evaluation.

Rules are evaluated on *trusted sensor output only*. A reading that the data
quality layer marked bad or missing is never used as clinical evidence: the
clause becomes "unknown" and the rule is reported as inhibited instead of
raising (or clearing) a medical warning on faulty data.
"""
from __future__ import annotations

import operator
from dataclasses import dataclass, field
from typing import Mapping, Optional, Sequence

from .quality import GOOD, SUSPECT
from .sensors import SensorSpec
from .util import linear_slope

AGGREGATIONS = ("last", "mean", "min", "max", "slope_per_min", "delta")
OPERATORS = {">": operator.gt, ">=": operator.ge, "<": operator.lt, "<=": operator.le}
SEVERITIES = ("advisory", "caution", "warning", "critical")

LAST_MAX_AGE_S = 3.0        # "last" may use the newest trusted reading this old
WINDOW_COVERAGE = 0.4       # fraction of a window that must be trusted data
UNKNOWN_GRACE_S = 5.0       # brief untrusted gaps do not reset a pending rule
INHIBIT_EVENT_GAP_S = 30.0  # rate limit for RULE_INHIBITED timeline events


@dataclass(frozen=True)
class RuleClause:
    sensor_key: str
    operator: str
    threshold: float
    aggregation: str = "last"
    window_s: float = 30.0


@dataclass(frozen=True)
class MedicalRule:
    key: str
    name: str
    severity: str
    clauses: tuple[RuleClause, ...]
    logic: str = "all"                  # all | any
    sustain_s: float = 10.0
    clear_after_s: float = 30.0
    require_good_quality: bool = True
    condition_key: Optional[str] = None
    condition_name: Optional[str] = None
    message: str = ""
    recommendations: tuple[str, ...] = ()


@dataclass(frozen=True)
class TrustedSample:
    t: float
    value: Optional[float]
    status: str


@dataclass
class _RuleState:
    true_since: Optional[float] = None
    false_since: Optional[float] = None
    unknown_since: Optional[float] = None
    last_inhibit_event: float = -1e9
    warning: Optional[dict] = None
    state: str = "inactive"
    count: int = 0
    inhibited_by: list[str] = field(default_factory=list)


class RuleEngine:
    def __init__(self, rules: Sequence[MedicalRule], sensors: Sequence[SensorSpec], dt: float) -> None:
        self.rules = list(rules)
        self.dt = dt
        self._sensors = {s.key: s for s in sensors}
        self._state = {r.key: _RuleState() for r in self.rules}

    @property
    def active_warnings(self) -> list[dict]:
        return [dict(st.warning) for st in self._state.values() if st.warning is not None]

    # -- clause ---------------------------------------------------------------
    def _clause(
        self, c: RuleClause, series: Mapping[str, Sequence[TrustedSample]], t: float, strict: bool
    ) -> tuple[Optional[float], Optional[bool], str]:
        """Returns (value, result, reason). result None means 'unknown'."""
        samples = series.get(c.sensor_key)
        if samples is None:
            return None, None, "sensor is not active"

        def ok(s: TrustedSample) -> bool:
            return s.value is not None and (s.status == GOOD or (not strict and s.status == SUSPECT))

        if c.aggregation == "last":
            for s in reversed(samples):
                if t - s.t > LAST_MAX_AGE_S:
                    break
                if ok(s):
                    return s.value, OPERATORS[c.operator](s.value, c.threshold), ""
            return None, None, "no trusted reading"

        window = [s for s in samples if s.t > t - c.window_s - 1e-9]
        good = [s for s in window if ok(s)]
        if not good or t - good[-1].t > LAST_MAX_AGE_S:
            return None, None, "no trusted reading"
        if t < c.window_s:
            return None, None, "warming up"
        if len(good) < WINDOW_COVERAGE * (c.window_s / self.dt):
            return None, None, "not enough trusted data in window"

        vals = [s.value for s in good]
        if c.aggregation == "mean":
            value = sum(vals) / len(vals)
        elif c.aggregation == "min":
            value = min(vals)
        elif c.aggregation == "max":
            value = max(vals)
        elif c.aggregation == "delta":
            value = vals[-1] - vals[0]
        else:  # slope_per_min
            slope = linear_slope([(s.t, s.value) for s in good])
            if slope is None:
                return None, None, "not enough trusted data in window"
            value = slope * 60.0
        return value, OPERATORS[c.operator](value, c.threshold), ""

    # -- rules ----------------------------------------------------------------
    def evaluate(
        self, t: float, series: Mapping[str, Sequence[TrustedSample]]
    ) -> tuple[list[dict], list[dict]]:
        """Returns (events, rule_status) for this tick."""
        events: list[dict] = []
        status: list[dict] = []

        for rule in self.rules:
            st = self._state[rule.key]
            evals = [self._clause(c, series, t, rule.require_good_quality) for c in rule.clauses]
            results = [e[1] for e in evals]
            if rule.logic == "any":
                result = True if any(r is True for r in results) else (
                    None if any(r is None for r in results) else False)
            else:
                result = False if any(r is False for r in results) else (
                    None if any(r is None for r in results) else True)

            evidence = []
            for c, (value, res, reason) in zip(rule.clauses, evals):
                spec = self._sensors.get(c.sensor_key)
                evidence.append({
                    "sensor_key": c.sensor_key,
                    "sensor_name": spec.name if spec else c.sensor_key,
                    "unit": spec.unit if spec else "",
                    "aggregation": c.aggregation,
                    "window_s": c.window_s,
                    "operator": c.operator,
                    "threshold": c.threshold,
                    "value": None if value is None else round(value, 4),
                    "result": res,
                    "reason": reason,
                })
            warming = any(e[2] == "warming up" for e in evals)
            blockers = sorted({c.sensor_key for c, e in zip(rule.clauses, evals)
                               if e[1] is None and e[2] != "warming up"})

            if result is True:
                st.unknown_since = None
                st.false_since = None
                if st.true_since is None:
                    st.true_since = t
                if st.warning is None and t - st.true_since >= rule.sustain_s:
                    st.count += 1
                    st.warning = {
                        "id": f"med:{rule.key}:{st.count}",
                        "kind": "medical",
                        "key": rule.key,
                        "name": rule.name,
                        "severity": rule.severity,
                        "condition_key": rule.condition_key,
                        "condition_name": rule.condition_name,
                        "message": rule.message or rule.name,
                        "recommendations": list(rule.recommendations),
                        "evidence": evidence,
                        "raised_at": t,
                        "cleared_at": None,
                    }
                    events.append({"type": "MEDICAL_WARNING_RAISED", "warning": dict(st.warning)})
            elif result is False:
                st.unknown_since = None
                st.true_since = None
                if st.warning is not None:
                    if st.false_since is None:
                        st.false_since = t
                    if t - st.false_since >= rule.clear_after_s:
                        st.warning["cleared_at"] = t
                        events.append({"type": "MEDICAL_WARNING_CLEARED", "warning": dict(st.warning)})
                        st.warning = None
                        st.false_since = None
            else:  # unknown: neither raise nor clear on untrusted data
                if st.unknown_since is None:
                    st.unknown_since = t
                if t - st.unknown_since >= UNKNOWN_GRACE_S:
                    st.true_since = None

            if st.warning is not None:
                st.warning["evidence"] = evidence
                state = "active"
            elif result is None and warming and not blockers:
                state = "warming_up"
            elif result is None and st.unknown_since is not None and t - st.unknown_since >= UNKNOWN_GRACE_S:
                state = "inhibited"
            elif st.true_since is not None:
                state = "pending"
            else:
                state = "inactive"

            if state == "inhibited" and st.state != "inhibited" and blockers \
                    and t - st.last_inhibit_event >= INHIBIT_EVENT_GAP_S:
                st.last_inhibit_event = t
                events.append({
                    "type": "RULE_INHIBITED",
                    "rule_key": rule.key,
                    "rule_name": rule.name,
                    "sensors": blockers,
                    "message": (f"Medical rule '{rule.name}' is inhibited: untrusted data from "
                                f"{', '.join(blockers)}."),
                })
            st.state = state
            st.inhibited_by = blockers if state == "inhibited" else []
            status.append({
                "key": rule.key, "name": rule.name, "severity": rule.severity, "state": state,
                "inhibited_by": st.inhibited_by, "clauses": evidence,
            })
        return events, status
