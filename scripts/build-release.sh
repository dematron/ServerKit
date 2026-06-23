#!/bin/bash
#
# ServerKit release builder.
#
# Produces a portable tarball that installs without compiling the frontend on
# the target: the full /opt/serverkit tree with a built frontend. The Python
# virtualenv is created locally by install.sh/update.sh so absolute paths in
# the venv always match the target machine.
#
#   bash scripts/build-release.sh
#   VERSION=v1.7.0 bash scripts/build-release.sh
#
set -euo pipefail

BUILD_DIR="/tmp/serverkit-release-build"

# ---------------------------------------------------------------------------
# Terminal styling (violet ServerKit identity, degrades to plain text)
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
    ESC=$'\033'
    RST="${ESC}[0m"; BLD="${ESC}[1m"
    paint() { printf '%s[38;2;%d;%d;%dm' "$ESC" "$1" "$2" "$3"; }
else
    RST=''; BLD=''
    paint() { :; }
fi

HUE_OK="$(paint 52 211 153)"; HUE_ERR="$(paint 248 113 113)"
HUE_LINK="$(paint 103 232 249)"

good() { printf '  %s✔%s %s\n' "$HUE_OK"   "$RST" "$1"; }
halt() { printf '  %s✘%s %s\n' "$HUE_ERR"  "$RST" "$1" >&2; exit 1; }
step() { printf '  %s❯%s %s\n' "$HUE_LINK" "$RST" "$1"; }

# ---------------------------------------------------------------------------
# Resolve version + architecture into an output filename
# ---------------------------------------------------------------------------
if [ -n "${VERSION:-}" ]; then
    RELEASE_TAG="$VERSION"
elif [ -f "VERSION" ]; then
    RELEASE_TAG="v$(cat VERSION | tr -d '\n\r ')"
else
    halt "Cannot determine version. Set VERSION or create a VERSION file."
fi

case "${BUILD_ARCH:-$(uname -m)}" in
    x86_64|amd64)  DL_ARCH="amd64" ;;
    aarch64|arm64) DL_ARCH="arm64" ;;
    *)             halt "Unsupported architecture: ${BUILD_ARCH:-$(uname -m)}" ;;
esac

OUTPUT="serverkit-${RELEASE_TAG}-linux-${DL_ARCH}.tar.gz"
step "Building release ${RELEASE_TAG} for ${DL_ARCH}"

# ---------------------------------------------------------------------------
# Toolchain check
# ---------------------------------------------------------------------------
command -v node &>/dev/null || halt "Node.js is required."

# ---------------------------------------------------------------------------
# Stage a clean copy of the repository
# ---------------------------------------------------------------------------
step "Preparing the build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

step "Copying the source tree..."
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Copy the source tree with tar, which handles broken symlinks and avoids
# the long rm -rf timeouts that cp + rm can hit on Windows/Git Bash.
mkdir -p "$BUILD_DIR"
cd "$REPO_ROOT"
tar -cf -     --exclude='./.git'     --exclude='./node_modules'     --exclude='./venv'     --exclude='./.venv'     --exclude='./.venv-wsl'     --exclude='./backend/venv'     --exclude='./backend/.venv'     --exclude='./backend/.venv-wsl'     --exclude='./__pycache__'     --exclude='./.pytest_cache'     --exclude='./instance'     --exclude='./dist'     --exclude='./backups'     --exclude='./backend/dev-data/backups'     --exclude='./backend/instance/backups'     --exclude='./scripts/test/output'     --exclude='*.png'     --exclude='*.jpeg'     --exclude='*.jpg'     --exclude='*.log'     --exclude='*.tmp'     --exclude='*.pyc'     . | tar -C "$BUILD_DIR" -xf -

# ---------------------------------------------------------------------------
# Build the frontend bundle
# ---------------------------------------------------------------------------
step "Building the frontend..."
cd "$BUILD_DIR/frontend"
npm ci --prefer-offline 2>&1 | tail -5
NODE_OPTIONS="--max-old-space-size=1024" npm run build 2>&1 | tail -10

# ---------------------------------------------------------------------------
# Strip development artifacts from the staged tree
# ---------------------------------------------------------------------------
step "Cleaning release artifacts..."
rm -rf "$BUILD_DIR/frontend/node_modules"
find "$BUILD_DIR" -type d -name __pycache__    -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -type d -name .pytest_cache  -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true
find "$BUILD_DIR" -type f \( -name '*.png' -o -name '*.jpeg' -o -name '*.jpg' \) -delete 2>/dev/null || true

# Runtime directory the app expects to exist.
mkdir -p "$BUILD_DIR/backend/instance"

# ---------------------------------------------------------------------------
# Pack the tarball with an /opt/serverkit prefix
# ---------------------------------------------------------------------------
step "Creating the tarball..."
# Land the tarball at the repo root (matches .gitignore's /serverkit-*.tar.gz).
DEST_DIR="$REPO_ROOT"

# Pack from the parent of BUILD_DIR with a transform so the archive contains
# /opt/serverkit without moving directories across filesystems.
cd "$(dirname "$BUILD_DIR")"
tar czf "${DEST_DIR}/${OUTPUT}" \
    --exclude='node_modules' \
    --exclude='venv' \
    --exclude='.venv' \
    --exclude='.venv-wsl' \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='instance' \
    --exclude='dist' \
    --exclude='/backups' \
    --exclude='/backend/instance/backups' \
    --exclude='/backend/dev-data/backups' \
    --exclude='/scripts/test/output' \
    --exclude='*.png' \
    --exclude='*.jpeg' \
    --exclude='*.jpg' \
    --exclude='*.log' \
    --exclude='*.tmp' \
    --exclude='*.pyc' \
    --transform 's|^serverkit-release-build|opt/serverkit|' \
    serverkit-release-build

cd "$DEST_DIR"
rm -rf "$BUILD_DIR"

good "Release built: ${OUTPUT}"
ls -lh "${OUTPUT}"

printf '\n'
printf 'Upload this file to GitHub Releases: %s\n' "$OUTPUT"
printf 'Install with:\n'
printf '  curl -fsSL https://serverkit.ai/install.sh | INSTALL_FROM_RELEASE=1 bash\n\n'
