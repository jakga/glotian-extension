#!/bin/bash

###############################################################################
# Glotian Chrome Extension - Packaging Script for Chrome Web Store
###############################################################################
#
# This script creates a production-ready ZIP file for Chrome Web Store submission.
#
# Usage:
#   ./scripts/package.sh [options]
#
# Options:
#   --version VERSION    Set version number (default: read from manifest.json)
#   --output DIR         Output directory (default: ./dist-store)
#   --skip-build         Skip build step (use existing dist-prod/)
#   --skip-checks        Skip pre-packaging validation checks
#   --help               Show this help message
#
# Requirements:
#   - Node.js 18+
#   - pnpm 10.17.1+
#   - zip command
#
# Steps:
#   1. Validate environment and dependencies
#   2. Run production build (unless --skip-build)
#   3. Copy dist-prod/ to temporary packaging directory
#   4. Remove development files and source maps
#   5. Verify bundle size (<2MB requirement)
#   6. Create ZIP archive
#   7. Generate checksum
#
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
VERSION=""
OUTPUT_DIR="./dist-store"
SKIP_BUILD=false
SKIP_CHECKS=false

# Script directory (apps/extension/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -n 30 "$0" | grep "^#" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is required but not installed. Please install it first."
        exit 1
    fi
}

###############################################################################
# Parse Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --help)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

###############################################################################
# Pre-Flight Checks
###############################################################################

log_info "Starting Chrome Web Store packaging..."

# Change to extension root directory
cd "$ROOT_DIR"

# Check required commands
check_command "node"
check_command "pnpm"
check_command "zip"
check_command "jq"  # For JSON parsing

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18+ is required (current: $(node -v))"
    exit 1
fi

# Check pnpm version
PNPM_VERSION=$(pnpm -v)
log_info "Using pnpm version: $PNPM_VERSION"

# Read version from manifest.json if not specified
if [ -z "$VERSION" ]; then
    if [ ! -f "manifest.json" ]; then
        log_error "manifest.json not found in $ROOT_DIR"
        exit 1
    fi
    VERSION=$(jq -r '.version' manifest.json)
    log_info "Version from manifest.json: $VERSION"
else
    log_info "Using specified version: $VERSION"
fi

###############################################################################
# Validation Checks
###############################################################################

if [ "$SKIP_CHECKS" = false ]; then
    log_info "Running validation checks..."

    # Check .env.local exists
    if [ ! -f ".env.local" ]; then
        log_warning ".env.local not found. API keys will not be bundled."
        log_warning "Make sure to configure Supabase credentials after installation."
    fi

    # Check for sensitive data in manifest
    if grep -q "localhost" manifest.json 2>/dev/null; then
        log_error "manifest.json contains 'localhost'. Remove development URLs before packaging."
        exit 1
    fi

    # Check TypeScript compilation (optional)
    log_info "Checking TypeScript types..."
    if pnpm run check-types 2>&1 | grep -q "error TS"; then
        log_warning "TypeScript errors detected. Proceeding anyway..."
        log_warning "Fix these errors for a production-ready build."
    else
        log_success "TypeScript check passed"
    fi

    log_success "Validation checks passed"
fi

###############################################################################
# Production Build
###############################################################################

if [ "$SKIP_BUILD" = false ]; then
    log_info "Running production build..."

    # Clean previous build
    rm -rf dist-prod

    # Build extension
    if ! pnpm run build; then
        log_error "Build failed. Fix errors and try again."
        exit 1
    fi

    log_success "Production build complete"
else
    log_info "Skipping build step (using existing dist-prod/)"

    if [ ! -d "dist-prod" ]; then
        log_error "dist-prod/ directory not found. Run 'pnpm build' first or remove --skip-build flag."
        exit 1
    fi
fi

###############################################################################
# Prepare Packaging Directory
###############################################################################

log_info "Preparing packaging directory..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Create temporary packaging directory
TEMP_DIR=$(mktemp -d)
log_info "Temporary directory: $TEMP_DIR"

# Setup cleanup trap to ensure temp directory is always removed on exit
trap 'rm -rf "$TEMP_DIR"' EXIT

# Copy dist-prod to temp
cp -r dist-prod/* "$TEMP_DIR/"

# Navigate to temp directory
cd "$TEMP_DIR"

###############################################################################
# Clean Up Development Files
###############################################################################

log_info "Removing development files..."

# Remove source maps
find . -name "*.map" -type f -delete
log_info "  ✓ Removed source maps"

# Remove .DS_Store (macOS)
find . -name ".DS_Store" -type f -delete

# Remove development assets
if [ -d "tests" ]; then
    rm -rf tests
    log_info "  ✓ Removed tests directory"
fi

# Remove large unnecessary files
if [ -f "README.md" ]; then
    # Keep README but remove verbose development instructions
    log_info "  ✓ Kept README.md (consider creating a user-facing version)"
fi

###############################################################################
# Verify Bundle Size
###############################################################################

log_info "Checking bundle size..."

BUNDLE_SIZE=$(du -sm . | awk '{print $1}')
log_info "Bundle size: ${BUNDLE_SIZE}MB"

MAX_SIZE=2  # Chrome Web Store limit (unofficial, but recommended)
if [ "$BUNDLE_SIZE" -gt "$MAX_SIZE" ]; then
    log_error "Bundle size (${BUNDLE_SIZE}MB) exceeds ${MAX_SIZE}MB limit!"
    log_error "Consider:"
    log_error "  - Removing unused dependencies"
    log_error "  - Optimizing images"
    log_error "  - Enabling more aggressive minification"
    exit 1
fi

log_success "Bundle size is within limits"

###############################################################################
# Create ZIP Archive
###############################################################################

log_info "Creating ZIP archive..."

ZIP_NAME="glotian-extension-v${VERSION}.zip"

# Handle both absolute and relative output directories
if [[ "$OUTPUT_DIR" == /* ]]; then
    # Absolute path
    ZIP_PATH="$OUTPUT_DIR/$ZIP_NAME"
else
    # Relative path - concatenate with ROOT_DIR
    ZIP_PATH="$ROOT_DIR/$OUTPUT_DIR/$ZIP_NAME"
fi

# Remove existing ZIP if present
rm -f "$ZIP_PATH"

# Create ZIP (exclude hidden files, but keep manifest.json and other configs)
zip -r -q "$ZIP_PATH" . -x "*.DS_Store" "*.git*"

if [ ! -f "$ZIP_PATH" ]; then
    log_error "Failed to create ZIP file"
    exit 1
fi

ZIP_SIZE=$(du -h "$ZIP_PATH" | awk '{print $1}')
log_success "ZIP created: $ZIP_PATH ($ZIP_SIZE)"

###############################################################################
# Generate Checksum
###############################################################################

log_info "Generating checksums..."

# Determine checksum output directory (handle both absolute and relative paths)
if [[ "$OUTPUT_DIR" == /* ]]; then
    CHECKSUM_DIR="$OUTPUT_DIR"
else
    CHECKSUM_DIR="$ROOT_DIR/$OUTPUT_DIR"
fi

cd "$CHECKSUM_DIR"

# SHA256 checksum with cross-platform support
if command -v shasum &> /dev/null; then
    shasum -a 256 "$ZIP_NAME" > "${ZIP_NAME}.sha256"
elif command -v sha256sum &> /dev/null; then
    sha256sum "$ZIP_NAME" > "${ZIP_NAME}.sha256"
else
    log_error "Neither shasum nor sha256sum found. Please install one of them."
    exit 1
fi
log_info "  ✓ SHA256: $(cat "${ZIP_NAME}.sha256" | awk '{print $1}')"

# MD5 checksum with cross-platform support (for legacy compatibility)
if command -v md5sum &> /dev/null; then
    md5sum "$ZIP_NAME" | awk '{print $1}' > "${ZIP_NAME}.md5"
elif command -v md5 &> /dev/null; then
    md5 -r "$ZIP_NAME" | awk '{print $1}' > "${ZIP_NAME}.md5"
else
    log_error "Neither md5sum nor md5 found. Please install one of them."
    exit 1
fi
log_info "  ✓ MD5: $(cat "${ZIP_NAME}.md5")"

###############################################################################
# Cleanup
###############################################################################

log_info "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

###############################################################################
# Final Summary
###############################################################################

echo ""
echo "============================================================================"
log_success "PACKAGING COMPLETE!"
echo "============================================================================"
echo ""
echo "📦 Package Details:"
echo "   Version:      $VERSION"
echo "   ZIP File:     $ZIP_PATH"
echo "   Size:         $ZIP_SIZE"
echo "   Bundle Size:  ${BUNDLE_SIZE}MB"
echo ""
echo "📋 Next Steps:"
echo "   1. Review the ZIP contents:"
echo "      unzip -l $ZIP_PATH | less"
echo ""
echo "   2. Test the packaged extension:"
echo "      - Open chrome://extensions"
echo "      - Enable Developer Mode"
echo "      - Click 'Load unpacked'"
# Determine display path (handle both absolute and relative)
if [[ "$OUTPUT_DIR" == /* ]]; then
    echo "      - Select: $OUTPUT_DIR (unzipped folder)"
else
    echo "      - Select: $ROOT_DIR/$OUTPUT_DIR (unzipped folder)"
fi
echo "      - Test all features from tests/manual/integration.md"
echo ""
echo "   3. Submit to Chrome Web Store:"
echo "      - Go to: https://chrome.google.com/webstore/devconsole"
echo "      - Create new item or update existing"
echo "      - Upload: $ZIP_NAME"
echo "      - Fill in store listing (see docs/store-listing.md)"
echo "      - Submit for review"
echo ""
echo "   4. Update Origin Trial tokens after submission:"
echo "      - Note your final extension ID from Chrome Web Store"
echo "      - Get tokens from: https://developer.chrome.com/origintrials/"
echo "      - Update manifest.json with new trial_tokens"
echo "      - Rebuild and resubmit (version bump required)"
echo ""
echo "📄 Important Files:"
echo "   - Store Listing: docs/store-listing.md"
echo "   - Privacy Policy: docs/privacy-policy.md"
echo "   - Manual QA: tests/manual/integration.md"
echo ""
echo "✅ Pre-Submission Checklist:"
echo "   [ ] All manual QA tests passed"
echo "   [ ] Privacy policy published at public URL"
echo "   [ ] Screenshots prepared (1280x800px, 5-8 images)"
echo "   [ ] Promotional tiles created (440x280px, 1400x560px)"
echo "   [ ] Demo video recorded (optional but recommended)"
echo "   [ ] Developer info updated in manifest.json"
echo "   [ ] Support email is monitored"
echo "   [ ] .env.local credentials are NOT hardcoded in ZIP"
echo ""
echo "🔗 Useful Links:"
echo "   - Chrome Web Store Developer Dashboard:"
echo "     https://chrome.google.com/webstore/devconsole"
echo "   - Chrome Extension Documentation:"
echo "     https://developer.chrome.com/docs/extensions/"
echo "   - Origin Trials:"
echo "     https://developer.chrome.com/origintrials/"
echo ""
echo "============================================================================"

# Return to original directory
cd "$ROOT_DIR"

log_success "Done! Ready for Chrome Web Store submission."
