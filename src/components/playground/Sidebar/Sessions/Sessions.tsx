'use client'

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useQueryState } from 'nuqs'

import { usePlaygroundStore } from '@/store'

import SessionItem from './SessionItem'
import SessionBlankState from './SessionBlankState'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

dayjs.extend(utc)

const formatDate = (ts: number, style: 'natural' | 'full' = 'full'): string => {
  const d = dayjs.unix(ts).utc()
  return style === 'natural'
    ? d.format('HH:mm')
    : d.format('YYYY-MM-DD HH:mm:ss')
}

interface SkeletonListProps {
  skeletonCount: number
}
const SkeletonList: FC<SkeletonListProps> = ({ skeletonCount }) => {
  const list = useMemo(
    () => Array.from({ length: skeletonCount }, (_, i) => i),
    [skeletonCount]
  )

  return list.map((k, idx) => (
    <Skeleton
      key={k}
      className={cn(
        'mb-1 h-11 rounded-lg px-3 py-2',
        idx > 0 && 'bg-muted'
      )}
    />
  ))
}

const Sessions = () => {
  const [sessionId] = useQueryState('session')

  // A carga das sessões (lista e a de ?session=) fica no ChatArea.
  const {
    isEndpointActive,
    isEndpointLoading,
    hasStorage,
    sessionsData,
    isSessionsLoading
  } = usePlaygroundStore()

  const [isScrolling, setIsScrolling] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleScroll = () => {
    setIsScrolling(true)

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 1500)
  }

  // Cleanup the scroll timeout when component unmounts
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (sessionId) setSelectedSessionId(sessionId)
  }, [sessionId])

  const formattedSessions = useMemo(() => {
    if (!Array.isArray(sessionsData)) return []
    return sessionsData.map((e) => ({
      ...e,
      formatted_time: formatDate(e.created_at, 'natural')
    }))
  }, [sessionsData])

  const handleSessionClick = useCallback(
    (id: string) => () => setSelectedSessionId(id),
    []
  )

  if (isSessionsLoading || isEndpointLoading) {
    return (
      <div className="w-full">
        <div className="mb-2 text-xs font-medium uppercase">Sessions</div>
        <div className="mt-4 h-[calc(100vh-325px)] w-full overflow-y-auto">
          <SkeletonList skeletonCount={5} />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-2 w-full text-xs font-medium uppercase">Sessions</div>
      <div
        className={`h-[calc(100vh-345px)] overflow-y-auto font-sans transition-all duration-300 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar]:transition-opacity [&::-webkit-scrollbar]:duration-300 ${
          isScrolling
            ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:opacity-0'
            : '[&::-webkit-scrollbar]:opacity-100'
        }`}
        onScroll={handleScroll}
        onMouseOver={() => setIsScrolling(true)}
        onMouseLeave={handleScroll}
      >
        {!isEndpointActive ||
        !hasStorage ||
        (!isSessionsLoading && (!sessionsData || sessionsData.length === 0)) ? (
          <SessionBlankState />
        ) : (
          <div className="flex flex-col gap-y-1 pr-1">
            {formattedSessions.map((entry, idx) => (
              <SessionItem
                key={`${entry.session_id}-${idx}`}
                {...entry}
                currentSessionId={selectedSessionId}
                isSelected={selectedSessionId === entry.session_id}
                onSessionClick={handleSessionClick(entry.session_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Sessions
