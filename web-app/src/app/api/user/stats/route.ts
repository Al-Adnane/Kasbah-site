import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'

const KASBAH_API_URL = process.env.NEXT_PUBLIC_KASBAH_API_URL || 'https://api.bekasbah.com'
const KASBAH_API_KEY = process.env.KASBAH_API_KEY

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user stats from Kasbah-Core
    const response = await fetch(`${KASBAH_API_URL}/api/user/stats`, {
      headers: {
        'Authorization': `Bearer ${KASBAH_API_KEY}`,
        'X-User-ID': userId
      }
    })

    if (!response.ok) {
      throw new Error(`Kasbah API error: ${response.status}`)
    }

    const stats = await response.json()

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
