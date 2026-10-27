# app/routers/ml_insights.py
# AI/ML integration (Front end -> API -> Oracle -> model -> Oracle -> UI)
#
#   GET  /ml-insights/predictions          upcoming appointments + risk (vw_upcoming_noshow_risk)
#   GET  /ml-insights/model-summary        active model metrics from ML_MODEL_RUN (DB) + report
#   GET  /ml-insights/runs                 model registry history
#   POST /ml-insights/score/{appt_id}      LIVE prediction for one appointment (features computed
#                                          in Oracle by the same SQL used for training)
#   POST /ml-insights/rescore              re-score all upcoming appointments  (ADMIN / RECEPTIONIST)
#   POST /ml-insights/retrain              full retrain + evaluation + registration (ADMIN)
#
# Reads use the READ-ONLY connection; writes (rescore / retrain) use admin1,
# whose ADMIN_ROLE may write ML_MODEL_RUN / ML_PREDICTION.

import json
import os
import sys
import threading

from fastapi import APIRouter, Depends, HTTPException

from app.auth.jwt import AppUser, require_roles
from app.db.helpers import query
from app.db.session import get_admin_connection, get_readonly_connection

router = APIRouter()

_ML_DIR = next((p for p in [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ml")),
    os.path.abspath(os.path.join(os.getcwd(), "..", "ml")),
    os.path.abspath(os.path.join(os.getcwd(), "ml")),
] if os.path.isdir(p)), None)
if _ML_DIR and _ML_DIR not in sys.path:
    sys.path.insert(0, _ML_DIR)

_MODEL_PATH = os.path.join(_ML_DIR, "no_show_model.joblib") if _ML_DIR else None
_cache = {"mtime": None, "bundle": None}
_train_lock = threading.Lock()


def _bundle():
    if not _MODEL_PATH or not os.path.exists(_MODEL_PATH):
        raise HTTPException(404, "No trained model found. Run ml/run_pipeline.py (or 4_run_ml.ps1) first.")
    mtime = os.path.getmtime(_MODEL_PATH)
    if _cache["mtime"] != mtime:
        import joblib
        b = joblib.load(_MODEL_PATH)
        if "pipeline" not in b:
            raise HTTPException(409, "Saved model is from the old v1 pipeline - retrain with ml/run_pipeline.py.")
        _cache.update(mtime=mtime, bundle=b)
    return _cache["bundle"]


@router.get("/ml-insights/predictions")
def upcoming_predictions(risk_band: str = None, conn=Depends(get_readonly_connection)):
    sql = """SELECT appointment_id, TO_CHAR(appt_date, 'YYYY-MM-DD') AS appt_date, appt_time,
                    patient_id, patient_name AS patient, phone, doctor_name, department_name,
                    prediction, ROUND(probability, 4) AS probability, risk_band, risk_factors,
                    model_name, model_version
               FROM vw_upcoming_noshow_risk
              WHERE (:band IS NULL OR risk_band = :band)
              ORDER BY probability DESC"""
    res = query(conn, sql, {"band": risk_band.upper() if risk_band else None})
    res["disclaimer"] = "Decision-support estimate only - not a medical judgement."
    return res


@router.get("/ml-insights/model-summary")
def model_summary(conn=Depends(get_readonly_connection)):
    """The ACTIVE model, read from the model registry table in Oracle."""
    res = query(conn, """SELECT run_id, model_name, model_version, TO_CHAR(trained_at, 'YYYY-MM-DD HH24:MI') AS trained_at,
                                train_rows, test_rows, TO_CHAR(train_from, 'YYYY-MM-DD') AS train_from,
                                TO_CHAR(train_to, 'YYYY-MM-DD') AS train_to, TO_CHAR(test_from, 'YYYY-MM-DD') AS test_from,
                                TO_CHAR(test_to, 'YYYY-MM-DD') AS test_to, threshold, roc_auc, pr_auc, accuracy,
                                precision_score, recall_score, f1_score, brier_score, metrics_json
                           FROM ml_model_run WHERE is_active = 'Y'""")
    if not res["results"]:
        return {"available": False, "sql_executed": res["sql_executed"],
                "message": "No active model registered in ML_MODEL_RUN. Run 4_run_ml.ps1 "
                           "(python ml/run_pipeline.py) - or press 'Retrain' as admin1."}
    row = res["results"][0]
    raw = row.pop("metrics_json") or "{}"
    # newer oracledb versions return an "IS JSON" column already parsed as a dict
    if hasattr(raw, "read"):
        raw = raw.read()
    report = raw if isinstance(raw, (dict, list)) else json.loads(raw)
    return {"available": True, "run": row, "report": report, "sql_executed": res["sql_executed"],
            "features": (_cache["bundle"] or {}).get("features") if _cache["bundle"] else None}


@router.get("/ml-insights/runs")
def runs(conn=Depends(get_readonly_connection)):
    return query(conn, """SELECT run_id, model_name, model_version, TO_CHAR(trained_at, 'YYYY-MM-DD HH24:MI') AS trained_at,
                                 train_rows, test_rows, threshold, roc_auc, pr_auc, precision_score, recall_score,
                                 f1_score, is_active,
                                 (SELECT COUNT(*) FROM ml_prediction p WHERE p.run_id = r.run_id) AS predictions
                            FROM ml_model_run r ORDER BY run_id DESC""")


@router.post("/ml-insights/score/{appointment_id}")
def score_one(appointment_id: int, conn=Depends(get_readonly_connection)):
    """Live inference: Oracle computes the features for this appointment,
    the saved sklearn Pipeline (pre-processing + model) scores it, and the
    occlusion explainer says which features drive the risk. Nothing is
    written - use /rescore to store predictions."""
    from features import FEATURE_LABELS, SINGLE_WHERE, fetch
    from predict_and_store import score_frame
    b = _bundle()
    df = fetch(conn, SINGLE_WHERE, appt_id=appointment_id)
    if df.empty:
        raise HTTPException(404, f"Appointment {appointment_id} not found")
    proba, labels, reasons = score_frame(b, df)
    row = df.iloc[0]
    feats = {FEATURE_LABELS.get(f, f): (row[f].item() if hasattr(row[f], "item") else row[f]) for f in b["features"]}
    return {
        "appointment_id": appointment_id, "status": row["status"],
        "probability": round(float(proba[0]), 4), "prediction": labels[0], "threshold": b["threshold"],
        "risk_factors": reasons[0], "features": feats, "model_name": b["model_name"],
        "model_version": b.get("model_version"),
        "sql_executed": "-- features computed in Oracle (ml/features.py FEATURE_SQL)\n" +
                        b["feature_sql"].split(" WHERE a.status")[0].strip() + f"\n WHERE a.appointment_id = {appointment_id}",
        "note": "Only meaningful for SCHEDULED appointments; for past visits the true outcome is already known."
                if row["status"] != "SCHEDULED" else None,
    }


@router.post("/ml-insights/rescore")
def rescore(conn=Depends(get_admin_connection), user: AppUser = Depends(require_roles("ADMIN", "RECEPTIONIST"))):
    from predict_and_store import predict_and_store
    from run_pipeline import ensure_registered
    b = ensure_registered(conn, _bundle())
    n = predict_and_store(conn, b)
    _cache["mtime"] = None
    return {"scored": n, "run_id": b["run_id"], "sql_executed": "MERGE INTO ml_prediction ... (executemany, see ml/predict_and_store.py)"}


@router.post("/ml-insights/retrain")
def retrain(conn=Depends(get_admin_connection), user: AppUser = Depends(require_roles("ADMIN"))):
    """Extract -> CV-compare 4 models -> evaluate on the most recent 20 % ->
    register in ML_MODEL_RUN (atomic switch of the active model) -> save ->
    MERGE predictions. Takes ~10-30 s."""
    if not _train_lock.acquire(blocking=False):
        raise HTTPException(409, "A retraining run is already in progress.")
    try:
        from predict_and_store import predict_and_store
        from run_pipeline import train_and_register
        b = train_and_register(conn, verbose=False)
        n = predict_and_store(conn, b)
        _cache["mtime"] = None
        return {"run_id": b["run_id"], "model_name": b["model_name"], "model_version": b["model_version"],
                "metrics": {k: v for k, v in b["metrics"].items() if k != "roc_curve"},
                "comparison": b["comparison"], "scored": n}
    finally:
        _train_lock.release()