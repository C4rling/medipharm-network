# MediPharm Network

A multi-clinic healthcare and pharmacy database system (Healthcare Clinic Networks and Patient EHR theme) built for Advanced Database Systems.

## Team

| Member | Role |
|---|---|
| [Lorie Anne Ave] | Lead Database Administrator (DBA) and Cloud Infrastructure Engineer |
| [Aleann Venice Achacoso] | Lead Database Programmer and Query Optimization Engineer |
| [Carla Jane Clarabal] | Frontend/UI Connector and Git Workflow Administrator |

## Tech Stack
- Database: PostgreSQL (hosted on Neon)
- Backend: [framework to be decided]

## Repository Structure
- `docs/`: ERD and documentation
- `migrations/`: sequential SQL scripts (`001_...`, `002_...`)

## Git Workflow
- Direct pushes to `main` are blocked. All work goes through pull requests.
- Branch names: `feature/...`, `fix/...`, `docs/...`, `chore/...`
- Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`

## Security
- Secrets live in a local `.env` file, which is never committed.
- The app connects with a limited-privilege role (`medipharm_app`), not an admin account.