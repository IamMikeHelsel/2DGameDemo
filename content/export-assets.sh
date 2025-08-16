#!/bin/bash

# Toodee Art Pipeline Export Scripts
# This script processes Aseprite files and generates optimized spritesheets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR"
ART_DIR="$CONTENT_DIR/art"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_tools() {
    log_info "Checking required tools..."
    
    if ! command -v aseprite &> /dev/null; then
        log_warn "Aseprite not found in PATH. Please install Aseprite or add it to PATH."
    else
        log_info "Aseprite found: $(aseprite --version | head -n 1)"
    fi
    
    if ! command -v TexturePacker &> /dev/null; then
        log_warn "TexturePacker not found in PATH. Skipping atlas generation."
    else
        log_info "TexturePacker found"
    fi
}

# Export single Aseprite file
export_aseprite() {
    local source_file="$1"
    local output_dir="$2"
    local filename=$(basename "$source_file" .aseprite)
    
    log_info "Exporting $filename..."
    
    # Create output directory if it doesn't exist
    mkdir -p "$output_dir"
    
    # Export spritesheet and JSON data
    aseprite -b "$source_file" \
        --sheet "$output_dir/${filename}.png" \
        --data "$output_dir/${filename}.json" \
        --format json-array \
        --sheet-pack \
        --trim \
        --inner-padding 2
        
    if [ $? -eq 0 ]; then
        log_info "✓ Exported $filename successfully"
    else
        log_error "✗ Failed to export $filename"
        return 1
    fi
}

# Export all Aseprite files in a directory
export_category() {
    local category="$1"
    local source_dir="$ART_DIR/$category/source"
    local export_dir="$ART_DIR/$category/export"
    
    if [ ! -d "$source_dir" ]; then
        log_warn "Source directory not found: $source_dir"
        return 0
    fi
    
    log_info "Processing $category assets..."
    
    # Find all .aseprite files and export them
    find "$source_dir" -name "*.aseprite" -type f | while read -r file; do
        export_aseprite "$file" "$export_dir"
    done
}

# Generate texture atlas for a category
generate_atlas() {
    local category="$1"
    local export_dir="$ART_DIR/$category/export"
    local atlas_dir="$ART_DIR/$category/atlas"
    
    if [ ! -d "$export_dir" ]; then
        log_warn "Export directory not found: $export_dir"
        return 0
    fi
    
    if ! command -v TexturePacker &> /dev/null; then
        log_warn "TexturePacker not available, skipping atlas generation for $category"
        return 0
    fi
    
    log_info "Generating atlas for $category..."
    mkdir -p "$atlas_dir"
    
    # Count PNG files in export directory
    png_count=$(find "$export_dir" -name "*.png" -type f | wc -l)
    
    if [ "$png_count" -eq 0 ]; then
        log_warn "No PNG files found in $export_dir, skipping atlas generation"
        return 0
    fi
    
    # Generate atlas using TexturePacker
    TexturePacker \
        --format phaser3 \
        --algorithm MaxRects \
        --padding 4 \
        --trim \
        --power-of-two \
        --max-size 2048 \
        --sheet "$atlas_dir/${category}_atlas.png" \
        --data "$atlas_dir/${category}_atlas.json" \
        "$export_dir"/*.png
        
    if [ $? -eq 0 ]; then
        log_info "✓ Generated atlas for $category"
    else
        log_error "✗ Failed to generate atlas for $category"
        return 1
    fi
}

# Main export function
main() {
    log_info "Starting Toodee Art Pipeline Export"
    log_info "Working directory: $CONTENT_DIR"
    
    check_tools
    
    # Categories to process
    categories=("characters" "tiles" "mobs" "items" "ui" "vfx")
    
    # Export individual spritesheets
    for category in "${categories[@]}"; do
        export_category "$category"
    done
    
    # Generate atlases
    log_info "Generating texture atlases..."
    for category in "${categories[@]}"; do
        generate_atlas "$category"
    done
    
    log_info "Art pipeline export complete!"
    log_info "Exported assets are in content/art/*/export/"
    log_info "Generated atlases are in content/art/*/atlas/"
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi