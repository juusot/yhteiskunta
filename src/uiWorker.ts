import * as S from "./simulation/state";
import * as C from "./simulation/constants";

/**
 * UI Worker: Extracts entity data from SharedArrayBuffers in the background
 * to prevent blocking the main React thread.
 */

self.onmessage = (e: MessageEvent) => {
  const { type, payload, buffers } = e.data;

  if (type === "INIT") {
    if (buffers) {
      S.mapStateBuffers(buffers);
      console.log("UI Worker: Buffers mapped successfully.");
    }
    return;
  }

  if (type === "FETCH_ENTITIES") {
    const { offset, limit } = payload || { offset: 0, limit: 50 };
    const localArray = [];

    // Safety check for uninitialized buffers
    if (!S.state || !S.positionX) {
      self.postMessage({ type: "ENTITIES_PAYLOAD", data: [] });
      return;
    }

    const end = Math.min(offset + limit, C.MAX_ENTITIES);

    try {
      for (let i = offset; i < end; i++) {
        // Skip dead entities
        if (S.state[i] === C.EntityState.Dead) continue;

        // Push minimal required data for UI rendering
        localArray.push({
          id: i,
          x: S.positionX[i],
          y: S.positionY[i],
          health: S.health[i],
          faction: S.groupAffiliations[i * C.MAX_GROUP_CHANNELS], // Primary group affiliation
          state: S.state[i],
        });
      }

      self.postMessage({ type: "ENTITIES_PAYLOAD", data: localArray });
    } catch (err) {
      console.error("UI Worker: Error extracting entity data", err);
      self.postMessage({ type: "ENTITIES_PAYLOAD", data: [] });
    }
  }

  if (type === "HOVER_QUERY") {
    const { x, y, radius, screenX, screenY } = payload;

    if (!S.spatialHead) return;

    const cellX = Math.max(
      0,
      Math.min(C.GRID_COLS - 1, Math.floor(x / C.GRID_SIZE)),
    );
    const cellY = Math.max(
      0,
      Math.min(C.GRID_ROWS - 1, Math.floor(y / C.GRID_SIZE)),
    );
    const cellIndex = cellY * C.GRID_COLS + cellX;

    let closestId = -1;
    let closestType = "";
    let closestDesc = "";
    let minDistSq = radius * radius;

    // 1. Check Buildings
    let bldId = S.bldSpatialHead[cellIndex];
    while (bldId !== -1) {
      const dx = S.bldPositionX[bldId] - x;
      const dy = S.bldPositionY[bldId] - y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestId = bldId;
        closestType = "Building";
        const types = ["", "Warehouse", "House", "Tower", "Wall", "Field"];
        const typeName = types[S.bldType[bldId]] || "Unknown";
        closestDesc = `${typeName} | HP: ${S.bldHealth[bldId]} | Owner: Grp ${S.bldOwnerGroup[bldId]}`;
      }
      bldId = S.bldSpatialNext[bldId];
    }

    // 2. Check Characters (Entities)
    let entId = S.spatialHead[cellIndex];
    while (entId !== -1) {
      const dx = S.positionX[entId] - x;
      const dy = S.positionY[entId] - y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestId = entId;
        closestType = "Character";
        closestDesc = `Entity ${entId} | HP: ${S.health[entId]} | Faction: ${S.groupAffiliations[entId * C.MAX_GROUP_CHANNELS]}`;
      }
      entId = S.spatialNext[entId];
    }

    if (closestId !== -1) {
      self.postMessage({
        type: "HOVER_RESULT",
        data: {
          id: closestId,
          entityType: closestType,
          desc: closestDesc,
          screenX,
          screenY,
        },
      });
    } else {
      self.postMessage({ type: "HOVER_RESULT", data: null });
    }
  }
};
