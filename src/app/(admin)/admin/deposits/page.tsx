'use client'
import { useQuery } from '@tanstack/react-query'
import { CheckCircleIcon, ClockIcon, XCircleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/types'

async function fetchDeposits() {
  const supabase = createClient()
  const { data } = await supabase
    .from('lender_deposits')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export default function AdminDepositsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['admin-deposits'], queryFn: fetchDeposits })

  return (
    <div className="px-6 pt-12 pb-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Lender Deposits</h1>
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="animate-pulse bg-white rounded-2xl h-20"/>)}</div>
      ) : data.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No deposits yet.</p>
      ) : (
        <div className="space-y-3">
          {data.map((d: Record<string,unknown>) => (
            <div key={String(d.id)} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900">{formatCurrency(Number(d.principal ?? 0))}</p>
                  <p className="text-xs text-gray-400">{d.term_months} months · {Number(d.return_rate ?? 0)*100}% return</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  String(d.status) === 'active' ? 'bg-green-50 text-green-700 border-green-200'
                  : String(d.status) === 'pending' ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200'
                }`}>{String(d.status)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
