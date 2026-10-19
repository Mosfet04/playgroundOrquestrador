import * as React from 'react'

import { cn } from '@/lib/utils'

// Table do Design System (P1-01: `table.tsx` do shadcn, só marcação), no card
// com borda e rolagem horizontal própria.

const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
    <table className={cn('w-full min-w-[680px] border-collapse text-sm', className)} {...props} />
  </div>
)

const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-b border-border last:border-b-0', className)} {...props} />
)

const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'h-9 whitespace-nowrap border-b border-border bg-muted px-3 text-left text-xs font-medium text-muted-foreground',
      className
    )}
    {...props}
  />
)

const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('h-[52px] px-3 align-middle', className)} {...props} />
)

export { Table, TableRow, TableHead, TableCell }
