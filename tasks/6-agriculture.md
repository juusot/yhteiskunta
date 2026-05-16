# Task 6: Agriculture & Sustenance

## Description
Currently, characters do not prioritize food, resulting in groups having 0 food. We need to fix the AI harvesting priorities, make food a strict requirement for survival and growth, and introduce Fields as permanent food sources.

## Actions
- [ ] **Food AI Priority:** Update the `AutonomySystem` so characters prioritize harvesting food (bushes/fields) when the group's food reserves drop below a critical threshold.
- [ ] **Food Consumption:** Ensure `SummarySystem` properly deducts Food (not just general wealth/gold) for population maintenance.
- [ ] **Agriculture (Fields):** 
  - Add `BuildingType.Field`.
  - Characters should build Fields near their village when food is scarce and wild bushes are depleted.
  - Fields do not disappear when harvested, providing a permanent but labor-intensive food source.