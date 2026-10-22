# ml/features.py
# ---------------------------------------------------------------------------
# ONE place that defines the model's features.
#
# Every feature is computed INSIDE ORACLE by a single SQL statement
# (joins + correlated sub-queries + an analytic KEEP(DENSE_RANK LAST)
# aggregate), so the database - not Python - is the source of truth for
# feature engineering. The same SQL is used for:
#   * training      (status IN ('COMPLETED','NO_SHOW')  -> labelled rows)
#   * batch scoring (status = 'SCHEDULED', appt_date >= today)
#   * live scoring  (one appointment_id, called from the FastAPI backend)
# so training/serving skew is impossible.
#
# Leakage guard: every "history" feature only looks at appointments with
# appt_date STRICTLY BEFORE the appointment being described, and only at
# RESOLVED ones (COMPLETED / NO_SHOW) - a future or still-scheduled visit
# can never leak into a feature.
# ---------------------------------------------------------------------------

FEATURE_SQL = """
SELECT a.appointment_id,
       a.patient_id,
       a.appt_date,
       a.status,
       dep.department_name,
       p.gender,
       TRUNC(MONTHS_BETWEEN(a.appt_date, p.dob) / 12)                    AS patient_age,
       CASE WHEN a.appt_type = 'NEW' THEN 1 ELSE 0 END                    AS appt_type_new,
       (a.appt_date - TRUNC(a.appt_date, 'IW'))                           AS appt_weekday,
       TO_NUMBER(SUBSTR(a.appt_time, 1, 2))                               AS appt_hour,
       GREATEST(a.appt_date - TRUNC(CAST(a.created_at AS DATE)), 0)       AS lead_time_days,
       (SELECT COUNT(*) FROM appointment h
         WHERE h.patient_id = a.patient_id AND h.appt_date < a.appt_date
           AND h.status IN ('COMPLETED','NO_SHOW'))                       AS prior_appt_count,
       (SELECT COUNT(*) FROM appointment h
         WHERE h.patient_id = a.patient_id AND h.appt_date < a.appt_date
           AND h.status = 'NO_SHOW')                                      AS prior_no_show_count,
       (SELECT COUNT(*) FROM appointment h
         WHERE h.patient_id = a.patient_id AND h.appt_date < a.appt_date
           AND h.status = 'CANCELLED')                                    AS prior_cancel_count,
       NVL((SELECT LEAST(a.appt_date - MAX(h.appt_date), 365) FROM appointment h
             WHERE h.patient_id = a.patient_id AND h.appt_date < a.appt_date
               AND h.status IN ('COMPLETED','NO_SHOW')), 365)             AS days_since_last_visit,
       NVL((SELECT MAX(CASE WHEN h.status = 'NO_SHOW' THEN 1 ELSE 0 END)
                   KEEP (DENSE_RANK LAST ORDER BY h.appt_date, h.appt_time)
              FROM appointment h
             WHERE h.patient_id = a.patient_id AND h.appt_date < a.appt_date
               AND h.status IN ('COMPLETED','NO_SHOW')), 0)               AS last_visit_no_show,
       CASE WHEN EXISTS (SELECT 1 FROM insurance_policy ip
                          WHERE ip.patient_id = a.patient_id) THEN 1 ELSE 0 END AS has_insurance,
       CASE WHEN p.city IS NULL OR UPPER(p.city) = 'PUNE' THEN 0 ELSE 1 END AS lives_outside_city
  FROM appointment a
  JOIN patient    p   ON p.patient_id     = a.patient_id
  JOIN doctor     d   ON d.doctor_id      = a.doctor_id
  JOIN department dep ON dep.department_id = d.department_id
"""

TRAIN_WHERE = " WHERE a.status IN ('COMPLETED','NO_SHOW') ORDER BY a.appt_date, a.appt_time"
UPCOMING_WHERE = " WHERE a.status = 'SCHEDULED' AND a.appt_date >= TRUNC(SYSDATE) ORDER BY a.appt_date, a.appt_time"
SINGLE_WHERE = " WHERE a.appointment_id = :appt_id"

NUMERIC_FEATURES = ["patient_age", "lead_time_days", "prior_appt_count", "prior_no_show_count",
                    "prior_no_show_rate", "prior_cancel_count", "days_since_last_visit", "appt_hour"]
BINARY_FEATURES = ["appt_type_new", "is_new_patient", "last_visit_no_show", "has_insurance",
                   "lives_outside_city"]
CATEGORICAL_FEATURES = ["department_name", "appt_weekday", "gender"]
ALL_FEATURES = NUMERIC_FEATURES + BINARY_FEATURES + CATEGORICAL_FEATURES

# Human-readable names (used by the UI and in the per-prediction explanation)
FEATURE_LABELS = {
    "patient_age": "Patient age", "lead_time_days": "Booking lead time (days)",
    "prior_appt_count": "Previous visits", "prior_no_show_count": "Previous no-shows",
    "prior_no_show_rate": "Past no-show rate", "prior_cancel_count": "Previous cancellations",
    "days_since_last_visit": "Days since last visit", "appt_hour": "Appointment hour",
    "appt_type_new": "New (first) consultation", "is_new_patient": "First-ever visit",
    "last_visit_no_show": "Missed the last visit", "has_insurance": "Has insurance",
    "lives_outside_city": "Lives outside Pune", "department_name": "Department",
    "appt_weekday": "Weekday", "gender": "Gender",
}


def rows_to_frame(cursor, rows):
    import pandas as pd
    cols = [c[0].lower() for c in cursor.description]
    return pd.DataFrame(rows, columns=cols)


def fetch(conn, where, **binds):
    """Run FEATURE_SQL + where-clause and return a pandas DataFrame."""
    cur = conn.cursor()
    cur.execute(FEATURE_SQL + where, **binds)
    return add_derived(rows_to_frame(cur, cur.fetchall()))


def add_derived(df):
    """Tiny, purely arithmetic derivations (kept out of SQL for readability)."""
    import numpy as np
    import pandas as pd
    df = df.copy()
    df.columns = [str(c).lower() for c in df.columns]
    for c in ["patient_age", "lead_time_days", "prior_appt_count", "prior_no_show_count", "prior_cancel_count",
              "days_since_last_visit", "appt_hour", "appt_type_new", "last_visit_no_show", "has_insurance",
              "lives_outside_city", "appt_weekday"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["prior_no_show_rate"] = np.where(df["prior_appt_count"] > 0,
                                        df["prior_no_show_count"] / df["prior_appt_count"].replace(0, 1), 0.0)
    df["is_new_patient"] = (df["prior_appt_count"] == 0).astype(int)
    df["appt_weekday"] = df["appt_weekday"].astype(int).astype(str)
    df["gender"] = df["gender"].fillna("U").astype(str)
    df["department_name"] = df["department_name"].fillna("Unknown").astype(str)
    if "status" in df.columns:
        df["label"] = (df["status"].astype(str).str.upper() == "NO_SHOW").astype(int)
    return df
