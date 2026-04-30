# Mini Design System do Painel do Representante

## Escopo da Fase 1

Esta fase padroniza a arquitetura visual do painel do representante sem alterar regras comerciais. O foco e criar uma linguagem reutilizavel para telas de consulta, resumo e detalhe, deixando a criacao de pedidos preparada para uma refatoracao guiada na Fase 2.

Telas mapeadas:

- `src/app/sales/dashboard/page.tsx`: indicadores, atalhos e listas recentes.
- `src/app/sales/orders/page.tsx`: listagem paginada de pedidos.
- `src/app/sales/orders/new/page.tsx`: entrada do builder de pedido.
- `src/components/sales/representative-order-builder.tsx`: experiencia principal de criacao de pedido e orcamento.
- `src/app/sales/orders/[id]/page.tsx`: detalhe do pedido.
- `src/app/sales/quotes/page.tsx` e `src/components/sales/representative-quotes-page.tsx`: pipeline/listagem de orcamentos.
- `src/app/sales/loading.tsx` e `src/app/sales/error.tsx`: estados transversais.

## Principios

- **Operacional antes de decorativo:** o painel deve priorizar velocidade de campo, leitura rapida e proxima acao.
- **Tokens do sistema:** usar `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `primary` e `bronze` em vez de cores fixas como `slate-*`.
- **Densidade controlada:** cards compactos para listas e metricas; paineis apenas quando agrupam informacao real.
- **Estados explicitos:** loading, vazio, erro, sucesso e pendencias devem ter componentes consistentes.
- **Mobile primeiro para vendedor externo:** botoes e linhas devem manter toque confortavel e texto truncado de forma previsivel.

## Componentes Base

Arquivo: `src/components/sales/sales-ui.tsx`

- `SalesPanel`: superficie padrao para secoes com borda, fundo e sombra discreta.
- `SalesPanelHeader`: cabecalho padrao de painel com titulo, descricao opcional e acao.
- `SalesStatusBadge`: badge compacto com tons `neutral`, `navy`, `bronze`, `success`, `warning` e `danger`.
- `SalesRecordLink`: linha clicavel padrao para pedidos, orcamentos e registros recentes.
- `SalesPagination`: paginacao padrao com anterior/proxima e label central.
- `SalesMetricCard`: card de indicador com icone, valor e texto auxiliar.
- `SalesKpiStrip`: KPIs compactos no topo.
- `SalesEmptyState`: estado vazio com descricao e acao.
- `SalesPageSkeleton`: loading padrao do painel.
- `SalesErrorState`: erro padrao com acoes de recuperacao.
- `SalesInfoPill`: resumo curto para detalhes.

## Mapa Por Tela

### Dashboard

Objetivo: central de acao diaria.

Padrao aplicado:

- KPIs compactos em `SalesKpiStrip`.
- Listas recentes dentro de `SalesPanel`.
- Linhas recentes com `SalesRecordLink`.
- Empty states com CTA direto para criar pedido/orcamento.

Proximo refinamento sugerido:

- Adicionar "proxima melhor acao" com clientes prioritarios, orcamentos vencendo e visitas pendentes.

### Pedidos

Objetivo: consulta rapida e retorno ao detalhe.

Padrao aplicado:

- Contagem e pagina atual no topo.
- Lista em `SalesPanel`.
- Cada pedido em `SalesRecordLink`.
- Tipo do pedido em `SalesStatusBadge`, destacando `PRONTA_ENTREGA`.
- Paginacao em `SalesPagination`.

Proximo refinamento sugerido:

- Filtros por status, cliente, tipo de pedido e periodo.

### Novo Pedido

Objetivo: fluxo operacional de venda.

Estado atual:

- Builder funcional e ja suporta `PRE_VENDA` e `PRONTA_ENTREGA`.
- Estrutura ainda concentra muitas responsabilidades em um unico componente.

Padrao definido para Fase 2:

- Separar em componentes de etapa: cliente, tipo de pedido, produtos, pagamento, negociacao, revisao e conclusao.
- Usar `SalesPanel` para secoes desktop.
- Usar linhas/etapas compactas no mobile.
- Centralizar validacoes visuais em um componente de pendencias.

### Detalhe Do Pedido

Objetivo: leitura executiva do pedido e conferencias.

Padrao aplicado:

- Header com badges padronizados.
- Resumos com `SalesInfoPill`.
- Secoes em `SalesPanel`.
- Conteudo interno usando tokens globais, sem `slate-*` fixo.
- Total final com `gradient-navy`.

Proximo refinamento sugerido:

- Acoes de compartilhamento/PDF tambem no detalhe desktop.

### Orcamentos

Objetivo: gerir pipeline comercial.

Padrao aplicado:

- Indicadores em `SalesMetricCard`.
- Pipeline e aging em `SalesPanel`.
- Status em `SalesStatusBadge`.
- Paginacao em `SalesPagination`.

Proximo refinamento sugerido:

- Substituir `window.confirm` por dialog padronizado para cancelar/excluir.

## Regras Visuais

- Bordas: `border border-border/40`.
- Raio padrao de painel: `rounded-2xl`.
- Raio interno de celulas/linhas: `rounded-xl`.
- Titulos de painel: `text-sm font-semibold font-heading`.
- Labels auxiliares: `text-xs text-muted-foreground`.
- Valores financeiros: `font-heading font-bold`.
- Badges: sempre `SalesStatusBadge`, nunca spans ad hoc.
- Paginacao: sempre `SalesPagination`.
- Empty/error/loading: sempre os componentes transversais de `sales-ui.tsx`.

## Pendencias Para Fases Futuras

- Refatorar `RepresentativeOrderBuilder` em componentes menores.
- Criar componente de revisao final antes de confirmar pedido.
- Adicionar filtros enterprise em pedidos.
- Padronizar dialog de confirmacao para acoes destrutivas.
- Criar um mapa de estados de pedido/orcamento com labels/tone centralizados.
