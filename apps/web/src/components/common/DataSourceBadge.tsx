import React from 'react';
import { cn } from '@/lib/utils';

export interface DataSourceBadgeProps {
  source: string;
  asOf: number; // Unix timestamp in seconds
  stale?: boolean;
  className?: string;
  showAttributionLink?: boolean;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({
  source,
  asOf,
  stale = false,
  className,
  showAttributionLink = false,
}) => {
  const asOfDate = new Date(asOf * 1000);
  const formattedTime = asOf > 0 ? asOfDate.toLocaleTimeString() : '—';
  const isOpenMeteo = source.toLowerCase().includes('open-meteo');

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-card text-muted-foreground',
        stale ? 'border-amber-500/30 text-amber-300 bg-amber-950/20' : '',
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', stale ? 'bg-amber-400' : 'bg-[hsl(var(--ok))]')} />
      <span>
        {isOpenMeteo && showAttributionLink ? (
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-foreground"
          >
            Weather by Open-Meteo.com
          </a>
        ) : (
          source
        )}
      </span>
      <span>·</span>
      <span>as of {formattedTime}</span>
      {stale && (
        <span className="px-1 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 ml-0.5">
          STALE
        </span>
      )}
    </div>
  );
};
