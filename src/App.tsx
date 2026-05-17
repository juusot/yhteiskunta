import React, { useState, useEffect, useMemo } from 'react';

interface GroupStats {
  id: number;
  name: string;
  population: number;
  wealth: number;
  wood: number;
  gold: number;
  food: number;
  misc: number;
  buildingCount: number;
  createdAt: number;
}

interface EntityInfo {
  id: number;
  health: number;
  maxHealth: number;
  money: number;
  state: number;
  stateName: string;
  inventory: number[];
  tool: number;
  weapon: number;
  armor: number;
  positionX: number;
  positionY: number;
  groups: number[];
  effectiveDamage: number;
  effectiveSpeed: number;
  effectiveLifespan: number;
}

interface BuildingInfo {
  id: number;
  type: number;
  typeName: string;
  positionX: number;
  positionY: number;
  health: number;
  maxHealth: number;
  ownerGroup: number;
  inventory: number[];
}

interface AppProps {
  ruleRegistry: Int32Array | null;
  logicBytecode: Int32Array | null;
  groupPopulation: Int32Array | null;
  groupTotalWealth: Int32Array | null;
  groupBuildingCount: Int32Array | null;
  groupWood: Int32Array | null;
  groupGold: Int32Array | null;
  groupFood: Int32Array | null;
  groupMisc: Int32Array | null;
  tickCount: number;
  lastTickTime: number;
  avgTickTime: number;
  inspectEntity: EntityInfo | null;
  chronicle: string[];
  onFollow: () => void;
  onClearInspect: () => void;
}

const STATE_NAMES = ['Idle', 'Harvesting', 'Fleeing', 'Combat', 'Returning', 'Dead', 'Trading', 'Reporting', 'Construction'];
const BUILDING_NAMES = ['', 'Warehouse', 'House', 'Tower', 'Wall', 'Field'];
const ARCHETYPE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];

export const App: React.FC<AppProps> = ({ 
  ruleRegistry, logicBytecode, groupPopulation, groupTotalWealth, groupBuildingCount,
  groupWood, groupGold, groupFood, groupMisc,
  tickCount, lastTickTime, avgTickTime, inspectEntity, chronicle,
  onFollow, onClearInspect
}) => {
  const [activeTab, setActiveTab] = useState<'groups' | 'characters' | 'buildings' | 'rules'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<number | -1>(-1);
  const [brushActive, setBrushActive] = useState(false);
  const [brushGroupId, setBrushGroupId] = useState(0);
  const [brushTrait, setBrushTrait] = useState(0);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    (window as any).brushState = { active: brushActive, groupId: brushGroupId, trait: brushTrait };
  }, [brushActive, brushGroupId, brushTrait]);

  const groups = useMemo(() => {
    const result: GroupStats[] = [];
    for (let i = 0; i < 100; i++) {
      const pop = groupPopulation?.[i] || 0;
      const bldCount = groupBuildingCount?.[i] || 0;
      if (pop > 0 || bldCount > 0 || i < 4) {
        result.push({
          id: i,
          name: (window as any).groupNames?.[i] || `Group ${i}`,
          population: pop,
          wealth: groupTotalWealth?.[i] || 0,
          wood: groupWood?.[i] || 0,
          gold: groupGold?.[i] || 0,
          food: groupFood?.[i] || 0,
          misc: groupMisc?.[i] || 0,
          buildingCount: bldCount,
          createdAt: 0
        });
      }
    }
    return result;
  }, [tickCount, groupPopulation, groupTotalWealth, groupBuildingCount, groupWood, groupGold, groupFood, groupMisc]);

  const selectedGroup = useMemo(() => {
    if (selectedGroupId === null) return null;
    return groups.find(g => g.id === selectedGroupId) || null;
  }, [selectedGroupId, groups]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groups;
    const term = searchTerm.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(term) || g.id.toString() === term);
  }, [groups, searchTerm]);

  const groupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    const members: EntityInfo[] = [];
    if ((window as any).S && (window as any).S.state) {
      const S = (window as any).S;
      const maxEntities = 100000;
      for (let i = 0; i < maxEntities; i++) {
        if (S.state[i] === 5) continue;
        for (let slot = 0; slot < 8; slot++) {
          if (S.groupAffiliations[i * 10 + slot] === selectedGroup.id) {
            members.push({
              id: i,
              health: S.health[i] || 0,
              maxHealth: 100,
              money: S.money[i] || 0,
              state: S.state[i] || 0,
              stateName: STATE_NAMES[S.state[i]] || 'Unknown',
              inventory: [],
              tool: S.charTool?.[i] || 0,
              weapon: S.charWeapon?.[i] || 0,
              armor: S.charArmor?.[i] || 0,
              positionX: S.positionX?.[i] || 0,
              positionY: S.positionY?.[i] || 0,
groups: Array.from(S.groupAffiliations.slice(i * 10, i * 10 + 10) as unknown as number[]).filter(g => g !== -1),
              effectiveDamage: S.effectiveDamage?.[i] || 10,
              effectiveSpeed: S.effectiveSpeed?.[i] || 1,
              effectiveLifespan: S.effectiveLifespan?.[i] || 80
            });
            break;
          }
        }
      }
    }
    return members;
  }, [selectedGroup, tickCount]);

  const entities = useMemo(() => {
    const result: EntityInfo[] = [];
    const S = (window as any).S;
    if (!S?.state) return result;
    const maxEntities = 100000;
    for (let i = 0; i < maxEntities; i++) {
      if (S.state[i] === 5) continue;
        result.push({
          id: i,
          health: S.health[i] || 0,
          maxHealth: 100,
          money: S.money[i] || 0,
          state: S.state[i] || 0,
          stateName: STATE_NAMES[S.state[i]] || 'Unknown',
          inventory: [],
          tool: S.charTool?.[i] || 0,
          weapon: S.charWeapon?.[i] || 0,
          armor: S.charArmor?.[i] || 0,
          positionX: S.positionX?.[i] || 0,
          positionY: S.positionY?.[i] || 0,
groups: Array.from(S.groupAffiliations.slice(i * 10, i * 10 + 10) as unknown as number[]).filter(g => g !== -1),
            effectiveDamage: S.effectiveDamage?.[i] || 10,
          effectiveSpeed: S.effectiveSpeed?.[i] || 1,
          effectiveLifespan: S.effectiveLifespan?.[i] || 80
        });
        if (result.length >= 500) break;
      }
    return result;
  }, [tickCount]);

  const filteredEntities = useMemo(() => {
    let result = entities;
    if (filterState !== -1) {
      result = result.filter(e => e.state === filterState);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e => e.id.toString() === term || e.groups.some(g => g.toString() === term));
    }
    return result;
  }, [entities, filterState, searchTerm]);

  const selectedEntity = useMemo(() => {
    if (selectedEntityId === null) return inspectEntity;
    return entities.find(e => e.id === selectedEntityId) || inspectEntity;
  }, [selectedEntityId, inspectEntity, entities]);

  const buildings = useMemo(() => {
    const result: BuildingInfo[] = [];
    if ((window as any).S && (window as any).S.bldType) {
      const S = (window as any).S;
      for (let i = 0; i < 20000; i++) {
        if (S.bldType[i] === 0) continue;
        result.push({
          id: i,
          type: S.bldType[i],
          typeName: BUILDING_NAMES[S.bldType[i]] || 'Unknown',
          positionX: S.bldPositionX?.[i] || 0,
          positionY: S.bldPositionY?.[i] || 0,
          health: S.bldHealth[i] || 0,
          maxHealth: 1000,
          ownerGroup: S.bldOwnerGroup[i] || -1,
          inventory: []
        });
        if (result.length >= 200) break;
      }
    }
    return result;
  }, [tickCount]);

  const filteredBuildings = useMemo(() => {
    let result = buildings;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b => b.id.toString() === term || b.typeName.toLowerCase().includes(term));
    }
    return result;
  }, [buildings, searchTerm]);

  const selectedBuilding = useMemo(() => {
    if (selectedBuildingId === null) return null;
    return buildings.find(b => b.id === selectedBuildingId) || null;
  }, [selectedBuildingId, buildings]);

  const handleEntityClick = (id: number) => {
    setSelectedEntityId(id);
    (window as any).selectEntity?.(id);
  };

  const handleGroupClick = (id: number) => {
    setSelectedGroupId(id);
  };

  const handleBuildingClick = (id: number) => {
    setSelectedBuildingId(id);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 text-gray-900 font-sans text-sm">
      <div className="flex border-b border-gray-300 bg-white">
        {(['groups', 'characters', 'buildings', 'rules'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-xs uppercase tracking-wide transition-colors ${
              activeTab === tab 
                ? 'bg-gray-900 text-white border-b-2 border-gray-900' 
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Monitor Section - Always Visible */}
      <div className="border-b border-gray-300 bg-gray-100 p-2 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex gap-3">
            <span><span className="text-gray-500">Pop:</span> <span className="font-medium">{groups.reduce((a,g) => a + g.population, 0).toLocaleString()}</span></span>
            <span><span className="text-gray-500">Tick:</span> <span className="font-medium">{tickCount}</span></span>
            <span><span className="text-gray-500">Last:</span> <span className="font-medium">{lastTickTime.toFixed(1)}ms</span></span>
            <span><span className="text-gray-500">Avg:</span> <span className="font-medium">{avgTickTime.toFixed(1)}ms</span></span>
          </div>
        </div>
        
        {inspectEntity && (
          <div className="bg-white rounded border border-gray-300 p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs">Inspect: Entity {inspectEntity.id}</span>
              <span className="text-xs text-gray-500">{inspectEntity.stateName}</span>
              <span className="text-xs">HP: {inspectEntity.health}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={onFollow} className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded">Follow</button>
              <button onClick={onClearInspect} className="px-2 py-0.5 bg-gray-400 text-white text-xs rounded">Clear</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded border border-gray-300 p-2 max-h-24 overflow-y-auto">
          <div className="text-xs font-medium text-gray-600 mb-1">Chronicle</div>
          {chronicle.length > 0 ? (
            chronicle.slice(-10).map((line, i) => (
              <div key={i} className="text-[10px] text-gray-700 border-b border-gray-100 last:border-0">{line}</div>
            ))
          ) : (
            <div className="text-[10px] text-gray-400 italic">No events</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'groups' && (
          <>
            <div className="w-1/3 border-r border-gray-300 flex flex-col bg-white">
              <div className="p-3 border-b border-gray-200">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search groups..."
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="p-2 border-b border-gray-200 bg-gray-50">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (newGroupName.trim() && (window as any).createGroup) {
                        (window as any).createGroup(newGroupName.trim());
                        setNewGroupName('');
                      }
                    }}
                    className="px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-700"
                  >
                    + Create Group
                  </button>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredGroups.map(g => (
                  <div
                    key={g.id}
                    onClick={() => handleGroupClick(g.id)}
                    className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedGroupId === g.id ? 'bg-gray-100 border-l-4 border-l-gray-900' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: ARCHETYPE_COLORS[g.id % 4] }}
                        />
                        <span className="font-medium">{g.name}</span>
                        <span className="text-gray-400 text-xs">ID: {g.id}</span>
                      </div>
                      <span className="text-xs text-gray-500">{g.population} pop</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Wealth: {g.wealth.toLocaleString()} · {g.buildingCount} buildings
                    </div>
                  </div>
                ))}
                {filteredGroups.length === 0 && (
                  <div className="p-4 text-center text-gray-400 text-sm">No groups found</div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selectedGroup ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div 
                        className="w-8 h-8 rounded-full" 
                        style={{ backgroundColor: ARCHETYPE_COLORS[selectedGroup.id % 4] }}
                      />
                      <div>
                        <h2 className="text-lg font-semibold">{selectedGroup.name}</h2>
                        <p className="text-xs text-gray-500">Group ID: {selectedGroup.id}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Population:</span> {selectedGroup.population}</div>
                      <div><span className="text-gray-500">Buildings:</span> {selectedGroup.buildingCount}</div>
                      <div><span className="text-gray-500">Wealth:</span> {selectedGroup.wealth.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Resources</h3>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center p-2 bg-amber-50 rounded">
                        <div className="text-lg font-semibold text-amber-700">{selectedGroup.wood}</div>
                        <div className="text-xs text-amber-600">Wood</div>
                      </div>
                      <div className="text-center p-2 bg-yellow-50 rounded">
                        <div className="text-lg font-semibold text-yellow-700">{selectedGroup.gold}</div>
                        <div className="text-xs text-yellow-600">Gold</div>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded">
                        <div className="text-lg font-semibold text-green-700">{selectedGroup.food}</div>
                        <div className="text-xs text-green-600">Food</div>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded">
                        <div className="text-lg font-semibold text-gray-700">{selectedGroup.misc}</div>
                        <div className="text-xs text-gray-500">Misc</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">
                      Members ({groupMembers.length})
                    </h3>
                    <div className="max-h-64 overflow-y-auto">
                      {groupMembers.slice(0, 50).map(m => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setActiveTab('characters');
                            setSelectedEntityId(m.id);
                          }}
                          className="flex items-center justify-between p-2 hover:bg-gray-50 cursor-pointer rounded"
                        >
                          <div>
                            <span className="font-medium">Entity {m.id}</span>
                            <span className="text-xs text-gray-500 ml-2">{m.stateName}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            HP: {m.health}
                          </div>
                        </div>
                      ))}
                      {groupMembers.length === 0 && (
                        <div className="text-gray-400 text-sm text-center py-2">No members</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const eid = prompt('Entity ID:');
                          const slot = prompt('Slot (0-7):');
                          if (eid && slot && (window as any).assignToGroup) {
                            (window as any).assignToGroup(parseInt(eid), selectedGroup.id, parseInt(slot));
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Assign Member
                      </button>
                      <button
                        onClick={() => {
                          const evt = prompt('Event (99=attack, 100=move, 101=recruit):');
                          if (evt && (window as any).sendEvent) {
                            (window as any).sendEvent(selectedGroup.id, parseInt(evt));
                          }
                        }}
                        className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
                      >
                        Send Event
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Select a group to view details
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'characters' && (
          <>
            <div className="w-1/3 border-r border-gray-300 flex flex-col bg-white">
              <div className="p-3 border-b border-gray-200">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by ID or group..."
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="p-2 border-b border-gray-200 bg-gray-50">
                <select
                  value={filterState}
                  onChange={(e) => setFilterState(parseInt(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value={-1}>All States</option>
                  {STATE_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredEntities.map(e => (
                  <div
                    key={e.id}
                    onClick={() => handleEntityClick(e.id)}
                    className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedEntityId === e.id ? 'bg-gray-100 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">Entity {e.id}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                          e.state === 3 ? 'bg-red-100 text-red-700' :
                          e.state === 1 ? 'bg-green-100 text-green-700' :
                          e.state === 0 ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {e.stateName}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">HP: {e.health}</div>
                    </div>
                    {e.groups.length > 0 && (
                      <div className="mt-1 text-xs text-gray-400">
                        Groups: {e.groups.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
                {filteredEntities.length === 0 && (
                  <div className="p-4 text-center text-gray-400 text-sm">No entities found</div>
                )}
              </div>
              <div className="p-2 border-t border-gray-200 text-xs text-gray-500 text-center">
                Showing {filteredEntities.length} entities
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selectedEntity ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold">Entity {selectedEntity.id}</h2>
                      <span className={`text-xs px-2 py-1 rounded ${
                        selectedEntity.state === 3 ? 'bg-red-100 text-red-700' :
                        selectedEntity.state === 1 ? 'bg-green-100 text-green-700' :
                        selectedEntity.state === 0 ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {selectedEntity.stateName}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Position:</span>{' '}
                        ({Math.round(selectedEntity.positionX)}, {Math.round(selectedEntity.positionY)})
                      </div>
                      <div>
                        <span className="text-gray-500">Money:</span> {selectedEntity.money}
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm">Health:</span>
                        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${(selectedEntity.health / selectedEntity.maxHealth) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm">{selectedEntity.health}/{selectedEntity.maxHealth}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Stats</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-gray-50 rounded">
                        <div className="text-xl font-semibold">{selectedEntity.effectiveDamage}</div>
                        <div className="text-xs text-gray-500">Damage</div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded">
                        <div className="text-xl font-semibold">{selectedEntity.effectiveSpeed.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Speed</div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded">
                        <div className="text-xl font-semibold">{selectedEntity.effectiveLifespan}</div>
                        <div className="text-xs text-gray-500">Lifespan</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Equipment</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs">Weapon</div>
                        <div className="font-medium">Level {selectedEntity.weapon}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Armor</div>
                        <div className="font-medium">Level {selectedEntity.armor}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Tool</div>
                        <div className="font-medium">{
                          selectedEntity.tool === 0 ? 'Wood' :
                          selectedEntity.tool === 1 ? 'Gold' :
                          selectedEntity.tool === 2 ? 'Food' :
                          selectedEntity.tool === 3 ? 'Misc' : 'None'
                        }</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">
                      Group Affiliations (8 slots)
                    </h3>
                    <div className="space-y-1">
                      {Array.from({ length: 8 }).map((_, slot) => {
                        const groupId = selectedEntity.groups[slot] ?? -1;
                        const isPrimary = slot === 0;
                        return (
                          <div 
                            key={slot}
                            className={`flex items-center justify-between p-2 rounded ${
                              isPrimary ? 'bg-gray-900 text-white' : 'bg-gray-50'
                            }`}
                          >
                            <span className="text-xs font-medium">Slot {slot}{isPrimary ? ' (Primary)' : ''}</span>
                            <span className="text-sm">
                              {groupId !== -1 ? (
                                <span 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => {
                                    setActiveTab('groups');
                                    setSelectedGroupId(groupId);
                                  }}
                                >
                                  Group {groupId}
                                </span>
                              ) : (
                                <span className="text-gray-400">Empty</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={onFollow}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Follow
                      </button>
                      <button
                        onClick={onClearInspect}
                        className="px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                      >
                        Clear Selection
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Kill this entity?')) {
                            (window as any).killEntity?.(selectedEntity.id);
                          }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                      >
                        Kill
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Select an entity to view details
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'buildings' && (
          <>
            <div className="w-1/3 border-r border-gray-300 flex flex-col bg-white">
              <div className="p-3 border-b border-gray-200">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search buildings..."
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredBuildings.map(b => (
                  <div
                    key={b.id}
                    onClick={() => handleBuildingClick(b.id)}
                    className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedBuildingId === b.id ? 'bg-gray-100 border-l-4 border-l-green-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.typeName}</span>
                        <span className="text-gray-400 text-xs">ID: {b.id}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Owner: Group {b.ownerGroup} · HP: {b.health}
                    </div>
                  </div>
                ))}
                {filteredBuildings.length === 0 && (
                  <div className="p-4 text-center text-gray-400 text-sm">No buildings found</div>
                )}
              </div>
              <div className="p-2 border-t border-gray-200 text-xs text-gray-500 text-center">
                {filteredBuildings.length} buildings
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selectedBuilding ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold">{selectedBuilding.typeName}</h2>
                      <span className="text-gray-500 text-sm">ID: {selectedBuilding.id}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Position:</span>{' '}
                        ({Math.round(selectedBuilding.positionX)}, {Math.round(selectedBuilding.positionY)})
                      </div>
                      <div>
                        <span className="text-gray-500">Owner:</span>{' '}
                        <span 
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setActiveTab('groups');
                            setSelectedGroupId(selectedBuilding.ownerGroup);
                          }}
                        >
                          Group {selectedBuilding.ownerGroup}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm">Health:</span>
                        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${(selectedBuilding.health / selectedBuilding.maxHealth) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm">{selectedBuilding.health}/{selectedBuilding.maxHealth}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-700 mb-3">Influence</h3>
                    <div className="text-sm">
                      {selectedBuilding.type === 1 && <span className="text-blue-600">Radius: 200 units (Warehouse)</span>}
                      {selectedBuilding.type === 2 && <span className="text-purple-600">Radius: 80 units (House)</span>}
                      {selectedBuilding.type === 3 && <span className="text-red-600">Radius: 150 units (Tower)</span>}
                      {selectedBuilding.type === 4 && <span className="text-gray-600">No influence (Wall)</span>}
                      {selectedBuilding.type === 5 && <span className="text-green-600">No influence (Field)</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Select a building to view details
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'rules' && (
          <RulesTab ruleRegistry={ruleRegistry} logicBytecode={logicBytecode} />
        )}
      </div>

      <div className="bg-gray-100 p-3 border-t border-gray-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">
              Tick: {tickCount} | Last: {lastTickTime.toFixed(1)}ms | Avg: {avgTickTime.toFixed(1)}ms
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Brush:</label>
            <button 
              onClick={() => setBrushActive(!brushActive)}
              className={`px-2 py-1 text-xs rounded ${
                brushActive ? 'bg-green-600 text-white' : 'bg-white border border-gray-300'
              }`}
            >
              {brushActive ? 'ON' : 'OFF'}
            </button>
            {brushActive && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={brushGroupId}
                  onChange={(e) => setBrushGroupId(parseInt(e.target.value))}
                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                  placeholder="Group"
                />
                <select
                  value={brushTrait}
                  onChange={(e) => setBrushTrait(parseInt(e.target.value))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded"
                >
                  <option value={0}>NONE</option>
                  <option value={1}>TREE</option>
                  <option value={2}>AGGRO</option>
                  <option value={4}>SCOUT</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const RulesTab: React.FC<{ ruleRegistry: Int32Array | null; logicBytecode: Int32Array | null }> = ({ ruleRegistry, logicBytecode }) => {
  const [rules, setRules] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!ruleRegistry || !logicBytecode) return;
    const newRules = [];
    for (let i = 0; i < 20; i++) {
      const base = i * 10;
      const nodes: any[] = [];
      if (ruleRegistry[base + 2] === 255) {
        const lBase = i * 32;
        for (let j = 0; j < 32; j++) {
          const op = logicBytecode[lBase + j];
          if (op === 255) break;
          if (op === 0 || op === 1) nodes.push({ op, val: logicBytecode[lBase + ++j] });
          else if (op === 2) nodes.push({ op, val: logicBytecode[lBase + ++j], val2: logicBytecode[lBase + ++j] });
          else if (op === 3) nodes.push({ op, val: logicBytecode[lBase + ++j], val2: logicBytecode[lBase + ++j], val3: logicBytecode[lBase + ++j] });
          else nodes.push({ op, val: 0 });
        }
      }
      newRules.push({
        index: i,
        subjectId: ruleRegistry[base + 1],
        conditionType: ruleRegistry[base + 2],
        threshold: ruleRegistry[base + 3],
        actionState: ruleRegistry[base + 4],
        targetX: ruleRegistry[base + 5],
        targetY: ruleRegistry[base + 6],
        enabled: ruleRegistry[base + 7] === 1,
        nodes
      });
    }
    setRules(newRules);
  }, [ruleRegistry, logicBytecode]);

  const compileRule = (ruleIdx: number, nodes: any[]) => {
    if (!logicBytecode) return;
    const base = ruleIdx * 32;
    let ptr = 0;
    for (const n of nodes) {
      logicBytecode[base + ptr++] = n.op;
      if (n.op === 0 || n.op === 1) logicBytecode[base + ptr++] = n.val;
      else if (n.op === 2) { logicBytecode[base + ptr++] = n.val; logicBytecode[base + ptr++] = n.val2 || 0; }
      else if (n.op === 3) { logicBytecode[base + ptr++] = n.val; logicBytecode[base + ptr++] = n.val2 || 0; logicBytecode[base + ptr++] = n.val3 || 0; }
    }
    while (ptr < 32) logicBytecode[base + ptr++] = 255;
  };

  const updateRule = (index: number, field: string, value: any) => {
    if (!ruleRegistry) return;
    const base = index * 8;
    switch (field) {
      case 'subjectId': ruleRegistry[base + 1] = value; break;
      case 'conditionType': ruleRegistry[base + 2] = value; break;
      case 'threshold': ruleRegistry[base + 3] = value; break;
      case 'actionState': ruleRegistry[base + 4] = value; break;
      case 'targetX': ruleRegistry[base + 5] = value; break;
      case 'targetY': ruleRegistry[base + 6] = value; break;
      case 'enabled': ruleRegistry[base + 7] = value ? 1 : 0; break;
      case 'nodes': compileRule(index, value); break;
    }
    setRules(prev => prev.map(r => r.index === index ? { ...r, [field]: value } : r));
  };

  const filteredRules = searchTerm 
    ? rules.filter((_, i) => i.toString() === searchTerm || rules[i].subjectId.toString() === searchTerm)
    : rules;

  return (
    <div className="w-full p-4 overflow-y-auto">
      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search rules by index or group ID..."
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
        />
      </div>
      <div className="space-y-3">
        {filteredRules.map(r => (
          <div key={r.index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Rule #{r.index}</span>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateRule(r.index, 'enabled', e.target.checked)}
                  className="accent-gray-900"
                />
              </div>
              <div className="text-xs text-gray-500">Subject Group: {r.subjectId}</div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
              <div>
                <label className="block text-gray-500">Action</label>
                <select
                  value={r.actionState}
                  onChange={(e) => updateRule(r.index, 'actionState', parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-1"
                >
                  <option value={1}>Harvest</option>
                  <option value={2}>Flee</option>
                  <option value={3}>Combat</option>
                  <option value={4}>Return</option>
                  <option value={6}>Trade</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-500">Threshold</label>
                <input
                  type="number"
                  value={r.threshold}
                  onChange={(e) => updateRule(r.index, 'threshold', parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-1"
                />
              </div>
              <div>
                <label className="block text-gray-500">Target X</label>
                <input
                  type="number"
                  value={r.targetX}
                  onChange={(e) => updateRule(r.index, 'targetX', parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-1"
                />
              </div>
              <div>
                <label className="block text-gray-500">Target Y</label>
                <input
                  type="number"
                  value={r.targetY}
                  onChange={(e) => updateRule(r.index, 'targetY', parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded px-1"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {r.nodes.map((n: any, ni: number) => (
                <div key={ni} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                  <span className="font-medium">
                    {n.op === 0 ? 'POP>' : n.op === 1 ? 'W<' : n.op === 2 ? 'REL<' : n.op === 3 ? 'DIST>' : '?'}
                  </span>
                  <input
                    type="number"
                    value={n.val}
                    onChange={(e) => {
                      const next = [...r.nodes]; next[ni] = { ...next[ni], val: parseInt(e.target.value) };
                      updateRule(r.index, 'nodes', next);
                    }}
                    className="w-12 border border-gray-300 rounded px-1"
                  />
                  <button
                    onClick={() => {
                      const next = r.nodes.filter((_: any, i: number) => i !== ni);
                      updateRule(r.index, 'nodes', next);
                    }}
                    className="text-red-500 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => updateRule(r.index, 'nodes', [...r.nodes, { op: 0, val: 0 }])}
                className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
              >
                + Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;