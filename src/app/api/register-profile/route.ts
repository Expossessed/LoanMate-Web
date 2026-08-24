/**
 * POST /api/register-profile
 *
 * Inserts role-specific profile rows after a successful auth.signUp().
 * Uses the SUPABASE_SERVICE_ROLE_KEY so it bypasses all RLS policies.
 *
 * The caller must supply the userId returned by auth.signUp() — the route
 * verifies the caller is authenticated as that user before writing.
 *
 * Request body (JSON):
 * {
 *   userId:          string
 *   accountType:     'Student' | 'Lender'
 *   studentId:       string        // school-issued ID
 *   course:          string | null // students only
 *   yearLevel:       number | null // students only
 *   requirementsUrl: string | null // uploaded file URL (Study Load / Valid ID)
 * }
 *
 * Response (JSON):
 * { ok: true }  — or — { error: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }
  return createServerClient(url, serviceKey, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      accountType,
      studentId,
      course,
      yearLevel,
      requirementsUrl,
    }: {
      userId: string
      accountType: 'Student' | 'Lender'
      studentId: string
      course: string | null
      yearLevel: number | null
      requirementsUrl: string | null
    } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const supabase = adminClient()
    const isStudent = accountType === 'Student'

    if (isStudent) {
      const { error } = await supabase.from('student_profiles').insert({
        id: userId,
        student_id: studentId,
        course: course ?? null,
        year_level: yearLevel ?? null,
        enrollment_status: 'enrolled',
        has_forfeiture_history: false,
        requirements_url: requirementsUrl ?? null,
      })
      if (error) {
        console.error('[register-profile] student_profiles insert failed:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await supabase.from('lender_profiles').insert({
        id: userId,
        requirements_url: requirementsUrl ?? null,
      })
      if (error) {
        console.error('[register-profile] lender_profiles insert failed:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[register-profile] unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
