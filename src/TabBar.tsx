import React from "react";
import { Plus, X, Loader2 } from "lucide-react";

const ARDALI_STORE_TAB_URL = "ardali://store";

export type MockTab = {
  id: string;
  title: string;
  url: string;
  isLoading?: boolean;
  pinned?: boolean;
};

interface TabBarProps {
  tabs: MockTab[];
  activeTabId: string | null;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onSwitchTab: (id: string) => void;
  onOpenTabMenu: (tab: MockTab, position: { x: number; y: number }) => void;
}

function getTabIcon(urlStr: string) {
  if (urlStr === ARDALI_STORE_TAB_URL) return "/icons/app/ardali_256.png";
  try {
    const u = new URL(urlStr);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return "/icons/app/ardali_256.png";
  }
}

export function TabBar({
  tabs,
  activeTabId,
  onAddTab,
  onCloseTab,
  onSwitchTab,
  onOpenTabMenu,
}: TabBarProps) {
  return (
    <div className="web-tab-bar" style={{ display: 'flex', alignItems: 'center', backgroundColor: '#1e1e1e', height: '40px', padding: '0 8px', position: 'relative' }}>
      {tabs.map((tab) => {
        const iconSrc = getTabIcon(tab.url);
        return (
          <div
            key={tab.id}
            onClick={() => onSwitchTab(tab.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenTabMenu(tab, {
                x: rect.left,
                y: rect.bottom + 4,
              });
            }}
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
              {tab.isLoading ? (
                <Loader2 className="web-tab-spinner" size={14} style={{ color: '#00a8ff', flexShrink: 0 }} />
              ) : (
                <img src={iconSrc} alt="" style={{ width: '14px', height: '14px', borderRadius: '2px', objectFit: 'contain', flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
              {tab.title}
            </span>
            {!tab.pinned ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', marginLeft: '8px', padding: '2px', display: 'flex' }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
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
