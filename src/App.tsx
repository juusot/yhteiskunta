import React, { useState, useEffect } from 'react';

interface Rule {
  index: number;
  subjectId: number;
  conditionType: number;
  threshold: number;
  actionState: number;
  targetX: number;
  targetY: number;
  enabled: boolean;
}

interface GroupStats {
  id: number;
  population: number;
  wealth: number;
}

interface AppProps {
  ruleRegistry: Int32Array | null;
  groupPopulation: Int32Array | null;
  groupTotalWealth: Int32Array | null;
  tickCount: number;
}

export const App: React.FC<AppProps> = ({ ruleRegistry, groupPopulation, groupTotalWealth, tickCount }) => {
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
    if (!ruleRegistry) return;
    const newRules: Rule[] = [];
    for (let i = 0; i < 100; i++) {
      const base = i * 8;
      newRules.push({
        index: i,
        subjectId: ruleRegistry[base + 1],
        conditionType: ruleRegistry[base + 2],
        threshold: ruleRegistry[base + 3],
        actionState: ruleRegistry[base + 4],
        targetX: ruleRegistry[base + 5],
        targetY: ruleRegistry[base + 6],
        enabled: ruleRegistry[base + 7] === 1,
      });
    }
    setRules(newRules);
  }, [ruleRegistry]);

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
    }
    // Update local state to reflect change immediately
    setRules(prev => prev.map(r => r.index === index ? { ...r, [field]: value } : r));
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
            {rules.slice(0, 5).map(r => ( // Show first 5 for brevity
              <div key={r.index} className="bg-gray-800 p-3 rounded border border-gray-700 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-bold">Rule #{r.index}</span>
                  <input 
                    type="checkbox" 
                    checked={r.enabled} 
                    onChange={(e) => updateRule(r.index, 'enabled', e.target.checked)}
                    className="w-4 h-4 accent-green-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block">Group ID</label>
                    <input 
                      type="number" 
                      value={r.subjectId} 
                      onChange={(e) => updateRule(r.index, 'subjectId', parseInt(e.target.value))}
                      className="bg-gray-700 w-full px-2 py-1 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Condition</label>
                    <select 
                      value={r.conditionType} 
                      onChange={(e) => updateRule(r.index, 'conditionType', parseInt(e.target.value))}
                      className="bg-gray-700 w-full px-2 py-1 rounded"
                    >
                      <option value={0}>Pop &gt;</option>
                      <option value={1}>Wealth &gt;</option>
                      <option value={3}>Wealth &lt; (Deficit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Threshold</label>
                    <input 
                      type="number" 
                      value={r.threshold} 
                      onChange={(e) => updateRule(r.index, 'threshold', parseInt(e.target.value))}
                      className="bg-gray-700 w-full px-2 py-1 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Action</label>
                    <select 
                      value={r.actionState} 
                      onChange={(e) => updateRule(r.index, 'actionState', parseInt(e.target.value))}
                      className="bg-gray-700 w-full px-2 py-1 rounded"
                    >
                      <option value={1}>Harvest</option>
                      <option value={2}>Flee</option>
                      <option value={3}>Combat</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-500 italic">Showing first 5 slots...</p>
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
