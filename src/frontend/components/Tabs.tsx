import * as React from 'react';
import './Tabs.css';

interface Tab {
  id: string;
  label: string;
  /** Content rendered in the panel area when this tab is active. */
  panel: React.ReactNode;
}

interface Props {
  tabs: ReadonlyArray<Tab>;
  activeTab: string;
  onChange: (id: string) => void;
}

/**
 * Segmented tab strip with a managed panel area for switching between named views
 * within a panel or modal. All panels are kept in the DOM simultaneously and stacked
 * via CSS grid so the container height always equals the tallest panel — switching
 * tabs never causes layout thrash, and resize is handled entirely in CSS.
 * The caller owns the active tab state and fires onChange when the user picks a tab.
 */
export function Tabs({ tabs, activeTab, onChange }: Props) {
  return (
    <>
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
      <div className="tabPanels">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            className={`tabPanel${tab.id !== activeTab ? ' tabPanel-hidden' : ''}`}
          >
            {tab.panel}
          </div>
        ))}
      </div>
    </>
  );
}
