# Asset slots

The app runs entirely on procedural placeholders. To upgrade any piece with a real model, drop a `.glb`
into the matching folder and list it in `manifest.json`:

```json
{
  "characters": {
    "character01": "characters/character01/character01.glb"
  },
  "models": {
    "lighting/moving-head": "lighting/moving-head/moving-head.glb"
  }
}
```

## Folders

```
characters/character01 … character10   crowd characters (see src/crowd/GlbCharacter.ts for the rig-part naming convention)
club/architecture  club/booth  club/bar  club/balcony  club/stairs
lighting/moving-head  lighting/laser  lighting/strobe  lighting/led
props/phones  props/tables  props/chairs  props/speakers  props/glassware
materials/textures  materials/environment
```

## Character GLB convention (summary)

Metres, feet on y = 0, facing +Z, pelvis near y = 0.92. Meshes named `pelvis`, `torso`, `head`, `hair`,
`upperArmL/R`, `foreArmL/R`, `thighL/R`, `shinL/R` (optional `phone`, `phoneScreen`, `cup` on the R hand).
Optional Empty nodes `pivot_neck`, `pivot_shoulderL/R`, `pivot_elbowL/R`, `pivot_hipL/R`, `pivot_kneeL/R`
place the joints; otherwise they are derived from bounding boxes. Colour = vertex colours or the material's
base colour. The crowd shader animates the parts (bounce, arms, head, legs, phone) per person.
