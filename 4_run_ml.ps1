# Step 4 - train / evaluate / register the no-show model and score upcoming appointments
# (run after the DB is installed; re-run any time - e.g. after 5_reseed_data.ps1)
#   .\4_run_ml.ps1                  -> full retrain (compare 4 models, pick best, store in ML_MODEL_RUN)
#   .\4_run_ml.ps1 --predict-only   -> reuse ml\no_show_model.joblib, only re-score upcoming visits
#   .\4_run_ml.ps1 --report         -> print the saved model's evaluation report
$env:ORACLE_DSN = "localhost:1521/XEPDB1"
$env:ADMIN1_PWD = "admin1"

$venvPython = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

& $python -m pip install -q -r (Join-Path $PSScriptRoot "ml\requirements.txt")
Set-Location (Join-Path $PSScriptRoot "ml")
& $python run_pipeline.py $args
Set-Location $PSScriptRoot
