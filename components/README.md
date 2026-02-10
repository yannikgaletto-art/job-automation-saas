# 🎨 PATHLY UI COMPONENTS

**Design System:** Notion-Linear Hybrid  
**Status:** ✅ Ready for Use  
**Last Updated:** 2026-02-10

---

## 🚀 QUICK START

### Installation

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open demo page
open http://localhost:3000/demo
```

---

## 🧑 AVAILABLE COMPONENTS

### 1. Sidebar Navigation

**Location:** `components/ui/sidebar.tsx`

**Components:**
- `<Sidebar>` - Main container
- `<NavSection>` - Grouped navigation items
- `<NavItem>` - Individual nav link with badge support
- `<ProgressCard>` - Stats display with progress bar
- `<CreditsCard>` - Credits remaining display

**Example:**
```tsx
import { Home, Inbox, History, Settings } from 'lucide-react';
import { 
  Sidebar, 
  NavSection, 
  NavItem, 
  ProgressCard, 
  CreditsCard 
} from '@/components/ui/sidebar';

<Sidebar>
  <NavSection title="Main">
    <NavItem 
      icon={Home} 
      label="Dashboard" 
      href="/dashboard" 
      isActive 
    />
    <NavItem 
      icon={Inbox} 
      label="Auto-Apply" 
      href="/auto-apply" 
      badge={12} 
    />
    <NavItem 
      icon={History} 
      label="History" 
      href="/history" 
    />
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

**Features:**
- ⚡ Hover animation (subtle slide right)
- 🎯 Active state highlighting
- 📌 Badge support for notifications
- 📊 Live progress tracking
- 📱 Responsive (collapses to bottom nav on mobile)

---

### 2. Job Card (Tinder-Style)

**Location:** `components/ui/job-card.tsx`

**Example:**
```tsx
import { JobCard } from '@/components/ui/job-card';

<JobCard
  company="Stripe"
  logo="https://logo.clearbit.com/stripe.com"
  jobTitle="Senior Backend Engineer"
  location="Berlin"
  salary="€90-120k"
  remote="Full Remote"
  matchScore={95}
  aiInsight="Perfect match - your Python exp + payment infra needs"
  skills={['Python', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Redis']}
  onReview={() => console.log('Review')}
  onEdit={() => console.log('Edit')}
  onSkip={() => console.log('Skip')}
/>
```

**Features:**
- 👉 **Swipe gestures** - Right (>100px) = Review, Left (<-100px) = Skip
- 📊 **Match Score gradient** - Green→Blue (90%+), Orange (70-89%), Red (<70%)
- 🤖 **AI Insights** - Contextual reasoning display
- ✨ **Hover animation** - Scale 1.02, lift -2px
- 🎯 **Action buttons** - Review, Edit, Skip

---

### 3. Badge

**Location:** `components/ui/badge.tsx`

**Variants:**
- `primary` - Blue background (notifications)
- `secondary` - Gray background (default)
- `outline` - Border only (skills)
- `success` - Green (applied)
- `warning` - Orange (review needed)
- `danger` - Red (rejected)

**Example:**
```tsx
import { Badge } from '@/components/ui/badge';

<Badge variant="primary">12</Badge>
<Badge variant="success">Applied</Badge>
<Badge variant="outline">Python</Badge>
```

---

### 4. Button

**Location:** `components/ui/button.tsx`

**Variants:**
- `primary` - Blue, main actions
- `secondary` - Gray, secondary actions
- `outline` - Border, tertiary actions
- `ghost` - Transparent, minimal actions
- `danger` - Red, destructive actions

**Sizes:**
- `sm` - 32px height
- `md` - 40px height (default)
- `lg` - 48px height
- `icon` - 40x40px square

**Example:**
```tsx
import { Button } from '@/components/ui/button';
import { Eye, Edit, X } from 'lucide-react';

<Button variant="primary" size="md">
  <Eye className="w-4 h-4 mr-2" />
  Review CL
</Button>

<Button variant="ghost" size="icon">
  <X className="w-4 h-4" />
</Button>
```

---

### 5. Progress Bar

**Location:** `components/ui/progress.tsx`

**Example:**
```tsx
import { Progress } from '@/components/ui/progress';

<Progress value={75} className="h-2" />
```

---

## 🎨 DESIGN TOKENS

### Colors (Notion-Linear Hybrid)

```css
/* Backgrounds */
--bg-primary: #FFFFFF
--bg-secondary: #F7F7F5  /* Warm off-white */
--bg-tertiary: #FAFAF9
--bg-hover: #F5F5F4

/* Borders */
--border-light: #E7E7E5
--border-medium: #D6D6D3
--border-focus: #0066FF

/* Text */
--text-primary: #37352F  /* Notion black */
--text-secondary: #73726E
--text-tertiary: #A8A29E

/* Semantic */
--primary: #0066FF        /* Linear blue */
--success: #00C853
--warning: #FFA000
--danger: #D32F2F
```

### Typography

```css
/* Font */
font-family: 'Inter', system-ui, sans-serif

/* Scale */
--text-xs: 12px
--text-sm: 14px
--text-base: 16px
--text-lg: 18px
--text-xl: 20px
--text-2xl: 24px
--text-3xl: 30px

/* Weights */
--font-regular: 400
--font-medium: 500
--font-semibold: 600
```

### Spacing (8px Grid)

```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-6: 24px
--space-8: 32px
--space-12: 48px
```

---

## ⌨️ KEYBOARD SHORTCUTS (Planned)

```
Cmd+K       Open Command Menu
G H         Go to Dashboard
G I         Go to Inbox
G A         Go to History
J / K       Navigate up/down in lists
Enter       Select item
Esc         Close modal/menu
```

---

## 📱 RESPONSIVE BEHAVIOR

### Mobile (< 768px)
- Sidebar → Bottom Navigation (4 icons)
- Job Cards → Full-width, swipe-enabled
- AI Context → Slide-up sheet (toggle)

### Tablet (768-1024px)
- Sidebar → Collapsible
- Job Cards →  2-column grid
- AI Context → Hidden (toggle button)

### Desktop (> 1024px)
- Full 3-column layout
- All components visible
- Keyboard shortcuts active

---

## 🔧 DEVELOPMENT

### Component Structure

```
components/
├── ui/
│   ├── sidebar.tsx       # Sidebar navigation
│   ├── job-card.tsx      # Job card with swipe
│   ├── badge.tsx         # Status badges
│   ├── button.tsx        # Buttons
│   └── progress.tsx      # Progress bars
├── README.md          # This file
lib/
└── utils.ts           # cn() helper
```

### Adding New Components

1. **Create component file:**
   ```bash
   touch components/ui/my-component.tsx
   ```

2. **Follow the pattern:**
   ```tsx
   "use client";  // If using hooks
   
   import { cn } from '@/lib/utils';
   import { motion } from 'framer-motion';  // If animated
   
   export function MyComponent({ className, ...props }) {
     return (
       <div className={cn("base-classes", className)} {...props}>
         {/* Component content */}
       </div>
     );
   }
   ```

3. **Use design tokens:**
   - Text: `text-[#37352F]` (primary), `text-[#73726E]` (secondary)
   - Backgrounds: `bg-[#FAFAF9]`, `bg-[#F7F7F5]`
   - Borders: `border-[#E7E7E5]`
   - Hover: `hover:bg-[#F5F5F4]`

4. **Add animations:**
   ```tsx
   <motion.div
     whileHover={{ scale: 1.02, y: -2 }}
     transition={{ duration: 0.2 }}
   >
   ```

---

## ✅ ACCESSIBILITY

### Best Practices

1. **Semantic HTML:**
   - Use `<button>` for actions, not `<div>`
   - Use `<nav>` for navigation
   - Use proper heading hierarchy

2. **ARIA Labels:**
   ```tsx
   <button aria-label="Review cover letter">
     <Eye aria-hidden="true" />
   </button>
   ```

3. **Keyboard Navigation:**
   - All interactive elements: `tabIndex={0}`
   - Focus visible: `focus-visible:ring-2`

4. **Color Contrast:**
   - All text: 4.5:1 minimum ratio
   - Primary text: `#37352F` on `#FFFFFF` = 10.2:1 ✅
   - Secondary text: `#73726E` on `#FFFFFF` = 4.9:1 ✅

---

## 💡 TIPS & TRICKS

### 1. Job Card Swipe Customization

```tsx
// Adjust swipe threshold
if (info.offset.x > 150) {  // More sensitive
  onReview();
}

// Add haptic feedback (mobile)
if ('vibrate' in navigator) {
  navigator.vibrate(10);
}
```

### 2. Sidebar Persistence

```tsx
// Save collapsed state
const [isCollapsed, setIsCollapsed] = useState(
  () => localStorage.getItem('sidebar-collapsed') === 'true'
);
```

### 3. Match Score Animation

```tsx
import CountUp from 'react-countup';

<CountUp 
  end={matchScore} 
  duration={1.5} 
  suffix="%" 
/>
```

---

## 🔗 LINKS

- **Design System:** [docs/DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md)
- **Architecture:** [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- **Demo Page:** [app/demo/page.tsx](../app/demo/page.tsx)

---

## ❓ TROUBLESHOOTING

### "Module not found: @/components/ui/..."

**Solution:** Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### "Framer Motion animations not working"

**Solution:** Add `"use client"` directive at top of component file.

### "Colors not matching design system"

**Solution:** Use exact hex values from design tokens, not Tailwind defaults:
- ❌ `text-gray-700`
- ✅ `text-[#37352F]`

---

**Made with ❤️ in Berlin**

**Status:** ✅ READY  
**Questions?** Check [DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md)
