# ContractSense AI - Final Minimal MVP

## Final Simplification (Linear Flow Only)
- [x] Remove tab navigation completely
- [x] Remove bottom navigation bar
- [x] Convert to linear screen flow with simple navigation
- [x] Simplify Welcome screen (name + disclaimer only)
- [x] Keep Upload screen (PDF or text)
- [x] Keep Processing screen (loading only)
- [x] Simplify Summary screen (remove risk badges)
- [x] Simplify History screen (remove search, remove delete)
- [x] Remove all menus and extra navigation
- [x] Ensure linear flow: Welcome → Upload → Processing → Summary → History → Upload (loop)

## PDF Text Extraction Fix
- [x] Fix PDF text extraction in backend (contract-analyzer.ts)
- [x] Improve error handling for PDFs with no extractable text
- [x] Show clear message: "This PDF contains no selectable text. Please paste the text instead."
- [x] Test with text-based PDFs to ensure reliable extraction
- [x] Ensure no OCR, camera scanning, or image processing is added

## Database Schema Fix
- [x] Remove riskLevel from AI analysis generation
- [x] Remove or make nullable riskLevel column in analyses table
- [x] Fix processingTimeMs to handle NULL/0 instead of NaN
- [x] Make userId nullable in contracts table (no authentication)
- [x] Update insert logic to use NULL for userId
- [x] Ensure schema matches MVP fields: summary, mainObligations, potentialRisks, redFlags, timestamps
- [x] Run database migration

## Database Insert Crash Fix
- [x] Verify actual database schema matches code schema
- [x] Ensure riskLevel column is removed or nullable with default NULL
- [x] Fix processingTimeMs to never be NaN (always valid number or 0)
- [x] Verify userId is nullable in both contracts and analyses tables
- [x] Test that analysis saves successfully to database
- [x] Verify saved analysis appears in History screen

## Fix processingTimeMs NaN Issue (CRITICAL)
- [x] Investigate why processingTimeMs is NaN
- [x] Add defensive check right before DB insert: if (!Number.isFinite(processingTimeMs)) processingTimeMs = 0
- [x] Ensure timer starts before analysis and stops after
- [x] Add fallback to 0 if timing calculation fails
- [x] Test analysis saves successfully to database
- [x] Verify analysis appears in History screen
