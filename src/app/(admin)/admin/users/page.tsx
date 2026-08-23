'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

async function fetchUsers() {
  const supabase = createClient()
  const { data } = await supabase.rpc('admin_get_all_students')
  return (data ?? []) as Record<string, unknown>[]
}

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers })
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Suspended' ? 'Active' : 'Suspended'
    setProcessing(p => new Set(p).add(userId))
    try {
      const supabase = createClient()
      await supabase.rpc('admin_update_enrollment_status', { p_user_id: userId, p_status: newStatus })
      toast.success(`User ${newStatus === 'Active' ? 'restored' : 'suspended'}.`)
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setProcessing(p => { const s = new Set(p); s.delete(userId); return s })
    }
  }

  return (
    <div className="px-6 pt-12 pb-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Manage Users</h1>
      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="animate-pulse bg-white rounded-2xl h-16"/>)}</div>
      ) : users.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No users found.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const uid = String(u.id)
            const status = String(u.enrollment_status ?? 'Active')
            const isProc = processing.has(uid)
            const isSuspended = status === 'Suspended'
            return (
              <div key={uid} className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--brand-green-100)] shrink-0">
                  <span className="text-sm font-extrabold text-[var(--brand-green)]">
                    {String(u.first_name ?? '?')[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="text-xs font-mono text-gray-400">{String(u.student_id)}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${isSuspended ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                  {status}
                </span>
                <button
                  id={`toggle-user-${uid}`}
                  onClick={() => toggleStatus(uid, status)}
                  disabled={isProc}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${isSuspended ? 'bg-[var(--brand-green)] text-white hover:opacity-90' : 'bg-red-100 text-red-700 hover:bg-red-200'} disabled:opacity-50`}
                >
                  {isProc ? '…' : isSuspended ? 'Restore' : 'Suspend'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
