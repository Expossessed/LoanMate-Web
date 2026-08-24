/**
 * callGeminiEvaluate — client-side helper that sends images + metadata to
 * the server-side /api/ai-evaluate route (which keeps the API key secret).
 *
 * Converts File objects to base64 data-URIs before sending.
 */

import type { AiResult } from '@/lib/apply-helpers'

async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function callGeminiEvaluate(params: {
  files: { file: File; label: string }[]
  studentName: string
  studentId: string
  requestedAmount: number
  maxLoanCap?: number
  context?: 'register' | 'loan'
}): Promise<AiResult> {
  const images: string[] = []
  const labels: string[] = []

  for (const { file, label } of params.files) {
    try {
      const uri = await fileToDataUri(file)
      images.push(uri)
      labels.push(label)
    } catch {
      console.warn('Could not read file:', label)
    }
  }

  const res = await fetch('/api/ai-evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images,
      labels,
      studentName: params.studentName,
      studentId: params.studentId,
      requestedAmount: params.requestedAmount,
      maxLoanCap: params.maxLoanCap ?? 50000,
      context: params.context ?? 'loan',
    }),
  })

  if (!res.ok) {
    return {
      recommendation: 'manual_review',
      reasoning: 'AI evaluation service unavailable. Admin will review manually.',
      riskScore: 0.5,
      error: `HTTP ${res.status}`,
    }
  }

  return res.json()
}
