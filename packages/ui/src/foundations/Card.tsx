import React, { useState } from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'elevated' | 'outline';
  density?: 'comfortable' | 'compact';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'glass',
  density = 'comfortable',
  className = '',
  ...props
}) => {
  const variantClasses = {
    glass: 'bg-sheet border border-rule',
    elevated: 'bg-sheet border border-rule-strong',
    outline: 'bg-transparent border border-rule',
  };

  const densityClasses = {
    comfortable: 'p-5 rounded-[4px]',
    compact: 'p-3.5 rounded-[3px]',
  };

  return (
    <div
      className={`${variantClasses[variant]} ${densityClasses[density]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, className = '' }) => {
  return (
    <div className={`flex border-b border-rule gap-6 overflow-x-auto ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`pb-2.5 pt-1 text-[14px] border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 focus:outline-none ${
              isActive
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-ink-2 hover:text-ink font-medium'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[13px] px-1.5 py-0.5 rounded-[3px] ${
                  isActive ? 'bg-sunken text-ink' : 'text-ink-3'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export interface AccordionProps {
  items: { id: string; title: string; content: React.ReactNode }[];
  defaultOpenId?: string;
}

export const Accordion: React.FC<AccordionProps> = ({ items, defaultOpenId }) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || null);

  return (
    <div className="divide-y divide-rule border border-rule rounded-[4px] overflow-hidden">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="bg-sheet">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="w-full py-3.5 px-4 flex items-center justify-between text-left text-[14px] font-medium text-ink hover:bg-paper transition-colors focus:outline-none"
              aria-expanded={isOpen}
            >
              <span>{item.title}</span>
              <span className={`text-ink-3 text-xs transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {isOpen && <div className="p-4 pt-2 text-[14px] text-ink-2 bg-paper/60 border-t border-rule">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
};
