'use client'

import { motion } from 'framer-motion'
import { EmitterFederalTaxesSection } from './EmitterFederalTaxesSection'
import { EmitterIcmsStatesSection } from './EmitterIcmsStatesSection'
import { EmitterIbscbsStatesSection } from './EmitterIbscbsStatesSection'

export function EmitterTaxesTab() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
        >
            <EmitterFederalTaxesSection />
            <EmitterIcmsStatesSection />
            <EmitterIbscbsStatesSection />
        </motion.div>
    )
}
