# ⚡ FLUID MOTION COMPONENTS

**100% Framer Motion Compliance**  
**Design System:** Notion-Linear Hybrid  
**Status:** ✅ Production Ready

---

## 🎯 DESIGN PRINCIPLES

### 1. **Every Interactive Element Uses Framer Motion** ✅
- Buttons, badges, cards, links - ALL animated
- No static components allowed
- Consistent motion language throughout

### 2. **UI Must Feel Fluid** ✅
- Smooth page transitions (300ms)
- Spring animations for natural feel
- No janky or abrupt movements

### 3. **Standard Hover Effects** ✅
```tsx
whileHover={{ 
  scale: 1.02,
  y: -2,
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)"
}}
```

### 4. **Count-Up Animations** ✅
- Match scores animate from 0 → final value
- Credits count up
- Progress bars fill smoothly

---

## 📦 COMPONENTS

### Core Motion Components

#### 1. **Badge** (`motion/badge.tsx`)
```tsx
import { Badge } from '@/components/motion/badge';

<Badge variant="primary" interactive>
  12
</Badge>
```

**Features:**
- ✨ Initial scale animation (0.8 → 1)
- 👆 Hover: scale 1.05, y: -1
- 👍 Tap: scale 0.95
- 🎨 Variants: primary, secondary, outline, success, warning, danger

---

#### 2. **Button** (`motion/button.tsx`)
```tsx
import { Button } from '@/components/motion/button';

<Button variant="primary" loading={false}>
  Click Me
</Button>
```

**Features:**
- ✨ Spring animation (stiffness: 400)
- 👆 Hover: scale 1.02, y: -2
- 👍 Tap: scale 0.98
- ⏳ Built-in loading spinner
- 🎨 Variants: primary, secondary, outline, ghost, danger
- 📱 Sizes: sm, md, lg, icon

---

#### 3. **Progress** (`motion/progress.tsx`)
```tsx
import { Progress } from '@/components/motion/progress';

<Progress value={75} animated showValue />
```

**Features:**
- 📈 Smooth fill animation (0 → value)
- ⏱️ Spring physics (stiffness: 50, damping: 20)
- 📊 Optional percentage display
- ⏸️ Can disable animation

---

#### 4. **Count-Up** (`motion/count-up.tsx`)
```tsx
import { CountUp, AnimatedMatchScore } from '@/components/motion/count-up';

// Generic counter
<CountUp value={47} suffix=" left" duration={2} />

// Match score with gradient
<AnimatedMatchScore score={95} showIcon />
```

**Features:**
- 🔢 Animated number counting
- ⏱️ Customizable duration
- 🎯 Prefix/suffix support
- 📊 Decimal precision
- 🎨 Gradient badge for match scores (90%+ green→blue)

---

#### 5. **Page Transition** (`motion/page-transition.tsx`)
```tsx
import { PageTransition, SectionTransition, StaggerContainer, StaggerItem } from '@/components/motion/page-transition';

// Wrap entire page (use in app/template.tsx)
<PageTransition>{children}</PageTransition>

// Animate section
<SectionTransition delay={0.2}>
  <div>Content</div>
</SectionTransition>

// Stagger list items
<StaggerContainer staggerDelay={0.1}>
  {items.map(item => (
    <StaggerItem key={item.id}>
      {item.content}
    </StaggerItem>
  ))}
</StaggerContainer>
```

**Features:**
- 🔄 Fade + slide page transitions
- ⏱️ 300ms duration (optimized)
- 📄 Section-level animations
- 📃 Stagger effects for lists

---

#### 6. **Sidebar** (`motion/sidebar.tsx`)
```tsx
import { Sidebar, NavSection, NavItem, ProgressCard, CreditsCard } from '@/components/motion/sidebar';

<Sidebar>
  <NavSection title="Main">
    <NavItem 
      icon={Home} 
      label="Dashboard" 
      href="/dashboard" 
      isActive 
      shortcut="G H"
    />
  </NavSection>
  
  <NavSection title="Stats" className="mt-auto">
    <ProgressCard title="This Week" value={3} total={10} />
    <CreditsCard remaining={47} />
  </NavSection>
</Sidebar>
```

**Features:**
- 👉 Slide-in animation (from left)
- 👆 Nav items: scale 1.02, y: -2, shadow
- 🎯 Active indicator with layoutId
- 🔢 Animated counts in cards
- ⚡ Icon wiggle on hover
- ⌨️ Keyboard shortcut hints

---

#### 7. **Job Card** (`motion/job-card.tsx`)
```tsx
import { JobCard } from '@/components/motion/job-card';

<JobCard
  company="Stripe"
  logo="https://logo.clearbit.com/stripe.com"
  jobTitle="Senior Backend Engineer"
  location="Berlin"
  salary="€90-120k"
  remote="Full Remote"
  matchScore={95}
  aiInsight="Perfect match..."
  skills={['Python', 'Kubernetes']}
  onReview={() => {}}
  onEdit={() => {}}
  onSkip={() => {}}
  index={0}
/>
```

**Features:**
- 👉 Drag gestures (left/right)
- 🟢 Visual feedback overlays:
  - Right swipe: Green sparkle icon
  - Left swipe: Red X icon
- 🔄 Rotation on drag (-15° to +15°)
- 📈 Match score count-up animation
- ✨ Staggered entry animations
- 👆 Hover: scale 1.02, y: -4, shadow-lg
- 💫 AI insight pulse effect

---

#### 8. **Skeleton** (`motion/skeleton.tsx`)
```tsx
import { Skeleton, JobCardSkeleton, SidebarSkeleton } from '@/components/motion/skeleton';

// Generic skeleton
<Skeleton className="w-32 h-5" />

// Pre-built skeletons
<JobCardSkeleton />
<SidebarSkeleton />
```

**Features:**
- 👋 Pulsing opacity animation
- 📏 Pre-built component skeletons
- ⏱️ 1.5s loop duration

---

## 🔧 IMPLEMENTATION GUIDE

### Step 1: Install Dependencies
```bash
npm install framer-motion
```

### Step 2: Add Page Transitions
```tsx
// app/template.tsx
import { PageTransition } from '@/components/motion/page-transition';

export default function Template({ children }) {
  return <PageTransition>{children}</PageTransition>;
}
```

### Step 3: Use Motion Components
```tsx
// Replace old imports
- import { Button } from '@/components/ui/button';
+ import { Button } from '@/components/motion/button';

- import { Badge } from '@/components/ui/badge';
+ import { Badge } from '@/components/motion/badge';
```

### Step 4: Add Count-Up Animations
```tsx
import { CountUp } from '@/components/motion/count-up';

// Before
<span>{credits} left</span>

// After
<CountUp value={credits} suffix=" left" duration={2} />
```

---

## 🎯 ANIMATION TOKENS

### Durations
```tsx
const ANIMATION_DURATIONS = {
  instant: 0.1,   // Immediate feedback
  fast: 0.2,      // Button clicks, hovers
  base: 0.3,      // Page transitions, modals
  slow: 0.4,      // Large movements
  emphasis: 0.6,  // Special effects
};
```

### Easing Functions
```tsx
const EASINGS = {
  easeOut: [0, 0, 0.2, 1],        // Deceleration
  easeIn: [0.4, 0, 1, 1],         // Acceleration
  easeInOut: [0.4, 0, 0.2, 1],    // Both
  spring: { type: "spring", stiffness: 400, damping: 25 },
};
```

### Hover Effect Standard
```tsx
const HOVER_EFFECT = {
  scale: 1.02,
  y: -2,
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)",
  transition: { duration: 0.2 }
};
```

---

## ✅ COMPLIANCE CHECKLIST

| Requirement | Status | Notes |
|-------------|--------|-------|
| All interactive elements use Framer Motion | ✅ | Badge, Button, NavItem, JobCard, etc. |
| Page transitions are fluid | ✅ | template.tsx with PageTransition |
| Hover: scale 1.02, y: -2, shadow | ✅ | All components |
| Count-up animations for data | ✅ | Match score, credits, progress |
| Drag visual feedback | ✅ | JobCard overlays |
| Spring physics | ✅ | stiffness: 400, damping: 25 |
| Loading states | ✅ | Skeleton components |
| Stagger animations | ✅ | StaggerContainer/Item |

---

## 💡 BEST PRACTICES

### 1. Use `layoutId` for Shared Element Transitions
```tsx
<motion.div layoutId="activeIndicator" />
```

### 2. Optimize Animations with `willChange`
```tsx
<motion.div style={{ willChange: "transform" }} />
```

### 3. Disable Animations for Reduced Motion
```tsx
const shouldReduceMotion = useReducedMotion();

<motion.div
  animate={shouldReduceMotion ? {} : { scale: 1.02 }}
/>
```

### 4. Use `AnimatePresence` for Exit Animations
```tsx
<AnimatePresence mode="wait">
  {items.map(item => (
    <motion.div key={item.id} exit={{ opacity: 0 }}>
      {item.content}
    </motion.div>
  ))}
</AnimatePresence>
```

---

## 📊 PERFORMANCE

### GPU-Accelerated Properties
- `transform` (scale, rotate, translate) ✅
- `opacity` ✅
- Avoid animating: `width`, `height`, `margin`, `padding` ❌

### Optimization Tips
1. Use `will-change: transform` for heavy animations
2. Limit simultaneous animations (max 3-4)
3. Use `useReducedMotion()` hook
4. Debounce scroll-triggered animations

---

## 🔗 LINKS

- [Design System](../../docs/DESIGN_SYSTEM.md)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Demo Page](../../app/demo/page.tsx)

---

**Status:** ✅ 100% COMPLIANT  
**Made with ❤️ in Berlin**
