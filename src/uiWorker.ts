import * as S from './simulation/state';
import * as C from './simulation/constants';

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
                    faction: S.groupAffiliations[i * 10], // Primary group affiliation
                    state: S.state[i]
                });
            }
            
            self.postMessage({ type: "ENTITIES_PAYLOAD", data: localArray });
        } catch (err) {
            console.error("UI Worker: Error extracting entity data", err);
            self.postMessage({ type: "ENTITIES_PAYLOAD", data: [] });
        }
    }
};
