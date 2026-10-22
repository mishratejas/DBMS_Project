# ml/predict_and_store.py
# ---------------------------------------------------------------------------
# Scores upcoming SCHEDULED appointments and writes the result back INTO
# ORACLE (table ML_PREDICTION) with a single MERGE (upsert) statement run
# through executemany(). The web app only ever READS that table, so the
# front end stays fast and the ML write path stays an offline batch job.
#
# Each prediction also stores a short, human-readable "risk_factors" text
# (top reasons this appointment looks risky, see evaluate.explain_rows) so
# the reception desk knows WHY to call, not only WHOM to call.
# ---------------------------------------------------------------------------
from evaluate import explain_rows
from features import UPCOMING_WHERE, fetch

MERGE_SQL = """
MERGE INTO ml_prediction mp
USING (SELECT :appt_id AS appointment_id, :run_id AS run_id FROM dual) src
   ON (mp.appointment_id = src.appointment_id AND mp.run_id = src.run_id)
 WHEN MATCHED THEN
      UPDATE SET mp.prediction = :pred, mp.probability = :prob,
                 mp.risk_factors = :reasons, mp.prediction_date = SYSDATE
 WHEN NOT MATCHED THEN
      INSERT (appointment_id, run_id, prediction, probability, risk_factors)
      VALUES (:appt_id, :run_id, :pred, :prob, :reasons)
"""


def score_frame(bundle, df):
    """Returns (probabilities, labels, reasons) for a feature DataFrame."""
    pipe, thr = bundle["pipeline"], bundle["threshold"]
    proba, reasons = explain_rows(pipe, df, bundle["reference"])
    labels = ["NO_SHOW" if p >= thr else "ATTENDED" for p in proba]
    return proba, labels, reasons


def predict_and_store(conn, bundle):
    upcoming = fetch(conn, UPCOMING_WHERE)
    if upcoming.empty:
        print("  No upcoming SCHEDULED appointments to score.")
        return 0
    proba, labels, reasons = score_frame(bundle, upcoming)
    rows = [{"appt_id": int(a), "run_id": int(bundle["run_id"]), "pred": lab, "prob": round(float(p), 4),
             "reasons": r} for a, lab, p, r in zip(upcoming["appointment_id"], labels, proba, reasons)]
    cur = conn.cursor()
    cur.executemany(MERGE_SQL, rows)
    conn.commit()
    high = sum(1 for x in labels if x == "NO_SHOW")
    print(f"  Scored {len(rows)} upcoming appointments -> {high} flagged high-risk "
          f"(threshold {bundle['threshold']:.2f}); MERGEd into ML_PREDICTION (run_id={bundle['run_id']}).")
    return len(rows)


# Read-only query used by the "AI/ML Insights" page (backend/app/routers/ml_insights.py):
#
# SELECT p.first_name || ' ' || p.last_name AS patient, a.appt_date, a.appt_time,
#        mp.prediction, mp.probability, mp.risk_factors
#   FROM ml_prediction mp
#   JOIN ml_model_run  r ON r.run_id = mp.run_id AND r.is_active = 'Y'
#   JOIN appointment   a ON a.appointment_id = mp.appointment_id
#   JOIN patient       p ON p.patient_id = a.patient_id
#  WHERE a.appt_date >= TRUNC(SYSDATE) AND a.status = 'SCHEDULED'
#  ORDER BY mp.probability DESC;
