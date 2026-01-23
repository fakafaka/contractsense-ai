# ContractSense AI - Project TODO

## Phase 1: Branding & Setup
- [x] Generate custom app logo
- [x] Update app.config.ts with branding

## Phase 2: Database & Backend
- [x] Define database schema for contracts and analyses
- [x] Create database migration
- [x] Implement database query helpers
- [x] Create tRPC router structure

## Phase 3: AI Contract Analysis
- [x] Implement PDF text extraction
- [x] Create AI prompt for contract summary
- [x] Create AI prompt for main obligations
- [x] Create AI prompt for potential risks
- [x] Create AI prompt for red flags detection
- [x] Implement contract analysis tRPC endpoint
- [x] Add error handling for AI failures

## Phase 4: Authentication & Navigation
- [x] Update tab bar with Home, History, Profile tabs
- [x] Add tab bar icons to icon-symbol.tsx
- [x] Update theme colors to match brand
- [x] Create login screen UI
- [ ] Test authentication flow

## Phase 5: Home Screen
- [x] Build home screen layout
- [x] Add usage stats card
- [x] Add "Analyze New Contract" button
- [x] Add recent analyses section
- [x] Add empty state

## Phase 6: Upload Flow
- [x] Create upload screen UI
- [x] Implement PDF file picker
- [x] Implement text paste input
- [x] Add file validation (size, type)
- [x] Add loading state during analysis
- [x] Handle upload errors

## Phase 7: Analysis Display
- [x] Create analysis screen layout
- [x] Display contract summary section
- [x] Display main obligations section
- [x] Display potential risks section
- [x] Display red flags section
- [x] Add disclaimer section
- [x] Implement save to history
- [x] Add risk level indicators

## Phase 8: History Screen
- [x] Build history list UI
- [x] Implement search/filter
- [x] Add swipe to delete
- [ ] Add pull to refresh
- [x] Handle empty state
- [x] Navigate to analysis detail

## Phase 9: Profile Screen
- [x] Build profile screen layout
- [x] Display user info
- [x] Add usage stats
- [x] Add dark mode toggle
- [x] Add sign out button
- [x] Add about/legal links

## Phase 10: Polish & Testing
- [ ] Add loading states throughout
- [ ] Add error handling throughout
- [ ] Test all user flows end-to-end
- [ ] Test on iOS simulator
- [ ] Verify all buttons work
- [ ] Check dark mode appearance
- [ ] Verify SafeArea handling on all screens
