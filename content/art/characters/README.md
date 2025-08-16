# Character Asset Creation Guide

## Overview
This directory contains character sprites with the following specifications:
- **Tile size:** 32×32 pixels
- **Sprite layers:** BASE, OUTLINE, SHADOW, LIGHTMASK
- **Animation tags:** idle_*, walk_*, attack_*, hurt, death

## Directory Structure
- `source/` - Original Aseprite files (.aseprite)
- `export/` - Exported spritesheets (.png) and data (.json)
- `atlas/` - Generated texture atlases

## Animation Naming Convention
- `idle_up`, `idle_down`, `idle_left`, `idle_right` - Idle animations for each direction
- `walk_up`, `walk_down`, `walk_left`, `walk_right` - Walking animations
- `attack_up`, `attack_down`, `attack_left`, `attack_right` - Attack animations
- `hurt` - Taking damage animation
- `death` - Death animation

## Layer Structure (in Aseprite)
1. **BASE** - Main character colors and details
2. **OUTLINE** - Black outline for visibility
3. **SHADOW** - Drop shadow beneath character
4. **LIGHTMASK** - Areas affected by dynamic lighting

## Creating New Characters
1. Create new .aseprite file in `source/` directory
2. Set canvas size to appropriate dimensions (usually 32x32 for tiles, 32x64 for characters)
3. Create frame tags for each animation
4. Use the layer structure defined above
5. Run export script: `../export-assets.sh`

## Frame Counts (Recommended)
- Idle: 1-4 frames
- Walk: 4-8 frames
- Attack: 3-6 frames
- Hurt: 2-3 frames
- Death: 4-8 frames