import { cn } from '@/lib/utils'

const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn('rounded-md bg-secondary motion-safe:skeleton-shine', className)}
      {...props}
    />
  )
}

export { Skeleton }
