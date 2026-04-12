'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, className, style, ...props }, ref) => {
    return (
      <label className="flex items-center justify-between cursor-pointer" style={style}>
        <div className="flex-1">
          {label && <span className="text-sm text-sub">{label}</span>}
          {description && <p className="text-xs text-dim" style={{ marginTop: '2px' }}>{description}</p>}
        </div>
        <div style={{ position: 'relative', flexShrink: 0, marginLeft: '12px' }}>
          <input ref={ref} type="checkbox" className="sr-only peer" {...props} />
          <div
            className="peer-checked:bg-primary"
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '11px',
              background: 'var(--color-border)',
              transition: 'background 0.2s',
            }}
          />
          <div
            className="peer-checked:translate-x-[18px]"
            style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';
export { Toggle };
