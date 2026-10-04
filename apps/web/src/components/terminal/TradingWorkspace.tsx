import React from 'react';
import { cn } from '@/lib/utils';

export interface TradingWorkspaceProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const TradingWorkspace: React.FC<TradingWorkspaceProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <main
      className={cn(
        'flex-1 w-full max-w-[1500px] mx-auto p-4 sm:p-6 lg:p-7 space-y-6 overflow-y-auto font-sans text-zinc-300',
        className
      )}
      {...props}
    >
      {children}
    </main>
  );
};
