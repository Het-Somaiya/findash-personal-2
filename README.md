# FinDash

FinDash is a market analysis platform for retail investors focused on options data interpretation. It periodically pulls delayed U.S. equity and options data from free APIs, converts it into higher-level metrics, and serves those metrics to an interactive web frontend built around linked visualizations.

The platform does **not** place trades or make predictions. Its purpose is to help users understand market opinion, risk distribution, and potential outcomes implied by options pricing and positioning — metrics like options volume, open interest, implied volatility (IV), and put/call ratios.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4 |
| Backend | Django 6, Django REST Framework |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Language (BE) | Python 3.13 |

---

## Project Structure

```
FinDash-web/
├── package.json       # Monorepo scripts (npm run dev, etc.)
├── frontend/          # Vite + React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/   # React components (ChatBot, NewsFeed, etc.)
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   ├── vite.config.ts
│   └── package.json
│
└── backend/           # Django + DRF
    ├── findash/       # Django project (settings, urls, wsgi)
    ├── core/          # Main Django app
    ├── manage.py
    ├── requirements.txt
    └── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Python 3.13+
- PostgreSQL (optional — only needed if `USE_POSTGRES=True`)

---

### Quick Start (Monorepo)

From the project root, you can run both frontend and backend together:

```bash
# First time setup (venv + all deps)
npm run setup

# Run both frontend and backend
npm run dev
```

| Script | Description |
|--------|-------------|
| `npm run setup` | First-time setup (venv + all deps) |
| `npm run install` | Install frontend dependencies |
| `npm run dev` | Run frontend & backend together |
| `npm run dev:fe` | Run frontend only (Vite) |
| `npm run dev:be` | Run backend only (Django) |
| `npm run build` | Build frontend + collect static files |

---

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env if needed (SQLite works out of the box)

# Run migrations and start server
python manage.py migrate
python manage.py runserver
```

The API will be available at `http://localhost:8000`.

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

### Environment Variables (backend/.env)

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key — change in production | — |
| `DEBUG` | Enable debug mode | `True` |
| `ALLOWED_HOSTS` | Comma-separated list of allowed hosts | `localhost,127.0.0.1` |
| `USE_POSTGRES` | Use PostgreSQL instead of SQLite | `False` |
| `DB_NAME` | PostgreSQL database name | `findash` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | — |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |

### Database Configuration

By default, the backend uses **SQLite** for local development — no setup required.

To switch to **PostgreSQL** (recommended for production or team environments):

1. Ensure PostgreSQL is running locally
2. Create a database named `findash`
3. Set `USE_POSTGRES=True` in `backend/.env`
4. Configure `DB_USER`, `DB_PASSWORD`, etc. as needed
5. Run migrations: `python manage.py migrate`

**When to use PostgreSQL:**
- Production deployments
- Testing with production-like data
- Team development with shared database
- When you need PostgreSQL-specific features (JSON fields, full-text search, etc.)

---

## Development Workflow

- **Branch**: feature work happens on `dev/buddhsen`; production-ready code targets `release`
- **API**: Django REST Framework serves JSON at `/api/`; the React frontend consumes it via fetch/axios
- **Data**: Delayed market and options data is pulled from free public APIs and stored in the database for serving to the frontend
