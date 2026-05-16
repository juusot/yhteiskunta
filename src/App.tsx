import React, { useState, useEffect } from 'react';

interface LogicNode {
  op: number;
  val: number;
  val2?: number;
  val3?: number;
}

interface Rule {
  index: number;
  subjectId: number;
  conditionType: number;
  threshold: number;
  actionState: number;
  targetX: number;
  targetY: number;
  enabled: boolean;
  nodes: LogicNode[];
}

interface GroupStats {
  id: number;
  population: number;
  wealth: number;
  wood: number;
  gold: number;
  food: number;
  misc: number;
}

interface EntityInfo {
  id: number;
  health: number;
  money: number;
  state: number;
  inventory: number;
  groups: number[];
}

interface AppProps {
  ruleRegistry: Int32Array | null;
  logicBytecode: Int32Array | null;
  groupPopulation: Int32Array | null;
  groupTotalWealth: Int32Array | null;
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

const OP_POP_GT = 0, OP_WEALTH_LT = 1, OP_RELATION_LT = 2, OP_DIST_GT = 3;
const GATE_AND = 100, GATE_OR = 101, GATE_NOT = 102, OP_END = 255;

export const App: React.FC<AppProps> = ({ 
  ruleRegistry, logicBytecode, groupPopulation, groupTotalWealth, 
  groupWood, groupGold, groupFood, groupMisc,
  tickCount, lastTickTime, avgTickTime, inspectEntity, chronicle,
  onFollow, onClearInspect
}) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'stats' | 'rules'>('monitor');
  const [stats, setStats] = useState<GroupStats[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [brushActive, setBrushActive] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(0);
  const [selectedTrait, setSelectedTrait] = useState(0);

  // Sync brush state to global for main.tsx
  useEffect(() => {
    (window as any).brushState = {
      active: brushActive,
      groupId: selectedGroupId,
      trait: selectedTrait
    };
  }, [brushActive, selectedGroupId, selectedTrait]);

  // Update stats
  useEffect(() => {
    if (!groupPopulation || !groupTotalWealth || !groupWood || !groupGold || !groupFood || !groupMisc) return;
    const newStats: GroupStats[] = [];
    for (let i = 0; i < 50; i++) {
      if (groupPopulation[i] > 0) {
        newStats.push({ 
          id: i, 
          population: groupPopulation[i], 
          wealth: groupTotalWealth[i],
          wood: groupWood[i],
          gold: groupGold[i],
          food: groupFood[i],
          misc: groupMisc[i]
        });
      }
    }
    newStats.sort((a, b) => b.population - a.population);
    setStats(newStats.slice(0, 20));
  }, [tickCount, groupPopulation, groupTotalWealth, groupWood, groupGold, groupFood, groupMisc]);

  // Load rules
  useEffect(() => {
    if (!ruleRegistry || !logicBytecode) return;
    const newRules: Rule[] = [];
    for (let i = 0; i < 20; i++) {
      const base = i * 8;
      const nodes: LogicNode[] = [];
      if (ruleRegistry[base + 2] === 255) {
          const lBase = i * 32;
          for (let j = 0; j < 32; j++) {
              const op = logicBytecode[lBase + j];
              if (op === OP_END) break;
              if (op === OP_POP_GT || op === OP_WEALTH_LT) { nodes.push({ op, val: logicBytecode[lBase + ++j] }); }
              else if (op === OP_RELATION_LT) { nodes.push({ op, val: logicBytecode[lBase + ++j], val2: logicBytecode[lBase + ++j] }); }
              else if (op === OP_DIST_GT) { nodes.push({ op, val: logicBytecode[lBase + ++j], val2: logicBytecode[lBase + ++j], val3: logicBytecode[lBase + ++j] }); }
              else { nodes.push({ op, val: 0 }); }
          }
      }
      newRules.push({
        index: i, subjectId: ruleRegistry[base + 1], conditionType: ruleRegistry[base + 2], threshold: ruleRegistry[base + 3],
        actionState: ruleRegistry[base + 4], targetX: ruleRegistry[base + 5], targetY: ruleRegistry[base + 6],
        enabled: ruleRegistry[base + 7] === 1, nodes
      });
    }
    setRules(newRules);
  }, [ruleRegistry, logicBytecode]);

  const compileRule = (ruleIdx: number, nodes: LogicNode[]) => {
      if (!logicBytecode) return;
      const base = ruleIdx * 32;
      let ptr = 0;
      for (const n of nodes) {
          logicBytecode[base + ptr++] = n.op;
          if (n.op === OP_POP_GT || n.op === OP_WEALTH_LT) { logicBytecode[base + ptr++] = n.val; }
          else if (n.op === OP_RELATION_LT) { logicBytecode[base + ptr++] = n.val; logicBytecode[base + ptr++] = n.val2 || 0; }
          else if (n.op === OP_DIST_GT) { logicBytecode[base + ptr++] = n.val; logicBytecode[base + ptr++] = n.val2 || 0; logicBytecode[base + ptr++] = n.val3 || 0; }
      }
      while (ptr < 32) logicBytecode[base + ptr++] = OP_END;
  };

  const updateRule = (index: number, field: keyof Rule, value: any) => {
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

  const addNode = (rIdx: number, op: number) => {
      const rule = rules.find(r => r.index === rIdx);
      if (!rule) return;
      const newNodes = [...rule.nodes, { op, val: 0, val2: 0, val3: 0 }];
      updateRule(rIdx, 'nodes', newNodes);
      if (rule.conditionType !== 255) updateRule(rIdx, 'conditionType', 255);
  };

  return (
    <div className="h-full flex flex-col bg-white text-black font-mono">
      {/* Tabs */}
      <div className="flex border-b-2 border-black">
        {(['monitor', 'stats', 'rules'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-bold transition-colors border-r-2 border-black last:border-r-0 ${activeTab === tab ? 'bg-yellow-400' : 'bg-white hover:bg-gray-100'}`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            <section>
              <h2 className="bg-blue-600 text-white px-2 py-1 text-sm font-bold uppercase mb-2">Simulation Status</h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between border-b border-gray-200"><span>Population</span><span className="font-bold">{stats.reduce((a,b)=>a+b.population, 0).toLocaleString()}</span></div>
                <div className="flex justify-between border-b border-gray-200"><span>Last Tick</span><span className="font-bold">{lastTickTime.toFixed(1)}ms</span></div>
                <div className="flex justify-between border-b border-gray-200"><span>Avg Tick</span><span className="font-bold">{avgTickTime.toFixed(1)}ms</span></div>
              </div>
            </section>

            {inspectEntity && (
              <section>
                <h2 className="bg-red-600 text-white px-2 py-1 text-sm font-bold uppercase mb-2">Entity Inspector</h2>
                <div className="bg-gray-100 p-2 border-2 border-black text-xs space-y-1">
                  <div className="flex justify-between"><span>ID</span><span className="font-bold">{inspectEntity.id}</span></div>
                  <div className="flex justify-between"><span>Health</span><span className="font-bold">{inspectEntity.health}</span></div>
                  <div className="flex justify-between"><span>Money</span><span className="font-bold">{inspectEntity.money}</span></div>
                  <div className="flex justify-between"><span>State</span><span className="font-bold">{inspectEntity.state}</span></div>
                  <div className="flex justify-between"><span>Inv</span><span className="font-bold">{inspectEntity.inventory}</span></div>
                  <div className="pt-1"><strong>Groups:</strong> {inspectEntity.groups.join(", ")}</div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={onFollow} className="flex-1 py-1 text-[10px] bg-blue-500 text-white border-2 border-black">FOLLOW</button>
                  <button onClick={onClearInspect} className="flex-1 py-1 text-[10px] bg-red-500 text-white border-2 border-black">CLEAR</button>
                </div>
              </section>
            )}

            <section>
              <h2 className="bg-pink-500 text-white px-2 py-1 text-sm font-bold uppercase mb-2">Chronicle</h2>
              <div className="bg-white border border-black p-2 h-48 overflow-y-auto text-[10px] space-y-1 leading-tight">
                {chronicle.map((line, i) => <div key={i} className="border-b border-gray-100">{line}</div>)}
                {chronicle.length === 0 && <div className="text-gray-400 italic">No events recorded.</div>}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-2">
             <h2 className="bg-green-600 text-white px-2 py-1 text-sm font-bold uppercase mb-2">Group Demographics</h2>
            {stats.map(g => (
              <div key={g.id} className="bg-gray-100 p-2 border border-black">
                <div className="flex justify-between items-center text-xs border-b border-gray-300 pb-1 mb-1">
                  <span className="font-bold">Group {g.id}</span>
                  <span>{g.population.toLocaleString()} pop</span>
                </div>
                <div className="text-[10px] text-gray-700 font-bold mb-1">Total Wealth: {g.wealth.toLocaleString()}</div>
                <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-600">
                  <div className="flex justify-between"><span>Wood:</span> <span>{g.wood.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Gold:</span> <span>{g.gold.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Food:</span> <span>{g.food.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Misc:</span> <span>{g.misc.toLocaleString()}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="space-y-3">
            <h2 className="bg-yellow-500 text-black px-2 py-1 text-sm font-bold uppercase mb-2">Societal Rules</h2>
            {rules.slice(0, 8).map(r => ( 
              <div key={r.index} className="bg-gray-50 p-2 border-2 border-black space-y-1 text-[10px]">
                <div className="flex justify-between items-center border-b border-black pb-1">
                  <span className="font-bold">RULE #{r.index}</span>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.index, 'enabled', e.target.checked)} className="accent-black" />
                </div>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[8px] uppercase">Gid</label>
                    <input type="number" value={r.subjectId} onChange={(e) => updateRule(r.index, 'subjectId', parseInt(e.target.value))} className="w-full border border-black px-1" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[8px] uppercase">Act</label>
                    <select value={r.actionState} onChange={(e) => updateRule(r.index, 'actionState', parseInt(e.target.value))} className="w-full border border-black" >
                      <option value={1}>Harvest</option>
                      <option value={2}>Flee</option>
                      <option value={3}>Combat</option>
                      <option value={4}>Return</option>
                      <option value={6}>Trade</option>
                    </select>
                  </div>
                </div>

                <div className="pt-1 space-y-1">
                    <div className="flex justify-between items-center bg-gray-200 px-1">
                        <span className="text-[8px]">LOGIC</span>
                        <div className="flex gap-1">
                            <button onClick={() => addNode(r.index, OP_POP_GT)} className="bg-white px-1 border border-black">P+</button>
                            <button onClick={() => addNode(r.index, OP_WEALTH_LT)} className="bg-white px-1 border border-black">W-</button>
                            <button onClick={() => addNode(r.index, GATE_AND)} className="bg-blue-200 px-1 border border-black">AND</button>
                            <button onClick={() => addNode(r.index, GATE_OR)} className="bg-blue-200 px-1 border border-black">OR</button>
                        </div>
                    </div>
                    {r.nodes.map((n, ni) => (
                        <div key={ni} className="flex items-center gap-1 bg-white p-0.5 border border-gray-300">
                            <span className="w-10 font-bold">{n.op === 0 ? "POP>" : n.op === 1 ? "W<" : n.op === 100 ? "AND" : "OR"}</span>
                            {n.op < 100 && (
                                <input type="number" value={n.val} onChange={(e) => {
                                    const next = [...r.nodes]; next[ni].val = parseInt(e.target.value);
                                    updateRule(r.index, 'nodes', next);
                                }} className="border border-gray-300 w-12 text-center" />
                            )}
                            <button onClick={() => {
                                const next = r.nodes.filter((_, i) => i !== ni);
                                updateRule(r.index, 'nodes', next);
                            }} className="ml-auto text-red-500 font-bold">×</button>
                        </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* God Hand Brush (Always visible at bottom) */}
      <div className="bg-gray-100 p-3 border-t-2 border-black space-y-2">
        <h3 className="text-[10px] font-bold uppercase">Brush (God Hand)</h3>
        <button 
          onClick={() => setBrushActive(!brushActive)}
          className={`w-full py-1 border-2 border-black font-bold text-xs ${brushActive ? 'bg-green-500 text-white' : 'bg-white hover:bg-gray-50'}`}
        >
          {brushActive ? 'BRUSH: ACTIVE' : 'ACTIVATE BRUSH'}
        </button>
        {brushActive && (
          <div className="flex gap-2 text-[10px]">
            <div className="flex-1">
                <label className="block">GID</label>
                <input type="number" value={selectedGroupId} onChange={(e) => setSelectedGroupId(parseInt(e.target.value))} className="w-full border border-black px-1" />
            </div>
            <div className="flex-1">
                <label className="block">TRAIT</label>
                <select value={selectedTrait} onChange={(e) => setSelectedTrait(parseInt(e.target.value))} className="w-full border border-black" >
                    <option value={0}>NONE</option>
                    <option value={1}>TREE</option>
                    <option value={2}>AGGRO</option>
                    <option value={4}>SCOUT</option>
                </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
