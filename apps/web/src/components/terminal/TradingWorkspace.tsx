import React from 'react';
import { cn } from '@/lib/utils';

interface TradingWorkspaceProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const TradingWorkspace: React.FC<TradingWorkspaceProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 overflow-y-auto font-mono text-zinc-200 selection:bg-emerald-950 selection:text-emerald-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
