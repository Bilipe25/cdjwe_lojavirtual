import { getFiscalBaseDashboardAction } from '@/app/admin/actions/fiscal-bases'
import { FiscalBaseDashboard } from './components/FiscalBaseDashboard'
import { FiscalSourceGuide } from './components/FiscalSourceGuide'

export default async function FiscalBasesPage() {
    const result = await getFiscalBaseDashboardAction()

    if (!result.success || !result.data) {
        return (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
                {result.error || 'N\u00E3o foi poss\u00EDvel carregar o dashboard das bases fiscais.'}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">Bases Fiscais</h1>
                <p className="mt-1 text-muted-foreground">
                    {'Subm\u00F3dulo fiscal versionado para alimentar perfis tribut\u00E1rios com menos digita\u00E7\u00E3o manual e mais rastreabilidade.'}
                </p>
            </div>

            <FiscalBaseDashboard cards={result.data} />
            <FiscalSourceGuide />
        </div>
    )
}
