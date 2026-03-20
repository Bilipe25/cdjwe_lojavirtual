# Admin Customer Profile Redesign

## Phase 1: Audit & Planning (Current)
- [x] Audit current Customers List page ([app/admin/customers/page.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/page.tsx), [CustomerList.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/components/CustomerList.tsx))
- [x] Audit current Customer Drawer / Details component
- [x] Audit associated schemas ([schema.ts](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/schema.ts)) and data structures
- [x] Create Audit & Implementation Plan document ([admin_customer_plan.md](file:///C:/Users/netes/.gemini/antigravity/brain/d1d68e01-507b-458c-9e1d-38990553fd5e/admin_customer_plan.md))
- [x] Get user approval on the plan

## Phase 2: Architecture & Routing
- [x] Create new dynamic route `/admin/customers/[id]/page.tsx`
- [x] Implement Breadcrumb and Page Header layout
- [x] Implement robust loading states and "not found" handling
- [x] Update [CustomerList.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/components/CustomerList.tsx) to navigate to the new route instead of opening a drawer

## Phase 3: Profile Header & Actions
- [x] Build Enterprise Header Component (Name, Status, CNPJ, Contact, Price Table)
- [ ] Build Quick Actions menu (Edit, Reset Password, Toggle Status, etc.)

## Phase 4: Customer Detail Sections
- [x] Build General Info Section (Profile data, observations)
- [x] Build Access Section (Auth status, access history, reset actions)
- [x] Build Orders Section (Recent orders, total spent)
- [x] Build Addresses Section
- [x] Build Audit/Logs Section
- [ ] Build Commercial/Financial Section (Price tables, limits)

## Phase 5: Polish & Refactoring
- [x] Refactor the old Drawer components, separating logic into reusable chunks
- [x] Ensure Desktop UX maximizes horizontal space
- [x] Ensure Mobile UX is excellent (stacking, tabs/accordions)
- [x] Remove legacy Drawer code

## Phase 6: Inline Edit Paradigm (Enterprise CRM)
- [ ] Create `ClientContactCard` (Read/Edit mode for Email, Phone, Name)
- [ ] Create `ClientCompanyCard` (Read/Edit mode for CNPJ, Type, Rep, Tags)
- [ ] Remove legacy [CustomerEditDrawer.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/components/CustomerEditDrawer.tsx) entirely
- [ ] Implement [updateCustomer](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/actions.ts#255-276) callback in [page.tsx](file:///c:/projetos/Cdjwe-vendasexternas/cdjwe_lojavirtual/src/app/admin/customers/page.tsx) that updates local state smoothly
- [x] Add premium micro-interactions, skeleton improvements, and visual refinements on Header
- [x] Ensure Mobile UX is excellent (stacking, tabs/accordions)
- [x] Remove legacy Drawer code
