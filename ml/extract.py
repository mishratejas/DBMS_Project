# ml/extract.py
# Pulls the labelled training set straight from Oracle. All feature
# engineering happens in SQL (see features.FEATURE_SQL) so the app, the
# batch job and the live-scoring API share one definition.
from features import TRAIN_WHERE, fetch


def extract_training_data(conn):
    """Only RESOLVED appointments (COMPLETED / NO_SHOW) carry a ground-truth
    label. CANCELLED rows are excluded: a cancellation is not a no-show."""
    return fetch(conn, TRAIN_WHERE)
