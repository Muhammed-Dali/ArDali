import React from "react";
import { Plus, X } from "lucide-react";

export type MockTab = {
  id: string;
  title: string;
  url: string;
};

interface TabBarProps {
  tabs: MockTab[];
  activeTabId: string | null;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onSwitchTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onAddTab, onCloseTab, onSwitchTab }: TabBarProps) {
  return (
    <div className="web-tab-bar" style={{ display: 'flex', alignItems: 'center', backgroundColor: '#1e1e1e', height: '40px', padding: '0 8px' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSwitchTab(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: tab.id === activeTabId ? '#333' : '#252525',
            color: '#fff',
            padding: '4px 12px',
            marginRight: '4px',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            minWidth: '120px',
            maxWidth: '200px',
            borderTop: tab.id === activeTabId ? '2px solid #00a8ff' : '2px solid transparent',
            userSelect: 'none'
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
            {tab.title}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
            style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', marginLeft: '8px', padding: '2px', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button 
        onClick={onAddTab}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '4px',
          marginLeft: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%'
        }}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
