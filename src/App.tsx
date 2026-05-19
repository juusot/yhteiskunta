import React, { useState, useEffect, useMemo } from 'react';
import { BrutalButton, BrutalWindow, BrutalTab, BrutalTable } from './components/BrutalUI';

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
  name: string;
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
  uiWorker: Worker;
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
  uiWorker, ruleRegistry, logicBytecode, groupPopulation, groupTotalWealth, groupBuildingCount,
  groupWood, groupGold, groupFood, groupMisc,
  tickCount, lastTickTime, avgTickTime, inspectEntity, chronicle,
  onFollow, onClearInspect
}) => {
  const [isWindowOpen, setIsWindowOpen] = useState(false);
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
  const [selectedArchetype, setSelectedArchetype] = useState(1);
  const [tpsSpeed, setTpsSpeed] = useState(60);
  const [isPaused, setIsPaused] = useState(false);

  const [visibleEntities, setVisibleEntities] = useState<any[]>([]);

  useEffect(() => {
    (window as any).brushState = { active: brushActive, groupId: brushGroupId, trait: brushTrait };
  }, [brushActive, brushGroupId, brushTrait]);

  useEffect(() => {
    document.body.dataset.uiOpen = isWindowOpen ? 'true' : 'false';
  }, [isWindowOpen]);

  // UI Worker Communication
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === "ENTITIES_PAYLOAD") {
        setVisibleEntities(e.data.data);
      }
    };
    uiWorker.addEventListener('message', handleMessage);
    return () => uiWorker.removeEventListener('message', handleMessage);
  }, [uiWorker]);

  // Throttled Polling for Entity Data
  useEffect(() => {
    const interval = setInterval(() => {
      uiWorker.postMessage({ 
        type: "FETCH_ENTITIES", 
        payload: { offset: 0, limit: 50 } 
      });
    }, 250);
    return () => clearInterval(interval);
  }, [uiWorker]);

  // Sync selection state with inspectEntity (without auto-opening window)
  useEffect(() => {
    if (inspectEntity) {
      setSelectedEntityId(inspectEntity.id);
    }
  }, [inspectEntity]);

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

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groups;
    const term = searchTerm.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(term) || g.id.toString() === term);
  }, [groups, searchTerm]);

  const selectedGroup = useMemo(() => {
    if (selectedGroupId === null) return null;
    return groups.find(g => g.id === selectedGroupId) || null;
  }, [selectedGroupId, groups]);

  const groupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return visibleEntities
      .filter(e => e.faction === selectedGroup.id)
      .map(e => ({
        ...e,
        name: `Entity ${e.id}`,
        stateName: STATE_NAMES[e.state] || 'Unknown',
        maxHealth: 100,
        money: 0,
        inventory: [],
        tool: 0,
        weapon: 0,
        armor: 0,
        positionX: e.x,
        positionY: e.y,
        groups: [e.faction].filter(g => g !== -1),
        effectiveDamage: 10,
        effectiveSpeed: 1,
        effectiveLifespan: 80
      } as EntityInfo));
  }, [selectedGroup, visibleEntities]);

  const filteredEntities = useMemo(() => {
    let result = visibleEntities.map(e => ({
      ...e,
      name: `Entity ${e.id}`,
      stateName: STATE_NAMES[e.state] || 'Unknown',
      groups: [e.faction].filter(g => g !== -1)
    }));

    if (filterState !== -1) {
      result = result.filter(e => e.state === filterState);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e => e.id.toString() === term || e.groups.some(g => g.toString() === term));
    }
    return result;
  }, [visibleEntities, filterState, searchTerm]);

  const selectedEntity = useMemo(() => {
    if (selectedEntityId === null) return inspectEntity;
    const found = visibleEntities.find(e => e.id === selectedEntityId);
    if (found) {
        return {
            ...found,
            name: `Entity ${found.id}`,
            stateName: STATE_NAMES[found.state] || 'Unknown',
            maxHealth: 100,
            money: 0,
            inventory: [],
            tool: 0,
            weapon: 0,
            armor: 0,
            positionX: found.x,
            positionY: found.y,
            groups: [found.faction].filter(g => g !== -1),
            effectiveDamage: 10,
            effectiveSpeed: 1,
            effectiveLifespan: 80
        } as EntityInfo;
    }
    return inspectEntity;
  }, [selectedEntityId, inspectEntity, visibleEntities]);

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

  const handleSpeedClick = (speed: number, id: string) => {
    setTpsSpeed(speed);
    document.getElementById(id)?.click();
  };

  const handlePauseToggle = () => {
    setIsPaused(!isPaused);
    document.getElementById('btn-toggle-loop')?.click();
  };

  const gameDay = Math.floor(tickCount / 3600) % 30 + 1;
  const gameMonth = Math.floor(tickCount / (3600 * 30)) % 12 + 1;
  const gameYear = Math.floor(tickCount / (3600 * 30 * 12)) + 1;

  const totalPop = groups.reduce((a, g) => a + g.population, 0);

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      {/* TopAppBar */}
      <header className="bg-surface-container-lowest text-on-surface flex justify-between items-center w-full px-margin-lg py-unit h-16 border-b-4 border-on-surface shadow-brutal z-50 pointer-events-auto">
        <div className="flex items-center gap-4">
          <div className="border-2 border-on-surface px-4 py-2 bg-surface font-mono text-[13px] font-bold">
            Day {gameDay}, Month {gameMonth}, Year {gameYear}
          </div>
          <div className="bg-secondary-container text-on-secondary-container px-4 py-1 border-2 border-on-surface font-headline text-[24px] font-bold shadow-brutal-sm">
            POLMAP
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <BrutalButton onClick={() => handleSpeedClick(60, 'btn-speed-1')} active={tpsSpeed === 60}>1X</BrutalButton>
            <BrutalButton onClick={() => handleSpeedClick(120, 'btn-speed-2')} active={tpsSpeed === 120}>2X</BrutalButton>
            <BrutalButton onClick={() => handleSpeedClick(240, 'btn-speed-4')} active={tpsSpeed === 240}>4X</BrutalButton>
            <BrutalButton onClick={() => handleSpeedClick(480, 'btn-speed-8')} active={tpsSpeed === 480}>8X</BrutalButton>
            <BrutalButton onClick={() => handleSpeedClick(0, 'btn-speed-max')} active={tpsSpeed === 0}>MAX</BrutalButton>
          </div>
          <BrutalButton variant="primary" onClick={handlePauseToggle} className="w-10 h-10 p-0">
            <span className="material-symbols-outlined font-bold">
              {isPaused ? 'play_arrow' : 'pause'}
            </span>
          </BrutalButton>
          <BrutalButton variant="primary" onClick={() => document.getElementById('saveBtn')?.click()}>SAVE</BrutalButton>
          <BrutalButton onClick={() => document.getElementById('loadBtn')?.click()}>LOAD</BrutalButton>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
        {isWindowOpen && (
          <BrutalWindow 
            title="Inspector" 
            onClose={() => { setIsWindowOpen(false); onClearInspect(); }}
            tabs={
              <div className="flex">
                <BrutalTab active={activeTab === 'groups'} onClick={() => setActiveTab('groups')}>Groups</BrutalTab>
                <BrutalTab active={activeTab === 'characters'} onClick={() => setActiveTab('characters')}>Characters</BrutalTab>
                <BrutalTab active={activeTab === 'buildings'} onClick={() => setActiveTab('buildings')}>Buildings</BrutalTab>
                <BrutalTab active={activeTab === 'rules'} onClick={() => setActiveTab('rules')}>Rules</BrutalTab>
              </div>
            }
            footer={
              <>
                <div className="flex gap-6">
                  <span>Pop: <strong className="text-on-surface">{totalPop.toLocaleString()}</strong></span>
                  <span>Tick: <strong className="text-on-surface">{tickCount}</strong></span>
                  <span>Last: <strong>{lastTickTime.toFixed(1)}ms</strong></span>
                  <span>Avg: <strong>{avgTickTime.toFixed(1)}ms</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  Brush: <span className={`bg-surface border border-on-surface px-2 text-on-surface font-bold ${brushActive ? 'bg-primary-container' : ''}`}>{brushActive ? 'ON' : 'OFF'}</span>
                </div>
              </>
            }
          >
            <div className="flex flex-1 overflow-hidden text-on-surface">
              {/* Left Panel: List */}
              <div className="w-1/3 border-r-2 border-on-surface bg-surface flex flex-col overflow-hidden">
                <div className="p-4 border-b border-surface-variant flex flex-col gap-2">
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={`Search ${activeTab}...`}
                    className="w-full bg-surface border border-on-surface px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-2 focus:border-on-surface text-on-surface"
                  />
                  {activeTab === 'characters' && (
                    <select 
                      value={filterState}
                      onChange={(e) => setFilterState(parseInt(e.target.value))}
                      className="w-full bg-surface border border-on-surface px-2 py-1 font-mono text-[11px] text-on-surface"
                    >
                      <option value={-1}>All States</option>
                      {STATE_NAMES.map((name, i) => (
                        <option key={i} value={i}>{name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {activeTab === 'groups' && filteredGroups.map(g => (
                    <div 
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`p-4 border-b border-surface-variant cursor-pointer hover:bg-surface-container-low border-l-4 ${selectedGroupId === g.id ? 'bg-surface-container-highest border-l-primary-container' : 'border-l-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-on-surface" style={{ backgroundColor: ARCHETYPE_COLORS[g.id % 4] }}></div>
                          <span className="font-headline text-[18px] font-bold">{g.name}</span>
                        </div>
                        <span className="font-mono text-[13px] text-on-surface-variant">ID: #{g.id}</span>
                      </div>
                      <div className="font-mono text-[13px] text-on-surface-variant">{g.population} Population | {g.buildingCount} Buildings</div>
                    </div>
                  ))}

                  {activeTab === 'characters' && filteredEntities.map(e => (
                    <div 
                      key={e.id}
                      onClick={() => setSelectedEntityId(e.id)}
                      className={`p-4 border-b border-surface-variant cursor-pointer hover:bg-surface-container-low border-l-4 ${selectedEntityId === e.id ? 'bg-surface-container-highest border-l-primary-container' : 'border-l-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border border-on-surface" style={{ backgroundColor: ARCHETYPE_COLORS[e.faction % 4] }}></div>
                          <span className="font-headline text-[18px] font-bold">Entity {e.id}</span>
                        </div>
                        <span className="font-mono text-[13px] text-on-surface-variant">#{e.id}</span>
                      </div>
                      <div className="font-mono text-[13px] text-on-surface-variant">{e.stateName} | Groups: {e.groups.join(', ')}</div>
                    </div>
                  ))}

                  {activeTab === 'buildings' && filteredBuildings.map(b => (
                    <div 
                      key={b.id}
                      onClick={() => setSelectedBuildingId(b.id)}
                      className={`p-4 border-b border-surface-variant cursor-pointer hover:bg-surface-container-low border-l-4 ${selectedBuildingId === b.id ? 'bg-surface-container-highest border-l-primary-container' : 'border-l-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-headline text-[18px] font-bold">{b.typeName}</span>
                        </div>
                        <span className="font-mono text-[13px] text-on-surface-variant">ID: #{b.id}</span>
                      </div>
                      <div className="font-mono text-[13px] text-on-surface-variant">Owner: Group {b.ownerGroup} | HP: {b.health}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Panel: Dossier */}
              <div className="flex-1 bg-surface-container-lowest flex flex-col overflow-y-auto p-6 gap-6 text-on-surface">
                {activeTab === 'groups' && selectedGroup && (
                  <>
                    <div className="flex justify-between items-start border-b-2 border-on-surface pb-4">
                      <div>
                        <h2 className="font-headline text-[32px] font-bold uppercase flex items-center gap-3">
                          <div className="w-6 h-6 border-2 border-on-surface" style={{ backgroundColor: ARCHETYPE_COLORS[selectedGroup.id % 4] }}></div>
                          {selectedGroup.name}
                        </h2>
                        <div className="font-mono text-[13px] text-on-surface-variant mt-1">ID: {selectedGroup.id} | POPULATION: {selectedGroup.population} | WEALTH: {selectedGroup.wealth.toLocaleString()}</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="border-2 border-on-surface bg-surface p-4">
                        <h3 className="font-mono text-[12px] font-bold uppercase mb-4 border-b border-on-surface pb-1">Resources</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-surface-container p-2 border border-on-surface text-on-surface">
                            <div className="text-[10px] text-on-surface-variant uppercase">Wood</div>
                            <div className="text-[18px] font-bold">{selectedGroup.wood}</div>
                          </div>
                          <div className="bg-surface-container p-2 border border-on-surface text-on-surface">
                            <div className="text-[10px] text-on-surface-variant uppercase">Gold</div>
                            <div className="text-[18px] font-bold">{selectedGroup.gold}</div>
                          </div>
                          <div className="bg-surface-container p-2 border border-on-surface text-on-surface">
                            <div className="text-[10px] text-on-surface-variant uppercase">Food</div>
                            <div className="text-[18px] font-bold">{selectedGroup.food}</div>
                          </div>
                          <div className="bg-surface-container p-2 border border-on-surface text-on-surface">
                            <div className="text-[10px] text-on-surface-variant uppercase">Misc</div>
                            <div className="text-[18px] font-bold">{selectedGroup.misc}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="border-2 border-on-surface bg-surface p-4 flex flex-col">
                        <h3 className="font-mono text-[12px] font-bold uppercase mb-2 border-b border-on-surface pb-1">Recent Chronicle</h3>
                        <div className="flex-1 overflow-y-auto text-[10px] font-mono space-y-1">
                          {chronicle.slice(0, 10).map((line, i) => (
                            <div key={i} className="border-b border-surface-variant pb-1">{line}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-on-surface bg-surface p-4">
                      <h3 className="font-mono text-[12px] font-bold uppercase mb-4 border-b border-on-surface pb-1 text-on-surface">Group Members ({groupMembers.length})</h3>
                      <div className="max-h-48 overflow-y-auto">
                        <BrutalTable 
                          headers={['ID', 'State', 'Health']}
                          rows={groupMembers.slice(0, 20).map(m => [
                            `#${m.id}`,
                            m.stateName,
                            m.health
                          ])}
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'characters' && selectedEntity && (
                  <>
                    <div className="flex justify-between items-start border-b-2 border-on-surface pb-4">
                      <div>
                        <h2 className="font-headline text-[32px] font-bold uppercase flex items-center gap-3">
                          <div className="w-6 h-6 border-2 border-on-surface" style={{ backgroundColor: ARCHETYPE_COLORS[selectedEntity.faction % 4] }}></div>
                          ENTITY {selectedEntity.id}
                        </h2>
                        <div className="font-mono text-[13px] text-on-surface-variant mt-1 uppercase font-bold">STATE: {selectedEntity.stateName} | POS: ({Math.round(selectedEntity.positionX)}, {Math.round(selectedEntity.positionY)})</div>
                      </div>
                      <div className="flex gap-2">
                        <BrutalButton onClick={onFollow}>Follow</BrutalButton>
                        <BrutalButton variant="error" onClick={() => (window as any).killEntity?.(selectedEntity.id)}>Terminate</BrutalButton>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="border-2 border-on-surface bg-surface p-4 text-on-surface">
                        <h3 className="font-mono text-[12px] font-bold uppercase mb-4 border-b border-on-surface pb-1">Attributes</h3>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold w-12 uppercase">Health</span>
                            <div className="flex-1 h-4 bg-surface-container border border-on-surface relative">
                              <div className="absolute inset-0 bg-secondary transition-all" style={{ width: `${(selectedEntity.health / 100) * 100}%` }}></div>
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-on-secondary mix-blend-difference">{selectedEntity.health}/100</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-surface-container border border-on-surface p-1">
                              <div className="text-[9px] text-on-surface-variant uppercase">DMG</div>
                              <div className="font-bold">{selectedEntity.effectiveDamage}</div>
                            </div>
                            <div className="bg-surface-container border border-on-surface p-1">
                              <div className="text-[9px] text-on-surface-variant uppercase">SPD</div>
                              <div className="font-bold">{selectedEntity.effectiveSpeed.toFixed(1)}</div>
                            </div>
                            <div className="bg-surface-container border border-on-surface p-1">
                              <div className="text-[9px] text-on-surface-variant uppercase">LIFE</div>
                              <div className="font-bold">{selectedEntity.effectiveLifespan}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-2 border-on-surface bg-surface p-4 text-on-surface">
                        <h3 className="font-mono text-[12px] font-bold uppercase mb-4 border-b border-on-surface pb-1">Hierarchy</h3>
                        <div className="space-y-1 overflow-y-auto max-h-32">
                          {selectedEntity.groups.map((gid, i) => (
                            <div key={i} className="flex justify-between items-center text-[11px] font-mono border-b border-surface-variant pb-1 last:border-0">
                              <span>Slot {i}</span>
                              <span className="font-bold">Group {gid}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'buildings' && selectedBuilding && (
                  <>
                    <div className="flex justify-between items-start border-b-2 border-on-surface pb-4">
                      <div>
                        <h2 className="font-headline text-[32px] font-bold uppercase flex items-center gap-3">
                          {selectedBuilding.typeName}
                        </h2>
                        <div className="font-mono text-[13px] text-on-surface-variant mt-1 uppercase font-bold">ID: {selectedBuilding.id} | OWNER: Group {selectedBuilding.ownerGroup}</div>
                      </div>
                    </div>
                    <div className="border-2 border-on-surface bg-surface p-4 text-on-surface">
                      <h3 className="font-mono text-[12px] font-bold uppercase mb-4 border-b border-on-surface pb-1">Integrity</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold w-12 uppercase">Health</span>
                        <div className="flex-1 h-6 bg-surface-container border border-on-surface relative">
                          <div className="absolute inset-0 bg-tertiary transition-all" style={{ width: `${(selectedBuilding.health / selectedBuilding.maxHealth) * 100}%` }}></div>
                          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-on-tertiary mix-blend-difference">{selectedBuilding.health}/{selectedBuilding.maxHealth}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'rules' && (
                   <RulesTab ruleRegistry={ruleRegistry} logicBytecode={logicBytecode} />
                )}
              </div>
            </div>
          </BrutalWindow>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="bg-on-surface text-surface fixed bottom-0 left-0 w-full z-50 flex justify-between items-center px-margin-md py-1 h-8 border-t-2 border-surface-variant font-mono text-[11px] pointer-events-auto">
        <div className="flex items-center gap-4">
          <span>TICK_RATE: {(1000/avgTickTime).toFixed(0)} | LATENCY: {lastTickTime.toFixed(1)}ms | AVG: {avgTickTime.toFixed(1)}ms</span>
          <span className="w-2 h-2 bg-primary-container rounded-full animate-pulse"></span>
        </div>
        <div className="flex gap-4">
          <a className="text-surface-variant hover:text-primary-fixed transition-colors" href="#">PERFORMANCE</a>
          <a className="text-surface-variant hover:text-primary-fixed transition-colors" href="#">LOGS</a>
          <a className="text-surface-variant hover:text-primary-fixed transition-colors" href="#">NETWORK</a>
        </div>
      </footer>

      {/* Floating Action Button (Menu) */}
      <button 
        onClick={() => setIsWindowOpen(!isWindowOpen)}
        className="fixed bottom-12 right-6 bg-primary-container text-on-primary-container border-4 border-on-surface rounded-full w-14 h-14 flex items-center justify-center shadow-brutal hover:bg-on-surface hover:text-primary-container transition-colors z-50 pointer-events-auto"
      >
        <span className="material-symbols-outlined text-[32px]">
          {isWindowOpen ? 'close' : 'menu'}
        </span>
      </button>

      {/* Tooltip for Brush State */}
      {brushActive && (
        <div className="fixed top-20 right-6 bg-surface border-2 border-on-surface p-3 shadow-brutal pointer-events-auto z-40 w-48 font-mono text-[11px] text-on-surface">
          <div className="font-bold border-b border-on-surface mb-2 pb-1 uppercase">Brush Controls</div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span>Active</span>
              <BrutalButton onClick={() => setBrushActive(false)} variant="error" className="px-1 py-0 h-4">OFF</BrutalButton>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] text-on-surface-variant uppercase">Target Group</label>
              <input 
                type="number" 
                value={brushGroupId}
                onChange={(e) => setBrushGroupId(parseInt(e.target.value))}
                className="w-full border border-on-surface px-1 py-0.5 bg-surface-container text-on-surface"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] text-on-surface-variant uppercase">Trait Bitmask</label>
              <select 
                value={brushTrait}
                onChange={(e) => setBrushTrait(parseInt(e.target.value))}
                className="w-full border border-on-surface px-1 py-0.5 bg-surface-container text-on-surface"
              >
                <option value={0}>NONE</option>
                <option value={1}>TREE</option>
                <option value={2}>AGGRO</option>
                <option value={4}>SCOUT</option>
              </select>
            </div>
          </div>
        </div>
      )}
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
    <div className="w-full flex flex-col h-full bg-surface-container-lowest text-on-surface">
      <div className="p-4 border-b border-on-surface">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search rules..."
          className="w-full px-3 py-2 border border-on-surface rounded font-mono text-[13px] bg-surface text-on-surface"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredRules.map(r => (
          <div key={r.index} className="bg-surface border-2 border-on-surface p-4 shadow-brutal-sm">
            <div className="flex items-center justify-between mb-3 border-b border-on-surface pb-1 text-on-surface">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[14px]">RULE #{r.index}</span>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateRule(r.index, 'enabled', e.target.checked)}
                  className="accent-on-surface w-4 h-4 rounded-none border-2 border-on-surface bg-surface"
                />
              </div>
              <div className="text-[11px] font-mono text-on-surface-variant uppercase font-bold">Subject Group: {r.subjectId}</div>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4 text-[11px] font-mono text-on-surface">
              <div>
                <label className="block text-on-surface-variant uppercase font-bold mb-1">Action</label>
                <select
                  value={r.actionState}
                  onChange={(e) => updateRule(r.index, 'actionState', parseInt(e.target.value))}
                  className="w-full border-2 border-on-surface bg-surface px-1 py-0.5 text-on-surface"
                >
                  <option value={1}>Harvest</option>
                  <option value={2}>Flee</option>
                  <option value={3}>Combat</option>
                  <option value={4}>Return</option>
                  <option value={6}>Trade</option>
                </select>
              </div>
              <div>
                <label className="block text-on-surface-variant uppercase font-bold mb-1">Threshold</label>
                <input
                  type="number"
                  value={r.threshold}
                  onChange={(e) => updateRule(r.index, 'threshold', parseInt(e.target.value))}
                  className="w-full border-2 border-on-surface bg-surface px-1 py-0.5 text-on-surface"
                />
              </div>
              <div>
                <label className="block text-on-surface-variant uppercase font-bold mb-1">Target X</label>
                <input
                  type="number"
                  value={r.targetX}
                  onChange={(e) => updateRule(r.index, 'targetX', parseInt(e.target.value))}
                  className="w-full border-2 border-on-surface bg-surface px-1 py-0.5 text-on-surface"
                />
              </div>
              <div>
                <label className="block text-on-surface-variant uppercase font-bold mb-1">Target Y</label>
                <input
                  type="number"
                  value={r.targetY}
                  onChange={(e) => updateRule(r.index, 'targetY', parseInt(e.target.value))}
                  className="w-full border-2 border-on-surface bg-surface px-1 py-0.5 text-on-surface"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-on-surface">
              {r.nodes.map((n: any, ni: number) => (
                <div key={ni} className="flex items-center gap-1 bg-surface-container border border-on-surface px-2 py-1 text-[11px] font-mono">
                  <span className="font-bold">
                    {n.op === 0 ? 'POP>' : n.op === 1 ? 'W<' : n.op === 2 ? 'REL<' : n.op === 3 ? 'DIST>' : '?'}
                  </span>
                  <input
                    type="number"
                    value={n.val}
                    onChange={(e) => {
                      const next = [...r.nodes]; next[ni] = { ...next[ni], val: parseInt(e.target.value) };
                      updateRule(r.index, 'nodes', next);
                    }}
                    className="w-12 border border-on-surface bg-surface px-1 ml-1 text-on-surface"
                  />
                  <button
                    onClick={() => {
                      const next = r.nodes.filter((_: any, i: number) => i !== ni);
                      updateRule(r.index, 'nodes', next);
                    }}
                    className="text-error font-bold ml-1 hover:scale-125 transition-transform"
                  >
                    ×
                  </button>
                </div>
              ))}
              <BrutalButton onClick={() => updateRule(r.index, 'nodes', [...r.nodes, { op: 0, val: 0 }])} variant="ghost" className="border-dashed border-on-surface/30">
                + Add Node
              </BrutalButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
