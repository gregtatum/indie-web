import * as React from 'react';
import './Tabs.css';

interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: ReadonlyArray<Tab>;
  activeTab: string;
  onChange: (id: string) => void;
}

/**
 * Segmented tab strip for switching between named views within a panel or modal.
 * The caller owns the active tab state and renders the corresponding content;
 * Tabs only handles the visual strip and fires onChange when the user picks a tab.
 */
export function Tabs({ tabs, activeTab, onChange }: Props) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`tabsButton${tab.id === activeTab ? ' tabsButton-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
