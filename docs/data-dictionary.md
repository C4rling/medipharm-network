# MediPharm Network: Data Dictionary

Source of truth: `migrations/001_create_tables.sql`. Database: PostgreSQL on Neon.
Key: **PK** = primary key, **FK** = foreign key, **UQ** = unique, **NN** = not null.

## 1. Identity

### profile
Personal details shared by every person in the system.

| Column | Type | Constraints | Description |
|---|---|---|---|
| profile_id | SERIAL | PK | Unique ID of the person |
| first_name | VARCHAR(50) | NN | First name |
| last_name | VARCHAR(50) | NN | Last name |
| phone | VARCHAR(20) | | Contact number |
| address | VARCHAR(255) | | Home address |
| date_created | TIMESTAMP | NN, default now | When the profile was created |

### user_account
Login account linked to one profile.

| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | SERIAL | PK | Unique ID of the account |
| profile_id | INT | FK to profile, UQ, NN | The person who owns the account (deleted with the profile) |
| user_email | VARCHAR(100) | UQ, NN | Login email |
| password_hash | VARCHAR(255) | NN | Hashed password (bcrypt or argon2), never plain text |
| role | VARCHAR(20) | NN, one of `admin`, `staff`, `patient` | Decides which database role the user gets |
| active_status | BOOLEAN | NN, default true | Whether the account can be used |
| date_created | TIMESTAMP | NN, default now | When the account was created |

### staff
A profile that works for the network.

| Column | Type | Constraints | Description |
|---|---|---|---|
| staff_id | INT | PK, FK to profile | Same ID as the profile |
| hire_date | DATE | NN | Date the person was hired |

### patient
A profile that receives care.

| Column | Type | Constraints | Description |
|---|---|---|---|
| patient_id | INT | PK, FK to profile | Same ID as the profile |
| date_of_birth | DATE | NN | Birth date |
| gender | VARCHAR(10) | one of `male`, `female`, `other` | Gender |
| emergency_contact | VARCHAR(100) | | Name and number of an emergency contact |

## 2. Locations

### pharmacy_branches

| Column | Type | Constraints | Description |
|---|---|---|---|
| branch_id | SERIAL | PK | Unique ID of the branch |
| name | VARCHAR(100) | NN | Branch name |
| address | VARCHAR(255) | NN | Branch address |
| phone | VARCHAR(20) | | Branch phone number |

### clinic

| Column | Type | Constraints | Description |
|---|---|---|---|
| clinic_id | SERIAL | PK | Unique ID of the clinic |
| name | VARCHAR(100) | NN | Clinic name |
| address | VARCHAR(255) | NN | Clinic address |
| phone | VARCHAR(20) | | Clinic phone number |

## 3. Staff roles

### doctor

| Column | Type | Constraints | Description |
|---|---|---|---|
| doctor_id | INT | PK, FK to staff | Same ID as the staff member |
| specialty | VARCHAR(100) | NN | Medical specialty |
| license_number | VARCHAR(50) | UQ, NN | Professional license number |

### pharmacist

| Column | Type | Constraints | Description |
|---|---|---|---|
| pharmacist_id | INT | PK, FK to staff | Same ID as the staff member |
| branch_id | INT | FK to pharmacy_branches, NN | Branch where the pharmacist works |
| license_number | VARCHAR(50) | UQ, NN | Professional license number |

### doctor_clinic_assignments
Junction table: which doctors work at which clinics (many-to-many).

| Column | Type | Constraints | Description |
|---|---|---|---|
| doctor_id | INT | PK, FK to doctor | The doctor |
| clinic_id | INT | PK, FK to clinic | The clinic |
| date_assigned | DATE | NN, default today | Date of assignment |
| status | VARCHAR(20) | NN, `active` or `inactive`, default `active` | Whether the assignment is current |

## 4. Inventory

### medicines

| Column | Type | Constraints | Description |
|---|---|---|---|
| medicine_id | SERIAL | PK | Unique ID of the medicine |
| name | VARCHAR(100) | NN | Brand name |
| generic_name | VARCHAR(100) | | Generic (active ingredient) name |
| form | VARCHAR(50) | | Tablet, capsule, syrup, etc. |
| unit | VARCHAR(20) | | Strength, such as mg or ml |
| reorder_threshold | INT | NN, at least 0, default 0 | Stock level at or below which an alert opens |

### branches_stock
Junction table: how much of each medicine each branch holds (many-to-many).

| Column | Type | Constraints | Description |
|---|---|---|---|
| branch_id | INT | PK, FK to pharmacy_branches | The branch |
| medicine_id | INT | PK, FK to medicines | The medicine |
| quantity | INT | NN, at least 0, default 0 | Units in stock (cannot go negative) |
| updated_on | TIMESTAMP | NN, default now | Last change, kept current by a trigger |

### low_stock_alerts
Filled automatically by the trigger in `007`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| alert_id | SERIAL | PK | Unique ID of the alert |
| branch_id | INT | FK to pharmacy_branches, NN | Branch with low stock |
| medicine_id | INT | FK to medicines, NN | Medicine that is low |
| current_quantity | INT | NN | Quantity when the alert opened |
| threshold | INT | NN | Reorder threshold at that time |
| date_created | TIMESTAMP | NN, default now | When the alert opened |
| resolved | BOOLEAN | NN, default false | True once stock rises above the threshold |

## 5. Clinical flow

### appointments

| Column | Type | Constraints | Description |
|---|---|---|---|
| appointment_id | SERIAL | PK | Unique ID of the appointment |
| patient_id | INT | FK to patient, NN | The patient |
| doctor_id | INT | FK to doctor, NN | The doctor |
| clinic_id | INT | FK to clinic, NN | Where it takes place |
| appointment_date | DATE | NN | Date |
| time_slot | TIME | NN | Start time |
| status | VARCHAR(20) | NN, one of `scheduled`, `completed`, `cancelled`, `no_show`, default `scheduled` | Current state |
| date_created | TIMESTAMP | NN, default now | When it was booked |

Extra rule: `UNIQUE (doctor_id, appointment_date, time_slot)` stops a doctor being double-booked.

### consultation
The visit itself. One per appointment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| consultation_id | SERIAL | PK | Unique ID of the consultation |
| appointment_id | INT | FK to appointments, UQ, NN | The appointment it belongs to |
| diagnosis | TEXT | | Doctor's diagnosis |
| notes | TEXT | | Additional notes |
| consultation_date | TIMESTAMP | NN, default now | When it happened |

### prescriptions

| Column | Type | Constraints | Description |
|---|---|---|---|
| prescription_id | SERIAL | PK | Unique ID of the prescription |
| consultation_id | INT | FK to consultation, NN | The consultation that produced it |
| patient_id | INT | FK to patient, NN | The patient |
| prescribing_doctor_id | INT | FK to doctor, NN | The doctor who wrote it |
| branch_id | INT | FK to pharmacy_branches, NN | Branch that will dispense it |
| status | VARCHAR(20) | NN, one of `pending`, `partially_dispensed`, `dispensed`, `cancelled`, default `pending` | Overall state |
| date_created | TIMESTAMP | NN, default now | When it was written |

### prescription_items
Junction table: the medicines on each prescription (many-to-many).

| Column | Type | Constraints | Description |
|---|---|---|---|
| prescription_item_id | SERIAL | PK | Unique ID of the line |
| prescription_id | INT | FK to prescriptions, NN | The prescription (lines deleted with it) |
| medicine_id | INT | FK to medicines, NN | The medicine |
| quantity_requested | INT | NN, greater than 0 | Amount prescribed |
| quantity_dispensed | INT | NN, at least 0, default 0 | Amount given so far |
| item_status | VARCHAR(20) | NN, one of `pending`, `partially_dispensed`, `dispensed`, `out_of_stock`, default `pending` | State of this line |

Extra rules: one line per medicine per prescription (`UNIQUE (prescription_id, medicine_id)`), and `quantity_dispensed` can never exceed `quantity_requested`.

## 6. Audit

### audit_logs
Written only by triggers (`003`), never by the application.

| Column | Type | Constraints | Description |
|---|---|---|---|
| log_id | SERIAL | PK | Unique ID of the log entry |
| table_name | VARCHAR(50) | NN | Table that changed |
| record_id | INT | NN | ID of the changed row (for branches_stock, the medicine_id) |
| action | VARCHAR(10) | NN, `INSERT`, `UPDATE` or `DELETE` | What happened |
| changed_by | INT | FK to user_account, set to NULL if the user is deleted | Who made the change |
| old_status_value | VARCHAR(100) | | Value before |
| new_status_value | VARCHAR(100) | | Value after |
| changed_on | TIMESTAMP | NN, default now | When it happened |

## Relationships at a glance

- profile 1 to 1 user_account, and profile 1 to 1 staff or patient
- staff 1 to 1 doctor or pharmacist; pharmacy_branches 1 to many pharmacist
- doctor many to many clinic (through doctor_clinic_assignments)
- pharmacy_branches many to many medicines (through branches_stock)
- patient 1 to many appointments; appointments 1 to 1 consultation; consultation 1 to many prescriptions
- prescriptions many to many medicines (through prescription_items)

## Indexes

`idx_appt_patient`, `idx_appt_date`, `idx_rx_patient`, `idx_rx_items_med`, `idx_stock_medicine` and `idx_audit_table` speed up common lookups on the foreign keys and dates.