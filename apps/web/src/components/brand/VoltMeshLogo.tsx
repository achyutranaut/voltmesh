import React from 'react';

export type VoltMeshLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type VoltMeshLogoVariant = 'full' | 'mark' | 'wordmark';

export interface VoltMeshLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: VoltMeshLogoSize;
  variant?: VoltMeshLogoVariant;
  markOnly?: boolean;
  wordmarkOnly?: boolean;
  withGlow?: boolean;
  className?: string;
  imgClassName?: string;
}

const SIZE_CONFIGS: Record<
  VoltMeshLogoSize,
  {
    full: { height: string; width: string };
    mark: { height: string; width: string };
    wordmark: { height: string; width: string };
  }
> = {
  xs: {
    full: { height: 'h-4', width: 'w-auto' },
    mark: { height: 'h-4', width: 'w-auto' },
    wordmark: { height: 'h-3', width: 'w-auto' },
  },
  sm: {
    full: { height: 'h-6', width: 'w-auto' },
    mark: { height: 'h-5', width: 'w-auto' },
    wordmark: { height: 'h-4', width: 'w-auto' },
  },
  md: {
    full: { height: 'h-8', width: 'w-auto' },
    mark: { height: 'h-7', width: 'w-auto' },
    wordmark: { height: 'h-5', width: 'w-auto' },
  },
  lg: {
    full: { height: 'h-10', width: 'w-auto' },
    mark: { height: 'h-9', width: 'w-auto' },
    wordmark: { height: 'h-7', width: 'w-auto' },
  },
  xl: {
    full: { height: 'h-14', width: 'w-auto' },
    mark: { height: 'h-12', width: 'w-auto' },
    wordmark: { height: 'h-9', width: 'w-auto' },
  },
};

export const VoltMeshLogo: React.FC<VoltMeshLogoProps> = ({
  size = 'md',
  variant = 'full',
  markOnly = false,
  wordmarkOnly = false,
  withGlow = false,
  className = '',
  imgClassName = '',
  ...rest
}) => {
  const activeVariant: VoltMeshLogoVariant = markOnly
    ? 'mark'
    : wordmarkOnly
    ? 'wordmark'
    : variant;

  const sizeCfg = SIZE_CONFIGS[size][activeVariant];

  let src = '/brand/voltmesh-logo.png';
  let alt = 'VoltMesh';

  if (activeVariant === 'mark') {
    src = '/brand/voltmesh-mark.png';
    alt = 'VoltMesh Symbol';
  } else if (activeVariant === 'wordmark') {
    src = '/brand/voltmesh-wordmark.png';
    alt = 'VoltMesh';
  }

  return (
    <div
      className={`inline-flex items-center select-none relative ${className}`}
      {...rest}
    >
      {withGlow && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 blur-md rounded-full pointer-events-none -z-10"
        />
      )}
      <img
        src={src}
        alt={alt}
        className={`${sizeCfg.height} ${sizeCfg.width} object-contain transition-transform duration-200 ${imgClassName}`}
        loading="eager"
        decoding="async"
      />
    </div>
  );
};

export default VoltMeshLogo;
