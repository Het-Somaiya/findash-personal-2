# FinDash

FinDash is a market analysis platform for retail investors focused on options data interpretation. It periodically pulls delayed U.S. equity and options data from free APIs, converts it into higher-level metrics, and serves those metrics to an interactive web frontend built around linked visualizations.

The platform does **not** place trades or make predictions. Its purpose is to help users understand market opinion, risk distribution, and potential outcomes implied by options pricing and positioning — metrics like options volume, open interest, implied volatility (IV), and put/call ratios.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| Backend | Django 5.2, Django REST Framework |
| Database | Azure SQL Database (primary) / SQLite (fallback) |
| Filing GraphRAG | Neo4j, Qdrant, MongoDB, Azure OpenAI |
| Language (BE) | Python 3.12+ |

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
    ├── core/          # Main Django app, auth, chat, GraphRAG wiring
    │   └── graphrag/  # Framework-free filing GraphRAG modules
    ├── manage.py
    ├── requirements.txt
    └── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Python 3.13+
- ODBC Driver 18 for SQL Server (auto-installed on macOS via `npm run dev`)

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
# Edit .env — fill in DB_PASSWORD (ask team lead)

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

### Running Tests

Backend tests run against an in-memory SQLite database — no `runserver`, frontend,
or Azure SQL connection is required. Tests live in `backend/core/tests.py` and
cover auth, watchlist, and backtest functionality (GraphRAG/chat is excluded).

```bash
cd backend
source venv/bin/activate         # Windows: venv\Scripts\activate

# Run all tests
python manage.py test core

# Verbose (show each test name)
python manage.py test core -v 2

# Stop on first failure
python manage.py test core --failfast

# Run a single test class
python manage.py test core.tests.WatchlistTests

# Run a single test method
python manage.py test core.tests.RegisterTests.test_register_creates_user_and_returns_access_token

# Run in parallel (faster)
python manage.py test core --parallel
```

---

### Environment Variables (backend/.env)

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key — change in production | — |
| `DEBUG` | Enable debug mode | `True` |
| `ALLOWED_HOSTS` | Comma-separated list of allowed hosts | `localhost,127.0.0.1` |
| `DB_HOST` | Azure SQL server hostname | `findash.database.windows.net` |
| `DB_NAME` | Database name | `findash-sql-db` |
| `DB_USER` | SQL admin username | — |
| `DB_PASSWORD` | SQL admin password | — |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI key for chat | — |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint | — |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name | `gpt-4o-mini` |
| `AZURE_OPENAI_API_VERSION` | Azure OpenAI API version | `2025-01-01-preview` |
| `FILING_GRAPH_ENABLED` | Enable authenticated filing GraphRAG chat path | `False` |
| `NEO4J_URI` | Filing graph Neo4j Bolt URI | `bolt://localhost:7687` |
| `NEO4J_USER` | Filing graph Neo4j user | `neo4j` |
| `NEO4J_PASSWORD` | Filing graph Neo4j password | — |
| `QDRANT_HOST` | Filing embedding store host | `localhost` |
| `QDRANT_PORT` | Filing embedding store port | `6333` |
| `MONGO_URI` | Filing metadata MongoDB URI | `mongodb://localhost:27017` |
| `MONGO_DB_NAME` | Filing metadata MongoDB database | `findash` |

### Database Configuration

The backend uses **Azure SQL Database** as the primary database. All team members connect to the same shared instance.

When `DB_HOST`, `DB_USER`, and `DB_PASSWORD` are set in `.env`, Django connects to Azure SQL. If those are missing, it falls back to a local SQLite file for offline development.

**Setup:**
1. Copy `.env.example` to `.env`
2. Fill in `DB_PASSWORD` (ask the team lead)
3. Run `npm run dev` — ODBC driver is auto-checked and migrations run automatically

### Filing GraphRAG Chat

`/api/chat/` keeps the existing public Azure chat behavior for unauthenticated
users. When a request is authenticated and `FILING_GRAPH_ENABLED=True`, Django
routes the message through `backend/core/graphrag/` and returns a cited filing
answer when the graph has coverage. If the graph cannot answer, the service
falls back to Azure chat with an explicit filing-graph coverage note.

The backing Neo4j, Qdrant, and MongoDB stores are populated by
`filing-intel-engine` and migrated into the FinDash environment as periodic
snapshots. FinDash-web does not run ingestion. See
`backend/core/graphrag/README.md` for the expected database state.

For a local demo, run the filing-intel-engine stack or point these settings at
the private dev database host. Keep those databases private; the web app should
connect over localhost, Docker networking, or a trusted private network.

---

## Development Workflow

- **Branch**: feature work happens on personal `dev/<name>` branches. Rebase
  your branch onto `origin/develop`, open PRs into `develop`, and merge
  `develop` into `release` only after integration testing.
- **API**: Django REST Framework serves JSON at `/api/`; the React frontend consumes it via fetch/axios
- **Data**: Delayed market and options data is pulled from free public APIs and stored in the database for serving to the frontend
