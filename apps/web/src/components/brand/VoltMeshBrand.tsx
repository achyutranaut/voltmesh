import React from 'react';

export interface VoltMeshBrandProps {
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const VoltMeshBrand: React.FC<VoltMeshBrandProps> = ({
  subtitle = 'TRADING TERMINAL',
  size = 'md',
  className = '',
  onClick,
}) => {
  const markSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  const titleSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';
  const subSize = size === 'sm' ? 'text-[9px]' : size === 'lg' ? 'text-[11px]' : 'text-[10px]';

  return (
    <div
      className={`flex items-center space-x-2.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <img
        src="/brand/voltmesh-mark.png"
        alt="VoltMesh Mark"
        className={`${markSize} object-contain shrink-0`}
        loading="eager"
      />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className={`${titleSize} font-bold tracking-wider text-white font-mono`}>
          VOLTMESH
        </span>
        {subtitle && (
          <span className={`${subSize} text-zinc-400 font-mono tracking-wider uppercase mt-0.5`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default VoltMeshBrand;
