'use client'

/**
 * TanStack Query provider
 *
 * Wraps the entire app with QueryClientProvider so any component
 * can use useQuery / useMutation without additional setup.
 *
 * This is a Client Component because QueryClient is a browser-side concept.
 * The root layout.tsx (Server Component) imports this and renders it as a
 * child, keeping layout itself a server component.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  // useRef ensures a single QueryClient instance across re-renders
  const clientRef = useRef<QueryClient | null>(null)
  if (!clientRef.current) {
    clientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          // Stale time of 30 seconds — good balance between freshness and
          // avoiding excessive round-trips for financial data
          staleTime: 30_000,
          retry: 1,
        },
      },
    })
  }

  return (
    <QueryClientProvider client={clientRef.current}>
      {children}
    </QueryClientProvider>
  )
}
