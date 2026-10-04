import React from 'react';

export interface VoltMeshBrandProps {
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** When provided the brand renders as a button (keyboard + screen-reader accessible). */
  onClick?: () => void;
  /** Accessible label / tooltip used when the brand is clickable. */
  actionLabel?: string;
}

export const VoltMeshBrand: React.FC<VoltMeshBrandProps> = ({
  subtitle = 'Trading terminal',
  size = 'md',
  className = '',
  onClick,
  actionLabel = 'Back to overview',
}) => {
  const markSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-8 h-8' : 'w-7 h-7';
  const titleSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';
  const subSize = size === 'lg' ? 'text-xs' : 'text-[11px]';

  const content = (
    <>
      <img
        src="/brand/voltmesh-mark.png"
        alt=""
        aria-hidden="true"
        className={`${markSize} object-contain shrink-0`}
        loading="eager"
      />
      <div className="flex flex-col min-w-0 leading-tight text-left">
        <span className={`${titleSize} font-semibold tracking-tight text-white`}>VoltMesh</span>
        {subtitle && <span className={`${subSize} text-zinc-400 mt-0.5`}>{subtitle}</span>}
      </div>
    </>
  );

  const base = `flex items-center space-x-2.5 select-none ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={actionLabel}
        title={actionLabel}
        className={`${base} cursor-pointer rounded-md -m-1 p-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60`}
      >
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
};

export default VoltMeshBrand;
