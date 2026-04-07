import { FiscalImportWizard } from '../../components/FiscalImportWizard'
import { isFiscalBaseType } from '@/lib/fiscal/constants'

interface NewFiscalImportPageProps {
    searchParams: Promise<{ type?: string }>
}

export default async function NewFiscalImportPage({ searchParams }: NewFiscalImportPageProps) {
    const params = await searchParams
    const initialType = params.type && isFiscalBaseType(params.type) ? params.type : 'ncm'

    return <FiscalImportWizard initialType={initialType} />
}
