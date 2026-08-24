/**
 * POST /api/ai-evaluate
 *
 * Server-side Gemini document evaluation — API key stays secret.
 *
 * Two contexts:
 *   "register" → Study Load verification: checks student ID, last name, enrollment status
 *   "loan"     → School ID + Assessment Slip: checks name, ID, amount eligibility
 *
 * Request body (JSON):
 *   {
 *     images:          string[]  // base64 data-URIs ("data:image/jpeg;base64,...")
 *     labels:          string[]  // e.g. ["Study Load"] or ["School ID","Assessment Slip"]
 *     studentName:     string    // full name on file (first + last)
 *     studentId:       string    // student ID on file
 *     requestedAmount: number    // 0 for register context
 *     maxLoanCap?:     number    // default 50000
 *     context?:        string    // "register" | "loan"  (default: "loan")
 *   }
 *
 * Response (JSON):
 *   {
 *     recommendation: "approve" | "reject" | "manual_review"
 *     reasoning:      string
 *     riskScore:      number
 *     error?:         string   // present when falling back to local eval
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

// ─── Prompts ──────────────────────────────────────────────────────────────────

/**
 * Registration prompt — Study Load document.
 * Mirrors the Flutter buildPrompt structure for the register flow.
 * Checks: student ID number, last name match, enrollment status.
 */
function buildRegisterPrompt(studentName: string, studentId: string) {
  const lastName = studentName.trim().split(' ').slice(-1)[0] ?? studentName

  return `You are an enrollment verification AI for a university student cooperative loan system.
You have been given one document: a Study Load (also called Enrollment Form or Certificate of Registration).
The document should contain the student's full name, student ID number, and enrollment status.

Student on file: "${studentName}" (ID: ${studentId})
Last name to verify (last name is sufficient — first name is not required): "${lastName}"

Perform the following evaluation and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

JSON schema (all fields required):
{
  "extracted_name":      string  // full name as printed on the document,
  "extracted_last_name": string  // surname/family name extracted from the document,
  "extracted_student_id": string // student ID number as printed on the document,
  "is_enrolled":         boolean // true if document clearly shows the student is currently ENROLLED
                                 // (look for: "ENROLLED", "REGULAR", list of subjects with units, COR header),
  "last_name_match":     boolean // true if extracted_last_name closely matches "${lastName}"
                                 // (case-insensitive, allow minor spacing/typo differences),
  "id_match":            boolean // true if extracted_student_id matches "${studentId}",
  "documents_legible":   boolean // true if the document is clear enough to read ID and name,
  "risk_score":          number  // 0.0 (highest risk) to 1.0 (lowest risk),
  "recommendation":      string  // exactly one of: "approve", "reject", "manual_review",
  "reasoning":           string  // 1-2 sentence human-readable explanation
}

Recommendation rules:
- "approve"       if last_name_match=true AND id_match=true AND is_enrolled=true AND documents_legible=true AND risk_score >= 0.65
- "reject"        if id_match=false OR (last_name_match=false AND extracted_last_name is clearly a different person) OR document appears fraudulent/falsified/digitally edited
- "manual_review" for all other cases (blurry doc, enrollment status unclear, borderline score, name unclear)

Risk score guidance:
- Start at 0.60 as baseline
- +0.20 if the student ID matches exactly
- +0.10 if the last name matches the registered last name
- +0.15 if the student is clearly marked as ENROLLED / has active subjects
- -0.30 if the student ID on the document does not match "${studentId}"
- -0.20 if the last name on the document is clearly a different person's name
- -0.20 if the student appears NOT enrolled (LOA, Leave of Absence, no subjects listed, withdrawn)
- -0.15 if the document is blurry, cropped, or partially unreadable
- -0.30 if the document appears digitally altered, printed from a screen, or inconsistent`
}

/**
 * Loan prompt — School ID + Assessment Slip.
 * Exact mirror of the Flutter buildPrompt in ai_service.dart.
 */
function buildLoanPrompt(
  studentName: string,
  studentId: string,
  requestedAmount: number,
  maxLoanCap: number,
) {
  return `You are a loan officer AI for a university student cooperative loan system.
You have been given two documents: a School ID and an Assessment Slip.
Both documents should contain the student's full name and student ID number.

Student on file: "${studentName}" (ID: ${studentId})
Requested loan amount: ₱${requestedAmount.toFixed(2)}
System maximum loan cap: ₱${maxLoanCap.toFixed(2)}

Perform the following evaluation and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

JSON schema (all fields required):
{
  "extracted_name":            string  // full name from either document,
  "extracted_student_id":      string  // student ID number from either document,
  "extracted_tuition_balance": number  // amount due from the assessment slip (0 if unreadable),
  "extracted_monthly_income":  number  // always 0 (not collected in these documents),
  "name_match":                boolean // true if extracted_name closely matches "${studentName}",
  "id_match":                  boolean // true if extracted_student_id matches "${studentId}",
  "documents_legible":         boolean // true if both documents are clear enough to read,
  "eligible_amount":           number  // min(extracted_tuition_balance, ${requestedAmount.toFixed(2)}, ${maxLoanCap.toFixed(2)}),
  "risk_score":                number  // 0.0 (highest risk) to 1.0 (lowest risk),
  "recommendation":            string  // exactly one of: "approve", "reject", "manual_review",
  "reasoning":                 string  // 1-2 sentence human-readable explanation
}

Recommendation rules:
- "approve"       if name_match=true AND id_match=true AND documents_legible=true AND risk_score >= 0.65
- "reject"        if name_match=false OR id_match=false OR documents appear fraudulent/falsified
- "manual_review" for all other cases (blurry docs, name mismatch unclear, borderline score)

Risk score guidance:
- Start at 0.70 as baseline
- +0.15 if the name matches exactly across both documents
- +0.10 if the ID number matches exactly across both documents
- +0.10 if extracted_tuition_balance is close to the requested amount (not overborrowing)
- -0.20 if name on School ID does not match name on Assessment Slip
- -0.20 if student ID on School ID does not match ID on Assessment Slip
- -0.15 if either document is blurry, cropped, or partially unreadable
- -0.30 if either document appears digitally altered or inconsistent`
}

// ─── Local fallback ───────────────────────────────────────────────────────────

function localFallback(
  imageCount: number,
  context: string,
): { recommendation: 'approve' | 'reject' | 'manual_review'; reasoning: string; riskScore: number; error: string } {
  if (imageCount === 0) {
    return {
      recommendation: 'manual_review',
      reasoning: 'No documents uploaded. Please upload the required file.',
      riskScore: 0.3,
      error: 'No images provided',
    }
  }
  return {
    recommendation: context === 'register' ? 'manual_review' : 'approve',
    reasoning:
      context === 'register'
        ? 'AI evaluation unavailable. Admin will manually verify your Study Load.'
        : 'Documents submitted. Application forwarded to admin for final sign-off.',
    riskScore: 0.75,
    error: 'Gemini unavailable — used local evaluation',
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      images = [],
      labels = [],
      studentName = '',
      studentId = '',
      requestedAmount = 0,
      maxLoanCap = 50000,
      context = 'loan',
    } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.warn('[ai-evaluate] No GEMINI_API_KEY set — using local fallback')
      return NextResponse.json(localFallback(images.length, context), { status: 200 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })

    // Build multimodal parts: [image, label, image, label, ..., prompt]
    const parts: unknown[] = []
    for (let i = 0; i < images.length; i++) {
      const dataUri: string = images[i]
      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) continue
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
      if (labels[i]) parts.push({ text: `(Document: ${labels[i]})` })
    }

    // Append context-specific prompt
    const prompt =
      context === 'register'
        ? buildRegisterPrompt(studentName, studentId)
        : buildLoanPrompt(studentName, studentId, requestedAmount, maxLoanCap)
    parts.push({ text: prompt })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    } as Parameters<typeof model.generateContent>[0])

    const raw = result.response.text().trim()
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const json = JSON.parse(cleaned)

    // Normalise response for both contexts
    const recommendation: 'approve' | 'reject' | 'manual_review' =
      json.recommendation === 'approve' || json.recommendation === 'reject'
        ? json.recommendation
        : 'manual_review'

    // For register context, also surface enrollment/name/id details in reasoning
    let reasoning = json.reasoning ?? ''
    if (context === 'register') {
      const parts2: string[] = []
      if (json.extracted_student_id) parts2.push(`ID found: ${json.extracted_student_id}`)
      if (json.extracted_last_name) parts2.push(`Last name found: ${json.extracted_last_name}`)
      if (typeof json.is_enrolled === 'boolean')
        parts2.push(json.is_enrolled ? 'Status: Enrolled ✓' : 'Status: NOT enrolled ✗')
      if (parts2.length > 0) reasoning = `${reasoning}\n\n${parts2.join(' · ')}`
    }

    console.log(`[ai-evaluate] ${context} → ${recommendation} (score: ${json.risk_score})`)

    return NextResponse.json({ recommendation, reasoning, riskScore: json.risk_score ?? 0 })
  } catch (err) {
    console.error('[ai-evaluate] error:', err)
    return NextResponse.json({
      recommendation: 'manual_review',
      reasoning: 'AI evaluation could not complete. Admin will review manually.',
      riskScore: 0.5,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
