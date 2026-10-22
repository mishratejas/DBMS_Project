# ml/train.py
# ---------------------------------------------------------------------------
# Pre-processing + model training for the appointment NO-SHOW classifier.
#
# Design decisions (each one is a likely viva question):
#
# 1. Out-of-time test split, not a random split.
#    Rows are ordered by appt_date; the most recent 20 % become the test
#    set. The model is always evaluated on appointments that happened AFTER
#    everything it was trained on - exactly how it is used in production
#    (score next week's appointments using last year's history). A random
#    split would leak "future" behaviour into training and inflate scores.
#
# 2. Pre-processing lives INSIDE an sklearn Pipeline (ColumnTransformer):
#      numeric      -> median imputation + StandardScaler
#      binary flags -> passed through (already 0/1)
#      categorical  -> one-hot encoding (department, weekday, gender)
#    department_id used to be fed in as a NUMBER (1..8), which wrongly told
#    the model that "Pediatrics (4) > Cardiology (2)". One-hot fixes that.
#    Because the scaler/encoder are fitted inside the pipeline, they are
#    fitted on the training folds only (no leakage), and the saved .joblib
#    contains the full transform + model in one object.
#
# 3. Candidate models: a Dummy baseline (always predicts the base rate -
#    anything that cannot beat it is useless), Logistic Regression
#    (interpretable, linear), Random Forest and Histogram Gradient Boosting
#    (non-linear, interactions, e.g. "long lead time AND no insurance").
#
# 4. Model selection by 5-fold stratified cross-validated ROC-AUC on the
#    training period (PR-AUC as tie-breaker). The old code picked the model
#    with the highest RECALL, which rewards a useless model that predicts
#    NO_SHOW for everyone (recall = 1.0).
#
# 5. Class imbalance (~17 % no-shows) is handled by THRESHOLD MOVING, not
#    by class re-weighting: models are trained on the natural distribution
#    (so predicted probabilities stay calibrated and can be shown to staff
#    as "37 % risk"), then the decision threshold is chosen on
#    out-of-fold TRAINING predictions to maximise F1 for the NO_SHOW class.
#    The default 0.5 threshold would flag almost nobody, because a 17 %
#    event rarely gets a probability above 0.5. (Use beta=2 in
#    best_threshold() if the clinic prefers catching more no-shows at the
#    cost of more reminder calls.)
# ---------------------------------------------------------------------------
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import average_precision_score, fbeta_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from features import ALL_FEATURES, BINARY_FEATURES, CATEGORICAL_FEATURES, NUMERIC_FEATURES

RANDOM_STATE = 42


def make_preprocessor():
    try:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    except TypeError:  # scikit-learn < 1.2
        ohe = OneHotEncoder(handle_unknown="ignore", sparse=False)
    return ColumnTransformer([
        ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), NUMERIC_FEATURES),
        ("bin", "passthrough", BINARY_FEATURES),
        ("cat", ohe, CATEGORICAL_FEATURES),
    ])


def candidate_models():
    return {
        "baseline_dummy": DummyClassifier(strategy="prior"),
        "logistic_regression": LogisticRegression(C=0.5, max_iter=2000),
        "random_forest": RandomForestClassifier(n_estimators=400, min_samples_leaf=8, max_features="sqrt",
                                                n_jobs=-1, random_state=RANDOM_STATE),
        "gradient_boosting": HistGradientBoostingClassifier(learning_rate=0.05, max_depth=3, max_iter=250,
                                                            l2_regularization=1.0, random_state=RANDOM_STATE),
    }


def make_pipeline(model):
    return Pipeline([("prep", make_preprocessor()), ("model", model)])


def temporal_split(df: pd.DataFrame, test_fraction=0.2):
    """Oldest 80 % -> train, most recent 20 % -> test (out-of-time)."""
    df = df.sort_values(["appt_date", "appointment_id"]).reset_index(drop=True)
    cut = int(len(df) * (1 - test_fraction))
    return df.iloc[:cut].copy(), df.iloc[cut:].copy()


def best_threshold(y_true, proba, beta=1.0):
    """Threshold that maximises F-beta on out-of-fold predictions."""
    grid = np.round(np.arange(0.05, 0.80, 0.01), 2)
    scores = [fbeta_score(y_true, (proba >= t).astype(int), beta=beta, zero_division=0) for t in grid]
    i = int(np.argmax(scores))
    return float(grid[i]), float(scores[i])


def cross_validate_candidates(train_df: pd.DataFrame, verbose=True):
    """5-fold stratified CV on the training period for every candidate."""
    X, y = train_df[ALL_FEATURES], train_df["label"].values
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    results = {}
    for name, model in candidate_models().items():
        pipe = make_pipeline(model)
        oof = cross_val_predict(pipe, X, y, cv=cv, method="predict_proba")[:, 1]
        auc = float(roc_auc_score(y, oof)) if len(np.unique(y)) > 1 else 0.5
        ap = float(average_precision_score(y, oof))
        thr, f2 = best_threshold(y, oof)
        results[name] = {"cv_roc_auc": auc, "cv_pr_auc": ap, "threshold": thr, "cv_f1": f2, "oof": oof}
        if verbose:
            print(f"  CV {name:20s} ROC-AUC={auc:.3f}  PR-AUC={ap:.3f}  best-F1 threshold={thr:.2f} (F1={f2:.3f})")
    return results


def select_model(cv_results):
    """Highest CV ROC-AUC, PR-AUC as tie-breaker. The dummy can never win
    unless every real model is worse than chance."""
    return max(cv_results, key=lambda n: (round(cv_results[n]["cv_roc_auc"], 3), cv_results[n]["cv_pr_auc"]))


def fit_final(name, train_df):
    pipe = make_pipeline(candidate_models()[name])
    pipe.fit(train_df[ALL_FEATURES], train_df["label"].values)
    return pipe
