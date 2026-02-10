# 🎨 PATHLY V2.0 - DESIGN SYSTEM

**Status:** ✅ ACTIVE  
**Version:** 1.0  
**Philosophy:** Notion-Linear Hybrid - Professional + Fast + Flexible  
**Last Updated:** 2026-02-10

---

## 🎯 DESIGN PHILOSOPHY

### **"Notion's Clarity + Linear's Speed + Job-Specific Innovation"**

**Core Principles:**
1. ⚡ **Speed First** - Keyboard shortcuts, instant feedback, no loading states
2. 🎯 **Action-Oriented** - Every view = one decision (Apply/Edit/Skip)
3. 🧘 **Calm UI** - Reduced noise, generous whitespace, clear hierarchy
4. 🔮 **Future-Ready** - Modular widget system for new features
5. 📱 **Mobile-First** - Responsive by design, touch-optimized

**Inspired By:**
- **Linear** - Speed, keyboard shortcuts, opinionated design
- **Vercel** - Minimalist layout, smooth transitions
- **Notion** - Clean aesthetics, calm colors, focused content

---

## 🏗️ LAYOUT ARCHITECTURE

### **3-Column Hybrid Layout**

```
┌─────────────────────────────────────────────────────────────┐
│  ┌───────┐  ┌────────────────────────┐  ┌────────────────┐ │
│  │       │  │                        │  │                │ │
│  │ SIDE  │  │   MAIN CONTENT         │  │  AI CONTEXT    │ │
│  │ BAR   │  │   (Focus Area)         │  │  (Collapsible) │ │
│  │       │  │                        │  │                │ │
│  │ 256px │  │   Fluid (min 640px)    │  │  320px         │ │
│  │ Fixed │  │   Max-width: 1200px    │  │  Optional      │ │
│  └───────┘  └────────────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### **Responsive Breakpoints**
```css
/* Mobile (< 768px) */
- Sidebar → Bottom Navigation (4 icons)
- Main Content → Full Width
- AI Context → Slide-up Sheet (on demand)

/* Tablet (768-1024px) */
- Sidebar → Visible (collapsible)
- Main Content → Fluid
- AI Context → Hidden (toggle button)

/* Desktop (> 1024px) */
- Full 3-column layout
- All elements visible
- Keyboard shortcuts active
```

---

## 🎨 VISUAL DESIGN TOKENS

### **Color System**

#### Base Colors (Notion-Inspired)
```css
/* Backgrounds */
--bg-primary: #FFFFFF;
--bg-secondary: #F7F7F5;      /* Warm off-white */
--bg-tertiary: #FAFAF9;       /* Subtle gray */
--bg-hover: #F5F5F4;          /* Interactive hover */

/* Borders */
--border-light: #E7E7E5;      /* Subtle separators */
--border-medium: #D6D6D3;     /* Card borders */
--border-focus: #0066FF;      /* Focus states */

/* Text */
--text-primary: #37352F;      /* Notion black */
--text-secondary: #73726E;    /* Muted gray */
--text-tertiary: #A8A29E;     /* Placeholder */
```

#### Semantic Colors
```css
/* Brand */
--primary: #0066FF;           /* Bright blue (Linear-inspired) */
--primary-dark: #0052CC;
--primary-light: #3385FF;

/* Status Colors */
--success: #00C853;           /* Green - Applied */
--warning: #FFA000;           /* Orange - Review Needed */
--danger: #D32F2F;            /* Red - Rejected */
--info: #2196F3;              /* Blue - Info */

/* Match Score Gradient */
--match-high: linear-gradient(135deg, #00C853 0%, #0066FF 100%);   /* 90-100% */
--match-mid: linear-gradient(135deg, #FFA000 0%, #FF6D00 100%);    /* 70-89% */
--match-low: linear-gradient(135deg, #D32F2F 0%, #C62828 100%);    /* < 70% */
```

#### Dark Mode (Future)
```css
/* Backgrounds */
--bg-primary-dark: #1A1A1A;
--bg-secondary-dark: #262626;
--text-primary-dark: #E5E5E5;
--text-secondary-dark: #A3A3A3;
```

---

### **Typography**

#### Font Stack
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

#### Type Scale (Tailwind-inspired)
```css
--text-xs: 0.75rem;      /* 12px - Labels, badges */
--text-sm: 0.875rem;     /* 14px - Body, captions */
--text-base: 1rem;       /* 16px - Default body */
--text-lg: 1.125rem;     /* 18px - Subheadings */
--text-xl: 1.25rem;      /* 20px - Card titles */
--text-2xl: 1.5rem;      /* 24px - Section headings */
--text-3xl: 1.875rem;    /* 30px - Page headings */
--text-4xl: 2.25rem;     /* 36px - Hero text */
```

#### Font Weights
```css
--font-regular: 400;     /* Body text */
--font-medium: 500;      /* Emphasis */
--font-semibold: 600;    /* Headings */
--font-bold: 700;        /* Rare, only for CTA */
```

#### Line Heights
```css
--leading-tight: 1.25;   /* Headings */
--leading-normal: 1.5;   /* Body text */
--leading-relaxed: 1.75; /* Long-form content */
```

---

### **Spacing System (8px Grid)**

```css
--space-0: 0;
--space-1: 0.25rem;      /* 4px - Micro spacing */
--space-2: 0.5rem;       /* 8px - Inline elements */
--space-3: 0.75rem;      /* 12px - Small padding */
--space-4: 1rem;         /* 16px - Default spacing */
--space-5: 1.25rem;      /* 20px */
--space-6: 1.5rem;       /* 24px - Card padding */
--space-8: 2rem;         /* 32px - Section spacing */
--space-10: 2.5rem;      /* 40px */
--space-12: 3rem;        /* 48px - Large sections */
--space-16: 4rem;        /* 64px - Page sections */
--space-20: 5rem;        /* 80px - Hero spacing */
```

**Usage:**
- Use multiples of 4 for consistency
- Prefer `space-4` (16px) as default
- Use `space-6` (24px) for card padding
- Use `space-8` (32px) between sections

---

### **Shadows (Depth System)**

```css
/* Subtle (Rest state) */
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.06);

/* Medium (Hover state) */
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07),
             0 2px 4px -1px rgba(0, 0, 0, 0.04);

/* Large (Elevated elements) */
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08),
             0 4px 6px -2px rgba(0, 0, 0, 0.03);

/* Extra Large (Modals) */
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
             0 10px 10px -5px rgba(0, 0, 0, 0.04);
```

**Usage:**
- Cards: `shadow-sm` → `shadow-md` on hover
- Modals: `shadow-xl`
- Dropdowns: `shadow-lg`

---

### **Border Radius**

```css
--radius-none: 0;
--radius-sm: 0.25rem;    /* 4px - Small buttons */
--radius-md: 0.5rem;     /* 8px - Default (Notion-like) */
--radius-lg: 0.75rem;    /* 12px - Cards */
--radius-xl: 1rem;       /* 16px - Large cards */
--radius-full: 9999px;   /* Pills, avatars */
```

**Default:** Use `radius-md` (8px) everywhere for consistency (Notion-style)

---

### **Z-Index Hierarchy**

```css
--z-base: 0;             /* Default layer */
--z-dropdown: 100;       /* Dropdowns, tooltips */
--z-sticky: 200;         /* Sticky headers */
--z-overlay: 300;        /* Overlays (modals backdrop) */
--z-modal: 400;          /* Modals, dialogs */
--z-toast: 500;          /* Notifications */
--z-tooltip: 600;        /* Tooltips (always on top) */
```

---

## 🧩 COMPONENT LIBRARY

### **1. Sidebar Navigation**

```tsx
// Structure
<Sidebar className="w-64 fixed left-0 h-screen">
  <Logo />
  <NavSection title="Main">
    <NavItem icon="Home" label="Dashboard" badge={3} />
    <NavItem icon="Inbox" label="Auto-Apply" badge={12} />
    <NavItem icon="History" label="History" />
  </NavSection>
  
  <NavSection title="Stats" className="mt-auto">
    <ProgressCard 
      title="This Week" 
      value={3} 
      total={10} 
    />
    <CreditsCard remaining={47} />
  </NavSection>
</Sidebar>
```

**Visual:**
```
┌──────────────────────┐
│  🎯 Pathly           │
│  ──────────────────  │
│  📝 Manual Apply     │
│  📬 Auto-Apply (12)  │ ← Badge for new
│  📊 History          │
│  ⚙️ Settings         │
│                      │
│  ──────────────────  │
│  📈 This Week        │
│  ━━━━━━━ 3/10        │ ← Progress bar
│                      │
│  💰 Credits          │
│  ━━━━━━━ 47 left     │
└──────────────────────┘
```

**Interaction:**
- Hover: Background color change (`bg-hover`)
- Active: Bold text + primary color
- Keyboard: `Cmd+K` opens command menu

---

### **2. Job Card (Tinder-Style)**

```tsx
<JobCard
  company="Stripe"
  logo="/logos/stripe.png"
  jobTitle="Senior Backend Engineer"
  location="Berlin"
  salary="€90-120k"
  remote="Full Remote"
  matchScore={95}
  aiInsight="Perfect match - your Python exp + payment infra"
  skills={['Python', 'Kubernetes', 'gRPC']}
  onReview={handleReview}
  onEdit={handleEdit}
  onSkip={handleSkip}
/>
```

**Visual:**
```
┌────────────────────────────────────────┐
│  🏢 Stripe                   [⭐ 95%]  │ ← Gradient badge
│  Senior Backend Engineer               │
│  Berlin • €90-120k • Full Remote       │
│                                        │
│  💡 AI says:                           │
│  "Perfect match - your Python exp      │
│   + their payment infra needs"         │
│                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Skills: Python, Kubernetes, gRPC      │
│                                        │
│  [👁️ Review CL] [✏️ Edit] [🚫 Skip]   │ ← Actions
└────────────────────────────────────────┘
```

**Micro-Interactions:**
- Hover: `scale: 1.02`, `y: -2px`, `shadow-md`
- Swipe Right (>100px): Approve with haptic feedback
- Swipe Left (<-100px): Skip with fade-out
- Click Badge: Show detailed breakdown

---

### **3. Command Menu (Linear-Style)**

```tsx
// Trigger: Cmd+K (Mac) / Ctrl+K (Windows)
<CommandMenu>
  <CommandInput placeholder="Type a command or search..." />
  <CommandList>
    <CommandGroup heading="Actions">
      <CommandItem icon="Plus">New Application</CommandItem>
      <CommandItem icon="Search">Search Jobs</CommandItem>
    </CommandGroup>
    <CommandGroup heading="Navigation">
      <CommandItem icon="Home" shortcut="G H">Dashboard</CommandItem>
      <CommandItem icon="Inbox" shortcut="G I">Auto-Apply</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandMenu>
```

**Keyboard Shortcuts:**
```
Cmd+K       → Open Command Menu
G H         → Go to Dashboard
G I         → Go to Inbox
G A         → Go to History
J / K       → Navigate up/down in lists
Enter       → Select item
Esc         → Close menu
```

---

### **4. Application History Table (Notion-Style)**

```tsx
<HistoryTable>
  <TableHeader>
    <TableColumn sortable>Company</TableColumn>
    <TableColumn sortable>Job Title</TableColumn>
    <TableColumn sortable>Date</TableColumn>
    <TableColumn>Status</TableColumn>
  </TableHeader>
  <TableBody>
    <TableRow expandable>
      <TableCell>
        <CompanyCell logo="/tesla.png" name="Tesla" />
      </TableCell>
      <TableCell>Full-Stack Developer</TableCell>
      <TableCell>2h ago</TableCell>
      <TableCell>
        <StatusBadge status="applied" />
      </TableCell>
    </TableRow>
    {/* Expanded content */}
    <TableExpandedRow>
      <CoverLetterPreview />
    </TableExpandedRow>
  </TableBody>
</HistoryTable>
```

**Visual:**
```
┌────────────────────────────────────────────┐
│  📊 Application History                    │
│  ─────────────────────────────────────────│
│                                            │
│  🔍 Search  |  🗓️ Last 30 days  |  Export│
│                                            │
│  Company      Job Title         Status    │
│  ──────────────────────────────────────── │
│  🏢 Tesla     Full-Stack Dev    ✅ Applied │ ← Click to expand
│  🏢 Google    Product Mgr       ⏸️ Draft   │
│  🏢 Stripe    Backend Eng       👁️ Review  │
└────────────────────────────────────────────┘
```

**Interactions:**
- Hover Row: `bg-hover`, show action icons
- Click Row: Expand to show cover letter
- Inline Edit: Double-click cell (if editable)

---

### **5. AI Context Panel (Right Sidebar)**

```tsx
<ContextPanel collapsible initiallyOpen={true}>
  <ContextSection title="Current Job">
    <JobSummary company="Stripe" title="Backend Engineer" />
  </ContextSection>
  
  <ContextSection title="Why You Match">
    <MatchReasonList reasons={[
      '5y Python experience',
      'Kubernetes in production',
      'Payment APIs background'
    ]} />
  </ContextSection>
  
  <ContextSection title="Company Intel">
    <CompanyInsights
      news="Recently raised $6.5B"
      expansion="Expanding Berlin hub"
    />
  </ContextSection>
  
  <ContextSection title="Writing Style">
    <StyleAnalysis
      tone="Formal"
      avgSentenceLength={18}
      conjunctions={true}
    />
  </ContextSection>
  
  <Button variant="outline" onClick={refreshResearch}>
    🔄 Refresh Research
  </Button>
</ContextPanel>
```

**Visual:**
```
┌─────────────────────────┐
│  🤖 AI Context          │
│  ───────────────────────│
│                         │
│  📊 Current Job:        │
│  Stripe Backend Eng     │
│                         │
│  💡 Why you match:      │
│  • 5y Python exp        │
│  • Kubernetes prod      │
│  • Payment APIs         │
│                         │
│  🏢 Company Intel:      │
│  "Recently raised $6.5B"│
│  "Expanding Berlin hub" │
│                         │
│  ✍️ Writing Style:      │
│  Formal, conjunctions   │
│  Avg 18 words/sentence  │
│                         │
│  [🔄 Refresh Research]  │
└─────────────────────────┘
```

---

### **6. Progress Indicators**

```tsx
// Linear Progress Bar
<ProgressBar value={3} max={10} variant="primary" />

// Circular Progress (Match Score)
<CircularProgress 
  value={92} 
  size="lg" 
  gradient="match-high"
  showLabel={true}
/>

// Step Progress (Multi-step forms)
<StepProgress 
  steps={['Upload CV', 'Template', 'Job URL', 'Review']}
  currentStep={2}
/>
```

**Visual:**
```
Linear:
━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3/10

Circular:
    ╭─────╮
    │ 92% │ ← Gradient fill
    ╰─────╯

Steps:
━●━━○━━○━━○  Step 2/4
```

---

## 🎬 ANIMATIONS & MICRO-INTERACTIONS

### **Framer Motion Variants**

#### Page Transitions
```tsx
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

const pageTransition = {
  type: "tween",
  duration: 0.3,
  ease: "easeInOut",
}
```

#### Card Hover
```tsx
const cardVariants = {
  rest: { scale: 1, y: 0 },
  hover: { 
    scale: 1.02, 
    y: -2,
    transition: { duration: 0.2 }
  },
}
```

#### Swipe Gestures
```tsx
const swipeVariants = {
  drag: {
    x: 0,
    transition: { type: "spring", stiffness: 300 }
  },
}

// Handlers
const handleDragEnd = (_, info) => {
  if (info.offset.x > 100) handleApprove()
  if (info.offset.x < -100) handleSkip()
}
```

#### Count-Up Animation (Match Score)
```tsx
<CountUp 
  end={92} 
  duration={1.5} 
  suffix="%" 
  useEasing={true}
  easingFn={(t, b, c, d) => c * t / d + b} // Linear easing
/>
```

---

### **Loading States**

```tsx
// Skeleton (Notion-style)
<Skeleton className="h-20 w-full rounded-lg" />

// Spinner (Rare - only for long operations)
<Spinner size="md" />

// Optimistic UI (Preferred)
// Update UI immediately, rollback if error
```

**Philosophy:** Avoid spinners. Use optimistic updates + skeleton screens.

---

## 📱 RESPONSIVE DESIGN PATTERNS

### **Mobile (< 768px)**

```
┌──────────────────────┐
│  🎯 Pathly   ☰       │ ← Header with menu
│  ──────────────────  │
│                      │
│  [Job Card]          │ ← Full-width cards
│                      │
│  [Job Card]          │
│                      │
│  ──────────────────  │
│  [📝][📬][📊][⚙️]    │ ← Bottom nav
└──────────────────────┘
```

**Changes:**
- Sidebar → Bottom Navigation (4 icons)
- AI Context → Slide-up sheet (toggle)
- Swipe gestures enabled
- Larger tap targets (44px minimum)

---

### **Tablet (768-1024px)**

```
┌─────────────────────────────────┐
│  ┌───┐  ┌──────────────────┐   │
│  │SB │  │  Job Cards       │   │
│  │   │  │  (2-column grid) │   │
│  │   │  │                  │   │
│  └───┘  └──────────────────┘   │
└─────────────────────────────────┘
```

**Changes:**
- Sidebar collapsible (hamburger)
- Job Cards → 2-column grid
- AI Context hidden (toggle button)

---

### **Desktop (> 1024px)**

```
┌───────────────────────────────────────┐
│  ┌──┐  ┌──────────────┐  ┌────────┐  │
│  │SB│  │  Job Cards   │  │Context │  │
│  │  │  │  (masonry)   │  │Panel   │  │
│  └──┘  └──────────────┘  └────────┘  │
└───────────────────────────────────────┘
```

**Full layout:** All 3 columns visible

---

## 🚀 FUTURE INNOVATION SPACE

### **Modular Widget System**

```tsx
<Dashboard layout="customizable">
  <DragDropZone>
    <Widget id="job-cards" size="large" />
    <Widget id="ai-coach" size="medium" />
    <Widget id="radar" size="small" />
    <Widget id="timeline" size="medium" />
    <Widget id="stats" size="small" />
  </DragDropZone>
</Dashboard>
```

**Philosophy:** 
- Users can customize layout
- New features = New widgets
- Saved per-user preferences

---

### **Planned Widgets**

1. **Job Radar** (3D Scatter Plot)
   - X-axis: Salary
   - Y-axis: Match %
   - Z-axis: Location distance
   - Interactive, rotatable (Three.js)

2. **AI Writing Coach** (Live Feedback)
   - Real-time grammar check
   - Style score (1-10)
   - Suggestion chips

3. **Timeline View** (Visual History)
   - Horizontal timeline
   - Hover: Preview cover letter
   - Filter by status

4. **Company Heat Map**
   - Geographic visualization
   - Cluster by industry
   - Click to filter

---

## ✅ ACCESSIBILITY (A11Y)

### **WCAG 2.1 AA Compliance**

```tsx
// Color Contrast
// All text must have 4.5:1 contrast ratio
--text-primary on --bg-primary = 10.2:1 ✅
--text-secondary on --bg-primary = 4.9:1 ✅

// Focus States
outline: 2px solid var(--border-focus);
outline-offset: 2px;

// Screen Reader
<button aria-label="Review cover letter">
  <Icon name="eye" aria-hidden="true" />
</button>

// Keyboard Navigation
// All interactive elements must be keyboard accessible
tabIndex={0}
```

---

### **Best Practices**

1. **Semantic HTML**
   - Use `<button>` for actions, not `<div>`
   - Use `<nav>` for navigation
   - Use `<main>` for primary content

2. **Alt Text**
   - All images must have descriptive alt text
   - Decorative images: `alt=""`

3. **Focus Management**
   - Modals: Trap focus inside
   - Forms: Auto-focus first input
   - Errors: Move focus to error message

4. **Reduced Motion**
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

---

## 🔧 IMPLEMENTATION CHECKLIST

### **Phase 1: Foundation**
- [ ] Setup Tailwind with design tokens
- [ ] Install shadcn/ui components
- [ ] Create base layout (3-column)
- [ ] Implement dark mode support (optional)

### **Phase 2: Core Components**
- [ ] Sidebar navigation
- [ ] Job card component
- [ ] Command menu (Cmd+K)
- [ ] History table (Notion-style)

### **Phase 3: Interactions**
- [ ] Framer Motion animations
- [ ] Swipe gestures
- [ ] Keyboard shortcuts
- [ ] Loading states

### **Phase 4: Innovation**
- [ ] AI Context Panel
- [ ] Match score visualizations
- [ ] Widget system foundation
- [ ] 3D Job Radar (Three.js)

---

## 📚 RESOURCES

### **Design Inspiration**
- [Linear.app](https://linear.app) - Speed, keyboard shortcuts
- [Vercel Dashboard](https://vercel.com/dashboard) - Minimalist layout
- [Notion](https://notion.so) - Clean aesthetics

### **Component Libraries**
- [shadcn/ui](https://ui.shadcn.com/) - Base components
- [Radix UI](https://www.radix-ui.com/) - Headless primitives
- [Framer Motion](https://www.framer.com/motion/) - Animations

### **Tools**
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Figma](https://figma.com) - Design prototypes
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/) - 3D graphics

---

## 🎯 SUCCESS METRICS

### **Performance**
- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- Lighthouse Score > 90

### **Usability**
- Task completion rate > 95%
- Time to apply (manual) < 5min
- User satisfaction (NPS) > 40

### **Accessibility**
- WCAG 2.1 AA compliance
- Keyboard navigation 100% functional
- Screen reader compatible

---

## 📝 CHANGELOG

### Version 1.0 (2026-02-10)
- ✅ Initial design system
- ✅ Notion-Linear hybrid philosophy
- ✅ 3-column layout architecture
- ✅ Complete component library
- ✅ Animation guidelines
- ✅ Accessibility standards

---

**Made with ❤️ in Berlin**

**Status:** ✅ ACTIVE  
**Next Review:** After MVP launch  
**Questions?** Check [ARCHITECTURE.md](./ARCHITECTURE.md) or [CLAUDE.md](../CLAUDE.md)
