#!/usr/bin/env bash
set -euo pipefail

DRIVER_NAME="ODBC Driver 18 for SQL Server"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[odbc]${NC} $1"; }
warn() { echo -e "${YELLOW}[odbc]${NC} $1"; }
err()  { echo -e "${RED}[odbc]${NC} $1"; }

detect_os() {
  case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    Linux*)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)        echo "unknown" ;;
  esac
}

is_driver_installed() {
  if command -v odbcinst &>/dev/null; then
    odbcinst -q -d 2>/dev/null | grep -qi "ODBC Driver 18" && return 0
  fi
  return 1
}

install_macos() {
  if ! command -v brew &>/dev/null; then
    # Homebrew may be installed but not in PATH (Apple Silicon)
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    else
      err "Homebrew is not installed. Install it first:"
      err "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      exit 1
    fi
  fi

  log "Installing ${DRIVER_NAME} via Homebrew..."
  brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release 2>/dev/null || true
  HOMEBREW_ACCEPT_EULA=Y brew install msodbcsql18
  log "${DRIVER_NAME} installed successfully."
}

print_linux_instructions() {
  err "${DRIVER_NAME} is not installed."
  echo ""
  warn "Run the following commands to install it:"
  echo ""
  echo "  curl https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc"
  echo "  sudo add-apt-repository \"\$(curl -fsSL https://packages.microsoft.com/config/ubuntu/\$(lsb_release -rs)/prod.list)\""
  echo "  sudo apt-get update"
  echo "  sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18"
  echo ""
  warn "Then re-run: npm run dev"
  exit 1
}

print_windows_instructions() {
  err "${DRIVER_NAME} is not installed."
  echo ""
  warn "Run one of the following to install it:"
  echo ""
  echo "  winget install Microsoft.msodbcsql18"
  echo ""
  echo "  -- or download the installer from --"
  echo "  https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server"
  echo ""
  warn "Then re-run: npm run dev"
  exit 1
}

# ── Main ────────────────────────────────────────────────────────────────────

if is_driver_installed; then
  log "${DRIVER_NAME} found."
  exit 0
fi

OS="$(detect_os)"

case "$OS" in
  macos)
    install_macos
    ;;
  linux)
    print_linux_instructions
    ;;
  windows)
    print_windows_instructions
    ;;
  *)
    err "Unsupported OS. Please install ${DRIVER_NAME} manually."
    err "https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server"
    exit 1
    ;;
esac
