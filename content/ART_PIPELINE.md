# Toodee Art Pipeline Documentation

## Overview

This document describes the art pipeline and asset creation workflow for the Toodee 2D MMO game. The pipeline is designed to support industry-standard tools and provide a streamlined workflow from asset creation to in-game usage.

## Directory Structure

```
content/
├── art/
│   ├── characters/          # Character sprites and animations
│   │   ├── source/         # Original Aseprite files (.aseprite)
│   │   ├── export/         # Exported spritesheets (.png) and data (.json)
│   │   └── atlas/          # Generated texture atlases
│   ├── tiles/              # Environment tileset
│   ├── mobs/               # Enemy sprites
│   ├── items/              # Item icons and sprites
│   ├── ui/                 # UI elements (buttons, panels, bars)
│   ├── vfx/                # Visual effects (attacks, spells, impacts)
│   └── pipeline-config.json # Pipeline configuration
├── maps/
│   ├── source/             # Original Tiled map files (.tmx)
│   └── export/             # Exported map data (.json)
└── export-assets.sh        # Asset processing script
```

## Technical Specifications

### Sprite Specifications
- **Tile size:** 32×32 pixels
- **Character size:** 32×32 pixels (can be 32×64 for larger characters)
- **Animation frame rate:** 8-15 fps for most animations
- **Atlas size:** 2048×2048 pixels maximum (Power of Two)
- **Padding:** 4px between sprites in atlases

### Layer Structure (Aseprite)
1. **BASE** - Main sprite colors and details
2. **OUTLINE** - Black outline for visibility
3. **SHADOW** - Drop shadow beneath sprite
4. **LIGHTMASK** - Areas affected by dynamic lighting

### Animation Tags
- `idle_up`, `idle_down`, `idle_left`, `idle_right` - Idle poses
- `walk_up`, `walk_down`, `walk_left`, `walk_right` - Walking animations
- `attack_up`, `attack_down`, `attack_left`, `attack_right` - Attack animations
- `hurt` - Taking damage animation
- `death` - Death animation

## Tools and Workflow

### Required Tools
- **Aseprite** - Sprite creation and animation
- **Tiled** - Map editing
- **TexturePacker** (optional) - Atlas generation
- **SpriteIlluminator** (optional) - Normal map generation

### Asset Creation Workflow

#### 1. Character Creation
1. Create new .aseprite file in `content/art/characters/source/`
2. Set canvas size to 32×32 pixels
3. Create layers: BASE, OUTLINE, SHADOW, LIGHTMASK
4. Create frame tags for each animation
5. Export using the pipeline script

#### 2. Tileset Creation
1. Create new .aseprite file in `content/art/tiles/source/`
2. Use 32×32 grid
3. Create variations for each tile type
4. Export using the pipeline script

#### 3. Asset Export
Run the export script from the content directory:
```bash
./export-assets.sh
```

This will:
- Export all .aseprite files to PNG spritesheets
- Generate JSON metadata
- Create texture atlases (if TexturePacker is available)

### Manual Export Commands

For individual sprite export:
```bash
aseprite -b sprite.aseprite \
  --sheet sprite.png \
  --data sprite.json \
  --format json-array \
  --sheet-pack \
  --trim \
  --inner-padding 2
```

For atlas generation:
```bash
TexturePacker \
  --format phaser3 \
  --algorithm MaxRects \
  --padding 4 \
  --trim \
  --power-of-two \
  --max-size 2048 \
  --sheet atlas.png \
  --data atlas.json \
  input/*.png
```

## Integration with Game

### Asset Loading
Assets are defined in `packages/client/src/assets/GameAssets.ts` and loaded using the `AssetLoader` class:

```typescript
import { AssetLoader } from './assets/AssetLoader';
import { GAME_ASSETS } from './assets/GameAssets';

// In preload()
const loader = new AssetLoader(this);
loader.loadFromManifest(GAME_ASSETS);

// In create()
loader.createAnimationsFromManifest(GAME_ASSETS);
```

### Sprite Usage
```typescript
// Create a character sprite
const player = this.add.sprite(x, y, 'hero');
player.play('hero_walk_down');

// Create a tile
const tile = this.add.image(x, y, 'environment', TILE_INDICES.GRASS);

// Create a VFX
const effect = this.add.sprite(x, y, 'effects');
effect.play('vfx_fireball');
```

## Asset Categories

### Characters
- Hero character with full animation set
- NPCs and merchants
- Player customization sprites

### Environment
- Ground tiles (grass, dirt, stone, water)
- Wall and decoration tiles
- Interactive objects

### Mobs
- Basic enemies (slime, spider, skeleton)
- Boss creatures
- Animated attacks and death sequences

### Items
- Weapons (sword, bow, staff)
- Consumables (potions, food)
- Equipment (armor, accessories)
- Currency and materials

### UI Elements
- Buttons and panels
- Health and mana bars
- Inventory slots
- Chat bubbles

### VFX
- Attack effects (slash, impact)
- Spell effects (fireball, ice, lightning)
- Environment effects (sparkles, poison)
- UI feedback effects

## Quality Guidelines

### Art Style
- Maintain consistent pixel art style
- Use limited color palette for cohesion
- Ensure readability at game scale
- Follow 32×32 tile constraints

### Animation
- Keep frame counts reasonable (4-8 frames for walks, 2-4 for idles)
- Smooth timing and easing
- Clear silhouettes and readable motion
- Consistent frame rates within animation types

### Performance
- Use atlases for related sprites
- Minimize texture memory usage
- Keep individual sprite sizes reasonable
- Use appropriate compression settings

## Adding New Assets

### Step-by-Step Process
1. Create source files in appropriate `source/` directory
2. Follow naming conventions and layer structure
3. Run export script to generate game-ready assets
4. Update `GameAssets.ts` manifest
5. Copy exported assets to `packages/client/public/content/art/`
6. Test in-game loading and display

### Naming Conventions
- Use lowercase with underscores: `hero_walk_down`
- Be descriptive but concise: `stone_wall_cracked`
- Group related assets: `basic_mobs`, `magic_items`

## Troubleshooting

### Common Issues
- **Assets not loading:** Check file paths in manifest
- **Animations not playing:** Verify frame indices and sprite keys
- **Blurry sprites:** Ensure pixel-perfect positioning and scaling
- **Atlas too large:** Split into multiple smaller atlases

### Performance Tips
- Use sprite atlases for frequently used assets
- Preload essential assets in boot scene
- Lazy load less common assets
- Monitor texture memory usage

## Future Enhancements

### Planned Features
- Automatic sprite sheet optimization
- Normal map generation integration
- Asset dependency tracking
- Hot reloading during development
- Batch processing tools

### Tool Integration
- Custom Aseprite scripts for export automation
- Tiled plugin for game-specific properties
- CI/CD integration for asset processing
- Asset validation and quality checks