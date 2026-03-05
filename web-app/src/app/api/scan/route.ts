import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'

const KASBAH_API_URL = process.env.NEXT_PUBLIC_KASBAH_API_URL || 'https://api.bekasbah.com'
const KASBAH_API_KEY = process.env.KASBAH_API_KEY

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse request
    const { text } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // 3. Call Kasbah-Core API
    const response = await fetch(`${KASBAH_API_URL}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KASBAH_API_KEY}`
      },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      throw new Error(`Kasbah API error: ${response.status}`)
    }

    const result = await response.json()

    // 4. Return result with user info
    return NextResponse.json({
      ...result,
      userId,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Scan API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
