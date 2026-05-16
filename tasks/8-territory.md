# Task 8: Borders & Influence Expansion

## Description
Replace the current abstract influence system with a strict building-radius mechanism. Territorial expansion and building limits are driven by the placement of structures, creating natural friction between growing nations.

## Actions
- [x] **Building Influence Radius:** Every building (Castle, House, Field) projects a specific radius of ownership/influence onto the map.
- [x] **Expansion Limits:** Characters can ONLY build new structures within their nation's existing influence radius (or at the very edge of it). No room = no expansion.
- [x] **Border Clashes:** When two nations' influence radii overlap or collide, it automatically generates negative diplomatic relations or triggers border skirmishes.
- [x] **Influence Visualization:** Update the `InfluenceSystem` and WebGL shaders to clearly show the hard borders of a nation based on their buildings.