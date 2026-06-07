import * as React from 'react';
import { useRef } from 'react';
import './Tabs.css';

interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  disabledTitle?: string;
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
 *
 * Keyboard: Tab enters/exits the strip; Left/Right arrows move between tabs.
 */
export function Tabs({ tabs, activeTab, onChange }: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabledTabs = tabs.filter((tab) => !tab.disabled);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (enabledTabs.length === 0) {
      return;
    }
    const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    let nextIndex: number;
    if (event.key === 'ArrowRight') {
      nextIndex = (safeCurrentIndex + 1) % enabledTabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (safeCurrentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = enabledTabs[nextIndex];
    onChange(nextTab.id);
    tabRefs.current[tabs.findIndex((tab) => tab.id === nextTab.id)]?.focus();
  }

  return (
    <>
      <div className="tabs" role="tablist" onKeyDown={handleKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-disabled={tab.disabled ? true : undefined}
            disabled={tab.disabled}
            tabIndex={tab.id === activeTab && !tab.disabled ? 0 : -1}
            title={tab.disabledTitle}
            className={`tabsButton${tab.id === activeTab ? ' tabsButton-active' : ''}`}
            onClick={() => {
              if (!tab.disabled) {
                onChange(tab.id);
              }
            }}
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
