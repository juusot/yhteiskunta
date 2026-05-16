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
}

interface AppProps {
  ruleRegistry: Int32Array | null;
  logicBytecode: Int32Array | null;
  groupPopulation: Int32Array | null;
  groupTotalWealth: Int32Array | null;
  tickCount: number;
}

const OP_POP_GT = 0, OP_WEALTH_LT = 1, OP_RELATION_LT = 2, OP_DIST_GT = 3;
const GATE_AND = 100, GATE_OR = 101, GATE_NOT = 102, OP_END = 255;

export const App: React.FC<AppProps> = ({ ruleRegistry, logicBytecode, groupPopulation, groupTotalWealth, tickCount }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'rules'>('stats');
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

  // Update stats when tickCount changes
  useEffect(() => {
    if (!groupPopulation || !groupTotalWealth) return;
    const newStats: GroupStats[] = [];
    for (let i = 0; i < 50; i++) { // Check first 50 groups
      if (groupPopulation[i] > 0) {
        newStats.push({
          id: i,
          population: groupPopulation[i],
          wealth: groupTotalWealth[i],
        });
      }
    }
    newStats.sort((a, b) => b.population - a.population);
    setStats(newStats.slice(0, 20));
  }, [tickCount, groupPopulation, groupTotalWealth]);

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
    // Update local state to reflect change immediately
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
    <div className="fixed top-0 right-0 h-full w-80 bg-gray-900 text-white shadow-xl flex flex-col border-l border-gray-700 z-50 overflow-hidden">
      <div className="flex border-b border-gray-700">
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-3 font-bold transition-colors ${activeTab === 'stats' ? 'bg-gray-800 text-green-400 border-b-2 border-green-400' : 'hover:bg-gray-800'}`}
        >
          Group Stats
        </button>
        <button 
          onClick={() => setActiveTab('rules')}
          className={`flex-1 py-3 font-bold transition-colors ${activeTab === 'rules' ? 'bg-gray-800 text-green-400 border-b-2 border-green-400' : 'hover:bg-gray-800'}`}
        >
          Rule Editor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'stats' ? (
          <div className="space-y-2">
            <h3 className="text-sm uppercase tracking-wider text-gray-400 font-bold mb-4">Live Demographics</h3>
            {stats.map(g => (
              <div key={g.id} className="bg-gray-800 p-3 rounded border border-gray-700">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-green-400">Group {g.id}</span>
                  <span className="text-xs text-gray-400">{g.population.toLocaleString()} entities</span>
                </div>
                <div className="text-sm text-gray-300">Wealth: {g.wealth.toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm uppercase tracking-wider text-gray-400 font-bold">Societal Rules</h3>
            {rules.slice(0, 10).map(r => ( 
              <div key={r.index} className="bg-gray-800 p-3 rounded border border-gray-700 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-bold">Rule #{r.index}</span>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.index, 'enabled', e.target.checked)} className="w-4 h-4 accent-green-500" />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block">Group</label>
                    <input type="number" value={r.subjectId} onChange={(e) => updateRule(r.index, 'subjectId', parseInt(e.target.value))} className="bg-gray-700 w-full px-2 py-1 rounded" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Action</label>
                    <select value={r.actionState} onChange={(e) => updateRule(r.index, 'actionState', parseInt(e.target.value))} className="bg-gray-700 w-full px-2 py-1 rounded" >
                      <option value={1}>Harvest</option>
                      <option value={2}>Flee</option>
                      <option value={3}>Combat</option>
                      <option value={4}>Return</option>
                      <option value={6}>Trade</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-2 space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>Compound Logic (RPN)</span>
                        <div className="flex gap-1">
                            <button onClick={() => addNode(r.index, OP_POP_GT)} className="px-1 bg-gray-700 hover:bg-gray-600 rounded">POP+</button>
                            <button onClick={() => addNode(r.index, OP_WEALTH_LT)} className="px-1 bg-gray-700 hover:bg-gray-600 rounded">W-</button>
                            <button onClick={() => addNode(r.index, GATE_AND)} className="px-1 bg-blue-900 hover:bg-blue-800 rounded">AND</button>
                            <button onClick={() => addNode(r.index, GATE_OR)} className="px-1 bg-blue-900 hover:bg-blue-800 rounded">OR</button>
                            <button onClick={() => addNode(r.index, GATE_NOT)} className="px-1 bg-red-900 hover:bg-red-800 rounded">NOT</button>
                        </div>
                    </div>
                    {r.nodes.map((n, ni) => (
                        <div key={ni} className="flex items-center gap-1 bg-gray-900 p-1 rounded">
                            <span className="text-blue-400 font-mono text-[10px] w-12">
                                {n.op === 0 ? "POP_GT" : n.op === 1 ? "W_LT" : n.op === 100 ? "AND" : n.op === 101 ? "OR" : "OP"}
                            </span>
                            {n.op < 100 && (
                                <input type="number" value={n.val} onChange={(e) => {
                                    const next = [...r.nodes]; next[ni].val = parseInt(e.target.value);
                                    updateRule(r.index, 'nodes', next);
                                }} className="bg-gray-800 px-1 w-16 text-xs" />
                            )}
                            <button onClick={() => {
                                const next = r.nodes.filter((_, i) => i !== ni);
                                updateRule(r.index, 'nodes', next);
                                if (next.length === 0) updateRule(r.index, 'conditionType', 0);
                            }} className="ml-auto text-red-500">×</button>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                    <span>X: {r.targetX}</span>
                    <span>Y: {r.targetY}</span>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-500 italic">Showing first 10 slots...</p>
          </div>
        )}
      </div>

      <div className="bg-gray-800 p-4 border-t border-gray-700 space-y-3">
        <h3 className="text-xs font-bold uppercase text-gray-400">Brush Tool (God Hand)</h3>
        <button 
          onClick={() => setBrushActive(!brushActive)}
          className={`w-full py-2 rounded font-bold transition-colors ${brushActive ? 'bg-green-600 text-white shadow-inner' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          {brushActive ? 'BRUSH ACTIVE' : 'ACTIVATE BRUSH'}
        </button>
        {brushActive && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs w-16">Group:</span>
              <input 
                type="number" 
                value={selectedGroupId} 
                onChange={(e) => setSelectedGroupId(parseInt(e.target.value))}
                className="bg-gray-700 flex-1 px-2 py-1 rounded text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-16">Trait:</span>
              <select 
                value={selectedTrait} 
                onChange={(e) => setSelectedTrait(parseInt(e.target.value))}
                className="bg-gray-700 flex-1 px-2 py-1 rounded text-sm"
              >
                <option value={0}>None</option>
                <option value={1}>Tree</option>
                <option value={2}>Aggressive</option>
                <option value={4}>Scout</option>
                <option value={8}>Fanatic</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
