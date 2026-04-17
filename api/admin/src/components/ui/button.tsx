import { ButtonHTMLAttributes, forwardRef } from 'react';

// Unified with global .btn CSS classes so every <Button> in the admin inherits
// the same radius / min-height / padding as any raw .btn usage. Variants map
// directly to .btn-primary / .btn-secondary / .btn-danger / .btn-ghost, and
// the .card .btn { border-radius: 0 } rule continues to square-off buttons
// inside cards without any per-site change here.
//
// Size only nudges font-size / padding — the box (radius, border, appearance)
// still comes from .btn so the whole admin looks consistent.

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const sizeStyle: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px', minHeight: '32px' },
  md: {}, // inherit .btn defaults (48px min-height, .625rem 1rem padding, 14px)
  lg: { padding: '.75rem 1.25rem', fontSize: '14px', minHeight: '52px' },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, disabled, style, className = '', ...props }, ref) => {
    const classes = `btn btn-${variant}${className ? ' ' + className : ''}`;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={classes}
        style={{ ...sizeStyle[size], ...style }}
        {...props}
      >
        {loading ? (
          <svg width="16" height="16" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" fill="currentColor"
            style={{ animation: 'spin-cog 1.3s infinite linear' }}>
            <path d="M96,55.919V40.081c-3.104-0.646-6.545-1.228-10.255-1.739c-0.927-3.629-2.353-7.049-4.217-10.189
              c2.281-3.012,4.307-5.865,6.013-8.494L76.342,8.459c-2.629,1.706-5.482,3.731-8.493,6.013c-3.138-1.861-6.552-3.286-10.175-4.213
              C57.157,6.517,56.571,3.065,55.919,0H40.081c-0.652,3.065-1.238,6.517-1.755,10.259c-3.623,0.927-7.037,2.352-10.175,4.213
              c-3.01-2.281-5.864-4.307-8.493-6.013L8.459,19.658c1.706,2.629,3.731,5.482,6.013,8.494c-1.861,3.137-3.286,6.551-4.213,10.174
              C6.517,38.843,3.065,39.429,0,40.081v15.838c3.065,0.653,6.517,1.238,10.259,1.755c0.927,3.623,2.352,7.037,4.213,10.175
              c-2.281,3.011-4.307,5.864-6.013,8.493l11.199,11.199c2.629-1.706,5.483-3.731,8.493-6.013c3.138,1.861,6.552,3.286,10.175,4.213
              c0.517,3.742,1.103,7.193,1.755,10.259h15.838c0.652-3.065,1.238-6.517,1.755-10.259c3.628-0.928,7.047-2.355,10.188-4.221
              c2.985,2.261,5.829,4.282,8.48,6.021l11.199-11.199c-1.738-2.651-3.76-5.495-6.021-8.48c1.867-3.145,3.297-6.568,4.225-10.203
              C89.455,57.146,92.896,56.565,96,55.919z M48,72c-13.255,0-24-10.745-24-24s10.745-24,24-24s24,10.745,24,24S61.255,72,48,72z"/>
            <style>{`@keyframes spin-cog { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </svg>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
