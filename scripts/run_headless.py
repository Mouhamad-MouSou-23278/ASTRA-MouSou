"""Run a scenario headless and print a digest (engine tuning / debugging aid).

Usage (from the repo root):
    backend/.venv/Scripts/python scripts/run_headless.py ["prompt text"] [--seed N] [--every 30]

Uses a throwaway in-memory catalogue seeded with the demo data, so it never
touches the real database.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.environ["ASTRA_DATABASE_URL"] = "sqlite://"
os.environ.setdefault("ASTRA_LLM_PROVIDER", "local")
os.environ.setdefault("ASTRA_SECRET_KEY", "headless-run-not-a-real-secret-key-000000")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--every", type=float, default=30.0, help="print interval, simulated seconds")
    args = ap.parse_args()

    from sqlalchemy.pool import StaticPool
    from sqlalchemy import create_engine

    from app import db as dbmod
    from app.db import Base, SessionLocal
    from app import models  # noqa: F401
    from app.seed import seed
    from app.seed_data import DEFAULT_PROMPT
    from app.services import planner, registry
    from astra_sim import SimulationEngine, SimulationPlan

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    dbmod.engine = engine
    SessionLocal.configure(bind=engine)
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        seed(db)
        result = planner.generate_plan(db, args.prompt or DEFAULT_PROMPT, args.seed)
        snapshot = registry.build_snapshot(db, None)

    print("PLAN SOURCE:", result.source)
    for note in result.notes:
        print("  note:", note)
    if not result.valid:
        print("INVALID PLAN:", result.problems)
        return 1
    tl = result.timeline
    print(f"\nTIMELINE  duration {tl['duration_s']:.0f} s, distance {tl['distance_m']:.0f} m")
    for s in tl["segments"]:
        print(f"  {s['t_start']:7.1f} -> {s['t_end']:7.1f}  {s['action']:22s} {s['label']}")
    for o in tl["overlays"]:
        print(f"  {o['t_start']:7.1f} -> {o['t_end']!s:>7}  {o['action']:26s} {o['label']}")

    sim = SimulationEngine(registry.engine_config(snapshot, SimulationPlan.model_validate(result.plan)))
    print("\n   t   activity               HR  core  skin   lcg   met   dose/h  cumDose  heatW  cool  | sensor core")
    step_every = max(1, round(args.every / sim.dt))
    while not sim.finished:
        f = sim.step()
        for ev in f["events"]:
            t = ev["type"]
            if t in ("STEP_STARTED", "CONDITION_STARTED", "CONDITION_ENDED", "MISSION_COMPLETE"):
                print(f"{ev['t']:6.1f}  * {t}: {ev.get('label', '')}")
            elif "WARNING" in t:
                w = ev["warning"]
                print(f"{ev['t']:6.1f}  ! {t}: [{w['kind']}/{w['severity']}] {w['message']}")
            elif t == "RULE_INHIBITED":
                print(f"{ev['t']:6.1f}  ~ {ev['message']}")
        if f["seq"] % step_every == 0:
            tr, c = f["truth"], f["conditions"]
            act = f["activity"]["action"] if f["activity"] else "(idle)"
            core = f["sensors"].get("core_temp", [None, "-", []])
            print(f"{f['t']:6.1f}  {act:20s} {tr['heart_rate_bpm']:5.1f} {tr['core_temp_c']:5.2f} "
                  f"{tr['skin_temp_c']:5.2f} {tr['lcg_outlet_temp_c']:5.1f} {tr['metabolic_rate_w']:5.0f} "
                  f"{tr['rad_dose_rate_usv_h']:8.1f} {tr['rad_dose_cum_usv']:7.2f} "
                  f"{c['external_heat_w']:6.0f} {c['cooling_efficiency']:5.2f}  | {core[0]} {core[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
