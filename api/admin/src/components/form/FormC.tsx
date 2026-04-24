/**
 * 风格 C — iOS Settings 风格：行列表 + 左文字 + 右控件 + 分隔线
 * 信息密度高，视觉最像 macOS/iOS 设置。
 *
 * 组件结构：
 *   <FormSectionC title="站点">
 *     <FormRowC label="站点名称" value="我的博客" action="edit" onClick={...} />
 *     <FormRowC label="启用评论">
 *       <Toggle />
 *     </FormRowC>
 *     <FormRowC label="每页文章" value="10 篇" action="chevron" onClick={...} />
 *   </FormSectionC>
 */

import { type ReactNode } from 'react';
import { Toggle } from '@/components/ui';

export function FormSectionC({
  title, icon, description, children, footerHint,
}: {
  title?: string;
  icon?: string;           // FontAwesome class e.g. "fa-regular fa-globe"
  description?: string;
  children: ReactNode;
  footerHint?: string;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      {title && (
        <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {icon && (
            <i className={icon} style={{ fontSize: 13, color: 'var(--color-primary)' }} />
          )}
          <h3 style={{
            fontSize: 13, fontWeight: 600, margin: 0,
            color: 'var(--color-text-main)',
            letterSpacing: 0.2,
          }}>
            {title}
          </h3>
          {description && (
            <p className="text-sub" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              <span className="text-dim" style={{ margin: '0 6px' }}>·</span>
              {description}
            </p>
          )}
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {children}
      </div>
      {footerHint && (
        <p className="text-dim" style={{ fontSize: 11, margin: '8px 16px 0', lineHeight: 1.6 }}>
          {footerHint}
        </p>
      )}
    </section>
  );
}

export function FormRowC({
  label, hint, children, value, action, onClick, danger, icon,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;      // right-side control (for toggle / inline input)
  value?: string;             // right-side text (for display-only rows)
  action?: 'chevron' | 'edit' | 'none';
  onClick?: () => void;
  danger?: boolean;
  icon?: string;             // FontAwesome class
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-divider)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = 'var(--color-bg-soft)'; }}
      onMouseLeave={(e) => { if (clickable) e.currentTarget.style.background = 'transparent'; }}
      className="form-row-c-item"
    >
      {icon && (
        <div style={{
          width: 28, height: 28, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: danger ? '#fef2f2' : 'var(--color-bg-soft)',
        }}>
          <i className={icon} style={{ fontSize: 13, color: danger ? '#dc2626' : 'var(--color-primary)' }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: danger ? '#dc2626' : 'var(--color-text-main)',
        }}>
          {label}
        </div>
        {hint && (
          <div className="text-dim" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {value != null && (
          <span className="text-sub" style={{ fontSize: 13 }}>{value}</span>
        )}
        {children}
        {action === 'chevron' && (
          <i className="fa-solid fa-chevron-right" style={{ fontSize: 10, color: 'var(--color-text-dim)' }} />
        )}
        {action === 'edit' && (
          <i className="fa-regular fa-pen" style={{ fontSize: 11, color: 'var(--color-text-dim)' }} />
        )}
      </div>
    </div>
  );
}

/* ========================================================
   Form C — Table layout (方案 C)
   Left column: label on white background
   Right column: input on soft-gray background with vertical divider
   Row dividers between entries; focus state lights up right column.
   ======================================================== */

const LABEL_WIDTH = '32%';
const ROW_BORDER = '1px solid var(--color-divider)';
// Same surface left and right — the earlier grey right column + vertical
// divider made every simple toggle / input look like a 2-column data
// table. Keep horizontal row borders only, so sections read as a single
// unified surface like iOS Settings.
const VERT_DIVIDER = 'none';
const RIGHT_BG = 'transparent';

// Inline editable text row — table-style
export function FormRowInputC({
  label, value, onChange, placeholder, type = 'text', hint, register, last,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  register?: any;
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${LABEL_WIDTH} 1fr`,
      borderBottom: last ? 'none' : ROW_BORDER,
      minHeight: 56,
    }}>
      {/* Label cell */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: VERT_DIVIDER,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-main)' }}>{label}</div>
        {hint && <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
      </div>

      {/* Value cell */}
      <div style={{ padding: '6px 14px', background: RIGHT_BG, display: 'flex', alignItems: 'center' }}>
        <input
          type={type}
          placeholder={placeholder}
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          style={{
            width: '100%', height: 40, padding: '0 12px', fontSize: 13,
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-main)',
            outline: 'none', transition: 'border 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.border = '1px solid var(--color-primary)'; }}
          onBlur={(e) => {
            e.currentTarget.style.border = '1px solid var(--color-border)';
            register?.onBlur?.(e);
          }}
        />
      </div>
    </div>
  );
}

// Textarea variant — table-style, textarea takes full right column width
export function FormRowTextareaC({
  label, hint, rows = 3, value, onChange, register, placeholder, last,
}: {
  label: string;
  hint?: string;
  rows?: number;
  value?: string;
  onChange?: (v: string) => void;
  register?: any;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${LABEL_WIDTH} 1fr`,
      borderBottom: last ? 'none' : ROW_BORDER,
    }}>
      <div style={{
        padding: '10px 14px',
        borderRight: VERT_DIVIDER,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-main)' }}>{label}</div>
        {hint && <div className="text-dim" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.6 }}>{hint}</div>}
      </div>

      <div style={{ padding: '10px 14px', background: RIGHT_BG }}>
        <textarea
          rows={rows}
          placeholder={placeholder}
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          style={{
            width: '100%', minHeight: 80, padding: '10px 12px', fontSize: 13,
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-main)', outline: 'none', resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.6,
            transition: 'border 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.border = '1px solid var(--color-primary)'; }}
          onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--color-border)'; register?.onBlur?.(e); }}
        />
      </div>
    </div>
  );
}

// Select variant — table-style
export function FormRowSelectC({
  label, hint, value, onChange, register, options, last,
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange?: (v: string) => void;
  register?: any;
  options: { value: string; label: string }[];
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${LABEL_WIDTH} 1fr`,
      borderBottom: last ? 'none' : ROW_BORDER,
      minHeight: 56,
    }}>
      <div style={{
        padding: '10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: VERT_DIVIDER,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-main)' }}>{label}</div>
        {hint && <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
      </div>

      <div style={{ padding: '6px 14px', background: RIGHT_BG, display: 'flex', alignItems: 'center' }}>
        <select
          {...(register || {})}
          {...(register ? {} : { value: value ?? '', onChange: (e) => onChange?.(e.target.value) })}
          style={{
            height: 40, padding: '0 12px', fontSize: 13,
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-main)', outline: 'none', cursor: 'pointer',
          }}
        >
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
    </div>
  );
}

// Toggle variant — table-style, switch sits in right cell. Delegates
// the actual input to the existing <Toggle> component so the RHF
// register flow (ref + onChange) keeps working exactly the same as
// when <Toggle {...register('foo')} /> is used standalone.
export function FormRowToggleC({
  label, hint, checked, onChange, register, last,
}: {
  label: string;
  hint?: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  register?: any;
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${LABEL_WIDTH} 1fr`,
      borderBottom: last ? 'none' : ROW_BORDER,
      minHeight: 56,
    }}>
      <div style={{
        padding: '10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: VERT_DIVIDER,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-main)' }}>{label}</div>
        {hint && <div className="text-dim" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.6 }}>{hint}</div>}
      </div>
      {/* Right cell: just the switch, flush to the right edge — the
          inner <Toggle>'s default `justify-between` plus width:100%
          makes its empty flex-1 label div eat all the space on the
          left, so the switch hugs the right like iOS-style settings. */}
      <div style={{ padding: '6px 14px', background: RIGHT_BG, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Toggle
          {...(register || {})}
          {...(register ? {} : {
            checked: !!checked,
            onChange: (e: any) => onChange?.(e.target.checked),
          })}
          style={{ padding: 0, width: 'auto', flex: 'none' }}
        />
      </div>
    </div>
  );
}

// Range slider variant — table-style, shows current value inline with label.
export function FormRowRangeC({
  label, hint, value, onChange, min = 0, max = 100, step = 1, last,
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  last?: boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `${LABEL_WIDTH} 1fr`,
      borderBottom: last ? 'none' : ROW_BORDER,
      minHeight: 56,
    }}>
      <div style={{
        padding: '10px 14px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: VERT_DIVIDER,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-main)' }}>
          {label} <span className="text-dim" style={{ fontSize: 12 }}>({value})</span>
        </div>
        {hint && <div className="text-dim" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.6 }}>{hint}</div>}
      </div>
      <div style={{ padding: '10px 14px', background: RIGHT_BG, display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
