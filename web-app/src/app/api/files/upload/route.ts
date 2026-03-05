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

    // 2. Parse multipart form data
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const results = []

    // 3. Process each file
    for (const file of files) {
      // Convert file to base64
      const fileBuffer = await file.arrayBuffer()
      const base64File = Buffer.from(fileBuffer).toString('base64')

      // 4. Send to Kasbah-Core for scanning
      const response = await fetch(`${KASBAH_API_URL}/api/scan-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KASBAH_API_KEY}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          fileContent: base64File
        })
      })

      if (!response.ok) {
        throw new Error(`Kasbah API error: ${response.status}`)
      }

      const scanResult = await response.json()

      results.push({
        name: file.name,
        size: file.size,
        type: file.type,
        ...scanResult
      })
    }

    return NextResponse.json({ 
      success: true,
      count: results.length,
      results 
    })
  } catch (error) {
    console.error('File upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
