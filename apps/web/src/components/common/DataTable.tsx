import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  accessor?: (row: T) => any;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  mono?: boolean;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  compact?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectedId,
  searchPlaceholder = 'Filter records...',
  searchFilter,
  compact = false,
  emptyMessage = 'No records in interval',
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    let result = [...data];
    if (searchQuery.trim() && searchFilter) {
      result = result.filter(row => searchFilter(row, searchQuery.toLowerCase().trim()));
    }
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      result.sort((a, b) => {
        const valA = col?.accessor ? col.accessor(a) : (a as any)[sortKey];
        const valB = col?.accessor ? col.accessor(b) : (b as any)[sortKey];

        if (typeof valA === 'bigint' && typeof valB === 'bigint') {
          return sortDir === 'asc' ? Number(valA - valB) : Number(valB - valA);
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDir === 'asc' ? valA - valB : valB - valA;
        }
        const strA = String(valA ?? '').toLowerCase();
        const strB = String(valB ?? '').toLowerCase();
        return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }
    return result;
  }, [data, searchQuery, searchFilter, sortKey, sortDir, columns]);

  const handleHeaderClick = (col: Column<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  return (
    <div className="flex flex-col border border-zinc-800 bg-[#121215] rounded-none">
      {/* Search Header if searchFilter provided */}
      {searchFilter && (
        <div className="p-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 pl-8 pr-3 py-1 rounded placeholder-zinc-600 focus:outline-none focus:border-emerald-600 font-mono"
            />
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            SHOWING {filteredData.length} OF {data.length}
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-mono tracking-wider text-zinc-400 uppercase select-none">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const alignClass =
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    onClick={() => handleHeaderClick(col)}
                    className={`${compact ? 'py-1.5 px-2.5' : 'py-2 px-3'} ${alignClass} ${
                      col.sortable ? 'cursor-pointer hover:text-zinc-200 transition-colors' : ''
                    } font-semibold`}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : ''}`}>
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-zinc-600">
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-emerald-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-xs">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-zinc-500 font-mono text-xs">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredData.map((row) => {
                const rowKey = keyExtractor(row);
                const isSelected = selectedId === rowKey;

                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-zinc-800/80 text-white'
                        : 'hover:bg-zinc-800/40 text-zinc-300'
                    } ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                      const content = col.render
                        ? col.render(row)
                        : col.accessor
                        ? String(col.accessor(row) ?? '—')
                        : String((row as any)[col.key] ?? '—');

                      return (
                        <td
                          key={col.key}
                          className={`${compact ? 'py-1.5 px-2.5' : 'py-2 px-3'} ${alignClass} ${
                            col.mono ? 'font-mono' : ''
                          }`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
