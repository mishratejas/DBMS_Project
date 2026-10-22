# 🏥 MediCore HCMS — Hospital & Clinical Management System

[![Oracle Database](https://img.shields.io/badge/Oracle%20XE-21c%20%7C%2023ai-F80000?style=for-the-badge&logo=oracle&logoColor=white)](https://www.oracle.com/database/technologies/appdev/xe.html)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-1.3%2B-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

An enterprise-grade, full-stack **Hospital & Clinical Management System (HCMS)** engineered on **Oracle XE**. Designed with **database-enforced least-privilege security (RBAC)**, robust **PL/SQL business rules, triggers, and procedures**, a **FastAPI multi-pool backend**, a **React 18 + Vite clinical dashboard**, and an **integrated Machine Learning pipeline** for outpatient no-show prediction.

> **v2 update** — realistic seed data (28,310 rows in all 28 tables), fixed RBAC grants, full CRUD screens,
> 15 SQL reports, live ACID / concurrency / RBAC demos, normalization fixes (DISEASE table, ML registry) and a
> rebuilt, properly evaluated ML pipeline. See **[CHANGES.md](CHANGES.md)** (what changed and how to run it) and
> **[docs/DBMS_Report.md](docs/DBMS_Report.md)** (ER model, keys, FDs, normalization, SQL coverage, ML results).

---

## 📑 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [Key Features](#-key-features)
- [Database Schema & Objects](#-database-schema--objects)
- [Database-Enforced RBAC & Security](#-database-enforced-rbac--security)
- [Machine Learning Subsystem](#-machine-learning-subsystem)
- [DBMS Concept Lab & Interactive Features](#-dbms-concept-lab--interactive-features)
- [Project Directory Structure](#-project-directory-structure)
- [Quick Start & Setup Guide](#-quick-start--setup-guide)
- [REST API Reference](#-rest-api-reference)
- [Project Team & Git Contribution Plan](#-project-team--git-contribution-plan)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🏛 Architectural Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       React 18 + Vite Clinical UI                           │
│        (Role-Aware Navigation, Live SQL Panel, DBMS Lab, ER Viewer)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST (JWT Bearer Token)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Web Application                            │
│  - JWT Authentication & RBAC Role Resolution                                │
│  - One Dedicated Oracle Connection Pool Per Role (Least Privilege)          │
│  - Parameterized DQL/DML (Strict Bind Variables, SQL Injection Immune)      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ python-oracledb (Thin Mode)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Oracle XE Relational Database (XEPDB1)                   │
│  Schema Owner: HCMS_ADMIN                                                   │
│  - 28 Normalized Relational Tables (3NF/BCNF), 28,310 seed rows             │
│  - 14 Views, 25 explicit Indexes (FK, function-based), 26 Sequences         │
│  - 14 Triggers, 17 Procedures, 7 Functions, 1 Package                       │
│  - 8 Role-Specific Database Accounts (doctor1, receptionist1, etc.)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▲ Batch Pipeline Read/Write
                                       │
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Scikit-Learn ML Subsystem                              │
│  - Extracts resolved appointment history directly from Oracle               │
│  - Features computed in SQL; Dummy vs LogReg vs RF vs Gradient Boosting     │
│  - 5-fold CV + out-of-time test; run registered in `ML_MODEL_RUN`           │
│  - Scores upcoming appointments via SQL MERGE into `ML_PREDICTION`          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

1. **True Database-Enforced RBAC**:
   Security is not simulated solely in application code. Every API request acquires an Oracle connection authenticated as that role's actual database user. If a receptionist tries to query diagnosis records, Oracle itself raises `ORA-00942: table or view does not exist`.
2. **PL/SQL Encapsulated Workflows**:
   Critical clinical workflows (appointment booking, patient admission, triage queuing, prescription fulfillment, billing generation) execute inside stored procedures and packages ensuring transactional ACID integrity (`pkg_clinical_ops`).
3. **Audit Trail & Mutating Table Safe Triggers**:
   State transitions (bed availability, bill status updates, double-booking prevention, clinical note audit logging) are governed by triggers with proper constraint scoping to prevent mutating table errors (`ORA-04091`).
4. **Live SQL Transparency Panel**:
   Every clinical screen echoes the exact, bound SQL query executed against Oracle for complete academic and clinical auditing transparency.
5. **Interactive DBMS Concept Lab**:
   An embedded query sandbox executing safe read-only queries with live explain plans, demonstrating relational algebra, joins, aggregate queries, window functions, and analytics.
6. **Integrated Predictive AI Insights**:
   An offline/batch machine learning pipeline that extracts ground-truth appointment data from Oracle XE, evaluates candidate models, and writes calibrated no-show risk estimates into `ML_PREDICTION` for clinical staff decision support.

---

## 🗄 Database Schema & Objects

The relational core comprises **28 normalized tables** in the `HCMS_ADMIN` schema, **14 views**, **26 sequences**, **14 triggers** (incl. one compound trigger), **17 stored procedures**, **7 functions**, and **1 clinical package**. Keys, functional dependencies and the normal form of every table are in [docs/DBMS_Report.md](docs/DBMS_Report.md) and on the *Keys & normalization* page.

### 1. Functional Table Breakdown

| Domain | Tables | Description |
| :--- | :--- | :--- |
| **Administration** | `department`, `doctor`, `nurse`, `staff_schedule`, `room_bed` | Hospital departments, physician registries, nursing rosters, and bed occupancy tracking. |
| **Patient Care** | `patient`, `appointment`, `admission`, `service_queue` | Master patient demographics, scheduling, in-patient admissions, and FIFO/emergency service queues. |
| **Clinical** | `symptom`, `disease`, `diagnosis`, `diagnosis_symptom`, `vital_sign`, `clinical_note` | Clinical encounters, ICD-10 diagnosis codes, timestamped vitals, and physician notes. |
| **Diagnostics & Rx** | `lab_test_catalog`, `lab_order`, `medicine`, `prescription`, `prescription_item` | Laboratory order lifecycles, test catalog prices, medicine inventory, and itemized prescriptions. |
| **Billing & Finance** | `insurance_policy`, `bill`, `bill_item`, `payment` | Itemized invoicing, automatic copay calculations, and multi-mode payment tracking. |
| **System & AI** | `app_user`, `audit_log`, `ml_model_run`, `ml_prediction` | Application account mapping, clinical change audit trail, and ML prediction scores. |

### 2. Analytical & Reporting Views

- **`vw_patient_medical_summary`**: Multi-table join aggregating patient vitals, active diagnoses, and primary care physicians without exposing billing data.
- **`vw_doctor_appointment_schedule`**: Key-preserved join between appointments, doctors, and patients for real-time daily consultation rosters.
- **`vw_patient_billing_summary`**: Aggregates total charges, amounts paid, and outstanding balances.
- **`vw_pending_lab_reports`**: Filtered view for lab technicians displaying `ORDERED` and `SAMPLE_COLLECTED` tests.
- **`vw_current_admitted_patients`**: Updatable view tracking admitted inpatients, assigned rooms, and admitting physicians.
- **`vw_medicine_inventory_status`**: Identifies medicines falling below minimum `reorder_level`.
- **`vw_emergency_queue`**: Real-time prioritized queue entries for triage and emergency interventions.
- **`vw_doctor_workload`**: Aggregates doctor workload analytics (total, completed, cancelled, and no-show appointments).

### 3. PL/SQL Procedures, Functions & Triggers

- **`pkg_clinical_ops`**: Comprehensive package handling end-to-end patient admission, bed assignment, and coordinated discharge with automatic bed release.
- **`book_appointment`**: Concurrency-safe procedure verifying doctor availability before committing new appointments and placing patients in the service queue.
- **`generate_bill`**: Automatically compiles consultation fees and services into a unified bill.
- **`calculate_age(dob)`**: Deterministic function shared across both SQL queries and the ML pipeline for canonical patient age calculations.
- **`trg_appointment_conflict`**: Enforces strict scheduling validation to prevent double-booking doctors on overlapping timeslots.
- **`trg_prescription_stock_check`**: Validates medicine inventory before dispensing prescriptions.
- **`trg_bill_status_update`**: Automatically transitions bill status between `UNPAID`, `PARTIALLY_PAID`, and `PAID` upon payment entry.
- **`trg_bed_status_update`**: Synchronizes bed states (`AVAILABLE` vs. `OCCUPIED`) upon patient admission and discharge.

---

## 🔐 Database-Enforced RBAC & Security

MediCore implements strict **Role-Based Access Control (RBAC)** where rights are enforced directly inside the Oracle Database kernel:

```
          ┌───────────────────────────────────────────────┐
          │             FastAPI App Session               │
          └──────────────────────┬────────────────────────┘
                                 │ Connection acquired by Role
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ doctor1 user │         │ recep1 user  │         │ billing user │
│ (DOCTOR_ROLE)│         │ (RECEP_ROLE) │         │ (BILL_ROLE)  │
└───────┬──────┘         └───────┬──────┘         └───────┬──────┘
        │                        │                        │
  SELECT/INSERT            SELECT/INSERT            SELECT/INSERT
  on DIAGNOSIS,            on PATIENT,              on BILL,
  PRESCRIPTION             APPOINTMENT              PAYMENT
        │                        │                        │
  REVOKE ALL               REVOKE ALL               REVOKE ALL
  on BILL,                 on DIAGNOSIS,            on DIAGNOSIS,
  PAYMENT                  CLINICAL_NOTE            PRESCRIPTION
```

### Default Credentials (Simple Demo Setup)

All database and application accounts are initialized with simple credentials where **`password == username`**:

| User / Role | Username | Password | Accessible Clinical Modules |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin1` | `admin1` | Unrestricted access to all clinical, financial, administrative, and configuration screens. |
| **Doctor** | `doctor1` | `doctor1` | Dashboard, Patient Directory, Appointments, Clinical Workspace, Prescriptions, Labs. |
| **Nurse** | `nurse1` | `nurse1` | Dashboard, Patient Directory, Appointments, Bed Allocation, Triage/Queue Console, Vitals. |
| **Receptionist** | `receptionist1` | `receptionist1` | Patient Registration, Appointment Booking, Inpatient Admission, Service Queue. |
| **Pharmacist** | `pharmacist1` | `pharmacist1` | Prescription Fulfillment, Medicine Catalog, Stock Adjustment, Inventory Tracking. |
| **Lab Technician** | `labtech1` | `labtech1` | Test Catalog, Specimen Collection, Lab Order Status, Result Recording. |
| **Billing Clerk** | `billingclerk1` | `billingclerk1` | Invoicing, Bill Generation, Payment Recording, Financial Receipts. |
| **Read-Only / Auditor**| `readonly1` | `readonly1` | Concept Lab Sandbox, Reports, KPI Dashboards, Schema & ER Model Viewers. |

---

## 🤖 Machine Learning Subsystem

The **Outpatient No-Show Prediction Engine** predicts the likelihood that a scheduled appointment will result in a `NO_SHOW` versus `ATTENDED`.

```
                    ┌────────────────────────────┐
                    │ Oracle Database (XE)       │
                    │ 178+ Labeled Historical    │
                    │ Appointments               │
                    └─────────────┬──────────────┘
                                  │ ml/extract.py
                                  ▼
                    ┌────────────────────────────┐
                    │ Feature Engineering        │
                    │ - Patient Age (via DB fn)  │
                    │ - Historical No-Show Rate  │
                    │ - Lead Time Days           │
                    │ - Department & Day of Week │
                    └─────────────┬──────────────┘
                                  │ ml/train.py
                                  ▼
           ┌──────────────────────────────────────────────┐
           │ Candidate Model Training & Cross-Validation  │
           │  • Logistic Regression (L2 penalty)          │
           │  • Random Forest (100 estimators)            │
           │  • class_weight='balanced' (imbalance safe)  │
           └──────────────────────┬───────────────────────┘
                                  │ ml/evaluate.py
                                  ▼
                    ┌────────────────────────────┐
                    │ Model Selection            │
                    │ (Optimizing Recall then F1)│
                    │ -> no_show_model.joblib    │
                    └─────────────┬──────────────┘
                                  │ ml/predict_and_store.py
                                  ▼
                    ┌────────────────────────────┐
                    │ SQL MERGE into Oracle      │
                    │ `ML_PREDICTION` Table      │
                    └────────────────────────────┘
```

### Feature Engineering Details

1. **`patient_age`**: Computed dynamically via the database's `calculate_age(dob)` function.
2. **`prior_appt_count`**: Total past appointments scheduled for this patient.
3. **`prior_no_show_count`**: Number of times this patient previously missed an appointment.
4. **`prior_no_show_rate`**: Calculated as `prior_no_show_count / prior_appt_count`.
5. **`is_new_patient`**: Binary indicator (1 if first visit, 0 otherwise).
6. **`lead_time_days`**: Elapsed days between appointment booking timestamp and scheduled consultation date.
7. **`day_of_week` & `hour_of_day`**: Cyclic consultation schedule attributes.
8. **`department_id`**: Categorical one-hot encoded clinical department identifier.

---

## 🧪 DBMS Concept Lab & Interactive Features

The **DBMS Concept Lab** is a live query sandbox designed to demonstrate university DBMS coursework concepts on production data:

- **Relational Algebra Demonstrations**: Selection ($\sigma$), Projection ($\pi$), Natural Join ($\bowtie$), Cartesian Product ($\times$), and Set Union ($\cup$).
- **Complex Aggregation & Window Functions**: Demonstrating `GROUP BY`, `HAVING`, `ROLLUP`, `DENSE_RANK()`, `ROW_NUMBER() OVER (...)`, and running totals.
- **SQL Execution Transparency**: Every table, form, and action displays the underlying query and execution time.
- **Built-in Schema & ER Visualizer**: Real-time dynamic graph showing relational primary/foreign key connections across all 26 schema tables.

---

## 📁 Project Directory Structure

```
MediCore_HCMS/
├── 1_install_database.ps1     # Automated Oracle schema & seed data installer
├── 2_start_backend.ps1        # Initializes Python venv and starts FastAPI on port 8000
├── 3_start_frontend.ps1       # Launches Vite dev server on port 5173
├── 4_run_ml.ps1               # Executes end-to-end ML training and prediction pipeline
├── .env                       # Central environment variables & database credentials
├── README.md                  # Comprehensive project documentation
├── MediCore_HCMS_Git_Contribution_and_Push_Plan.pdf # Team push & commit sequence plan
│
├── database/                  # Oracle XE Relational Schema & Scripts
│   ├── 01_schema.sql          # 26 relational tables & foreign key constraints
│   ├── 03_sequences.sql       # 25 ID sequences for primary keys
│   ├── 04_sample_data.sql     # Baseline seed data for all domains
│   ├── 04b_bulk_data.sql      # 200 historical appointments for ML training
│   ├── 05_views.sql           # 8 specialized reporting & analytical views
│   ├── 06_indexes.sql         # B-tree & composite performance indexes
│   ├── 07_functions.sql       # Deterministic utility functions (calculate_age, etc.)
│   ├── 08_procedures.sql      # Core clinical business logic procedures
│   ├── 09_packages.sql        # pkg_clinical_ops specification & body
│   ├── 10_triggers.sql        # Mutation-safe audit & consistency triggers
│   ├── 11_queue.sql           # Service queue & emergency prioritization procedures
│   ├── 12_security_roles.sql  # Oracle RBAC role definitions, users & grant matrix
│   ├── 13_audit.sql           # Clinical audit trail logging infrastructure
│   ├── 14_bill_status_trigger.sql # Trigger updating bill payment status
│   └── install.py             # Python-based multi-statement Oracle installer
│
├── backend/                   # FastAPI Web Application & DB Connectors
│   ├── .env                   # Backend environment configuration
│   ├── requirements.txt       # Python dependencies (fastapi, uvicorn, oracledb, etc.)
│   └── app/
│       ├── main.py            # FastAPI entry point, CORS middleware & route setup
│       ├── auth/              # JWT bearer authentication & role mapping
│       ├── db/                # Oracle connection pooling (one pool per role) & sessions
│       └── routers/           # 13 modular REST routers (patients, billing, lab, etc.)
│
├── frontend/                  # React 18 + Vite SPA Frontend
│   ├── index.html             # HTML entry point with favicon & Google Fonts
│   ├── package.json           # npm dependencies (lucide-react, react-router, etc.)
│   ├── vite.config.js         # Vite configuration with `/api` reverse proxy to port 8000
│   ├── public/                # Static public assets (favicon.svg, favicon.ico)
│   └── src/
│       ├── main.jsx           # React DOM application mount
│       ├── App.jsx            # React Router tree & route guards
│       ├── Layout.jsx         # Role-aware responsive sidebar & header navigation
│       ├── index.css          # Design system tokens, Tailwind directives & glassmorphism
│       ├── api.js             # Thin fetch client attaching JWT Bearer tokens
│       ├── components/        # Reusable UI widgets (SqlPanel, DataTable, EcgLine, etc.)
│       └── pages/             # 13 clinical domain pages (Dashboard, Pharmacy, Lab, etc.)
│
└── ml/                        # Machine Learning Pipeline
    ├── extract.py             # Ground-truth dataset extraction from Oracle
    ├── train.py               # Feature preparation, scaling & candidate model training
    ├── evaluate.py            # Precision, Recall, F1 & ROC-AUC evaluation metrics
    ├── predict_and_store.py   # Scores scheduled appointments & executes SQL MERGE
    ├── run_pipeline.py        # Master pipeline CLI orchestrator
    └── no_show_model.joblib   # Trained, serialized scikit-learn model artifact
```

---

## 🚀 Quick Start & Setup Guide

### System Prerequisites

- **OS**: Windows 10/11, macOS, or Linux
- **Oracle Database**: Oracle Database 21c XE or 23ai XE (Running natively or via Docker container named `oracle-xe`)
- **Python**: Version 3.10 or higher
- **Node.js**: Version 18.0 or higher with npm

---

### Step 1: Ensure Oracle XE is Running

If running Oracle XE in Docker:
```powershell
docker start oracle-xe
# Wait ~30 seconds until the database is ready:
docker logs oracle-xe
```

### Step 2: Install Database Schema, Data & Roles

Run the automated installer script from the root directory:
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\1_install_database.ps1 -SystemPassword <YOUR_SYSTEM_PASSWORD>
```
*This drops any previous schema, creates `HCMS_ADMIN`, builds all 26 tables, compiles all PL/SQL objects, seeds sample data, and initializes the 8 security users.*

### Step 3: Launch the Backend API

In a new terminal window:
```powershell
.\2_start_backend.ps1
```
The FastAPI backend will start at **`http://127.0.0.1:8000`**.  
Verify health: Navigate to `http://127.0.0.1:8000/health` (returns `{"status":"ok"}`).  
Interactive Swagger Docs: Available at `http://127.0.0.1:8000/docs`.

### Step 4: Launch the Frontend Web Application

In another terminal window:
```powershell
.\3_start_frontend.ps1
```
The React + Vite application will launch at **`http://localhost:5173`**.

### Step 5: Run the Machine Learning Pipeline

In a separate terminal window (after Step 2):
```powershell
.\4_run_ml.ps1                 # retrain: compares 4 models, registers the best in ML_MODEL_RUN, scores upcoming visits
.\4_run_ml.ps1 --predict-only  # just re-score with the saved model
```
(Logged in as `admin1` you can also press **Retrain model** on the *AI/ML insights* page.)

### Step 6 (optional): Re-seed only the data

```powershell
.\5_reseed_data.ps1            # wipes and reloads 04_sample_data.sql, keeps schema/users/grants
```
The seed data is relative to the install week, so re-seeding after a few weeks makes "today" and "upcoming" fresh again.

---

## 📡 REST API Reference

All protected endpoints require an `Authorization: Bearer <JWT_TOKEN>` header obtained via `/auth/login`.

| Method | Endpoint | Description | Role Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticates against Oracle DB and issues signed JWT | All (Public) |
| `GET` | `/reports/dashboard` | Returns consolidated KPI statistics (beds, queue, revenue) | All Authenticated |
| `GET` | `/patients` | Lists registered patients | Admin, Doctor, Nurse, Recep |
| `GET` | `/patients/search` | Search patient records by last name (bind variable safe) | Admin, Doctor, Nurse, Recep |
| `POST` | `/patients` | Registers a new patient record into `PATIENT` | Admin, Receptionist |
| `GET` | `/doctors` | Returns catalog of registered physicians for pickers | All Authenticated |
| `GET` | `/appointments/schedule` | Retrieves daily scheduled appointments | Admin, Doctor, Nurse, Recep |
| `POST` | `/appointments/book` | Calls PL/SQL procedure `book_appointment` | Admin, Doctor, Recep |
| `GET` | `/admissions/available-beds`| Returns unoccupied hospital beds | Admin, Doctor, Nurse, Recep |
| `POST` | `/admissions/admit` | Calls `pkg_clinical_ops.admit_patient` | Admin, Doctor, Nurse, Recep |
| `GET` | `/clinical/patient-summary/{id}`| Retrieves patient diagnosis history | Admin, Doctor, Nurse |
| `POST` | `/clinical/notes` | Records timestamped clinical encounter note | Admin, Doctor |
| `POST` | `/clinical/vitals` | Records patient temperature, pulse, BP, and SpO2 | Admin, Doctor, Nurse |
| `POST` | `/clinical/discharge/{id}`| Calls `pkg_clinical_ops.discharge_patient` | Admin, Doctor |
| `GET` | `/pharmacy/medicines` | Returns catalog of active pharmaceutical drugs | Admin, Doctor, Pharmacist |
| `GET` | `/pharmacy/inventory` | Reads `vw_medicine_inventory_status` | Admin, Doctor, Pharmacist |
| `POST` | `/pharmacy/prescriptions`| Calls PL/SQL procedure `add_prescription` | Admin, Doctor |
| `GET` | `/lab/tests` | Returns laboratory test catalog and fees | Admin, Doctor, Lab Tech |
| `GET` | `/lab/pending` | Reads `vw_pending_lab_reports` | Admin, Doctor, Lab Tech |
| `POST` | `/lab/orders` | Calls PL/SQL procedure `register_lab_order` | Admin, Doctor |
| `PUT` | `/lab/orders/{id}/result`| Records validated diagnostic laboratory result | Admin, Lab Tech |
| `GET` | `/billing/summary/{id}` | Reads `vw_patient_billing_summary` | Admin, Billing Clerk |
| `POST` | `/billing/generate/{id}` | Calls PL/SQL procedure `generate_bill` | Admin, Billing Clerk |
| `POST` | `/billing/payments` | Records patient payment (triggers status flip) | Admin, Billing Clerk |
| `POST` | `/queue/emergency` | Calls PL/SQL procedure `prioritize_emergency` | Admin, Nurse, Recep |
| `POST` | `/queue/next` | Concurrency-safe call to `get_next_patient` | Admin, Doctor, Nurse |
| `GET` | `/ml-insights/predictions` | Reads ML risk scores from `ML_PREDICTION` | All Authenticated |
| `GET` | `/ml-insights/model-summary`| Returns active model parameters and metrics | All Authenticated |
| `POST` | `/dbms-lab/execute` | Sandboxed SQL runner on `readonly_role` | All Authenticated |

---

## 👥 Project Team & Git Contribution Plan

To ensure balanced collaborative distribution, a comprehensive 4-person Git contribution schedule has been established. The repository contains a PDF document outlining the sequence:  
👉 **[MediCore_HCMS_Git_Contribution_and_Push_Plan.pdf](file:///d:/DBMS_Project/MediCore_HCMS/MediCore_HCMS_Git_Contribution_and_Push_Plan.pdf)**

### Contribution Summary

| Contributor | Focus Area | Key Modules & Responsibilities | Approx. Lines of Code (LOC) |
| :--- | :--- | :--- | :--- |
| **Tejas** | **Database Architecture & DDL** | Oracle XE Schema (`01_schema.sql`), Sequences, Seed Data, PL/SQL Procedures & Package `pkg_clinical_ops`. | ~1,250 LOC (25%) |
| **Vaibhav** | **PL/SQL Rules, Triggers & Security** | Mutation-Safe Triggers, Queue Engine, Oracle RBAC Grants (`12_security_roles.sql`), Audit Log Infrastructure. | ~1,250 LOC (25%) |
| **Vansh** | **Backend API & Connection Pooling** | FastAPI Architecture, Multi-Role Pool (`pool.py`), JWT Auth, Modular REST Routers, Error Handling. | ~1,250 LOC (25%) |
| **Tanmay** | **Frontend UI & ML Integration** | React 18 Layout & Views, DBMS Concept Lab, Live SQL Panels, Scikit-Learn Pipeline (`ml/`). | ~1,250 LOC (25%) |

---

## ❓ Troubleshooting & FAQ

### 1. `ORA-01017: invalid username/password`
- **Cause**: Password mismatch between Oracle XE and your environment configuration.
- **Fix**: All default passwords match the username (e.g. `doctor1` / `doctor1`, `admin1` / `admin1`). To reset an Oracle account password manually, execute:
  ```sql
  ALTER USER doctor1 IDENTIFIED BY "doctor1";
  ```

### 2. `ORA-00942: table or view does not exist`
- **Cause**: The connecting user lacks `SELECT` privileges on the table, or `current_schema` was not switched to `HCMS_ADMIN`.
- **Fix**: The backend automatically sets `conn.current_schema = "HCMS_ADMIN"` upon acquiring connections. Ensure you ran `1_install_database.ps1` so all role grants are applied.

### 3. Port 8000 or Port 5173 is Already in Use
- **Cause**: A previous instance of Uvicorn or Vite is lingering in the background.
- **Fix**: Free the port using PowerShell:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
  ```

### 4. PowerShell Script Execution Blocked
- **Cause**: Windows PowerShell default script execution policy.
- **Fix**: Unblock execution for your current session:
  ```powershell
  Set-ExecutionPolicy -Scope Process Bypass
  ```

---

## 📄 License

This project is developed for educational and clinical management demonstration purposes under the **MIT License**.
