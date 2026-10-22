# ml/run_pipeline.py
# ---------------------------------------------------------------------------
# End-to-end ML pipeline:  Oracle -> features -> train/compare -> evaluate
#                          -> register run in ML_MODEL_RUN -> save model
#                          -> score upcoming appointments -> ML_PREDICTION
#
# Usage (from the ml/ folder, after the database is installed):
#   python run_pipeline.py                  # retrain + evaluate + register + score
#   python run_pipeline.py --predict-only   # reuse saved model, just re-score
#   python run_pipeline.py --report         # print the saved model's report
#
# Connection: env vars ORACLE_DSN (default localhost:1521/XEPDB1) and
# ADMIN1_PWD (default admin1). admin1 has ADMIN_ROLE, which (after the
# fixed 12_security_roles.sql) can read every table, EXECUTE the PL/SQL
# functions and write ML_MODEL_RUN / ML_PREDICTION.
#
# The old "--demo" mode was removed on purpose: it trained on random
# numbers generated in Python and then OVERWROTE no_show_model.joblib, so
# the "AI" page could end up showing a model that never saw a single row
# of hospital data.
# ---------------------------------------------------------------------------
import argparse
import datetime as dt
import json
import os
import sys

import joblib

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from evaluate import evaluate, feature_importance, reference_values  # noqa: E402
from extract import extract_training_data  # noqa: E402
from features import ALL_FEATURES, FEATURE_LABELS, FEATURE_SQL, TRAIN_WHERE  # noqa: E402
from predict_and_store import predict_and_store  # noqa: E402
from train import cross_validate_candidates, fit_final, select_model, temporal_split  # noqa: E402

MODEL_PATH = os.path.join(HERE, "no_show_model.joblib")
MIN_ROWS = 200


def connect(dsn=None, user="admin1", pwd=None):
    import oracledb
    dsn = dsn or os.environ.get("ORACLE_DSN", "localhost:1521/XEPDB1")
    pwd = pwd or os.environ.get("ADMIN1_PWD", "admin1")
    try:
        conn = oracledb.connect(user=user, password=pwd, dsn=dsn)
    except oracledb.Error as e:
        sys.exit(f"[Error] Cannot connect to Oracle at {dsn} as {user}: {e}\n"
                 "Is the database running and installed (1_install_database.ps1)?")
    conn.current_schema = "HCMS_ADMIN"
    return conn


def train_bundle(df, verbose=True):
    """Pure-Python part (no DB writes) - returns a model bundle dict."""
    if len(df) < MIN_ROWS or df["label"].nunique() < 2:
        raise SystemExit(f"Not enough labelled data ({len(df)} rows). Install 04_sample_data.sql first.")
    train_df, test_df = temporal_split(df)
    if verbose:
        print(f"  {len(df)} labelled appointments | no-show rate {df['label'].mean():.1%}")
        print(f"  train: {len(train_df)} rows ({train_df['appt_date'].min():%Y-%m-%d} .. {train_df['appt_date'].max():%Y-%m-%d})"
              f" | test (out-of-time): {len(test_df)} rows ({test_df['appt_date'].min():%Y-%m-%d} .. "
              f"{test_df['appt_date'].max():%Y-%m-%d})")
        print("Cross-validating candidate models on the training period ...")
    cv = cross_validate_candidates(train_df, verbose=verbose)
    best = select_model(cv)
    if verbose:
        print(f"Selected: {best}")
    comparison = {}
    pipes = {}
    for name, res in cv.items():
        pipe = fit_final(name, train_df)
        pipes[name] = pipe
        m = evaluate(pipe, test_df, res["threshold"])
        comparison[name] = {"cv_roc_auc": round(res["cv_roc_auc"], 4), "cv_pr_auc": round(res["cv_pr_auc"], 4),
                            **{k: m[k] for k in ("threshold", "roc_auc", "pr_auc", "precision", "recall", "f1",
                                                 "accuracy", "brier", "lift_top20")}}
        if verbose:
            print(f"  TEST {name:20s} ROC-AUC={m['roc_auc']:.3f} PR-AUC={m['pr_auc']:.3f} "
                  f"P={m['precision']:.2f} R={m['recall']:.2f} F1={m['f1']:.2f} Brier={m['brier']:.3f} "
                  f"lift@20%={m['lift_top20']:.2f}{'   <-- selected' if name == best else ''}")
    pipe = pipes[best]
    metrics = evaluate(pipe, test_df, cv[best]["threshold"])
    importance = feature_importance(pipe, test_df)
    return {
        "pipeline": pipe,
        "model_name": best,
        "threshold": cv[best]["threshold"],
        "features": ALL_FEATURES,
        "feature_labels": FEATURE_LABELS,
        "feature_sql": FEATURE_SQL + TRAIN_WHERE,
        "metrics": metrics,
        "comparison": comparison,
        "importance": importance,
        "reference": reference_values(train_df),
        "n_rows": int(len(df)),
        "n_train": int(len(train_df)),
        "n_test": int(len(test_df)),
        "no_show_rate": round(float(df["label"].mean()), 4),
        "train_range": [str(train_df["appt_date"].min())[:10], str(train_df["appt_date"].max())[:10]],
        "test_range": [str(test_df["appt_date"].min())[:10], str(test_df["appt_date"].max())[:10]],
        "trained_at": dt.datetime.now().isoformat(timespec="seconds"),
        "sklearn_version": __import__("sklearn").__version__,
    }


def register_run(conn, bundle):
    """Writes the run into ML_MODEL_RUN inside ONE transaction: the previous
    active model is de-activated and the new one activated atomically (the
    unique function-based index uq_one_active_model guarantees there can
    never be two active models)."""
    m = bundle["metrics"]
    version = dt.datetime.now().strftime("%y%m%d%H%M")
    payload = {k: bundle[k] for k in ("comparison", "importance", "n_rows", "n_train", "n_test", "no_show_rate",
                                      "train_range", "test_range", "sklearn_version")}
    payload["metrics"] = m
    cur = conn.cursor()
    run_id = cur.var(int)
    import oracledb
    cur.setinputsizes(js=oracledb.DB_TYPE_CLOB)   # JSON report can exceed 4000 bytes
    try:
        cur.execute("UPDATE ml_model_run SET is_active = 'N' WHERE is_active = 'Y'")
        cur.execute("""
            INSERT INTO ml_model_run (model_name, model_version, train_rows, test_rows,
                   train_from, train_to, test_from, test_to, threshold, roc_auc, pr_auc,
                   accuracy, precision_score, recall_score, f1_score, brier_score, is_active, metrics_json)
            VALUES (:mname, :ver, :ntr, :nte, TO_DATE(:trf,'YYYY-MM-DD'), TO_DATE(:trt,'YYYY-MM-DD'),
                    TO_DATE(:tef,'YYYY-MM-DD'), TO_DATE(:tet,'YYYY-MM-DD'), :thr, :auc, :ap,
                    :acc, :pre, :rec, :f1, :brier, 'Y', :js)
            RETURNING run_id INTO :rid""",
            mname=bundle["model_name"], ver=version, ntr=bundle["n_train"], nte=bundle["n_test"],
            trf=bundle["train_range"][0], trt=bundle["train_range"][1],
            tef=bundle["test_range"][0], tet=bundle["test_range"][1],
            thr=bundle["threshold"], auc=m["roc_auc"], ap=m["pr_auc"], acc=m["accuracy"], pre=m["precision"],
            rec=m["recall"], f1=m["f1"], brier=m["brier"], js=json.dumps(payload), rid=run_id)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    v = run_id.getvalue()
    bundle["run_id"] = int(v[0] if isinstance(v, list) else v)
    bundle["model_version"] = version
    return bundle


def ensure_registered(conn, bundle):
    """--predict-only after a fresh database install: the saved model's run_id
    does not exist in ML_MODEL_RUN yet, so register it (same metrics) first."""
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM ml_model_run WHERE run_id = :r AND model_version = :v",
                r=bundle.get("run_id") or -1, v=bundle.get("model_version") or "-")
    if cur.fetchone()[0] == 0:
        print("  Saved model is not registered in this database yet - registering it in ML_MODEL_RUN ...")
        register_run(conn, bundle)
        save_bundle(bundle)
    return bundle


def save_bundle(bundle, path=MODEL_PATH):
    joblib.dump(bundle, path)
    print(f"Saved model bundle -> {path}")


def load_bundle(path=MODEL_PATH):
    if not os.path.exists(path):
        sys.exit(f"No saved model at {path} - run without --predict-only first.")
    b = joblib.load(path)
    if "pipeline" not in b:
        sys.exit("The saved model is from the old (v1) pipeline - retrain: python run_pipeline.py")
    return b


def train_and_register(conn, verbose=True):
    """Used by the CLI and by the backend's 'Retrain' button."""
    df = extract_training_data(conn)
    bundle = train_bundle(df, verbose=verbose)
    bundle = register_run(conn, bundle)
    save_bundle(bundle)
    return bundle


def print_report(b):
    m = b["metrics"]
    print(f"Model: {b['model_name']}  version {b.get('model_version')}  run_id {b.get('run_id')}")
    print(f"Rows: {b['n_rows']} (train {b['n_train']}, test {b['n_test']}), no-show rate {b['no_show_rate']:.1%}")
    print(f"Threshold {m['threshold']}: ROC-AUC {m['roc_auc']} PR-AUC {m['pr_auc']} precision {m['precision']} "
          f"recall {m['recall']} F1 {m['f1']} accuracy {m['accuracy']} Brier {m['brier']} lift@20% {m['lift_top20']}")
    print(f"Confusion matrix [[TN, FP], [FN, TP]] = {m['confusion_matrix']}")
    print("Top features:", ", ".join(f"{x['label']} ({x['importance']:.3f})" for x in b["importance"][:6]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="MediCore HCMS no-show prediction pipeline")
    ap.add_argument("--predict-only", action="store_true", help="Skip training; re-score with the saved model.")
    ap.add_argument("--report", action="store_true", help="Print the saved model's evaluation report and exit.")
    ap.add_argument("--dsn", default=None)
    ap.add_argument("--user", default="admin1")
    ap.add_argument("--password", default=None)
    args = ap.parse_args()

    if args.report:
        print_report(load_bundle())
        sys.exit(0)

    conn = connect(args.dsn, args.user, args.password)
    try:
        if args.predict_only:
            bundle = ensure_registered(conn, load_bundle())
        else:
            print("Extracting labelled appointments from Oracle ...")
            bundle = train_and_register(conn)
            print_report(bundle)
        print("Scoring upcoming SCHEDULED appointments ...")
        predict_and_store(conn, bundle)
        print("ML pipeline finished.")
    finally:
        conn.close()
