import type { NextRequest } from 'next/server'

import { postRun } from '../../../runs'

export const runtime = 'nodejs'

export const POST = (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => postRun(request, 'team', params)
