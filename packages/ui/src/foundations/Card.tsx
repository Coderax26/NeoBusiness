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
    glass: 'backdrop-blur-md bg-zinc-900/60 border border-zinc-800/80 shadow-lg',
    elevated: 'backdrop-blur-xl bg-zinc-900/90 border border-teal-500/30 shadow-xl shadow-teal-950/20',
    outline: 'bg-transparent border border-zinc-800',
  };

  const densityClasses = {
    comfortable: 'p-6 rounded-2xl',
    compact: 'p-4 rounded-xl',
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
    <div className={`flex border-b border-zinc-800 gap-2 overflow-x-auto ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`pb-3 pt-1 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 focus:outline-none ${
              isActive
                ? 'border-teal-400 text-teal-300 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-teal-500/20 text-teal-200' : 'bg-zinc-800 text-zinc-400'
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
    <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="w-full py-3.5 px-4 flex items-center justify-between text-left text-sm font-medium text-zinc-200 hover:text-white transition-colors focus:outline-none focus:bg-zinc-800/40"
              aria-expanded={isOpen}
            >
              <span>{item.title}</span>
              <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isOpen && <div className="p-4 pt-1 text-sm text-zinc-300 bg-zinc-950/30">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
};
