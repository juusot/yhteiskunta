# Task 9: Multi-Stack Group Hierarchy

## Description
Flesh out the 8-slot group affiliation system. Currently, the UI and logic primarily focus on the top-level Nation (Slot 0). We need to implement and visualize sub-groups (Clans, Guilds, Cults) that exist within or across Nations.

## Actions
- [ ] **Hierarchy Generation:** When spawning characters, assign them to sub-groups (e.g., Slot 1 = Clan, Slot 2 = Religion/Cult).
- [ ] **Cross-Group Dynamics:** Implement logic where sub-groups can span multiple Nations (e.g., a Cult that exists in both the Red and Blue nations).
- [ ] **Conflict Resolution:** Ensure the existing priority check (Slot 0 beats Slot 1) works correctly when a Cult leader gives an order that conflicts with a Nation leader's order.
- [ ] **UI Visualization:** Update the React UI `App.tsx` to properly display a character's nested groups and show statistics for sub-groups, not just the top 4 Nations.