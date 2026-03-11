'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PaymentConditionList } from './components/PaymentConditionList'
import { PaymentConditionForm } from './components/PaymentConditionForm'
import type { PaymentCondition } from '@/lib/types'

interface ClientPageProps {
  initialConditions: PaymentCondition[]
  usageCounts: Record<string, number>
}

export function PaymentConditionsClient({ initialConditions, usageCounts }: ClientPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<PaymentCondition | null>(null)

  const handleOpenCreate = () => {
    setEditingCondition(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (cond: PaymentCondition) => {
    setEditingCondition(cond)
    setIsFormOpen(true)
  }

  const handleOpenClone = (cond: PaymentCondition) => {
    const cloned = { ...cond, name: `${cond.name} (Cópia)` }
    delete (cloned as any).id
    setEditingCondition(cloned as PaymentCondition)
    setIsFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleOpenCreate} className="gradient-navy border-0 text-white gap-2">
          <Plus className="h-4 w-4" />
          Nova Condição
        </Button>
      </div>

      <PaymentConditionList 
        conditions={initialConditions} 
        usageCounts={usageCounts}
        loading={false} 
        onEdit={handleOpenEdit} 
        onClone={handleOpenClone}
      />

      <PaymentConditionForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        condition={editingCondition}
      />
    </div>
  )
}
