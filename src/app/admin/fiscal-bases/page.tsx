import { getFiscalBaseDashboardAction } from '@/app/admin/actions/fiscal-bases'
import { listIcmsBasesAction } from '@/app/admin/actions/icms-bases'
import { listIbscbsBasesAction } from '@/app/admin/actions/ibscbs-bases'
import { FiscalBaseDashboard } from './components/FiscalBaseDashboard'
import { FiscalSourceGuide } from './components/FiscalSourceGuide'

export default async function FiscalBasesPage() {
    const [result, icmsResult, ibscbsResult] = await Promise.all([
        getFiscalBaseDashboardAction(),
        listIcmsBasesAction(),
        listIbscbsBasesAction(),
    ])

    if (!result.success || !result.data) {
        return (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
                {result.error || 'Nao foi possivel carregar o dashboard das bases fiscais.'}
            </div>
        )
    }

    const icmsBases = icmsResult.success && icmsResult.data ? icmsResult.data : []
    const ibscbsBases = ibscbsResult.success && ibscbsResult.data ? ibscbsResult.data : []

    const icmsCard = {
        tableType: 'icms' as const,
        kind: 'config' as const,
        label: 'Base de ICMS',
        description: 'Configuracao interna reutilizavel para ICMS, com regra nacional, excecoes por UF, interestadual e preparacao de ST.',
        isEnabled: true,
        recommendedRefreshDays: 0,
        activeVersion: null,
        latestVersion: null,
        lastImportAt: icmsBases[0]?.updatedAt || null,
        rowCount: icmsBases.length,
        isStale: false,
        staleByDays: null,
        hasAnyVersion: icmsBases.length > 0,
        openHref: '/admin/fiscal-bases/icms',
        openLabel: 'Abrir bases',
        primaryActionHref: '/admin/fiscal-bases/icms/novo',
        primaryActionLabel: 'Nova base',
        metricPanels: [
            {
                label: 'Ultima atualizacao',
                value: icmsBases[0]?.updatedAt ? new Date(icmsBases[0].updatedAt).toLocaleDateString('pt-BR') : 'Nao configurada',
            },
            {
                label: 'Bases cadastradas',
                value: icmsBases.length.toLocaleString('pt-BR'),
            },
            {
                label: 'Bases ativas',
                value: icmsBases.filter((item) => item.isActive).length.toLocaleString('pt-BR'),
            },
        ],
    }

    const ibscbsCard = {
        tableType: 'ibscbs' as const,
        kind: 'config' as const,
        label: 'Base de IBS/CBS',
        description: 'Configuracao interna versionada da reforma tributaria para CST, classificacao tributaria, vigencia e excecoes por UF.',
        isEnabled: true,
        recommendedRefreshDays: 0,
        activeVersion: null,
        latestVersion: null,
        lastImportAt: ibscbsBases[0]?.updatedAt || null,
        rowCount: ibscbsBases.length,
        isStale: false,
        staleByDays: null,
        hasAnyVersion: ibscbsBases.length > 0,
        openHref: '/admin/fiscal-bases/ibscbs',
        openLabel: 'Abrir bases',
        primaryActionHref: '/admin/fiscal-bases/ibscbs/novo',
        primaryActionLabel: 'Nova base',
        metricPanels: [
            {
                label: 'Ultima atualizacao',
                value: ibscbsBases[0]?.updatedAt ? new Date(ibscbsBases[0].updatedAt).toLocaleDateString('pt-BR') : 'Nao configurada',
            },
            {
                label: 'Bases cadastradas',
                value: ibscbsBases.length.toLocaleString('pt-BR'),
            },
            {
                label: 'Versoes ativas',
                value: ibscbsBases.filter((item) => item.activeVersionId).length.toLocaleString('pt-BR'),
            },
        ],
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold font-heading text-gradient-navy">Bases Fiscais</h1>
                <p className="mt-1 text-muted-foreground">
                    Hub fiscal para bases oficiais versionadas e configuracoes internas que alimentam perfis tributarios com menos digitacao manual e mais rastreabilidade.
                </p>
            </div>

            <FiscalBaseDashboard cards={[...result.data, icmsCard, ibscbsCard]} />
            <FiscalSourceGuide />
        </div>
    )
}
