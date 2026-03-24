import { getRepresentativeOrderBuilderData, getRepresentativeQuoteDetail } from '@/app/sales/actions'
import {
  RepresentativeOrderBuilder,
  type RepresentativeOrderBuilderInitialDraft,
} from '@/components/sales/representative-order-builder'

type NewQuoteSearchParams = {
  customer?: string
  editQuote?: string
  sourceQuote?: string
  fromVisit?: string
}

export default async function SalesNewQuotePage({
  searchParams,
}: {
  searchParams: Promise<NewQuoteSearchParams>
}) {
  const params = await searchParams
  const data = await getRepresentativeOrderBuilderData()

  let initialCustomerId = params.customer
  let initialDraft: RepresentativeOrderBuilderInitialDraft | undefined

  const editQuoteId = (params.editQuote || '').trim()
  const sourceQuoteId = (params.sourceQuote || '').trim()
  const sourceVisitId = (params.fromVisit || '').trim() || null
  const quoteToLoadId = editQuoteId || sourceQuoteId

  if (quoteToLoadId) {
    const sourceQuote = await getRepresentativeQuoteDetail(quoteToLoadId)
    if (sourceQuote) {
      initialCustomerId = sourceQuote.store_id

      const negotiationDiscountAmount = Number(sourceQuote.negotiation_discount_amount || 0)
      const negotiationDiscountPercentage = Number(sourceQuote.negotiation_discount_percentage || 0)
      const negotiationSurchargeAmount = Number(sourceQuote.negotiation_surcharge_amount || 0)

      initialDraft = {
        items: (sourceQuote.items || []).map((item) => ({
          cartKey: `${item.product_variant_id}::${item.size_option_id || 'legacy'}`,
          productId: item.product_variant?.product_id || item.product_variant_id,
          productName: item.product_name,
          variantId: item.product_variant_id,
          fabricName: item.fabric_name,
          colorName: item.color_name,
          sizeName: item.size_name || item.size || null,
          sizeOptionId: item.size_option_id || null,
          imageUrl: item.product_variant?.image_url || null,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })),
        notes: sourceQuote.notes || '',
        selectedPriceTableId: sourceQuote.price_table_id || null,
        discountType:
          negotiationDiscountAmount > 0
            ? negotiationDiscountPercentage > 0
              ? 'percent'
              : 'value'
            : 'none',
        discountValue:
          negotiationDiscountAmount > 0
            ? String(negotiationDiscountPercentage > 0 ? negotiationDiscountPercentage : negotiationDiscountAmount)
            : '',
        surchargeValue: negotiationSurchargeAmount > 0 ? String(negotiationSurchargeAmount) : '',
        negotiationReason: sourceQuote.negotiation_reason || '',
        selectedPaymentMethodId: sourceQuote.payment_method_id || null,
        selectedPaymentId: sourceQuote.payment_rule_id || sourceQuote.payment_condition_id || null,
        quoteId: editQuoteId ? sourceQuote.id : null,
        sourceVisitId,
      }
    }
  }

  if (!initialDraft && sourceVisitId) {
    initialDraft = {
      sourceVisitId,
    }
  }

  return (
    <RepresentativeOrderBuilder
      mode="quote"
      initialCustomerId={initialCustomerId}
      initialDraft={initialDraft}
      customers={data.customers}
      products={data.products}
      categories={data.categories}
      priceTables={data.priceTables}
      customerTypes={data.customerTypes}
    />
  )
}

