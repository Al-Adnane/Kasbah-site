import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs'
import { v4 as uuidv4 } from 'uuid'

const KASBAH_API_URL = process.env.NEXT_PUBLIC_KASBAH_API_URL || 'https://api.bekasbah.com'

// GET - List all API keys
export async function GET(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get API keys from Kasbah-Core
    const response = await fetch(`${KASBAH_API_URL}/api/keys`, {
      headers: {
        'Authorization': `Bearer ${process.env.KASBAH_API_KEY}`,
        'X-User-ID': userId
      }
    })

    if (!response.ok) {
      throw new Error(`Kasbah API error: ${response.status}`)
    }

    const { keys } = await response.json()

    return NextResponse.json({ keys })
  } catch (error) {
    console.error('Get keys error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Create new API key
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name } = await request.json()
    const key = `pk_${uuidv4().replace(/-/g, '')}`
    const keyPrefix = key.substring(0, 10)

    // Create API key in Kasbah-Core
    const response = await fetch(`${KASBAH_API_URL}/api/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KASBAH_API_KEY}`,
        'X-User-ID': userId
      },
      body: JSON.stringify({
        name: name || 'New API Key',
        key,
        keyPrefix
      })
    })

    if (!response.ok) {
      throw new Error(`Kasbah API error: ${response.status}`)
    }

    const newKey = await response.json()

    return NextResponse.json({
      id: newKey.id,
      name: newKey.name,
      key: newKey.key, // Only shown once
      keyPrefix: newKey.keyPrefix,
      created: newKey.created_at
    })
  } catch (error) {
    console.error('Create key error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete API key
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID required' }, { status: 400 })
    }

    // Delete API key in Kasbah-Core
    const response = await fetch(`${KASBAH_API_URL}/api/keys/${keyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.KASBAH_API_KEY}`,
        'X-User-ID': userId
      }
    })

    if (!response.ok) {
      throw new Error(`Kasbah API error: ${response.status}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete key error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
