'use client'

import { useMemo, useState } from 'react'
import type { BuilderCustomer, DraftItem } from '@/components/sales/order-builder/types'
import type { PriceTable } from '@/lib/types'

function getDefaultAddressId(store: BuilderCustomer | null) {
  return store?.addresses?.find((address) => address.is_main)?.id || store?.addresses?.[0]?.id || ''
}

function getDefaultPriceTableId(store: BuilderCustomer | null, fallbackTables: PriceTable[]) {
  return (store?.assigned_price_tables?.[0] || fallbackTables[0])?.id || ''
}

export function useOrderDraft({
  customers,
  priceTables,
  initialCustomerId,
}: {
  customers: BuilderCustomer[]
  priceTables: PriceTable[]
  initialCustomerId?: string
}) {
  const initialStore = customers.find((customer) => customer.id === initialCustomerId) || null

  const [selectedStoreId, setSelectedStoreId] = useState(initialCustomerId || '')
  const [selectedAddressId, setSelectedAddressId] = useState(() => getDefaultAddressId(initialStore))
  const [selectedPriceTableId, setSelectedPriceTableId] = useState(() => getDefaultPriceTableId(initialStore, priceTables))
  const [items, setItems] = useState<DraftItem[]>([])

  const selectedStore = useMemo(
    () => customers.find((customer) => customer.id === selectedStoreId) || null,
    [customers, selectedStoreId]
  )

  const availablePriceTables = useMemo(
    () => (selectedStore?.assigned_price_tables?.length ? selectedStore.assigned_price_tables : priceTables),
    [priceTables, selectedStore]
  )

  const handleStoreChange = (nextStoreId: string) => {
    const nextStore = customers.find((customer) => customer.id === nextStoreId) || null
    setSelectedStoreId(nextStoreId)
    setSelectedAddressId(getDefaultAddressId(nextStore))
    setSelectedPriceTableId(getDefaultPriceTableId(nextStore, priceTables))
  }

  return {
    selectedStore,
    selectedStoreId,
    setSelectedStoreId,
    selectedAddressId,
    setSelectedAddressId,
    selectedPriceTableId,
    setSelectedPriceTableId,
    items,
    setItems,
    availablePriceTables,
    handleStoreChange,
  }
}
