# ml/evaluate.py
# ---------------------------------------------------------------------------
# Evaluation on the held-out, out-of-time TEST period.
#
# Why these metrics:
#   * Accuracy is reported but NOT trusted: with ~18 % no-shows a model that
#     always says "will attend" is ~82 % accurate and completely useless.
#   * ROC-AUC  - ranking quality independent of the threshold
#                (0.5 = coin flip, 1.0 = perfect).
#   * PR-AUC   - like ROC-AUC but focused on the rare positive class; its
#                "no-skill" value equals the no-show rate.
#   * Precision / Recall / F1 / F2 at the chosen threshold - what staff
#     actually experience ("of the patients we called, how many would have
#     missed?" / "of all the no-shows, how many did we catch?").
#   * Brier score - calibration of the probabilities (lower is better).
#   * Confusion matrix - the raw TN / FP / FN / TP counts.
#   * Lift in the top-20 % riskiest appointments - "if we only have time to
#     call 1 in 5 patients, how many more no-shows do we reach than random?"
#   * Permutation importance - model-agnostic: how much ROC-AUC drops when
#     one feature's values are shuffled.
# ---------------------------------------------------------------------------
import numpy as np
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, confusion_matrix,
                             f1_score, fbeta_score, precision_score, recall_score, roc_auc_score, roc_curve)

from features import ALL_FEATURES, CATEGORICAL_FEATURES, FEATURE_LABELS


def evaluate(pipe, test_df, threshold):
    X, y = test_df[ALL_FEATURES], test_df["label"].values
    proba = pipe.predict_proba(X)[:, 1]
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    try:
        auc = float(roc_auc_score(y, proba))
        fpr, tpr, _ = roc_curve(y, proba)
        idx = np.linspace(0, len(fpr) - 1, num=min(40, len(fpr))).astype(int)
        curve = [{"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)} for i in idx]
    except ValueError:
        auc, curve = 0.5, []
    k = max(1, int(round(len(y) * 0.2)))
    top = np.argsort(-proba)[:k]
    base_rate = float(y.mean()) if len(y) else 0.0
    lift = float(y[top].mean() / base_rate) if base_rate > 0 else 0.0
    return {
        "n_test": int(len(y)),
        "test_no_show_rate": round(base_rate, 4),
        "threshold": round(float(threshold), 2),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
        "f2": round(float(fbeta_score(y, pred, beta=2, zero_division=0)), 4),
        "roc_auc": round(auc, 4),
        "pr_auc": round(float(average_precision_score(y, proba)), 4),
        "brier": round(float(brier_score_loss(y, proba)), 4),
        "lift_top20": round(lift, 2),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "roc_curve": curve,
    }


def feature_importance(pipe, test_df, n_repeats=10, random_state=42):
    X, y = test_df[ALL_FEATURES], test_df["label"].values
    r = permutation_importance(pipe, X, y, scoring="roc_auc", n_repeats=n_repeats, random_state=random_state)
    out = [{"feature": f, "label": FEATURE_LABELS.get(f, f), "importance": round(float(m), 4),
            "std": round(float(s), 4)} for f, m, s in zip(ALL_FEATURES, r.importances_mean, r.importances_std)]
    return sorted(out, key=lambda x: -x["importance"])


def explain_rows(pipe, df, reference, top_k=2):
    """Per-appointment explanation by occlusion: replace one feature at a
    time with its typical training value (median / most common) and see how
    much the predicted risk DROPS. The features with the biggest drop are
    the main reasons this particular appointment looks risky."""
    X = df[ALL_FEATURES].copy()
    base = pipe.predict_proba(X)[:, 1]
    deltas = {}
    for f in ALL_FEATURES:
        Xf = X.copy()
        Xf[f] = reference[f]
        deltas[f] = base - pipe.predict_proba(Xf)[:, 1]
    reasons = []
    for i in range(len(X)):
        ranked = sorted(ALL_FEATURES, key=lambda f: -deltas[f][i])
        parts = [FEATURE_LABELS[f] + f" (+{deltas[f][i] * 100:.0f} pts)" for f in ranked[:top_k] if deltas[f][i] > 0.01]
        reasons.append("; ".join(parts)[:200] if parts else "No strong risk factor")
    return base, reasons


def reference_values(train_df):
    ref = {}
    for f in ALL_FEATURES:
        s = train_df[f]
        ref[f] = str(s.mode().iloc[0]) if f in CATEGORICAL_FEATURES else float(s.median())
    return ref
