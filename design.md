# ContractSense AI - Mobile App Design Plan

## Design Philosophy

ContractSense AI is designed for **mobile portrait orientation (9:16)** with **one-handed usage** in mind. The app must feel like a first-party iOS app, following **Apple Human Interface Guidelines (HIG)** and mainstream iOS design standards.

**Core Principles:**
- **Trustworthy**: Clean, professional design that inspires confidence when dealing with legal documents
- **Simple**: No legal jargon in UI, plain English everywhere
- **Accessible**: Easy to understand for non-lawyers
- **Focused**: Each screen has one clear purpose

---

## Color Palette

**Brand Colors:**
- **Primary**: `#2563EB` (Blue 600) - Professional, trustworthy, associated with legal/business
- **Background (Light)**: `#FFFFFF` (White) - Clean, professional
- **Background (Dark)**: `#0F172A` (Slate 900) - Professional dark mode
- **Surface (Light)**: `#F8FAFC` (Slate 50) - Subtle card backgrounds
- **Surface (Dark)**: `#1E293B` (Slate 800) - Dark mode cards
- **Foreground (Light)**: `#0F172A` (Slate 900) - Primary text
- **Foreground (Dark)**: `#F1F5F9` (Slate 100) - Dark mode text
- **Muted (Light)**: `#64748B` (Slate 500) - Secondary text
- **Muted (Dark)**: `#94A3B8` (Slate 400) - Dark mode secondary text
- **Success**: `#10B981` (Green 500) - Positive indicators
- **Warning**: `#F59E0B` (Amber 500) - Caution indicators
- **Error**: `#EF4444` (Red 500) - Red flags, risks
- **Border (Light)**: `#E2E8F0` (Slate 200)
- **Border (Dark)**: `#334155` (Slate 700)

---

## Screen List

### 1. **Login Screen** (`/login`)
**Purpose**: User authentication entry point

**Content:**
- App logo (top center)
- App name "ContractSense AI"
- Tagline: "Understand contracts in plain English"
- "Sign in with Manus" button (primary)
- Disclaimer text at bottom: "Not legal advice"

**Layout:**
- Centered vertical layout
- Large logo (120x120)
- Generous spacing between elements
- Button at comfortable thumb reach

---

### 2. **Home Screen** (`/(tabs)/index`)
**Purpose**: Main dashboard and contract upload entry point

**Content:**
- Welcome message: "Welcome, [Name]"
- Usage stats card:
  - "Analyses this month: X/Y" (free tier limit)
  - Progress bar showing usage
- Large primary action button: "Analyze New Contract"
- Quick access section:
  - "Recent Analyses" (last 3 contracts)
  - Each showing: contract name, date, risk level indicator
- Empty state (if no history):
  - Illustration
  - "No contracts analyzed yet"
  - "Upload your first contract to get started"

**Layout:**
- Scrollable vertical layout
- Stats card at top (sticky feel)
- Large CTA button (prominent, blue)
- List of recent items with right chevron

---

### 3. **Upload Screen** (`/upload`)
**Purpose**: Contract upload interface

**Content:**
- Header: "Upload Contract"
- Two upload options (cards):
  1. **Upload PDF File**
     - Icon: document icon
     - Text: "Choose PDF file"
     - Subtext: "Max 10MB"
  2. **Paste Text**
     - Icon: text icon
     - Text: "Paste contract text"
     - Subtext: "Copy and paste text directly"
- Selected file preview (if PDF chosen):
  - File name
  - File size
  - Remove button
- Text input area (if paste chosen):
  - Multi-line text input
  - Character count
- "Analyze Contract" button (bottom, disabled until content provided)
- Disclaimer: "This analysis is not legal advice. Consult a lawyer for legal guidance."

**Layout:**
- Two large tap targets for upload methods
- Clear visual feedback for selected method
- Bottom sheet style for text input
- Fixed bottom button

---

### 4. **Analysis Screen** (`/analysis/[id]`)
**Purpose**: Display AI-generated contract analysis

**Content:**
- Header: Contract name (editable)
- Date analyzed
- Scrollable content sections:

  **Section 1: Summary**
  - Icon: document icon
  - Title: "What is this contract about?"
  - Plain English summary (2-3 paragraphs)
  
  **Section 2: Main Obligations**
  - Icon: checklist icon
  - Title: "Your main responsibilities"
  - Bulleted list of key obligations
  - Each item in plain English
  
  **Section 3: Potential Risks**
  - Icon: warning triangle
  - Title: "What can go wrong"
  - List of potential risks
  - Each with brief explanation
  - Color-coded by severity (yellow/orange)
  
  **Section 4: Red Flags**
  - Icon: alert icon
  - Title: "Red flags to watch out for"
  - Critical issues highlighted
  - Categories:
    - Termination risks
    - Payment issues
    - Liability concerns
  - Color-coded red
  
  **Section 5: Disclaimer**
  - Icon: info icon
  - Background: light gray
  - Text: "This analysis is for informational purposes only and does not constitute legal advice. Please consult with a qualified attorney for legal guidance."

- Bottom actions:
  - "Save to History" button (if not saved)
  - "Share Analysis" button

**Layout:**
- Card-based sections
- Clear visual hierarchy
- Icons for quick scanning
- Color coding for risk levels
- Generous padding and spacing

---

### 5. **History Screen** (`/(tabs)/history`)
**Purpose**: View all past contract analyses

**Content:**
- Header: "Analysis History"
- Search bar (filter by name)
- List of analyzed contracts:
  - Contract name
  - Date analyzed
  - Risk level badge (Low/Medium/High)
  - Right chevron for navigation
- Empty state:
  - Illustration
  - "No analyses yet"
  - "Start by analyzing your first contract"

**Layout:**
- Search bar at top
- Scrollable list
- Swipe actions: Delete
- Pull to refresh

---

### 6. **Profile/Settings Screen** (`/(tabs)/profile`)
**Purpose**: User account and app settings

**Content:**
- User info card:
  - Name
  - Email
  - Account type (Free/Premium)
- Settings sections:
  
  **Subscription**
  - Current plan: "Free Plan"
  - Usage: "X/Y analyses this month"
  - "Upgrade to Premium" button
  
  **Preferences**
  - Dark mode toggle
  - Notification settings
  
  **About**
  - App version
  - Privacy policy link
  - Terms of service link
  - "About ContractSense AI"
  
  **Account**
  - "Sign Out" button (red)

**Layout:**
- Grouped list style (iOS Settings app style)
- Clear section headers
- Toggle switches for preferences
- Destructive action at bottom

---

## Key User Flows

### Flow 1: First-Time User - Analyze Contract
1. User opens app → Login screen
2. Tap "Sign in with Manus" → OAuth flow
3. Redirect to Home screen (empty state)
4. Tap "Analyze New Contract"
5. Navigate to Upload screen
6. Choose "Upload PDF File" or "Paste Text"
7. Select file / paste text
8. Tap "Analyze Contract" → Loading state (progress indicator)
9. Navigate to Analysis screen with results
10. Review sections: Summary → Obligations → Risks → Red Flags
11. Tap "Save to History"
12. Return to Home (now shows recent analysis)

### Flow 2: Returning User - View History
1. User opens app → Home screen (authenticated)
2. Tap "History" tab in bottom navigation
3. Browse list of past analyses
4. Tap on a contract
5. View full analysis
6. Swipe left to delete (optional)

### Flow 3: Quick Re-Analysis
1. From Home screen
2. Tap "Analyze New Contract"
3. Paste new contract text
4. Tap "Analyze Contract"
5. View results immediately

---

## Navigation Structure

**Tab Bar (Bottom):**
- **Home** (house icon) - Main dashboard
- **History** (clock icon) - Past analyses
- **Profile** (person icon) - Settings and account

**Modal Screens:**
- Login (full screen, no tabs)
- Upload (pushed from Home)
- Analysis (pushed from Upload or History)

---

## Component Patterns

### Cards
- Rounded corners (12px)
- Subtle shadow
- White background (light mode)
- Dark surface (dark mode)
- 16px padding

### Buttons
- **Primary**: Blue background, white text, rounded (8px)
- **Secondary**: White background, blue border, blue text
- **Destructive**: Red background, white text
- Height: 48px (comfortable tap target)

### Risk Indicators
- **Low**: Green dot + "Low Risk"
- **Medium**: Yellow/Orange dot + "Medium Risk"
- **High**: Red dot + "High Risk"

### Typography
- **Headers**: Bold, 24-28px
- **Section Titles**: Semibold, 18-20px
- **Body**: Regular, 16px
- **Captions**: Regular, 14px, muted color
- **Line Height**: 1.5x for readability

---

## Accessibility & Trust Elements

1. **Clear Disclaimers**: Visible on every analysis screen
2. **Plain Language**: No legal jargon in UI
3. **Visual Hierarchy**: Icons + color coding for quick scanning
4. **Loading States**: Clear progress indicators during analysis
5. **Error Handling**: Friendly error messages with retry options
6. **Offline Support**: Show cached analyses when offline
7. **Large Tap Targets**: Minimum 44x44pt (iOS HIG)

---

## Technical Notes

- Use `ScreenContainer` for all screens (SafeArea handling)
- Implement pull-to-refresh on History screen
- Use `FlatList` for all lists (performance)
- Store analyses in database (sync across devices)
- Cache last 10 analyses locally (AsyncStorage) for offline access
- Implement optimistic UI updates for better perceived performance
- Use haptic feedback on primary actions
- Implement skeleton loading states during API calls

---

## Out of Scope (MVP)

- Contract editing
- Contract comparison
- E-signatures
- Collaboration features
- Legal recommendations
- Direct lawyer consultation
- Contract templates
- Clause library
