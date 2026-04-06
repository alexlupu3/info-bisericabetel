import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Site } from '@betel/shared'

const SitesContext = createContext<Site[]>([])

export function SitesProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ['sites'],
    queryFn: api.sites,
    staleTime: Infinity,
  })
  return (
    <SitesContext.Provider value={data?.sites ?? []}>
      {children}
    </SitesContext.Provider>
  )
}

export function useSites() {
  return useContext(SitesContext)
}
