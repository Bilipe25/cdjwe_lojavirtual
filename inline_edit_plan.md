# Plano de Arquitetura: Edição Inline (CRM Enterprise)

## Visão Geral
O formulário monolítico contido no [CustomerEditDrawer](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/components/CustomerEditDrawer.tsx#34-404) será desmembrado em **Cartões Editáveis Modulares** diretamente na página do cliente. Essa abordagem ("Opção C") é o padrão mais maduro em CRMs como Salesforce e HubSpot.

Ao invés de um grande formulário lateral que tira o usuário do contexto, cada seção de dados terá um modo de visualização (Leitura) e um modo de Edição (Formulário).

---

## 🏗️ 1. Nova Estrutura de Componentes

A aba "Geral" passará a renderizar componentes autônomos e stateful:

### `ClientContactCard`
- **Exibe:** Nome Completo, E-mail, Telefone.
- **Edita:** Os mesmos campos.
- **Validação:** Checa se o email é editável baseado no status/placeholder.

### `ClientCompanyCard`
- **Exibe:** Razão Social, Nome Fantasia, CNPJ, Tipo de Cliente, Representante, Tags.
- **Edita:** Inputs e Selectors para os respectivos dados.
- **Dependências:** Recebe os lookups (customerTypes, tags, representatives) que já são carregados na [page.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/page.tsx).

### `ClientPrimaryAddressCard`
- **Exibe:** Endereço de faturamento principal (Rua, Cidade, Estado, CEP).
- **Edita:** Os mesmos campos do endereço da loja base.

---

## ⚙️ 2. Gerenciamento de Estado e Ciclo de Vida

Cada Cartão (Card) possuirá seu próprio `isEditing` (boolean):
1. **Modo Leitura:** O cartão exibe os dados agrupados elegantemente. No topo direito do cartão, um botão sutil "Editar" (Mudar para estado `isEditing = true`).
2. **Modo Edição:** O cartão substitui os textos por `Inputs`/`Selects` integrados com `react-hook-form` contendo as regras específicas apenas daquela fatia de dados (Zod Schema parcial).
3. **Salvamento:** Ao clicar em "Salvar", aquele formulário dispara a mutação ([updateCustomerAsAdminTx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/actions.ts#368-453) com carregamento otimista), fecha a edição, exibe um _Toast_ de sucesso e emite um evento para a [page.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/page.tsx).
4. **Atualização da Página:** O componente [page.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/page.tsx) atuará como um "Hub", repassando a nova entidade atualizada para o Header Premium reagir instantaneamente.

---

## 🗑️ 3. Limpeza do Legado

- O botão "Editar Cadastro" localizado nas Ações Rápidas do Header Principal será alterado para acionar o scroll automático ou focar na aba "Geral", removendo o gatilho que abria o Drawer.
- O arquivo [CustomerEditDrawer.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/components/CustomerEditDrawer.tsx) será **deletado**.
- O gigantesco `customerEditSchema` (Zod) será quebrado em pequenos schemas (ex: `contactSchema`, `companySchema`) para validação modular, ou utilizaremos o `.pick()` / `.omit()` do zod.

## Benefícios Desta Abordagem
- **Zero bloqueio de visão:** O usuário visualiza o restante dos dados do cliente enquanto edita uma seção específica.
- **Salvamento Direto:** Evita a perda de um formulário inteiro por conta de um erro em um único campo.
- **Responsividade perfeita:** O mobile lida incrivelmente melhor com cards que se expandem in-place do que com drawers laterais complexos e cheios de selects.
