#!/data/data/com.termux/files/usr/bin/bash
# ─────────────────────────────────────────────
#  NS Arena C++ — GitHub Push Script (Termux)
#  Usage: bash push.sh [commit message]
# ─────────────────────────────────────────────

set -e

# ── Colors ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  NS Arena C++ — Termux GitHub Push${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 1. Check we're inside the project root ───
if [ ! -f "CMakeLists.txt" ] || [ ! -d "src" ]; then
  error "Run this script from inside the ns-arena-cpp/ folder."
fi

# ── 2. Check git is available ────────────────
command -v git &>/dev/null || error "git not found. Install with: pkg install git"

# ── 3. Init repo if needed ───────────────────
if [ ! -d ".git" ]; then
  warn "No git repo found. Initialising..."
  git init
  git branch -M main
  success "Git repo initialised (branch: main)."
fi

# ── 4. Ensure a remote called 'origin' exists ─
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$REMOTE_URL" ]; then
  echo -e "${YELLOW}No remote 'origin' is set.${NC}"
  echo -n "  Enter your GitHub repo URL (https or ssh): "
  read -r REMOTE_URL
  [ -z "$REMOTE_URL" ] && error "Remote URL cannot be empty."
  git remote add origin "$REMOTE_URL"
  success "Remote set to: $REMOTE_URL"
else
  info "Remote origin → $REMOTE_URL"
fi

# ── 5. Set git identity if not configured ────
GIT_USER=$(git config user.name  2>/dev/null || true)
GIT_EMAIL=$(git config user.email 2>/dev/null || true)

if [ -z "$GIT_USER" ]; then
  echo -n "  Git username (for commits): "
  read -r GIT_USER
  git config user.name "$GIT_USER"
fi

if [ -z "$GIT_EMAIL" ]; then
  echo -n "  Git email: "
  read -r GIT_EMAIL
  git config user.email "$GIT_EMAIL"
fi

# ── 6. Stage all changes ─────────────────────
info "Staging all changes..."
git add -A

# ── 7. Check if there is anything to commit ──
if git diff --cached --quiet; then
  warn "Nothing new to commit — working tree is clean."
  echo ""
  info "Attempting push anyway (in case of unpushed commits)..."
  git push -u origin main && success "Push complete." || warn "Nothing to push."
  exit 0
fi

# ── 8. Commit message ────────────────────────
if [ -n "$1" ]; then
  COMMIT_MSG="$*"
else
  # Auto-generate a default based on changed files
  CHANGED=$(git diff --cached --name-only | head -5 | tr '\n' ' ')
  DEFAULT_MSG="update: $CHANGED"
  echo ""
  echo -e "  ${BOLD}Changed files:${NC}"
  git diff --cached --name-only | sed 's/^/    /'
  echo ""
  echo -e "  ${BOLD}Default commit message:${NC} ${DEFAULT_MSG}"
  echo -n "  Press Enter to use it, or type a custom message: "
  read -r CUSTOM_MSG
  COMMIT_MSG="${CUSTOM_MSG:-$DEFAULT_MSG}"
fi

# ── 9. Commit ────────────────────────────────
git commit -m "$COMMIT_MSG"
success "Committed: \"$COMMIT_MSG\""

# ── 10. Push ─────────────────────────────────
echo ""
info "Pushing to origin/main..."
git push -u origin main

echo ""
echo -e "${GREEN}${BOLD}✓ All done! NS Arena C++ pushed to GitHub.${NC}"
echo ""
