"""ASTRA Medical Machine Learning Decision & Autonomous Triage Engine.

Combines physiological telemetry with Trusted Data Layer (TDL) sensor trust scores
to perform real-time autonomous clinical diagnosis during Mars EVA missions,
especially during Communication Blackout (Loss of Signal / LOS).

Grounded in:
- NASA-STD-3001 (Space Flight Human-System Standard)
- EVA-EXP-0034 (Exploration Extravehicular Activity System Technical Standard)
- Apollo, Skylab, and ISS EVA clinical anomaly records
"""
from __future__ import annotations

import csv
import json
import math
import os
import random
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence

MODEL_SAVE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "medical_ml_model.json"))
DATASET_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "nasa_eva_medical_telemetry.csv"))

DIAGNOSIS_CLASSES = [
    "NOMINAL",
    "HEAT_EXHAUSTION",
    "HYPOXIA",
    "HYPERCAPNIA",
    "DECOMPRESSION_RISK",
    "RADIATION_EVENT",
    "SENSOR_ARTIFACT_FALSE_ALARM",
]

CLINICAL_KNOWLEDGE = {
    "NOMINAL": {
        "title_en": "Nominal Physiological Equilibrium",
        "title_ar": "توازن فسيولوجي طبيعي",
        "severity": "nominal",
        "citation": "NASA-STD-3001 Vol 1 §4.2: Astronaut vital signs within steady-state EVA margins.",
        "actions_en": ["Continue scheduled EVA timeline.", "Maintain nominal hydration and hydration cycle."],
        "actions_ar": ["مواصلة الجدول الزمني لنشاط السير في الفضاء.", "الحفاظ على معدل الترطيب وتناول السوائل بانتظام."],
    },
    "HEAT_EXHAUSTION": {
        "title_en": "Core Body Hyperthermia / Heat Exhaustion",
        "title_ar": "فرط الحرارة المركزي / إجهاد حراري",
        "severity": "critical",
        "citation": "NASA-STD-3001 Vol 2 §6.5.2: Core body temperature must not exceed 38.0°C sustained.",
        "actions_en": [
            "Immediately increase LCVG (Liquid Cooling Garment) coolant flow to MAX.",
            "Halt all physical traversal and rest in shaded terrain.",
            "Crew Doctor: Monitor for core temperature slope exceeding +0.1°C/min.",
        ],
        "actions_ar": [
            "زيادة تدفق سائل التبريد في سترة التبريد (LCVG) إلى الحد الأقصى فوراً.",
            "إيقاف كافة التحركات البدنية والاستراحة في منطقة ظل تضاريسية.",
            "طبيب الطاقم: مراقبة معدل ارتفاع الحرارة المركزية لتجنب تجاوز 0.1 مئوية/دقيقة.",
        ],
    },
    "HYPOXIA": {
        "title_en": "Acute Hypoxia / O2 Saturation Deficit",
        "title_ar": "نقص أكسجة حاد / انخفاض تشبع الأكسجين في الدم",
        "severity": "critical",
        "citation": "NASA-STD-3001 Vol 2 §6.2.1: Inspired pO2 must maintain blood SpO2 ≥ 90% at all times.",
        "actions_en": [
            "Switch spacesuit life support to Secondary Oxygen Pack (SOP).",
            "Verify helmet purge valve is closed.",
            "Prepare immediate emergency ingress to rover airlock or habitat.",
        ],
        "actions_ar": [
            "تحويل نظام دعم الحياة إلى حزمة الأكسجين الثانوية (SOP) فوراً.",
            "التحقق من إغلاق صمام تصريف الخوذة بإحكام.",
            "الاستعداد للدخول الطارئ إلى حجرة معادلة الضغط بمركبة الاستكشاف أو القاعدة.",
        ],
    },
    "HYPERCAPNIA": {
        "title_en": "Hypercapnia / Elevated Inspired CO2",
        "title_ar": "فرط ثنائي أكسيد الكربون / ارتفاع CO2 المستنشق",
        "severity": "warning",
        "citation": "NASA-STD-3001 Vol 2 §6.2.2: Inspired pCO2 must remain < 5.0 mmHg (7.6 mmHg max excursion).",
        "actions_en": [
            "Cycle amine scrubber bed / verify LiOH cartridge bypass.",
            "Instruct astronaut to slow breathing frequency to reduce CO2 generation.",
            "If pCO2 > 10 mmHg, terminate EVA immediately.",
        ],
        "actions_ar": [
            "إعادة تشغيل مصافي تنقية الأمين والتحقق من كفاءة خراطيش هيدروكسيد الليثيوم.",
            "توجيه رائد الفضاء بتهدئة معدل التنفس لخفض إنتاج ثاني أكسيد الكربون.",
            "إذا تجاوز pCO2 حاجز 10 ملم زئبق، يجب إنهاء مهمة السير الخارجي فوراً.",
        ],
    },
    "DECOMPRESSION_RISK": {
        "title_en": "Spacesuit Pressure Breach / Decompression Risk",
        "title_ar": "تسرب ضغط بذلة الفضاء / خطر انخفاض الضغط الحاد",
        "severity": "critical",
        "citation": "NASA-STD-3001 Vol 2 §6.1.1: Suit pressure must sustain minimum 27.6 kPa (4.0 psia).",
        "actions_en": [
            "Activate emergency high-pressure makeup gas injection.",
            "Perform tactile inspection of gloves, helmet seals, and umbilical connectors.",
            "Abort EVA and execute fast-repressurization protocol.",
        ],
        "actions_ar": [
            "تفعيل حقن غاز التعويض الطارئ عالي الضغط بالبذلة.",
            "فحص فوري للقفازات وموانع تسرب الخوذة وموصلات الإمداد.",
            "إلغاء مهمة السير فوراً والتوجه لبروتوكول إعادة الضغط السريع.",
        ],
    },
    "RADIATION_EVENT": {
        "title_en": "Solar Particle Event (SPE) / High Radiation Influx",
        "title_ar": "عاصفة جزيئات شمسية / تدفق إشعاعي مرتفع",
        "severity": "warning",
        "citation": "NASA-STD-3001 Vol 1 §4.3: Radiation ALARA principle; Mars surface limit 250 mSv career limit.",
        "actions_en": [
            "Seek immediate natural geologic shielding (crater ridge, overhang, lava tube).",
            "Orient suit backpack (water reservoir) toward sun as temporary water shield.",
            "Crew Doctor: Administer prophylactic radioprotectant / antiemetic upon ingress.",
        ],
        "actions_ar": [
            "اللجوء فوراً إلى حماية جيولوجية طبيعية (حافة فوهة، تجويف صخري، أنبوب بركاني).",
            "توجيه حقيبة الظهر (خزان المياه) نحو الشمس ليعمل كدرع مائي مؤقت.",
            "طبيب الطاقم: إعطاء واقيات الإشعاع الوقائية ومضادات الغثيان فور العودة للمركبة.",
        ],
    },
    "SENSOR_ARTIFACT_FALSE_ALARM": {
        "title_en": "Sensor Artifact Suppressed / False Alarm Prevented",
        "title_ar": "تجاهل إشارة كاذبة للمستشعر / منع إنذار خاطئ",
        "severity": "advisory",
        "citation": "ASTRA Trusted Data Layer: Multi-sensor cross-validation identified low sensor integrity.",
        "actions_en": [
            "TDL detected low Trust Score on primary sensor; secondary physiological indicators are stable.",
            "Crew Doctor: Instruct astronaut to inspect and readjust sensor probe attachment.",
            "False emergency medical intervention prevented.",
        ],
        "actions_ar": [
            "طبقة البيانات الموثوقة كشفت انخفاض موثوقية المستشعر بينما المؤشرات الثانوية طبيعية.",
            "طبيب الطاقم: توجيه رائد الفضاء لتثبيت وتعديل موضع مجس المستشعر.",
            "تم بنجاح منع تدخّل طبي طارئ خاطئ وغير مبرر.",
        ],
    },
}


class DecisionTreeNode:
    def __init__(
        self,
        feature: Optional[str] = None,
        threshold: Optional[float] = None,
        left: Optional[DecisionTreeNode] = None,
        right: Optional[DecisionTreeNode] = None,
        prediction: Optional[str] = None,
        probabilities: Optional[dict[str, float]] = None,
    ):
        self.feature = feature
        self.threshold = threshold
        self.left = left
        self.right = right
        self.prediction = prediction
        self.probabilities = probabilities or {}

    def to_dict(self) -> dict[str, Any]:
        if self.prediction:
            return {"prediction": self.prediction, "probabilities": self.probabilities}
        return {
            "feature": self.feature,
            "threshold": self.threshold,
            "left": self.left.to_dict() if self.left else None,
            "right": self.right.to_dict() if self.right else None,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> DecisionTreeNode:
        if "prediction" in d:
            return cls(prediction=d["prediction"], probabilities=d.get("probabilities", {}))
        return cls(
            feature=d["feature"],
            threshold=d["threshold"],
            left=cls.from_dict(d["left"]) if d.get("left") else None,
            right=cls.from_dict(d["right"]) if d.get("right") else None,
        )

    def predict(self, x: Mapping[str, float]) -> dict[str, float]:
        if self.prediction:
            return self.probabilities
        val = x.get(self.feature, 0.0)
        if val <= self.threshold:
            return self.left.predict(x) if self.left else self.probabilities
        return self.right.predict(x) if self.right else self.probabilities


class MedicalRandomForest:
    """Interpretable, portable Random Forest with trust-weighted sensor features."""

    def __init__(self, n_trees: int = 7, max_depth: int = 5):
        self.n_trees = n_trees
        self.max_depth = max_depth
        self.trees: list[DecisionTreeNode] = []
        self.feature_names = [
            "heart_rate",
            "spo2_pct",
            "core_temp_c",
            "resp_rate_bpm",
            "suit_pressure_kpa",
            "co2_mmhg",
            "rad_dose_rate_usv",
            "spo2_trust",
            "hr_trust",
            "temp_trust",
            "press_trust",
        ]
        self.is_trained = False
        self.accuracy = 0.0
        self.feature_importances: dict[str, float] = {}

    def _gini(self, y: list[str]) -> float:
        if not y:
            return 0.0
        n = len(y)
        counts = {}
        for c in y:
            counts[c] = counts.get(c, 0) + 1
        return 1.0 - sum((cnt / n) ** 2 for cnt in counts.values())

    def _build_tree(self, X: list[dict[str, float]], y: list[str], depth: int = 0) -> DecisionTreeNode:
        if not y:
            return DecisionTreeNode(prediction="NOMINAL", probabilities={"NOMINAL": 1.0})

        counts: dict[str, int] = {}
        for c in y:
            counts[c] = counts.get(c, 0) + 1
        total = len(y)
        probs = {c: round(cnt / total, 3) for c, cnt in counts.items()}
        majority = max(counts.items(), key=lambda item: item[1])[0]

        # Stop conditions
        if len(counts) == 1 or depth >= self.max_depth or total < 4:
            return DecisionTreeNode(prediction=majority, probabilities=probs)

        best_feat = None
        best_thresh = None
        best_gain = -1.0
        current_gini = self._gini(y)

        # Feature subsampling (random forest behavior)
        sub_features = random.sample(self.feature_names, k=min(6, len(self.feature_names)))

        for feat in sub_features:
            vals = sorted(set(x[feat] for x in X))
            if len(vals) < 2:
                continue
            # Sample candidate thresholds
            step = max(1, len(vals) // 8)
            candidates = [(vals[i] + vals[i + 1]) / 2.0 for i in range(0, len(vals) - 1, step)]
            for thresh in candidates:
                left_y = [y[i] for i, x in enumerate(X) if x[feat] <= thresh]
                right_y = [y[i] for i, x in enumerate(X) if x[feat] > thresh]
                if not left_y or not right_y:
                    continue
                gini_split = (len(left_y) / total) * self._gini(left_y) + (len(right_y) / total) * self._gini(right_y)
                gain = current_gini - gini_split
                if gain > best_gain:
                    best_gain = gain
                    best_feat = feat
                    best_thresh = thresh

        if best_gain <= 0.001 or best_feat is None:
            return DecisionTreeNode(prediction=majority, probabilities=probs)

        left_X = [x for x in X if x[best_feat] <= best_thresh]
        left_y = [y[i] for i, x in enumerate(X) if x[best_feat] <= best_thresh]
        right_X = [x for x in X if x[best_feat] > best_thresh]
        right_y = [y[i] for i, x in enumerate(X) if x[best_feat] > best_thresh]

        left_child = self._build_tree(left_X, left_y, depth + 1)
        right_child = self._build_tree(right_X, right_y, depth + 1)

        return DecisionTreeNode(
            feature=best_feat,
            threshold=best_thresh,
            left=left_child,
            right=right_child,
            probabilities=probs,
        )

    def train_from_csv(self, filepath: str = DATASET_PATH) -> dict[str, Any]:
        if not os.path.isfile(filepath):
            raise FileNotFoundError(f"Dataset not found at {filepath}")

        X: list[dict[str, float]] = []
        y: list[str] = []

        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                feat = {fn: float(row.get(fn, 0.0)) for fn in self.feature_names}
                X.append(feat)
                y.append(row["target_diagnosis"])

        if not X:
            raise ValueError("No data in dataset")

        # Train/test split (80/20)
        n = len(X)
        indices = list(range(n))
        random.seed(101)
        random.shuffle(indices)
        split = int(n * 0.8)
        train_idx, test_idx = indices[:split], indices[split:]

        X_train = [X[i] for i in train_idx]
        y_train = [y[i] for i in train_idx]
        X_test = [X[i] for i in test_idx]
        y_test = [y[i] for i in test_idx]

        # Train ensemble trees with bagging
        self.trees = []
        for t in range(self.n_trees):
            # Bootstrap sample
            boot_idx = [random.randint(0, len(X_train) - 1) for _ in range(len(X_train))]
            boot_X = [X_train[bi] for bi in boot_idx]
            boot_y = [y_train[bi] for bi in boot_idx]
            tree = self._build_tree(boot_X, boot_y)
            self.trees.append(tree)

        # Evaluate on test set
        correct = 0
        for x, yt in zip(X_test, y_test):
            pred, _ = self._predict_single(x)
            if pred == yt:
                correct += 1

        self.accuracy = round(correct / max(1, len(X_test)), 4)
        self.is_trained = True

        # Compute empirical feature importance
        importances: dict[str, float] = {fn: 0.0 for fn in self.feature_names}
        for tree in self.trees:
            self._accumulate_importance(tree, importances)
        tot_imp = sum(importances.values()) or 1.0
        self.feature_importances = {k: round(v / tot_imp, 3) for k, v in importances.items()}

        self.save()
        return {
            "trained": True,
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "accuracy": self.accuracy,
            "trees": len(self.trees),
            "feature_importances": self.feature_importances,
        }

    def _accumulate_importance(self, node: Optional[DecisionTreeNode], acc: dict[str, float]) -> None:
        if not node or not node.feature:
            return
        acc[node.feature] = acc.get(node.feature, 0.0) + 1.0
        self._accumulate_importance(node.left, acc)
        self._accumulate_importance(node.right, acc)

    def _predict_single(self, x: dict[str, float]) -> tuple[str, dict[str, float]]:
        agg_probs: dict[str, float] = {c: 0.0 for c in DIAGNOSIS_CLASSES}
        for tree in self.trees:
            tp = tree.predict(x)
            for c, p in tp.items():
                agg_probs[c] = agg_probs.get(c, 0.0) + p / len(self.trees)

        # Normalize
        tot = sum(agg_probs.values()) or 1.0
        norm_probs = {c: round(v / tot, 3) for c, v in agg_probs.items()}
        best_cls = max(norm_probs.items(), key=lambda item: item[1])[0]
        return best_cls, norm_probs

    def predict_triage(
        self,
        features: Mapping[str, float],
        comm_loss: bool = False,
        lang: str = "en",
    ) -> dict[str, Any]:
        """Triage astronaut state given vitals, TDL trust scores, and comms status."""
        if not self.is_trained:
            # Attempt to load saved model or train
            if not self.load():
                self.train_from_csv()

        x = {fn: float(features.get(fn, 0.0)) for fn in self.feature_names}
        best_cls, probs = self._predict_single(x)
        confidence = probs.get(best_cls, 0.0)

        meta = CLINICAL_KNOWLEDGE.get(best_cls, CLINICAL_KNOWLEDGE["NOMINAL"])

        title = meta["title_ar"] if lang == "ar" else meta["title_en"]
        actions = meta["actions_ar"] if lang == "ar" else meta["actions_en"]

        return {
            "diagnosis": best_cls,
            "title": title,
            "confidence": confidence,
            "severity": meta["severity"],
            "probabilities": probs,
            "nasa_citation": meta["citation"],
            "actions": actions,
            "comm_blackout_active": comm_loss,
            "tdl_sensor_trust": {
                "spo2": x["spo2_trust"],
                "heart_rate": x["hr_trust"],
                "core_temp": x["temp_trust"],
                "suit_pressure": x["press_trust"],
            },
        }

    def save(self, filepath: str = MODEL_SAVE_PATH) -> None:
        data = {
            "accuracy": self.accuracy,
            "feature_names": self.feature_names,
            "feature_importances": self.feature_importances,
            "trees": [t.to_dict() for t in self.trees],
        }
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self, filepath: str = MODEL_SAVE_PATH) -> bool:
        if not os.path.isfile(filepath):
            return False
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.accuracy = data.get("accuracy", 0.0)
            self.feature_names = data.get("feature_names", self.feature_names)
            self.feature_importances = data.get("feature_importances", {})
            self.trees = [DecisionTreeNode.from_dict(td) for td in data.get("trees", [])]
            self.is_trained = len(self.trees) > 0
            return self.is_trained
        except Exception:
            return False


# Global singleton
_model_instance = MedicalRandomForest()


def get_medical_ml_engine() -> MedicalRandomForest:
    global _model_instance
    if not _model_instance.is_trained:
        if not _model_instance.load():
            try:
                _model_instance.train_from_csv()
            except Exception:
                pass
    return _model_instance
