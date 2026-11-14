"""ASTRA deterministic simulation engine.

This package is deliberately free of web-framework and database imports so it
can be tested, reused, or replaced independently of the ASTRA backend.
"""
from .engine import EngineConfig, SimulationEngine
from .physics import CHANNELS, AstronautParams
from .plan import ALL_ACTIONS, FAULT_TYPES, PlanError, SimulationPlan
from .quality import DataQualityAssessor, QualityAssessment, RuleBasedQualityAssessor
from .rules import AGGREGATIONS, OPERATORS, SEVERITIES, MedicalRule, RuleClause
from .sensors import SensorProfile, SensorSpec
from .timeline import Timeline, compile_plan
from .world import LANDER_RAMP_KEY, HeightField, Waypoint, World

__all__ = [
    "AGGREGATIONS", "ALL_ACTIONS", "CHANNELS", "FAULT_TYPES", "LANDER_RAMP_KEY", "OPERATORS",
    "SEVERITIES", "AstronautParams", "DataQualityAssessor", "EngineConfig", "HeightField",
    "MedicalRule", "PlanError", "QualityAssessment", "RuleBasedQualityAssessor", "RuleClause",
    "SensorProfile", "SensorSpec", "SimulationEngine", "SimulationPlan", "Timeline", "Waypoint",
    "World", "compile_plan",
]
