'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckIcon, XIcon, HandshakeIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'

async function fetchInbox(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('loan_pledges')
    .select('*, loans(amount, purpose, user_id)')
    .eq('pledger_id', userId)
    .eq('borrower_self', false)
    .eq('status', 'pending')
  return (data ?? []) as Record<string, unknown>[]
}

export default function PledgeInboxPage() {
  const { profile } = useAuth()
  const userId = profile?.id
  const qc = useQueryClient()
  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ['pledge-inbox', userId],
    queryFn: () => fetchInbox(userId!),
    enabled: !!userId,
  })

  const respondMutation = useMutation({
    mutationFn: async ({ pledgeId, accept }: { pledgeId: string; accept: boolean }) => {
      const supabase = createClient()
      const newStatus = accept ? 'accepted' : 'declined'
      await supabase.from('loan_pledges').update({ status: newStatus }).eq('id', pledgeId)
    },
    onSuccess: (_, { accept }) => {
      toast.success(accept ? 'Pledge accepted.' : 'Pledge declined.')
      qc.invalidateQueries({ queryKey: ['pledge-inbox', userId] })
      qc.invalidateQueries({ queryKey: ['pending-pledges', userId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="px-6 pt-12 pb-10 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HandshakeIcon size={24} className="text-[var(--brand-green)]" />
        <h1 className="text-2xl font-bold text-gray-900">Pledge Inbox</h1>
        {pledges.length > 0 && (
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-400 text-white text-xs font-bold">
            {pledges.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="animate-pulse bg-white rounded-2xl h-32"/>)}</div>
      ) : pledges.length === 0 ? (
        <div className="text-center py-20">
          <HandshakeIcon size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-400">No pending pledge invitations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pledges.map((p) => {
            const loan = p.loans as Record<string, unknown> | null
            return (
              <div key={String(p.id)} className="bg-white rounded-2xl p-5 shadow-sm border border-orange-100">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Pledge Request</p>
                <p className="font-bold text-gray-900 mb-0.5 capitalize">{String(loan?.purpose ?? 'Loan')}</p>
                <p className="text-2xl font-extrabold text-[var(--brand-green)] mb-3">{formatCurrency(Number(p.amount ?? 0))}</p>
                <p className="text-sm text-gray-600 mb-4">A classmate is asking you to co-sign as collateral for their loan application.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => respondMutation.mutate({ pledgeId: String(p.id), accept: false })}
                    disabled={respondMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-300 text-red-600 font-bold text-sm hover:bg-red-50 transition disabled:opacity-50"
                  >
                    <XIcon size={16}/>Decline
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ pledgeId: String(p.id), accept: true })}
                    disabled={respondMutation.isPending}
                    className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-green)] text-white font-bold text-sm hover:bg-[var(--brand-green-dark)] transition disabled:opacity-50"
                  >
                    <CheckIcon size={16}/>Accept
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
