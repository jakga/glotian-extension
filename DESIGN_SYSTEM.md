# Glotian Extension Design System

This document outlines the design system used in the Glotian Chrome Extension, aligned with the mobile and web applications.

## Overview

The extension uses **Tailwind CSS** for consistent styling across all UI components. The design system follows the Glotian brand identity with soft teal and green colors, warm off-white backgrounds, and modern, accessible components.

## Colors

### Primary Colors

```css
--glotian-primary: #87b6c4 /* Soft teal - main brand color */
  --glotian-primary-dark: #6b9bab /* Darker teal for dark mode */
  --glotian-secondary: #89b78a /* Soft green - accent color */
  --glotian-secondary-dark: #6e9c70 /* Darker green for dark mode */;
```

### Background Colors

```css
--glotian-bg-light: #f8f7f4 /* Warm off-white background */
  --glotian-bg-white: #ffffff /* Pure white for cards */;
```

### Text Colors

```css
--glotian-text-primary: #1f2937 /* gray-800 - main text */
  --glotian-text-secondary: #6b7280 /* gray-500 - secondary text */
  --glotian-text-tertiary: #9ca3af /* gray-400 - tertiary text */;
```

### UI Colors

```css
--glotian-border: #e5e7eb /* gray-200 - borders */ --glotian-error: #dc2626
  /* red-600 - errors */;
```

### Gradients

```css
background: linear-gradient(135deg, #87b6c4 0%, #89b78a 100%);
```

## Typography

### Font Stack

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
  Cantarell, sans-serif;
```

### Font Sizes

- **xs**: 11px - Labels, badges, meta info
- **sm**: 12px - Secondary text
- **base**: 14px - Body text (default)
- **lg**: 16px - Headings, emphasized text
- **xl**: 18px - Page titles

### Font Weights

- **normal**: 400 - Body text
- **medium**: 500 - Buttons, emphasis
- **semibold**: 600 - Headings, labels
- **bold**: 700 - (rarely used)

## Components

### Buttons

#### Primary Button

```html
<button class="btn-primary">Primary Action</button>
```

- Gradient background (#87b6c4 → #89b78a)
- White text
- Hover: lift effect + larger shadow
- Disabled: gray background, 50% opacity

#### Secondary Button

```html
<button class="btn-secondary">Secondary Action</button>
```

- White background
- Teal border and text
- Hover: light teal background
- Disabled: light gray

#### Ghost Button

```html
<button class="btn-ghost">Text Link</button>
```

- No background
- Teal text
- Hover: underline + darker color

### Inputs

#### Text Input

```html
<input class="input-base" type="text" placeholder="Enter text..." />
```

- Border: 2px gray-200
- Focus: teal border + ring effect
- Rounded corners

#### Textarea

```html
<textarea class="input-base" rows="4"></textarea>
```

- Same styling as text input
- Supports vertical resize

### Cards

#### Basic Card

```html
<div class="card p-4">
  <h3 class="font-semibold mb-2">Card Title</h3>
  <p class="text-sm text-glotian-text-secondary">Card content...</p>
</div>
```

#### Hover Card

```html
<div class="card card-hover p-4">Hover to lift</div>
```

- Lift animation on hover
- Border becomes teal
- Larger shadow

### Badges

#### Primary Badge

```html
<span class="badge badge-primary">Tag</span>
```

- Light teal background
- Teal text and border

#### Secondary Badge

```html
<span class="badge badge-secondary">Category</span>
```

- Light green background
- Green text and border

### Loading States

#### Spinner

```html
<div class="spinner"></div>
```

- Rotating circle animation
- Teal accent color

#### Skeleton

```html
<div class="skeleton h-4 w-32 rounded"></div>
```

- Pulsing gray block
- Used for loading placeholders

## Layout

### Side Panel Structure

```
┌─────────────────────────────────┐
│ Header (Gradient)               │
├─────────────────────────────────┤
│ Tabs                            │
├─────────────────────────────────┤
│                                 │
│ Main Content Area               │
│ (Scrollable)                    │
│                                 │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
```

### Popup Structure

```
┌─────────────────────────┐
│ Header (Gradient)       │
├─────────────────────────┤
│ Quick Actions           │
├─────────────────────────┤
│ Keyboard Shortcuts      │
└─────────────────────────┘
```

## Spacing

Uses Tailwind's default spacing scale:

- **1**: 0.25rem (4px)
- **2**: 0.5rem (8px)
- **3**: 0.75rem (12px)
- **4**: 1rem (16px)
- **5**: 1.25rem (20px)
- **6**: 1.5rem (24px)
- **8**: 2rem (32px)

### Common Patterns

- Card padding: `p-4` (16px)
- Button padding: `px-4 py-2.5` (16px horizontal, 10px vertical)
- Section gaps: `gap-4` (16px)

## Border Radius

- **Default**: 0.75rem (12px) - `rounded-glotian`
- **Small**: 0.5rem (8px) - `rounded-lg`
- **Medium**: 0.375rem (6px) - `rounded-md`
- **Full**: 9999px - `rounded-full` (pills, badges)

## Shadows

```css
/* Default shadow for cards */
box-shadow: 0 2px 8px rgba(135, 182, 196, 0.08);

/* Hover shadow for interactive elements */
box-shadow: 0 4px 12px rgba(135, 182, 196, 0.3);
```

## Animations

### Transitions

All interactive elements use smooth transitions:

```css
transition: all 0.2s ease-out;
```

### Hover Effects

- **Buttons**: Lift up slightly (-1px translateY)
- **Cards**: Lift + shadow increase
- **Links**: Color change + underline

### Animations

- **Fade In**: 0.2s ease-out
- **Slide In**: 0.3s ease-out (from right)
- **Bounce Subtle**: 2s infinite (for warnings)
- **Spin**: 1s linear infinite (for loaders)

## Accessibility

### Focus States

All interactive elements have visible focus states:

```css
focus:outline-none focus:ring-2 focus:ring-glotian-primary/20
```

### ARIA Labels

All buttons and inputs have proper ARIA labels:

```html
<button aria-label="Close dialog">×</button>
<input aria-label="Search" type="text" />
```

### Color Contrast

All text meets WCAG AA standards:

- Primary text on white: 8.59:1
- Secondary text on white: 4.69:1
- White on gradient: 4.5:1+

## Responsive Design

The extension adapts to different viewport sizes:

- **Side Panel**: 400px minimum width
- **Popup**: Fixed 320px width
- **Content Overlays**: Responsive to page width

### Breakpoints

While rare in extensions, use Tailwind breakpoints when needed:

- **sm**: 640px
- **md**: 768px
- **lg**: 1024px

## Usage Examples

### Complete Form Example

```html
<form class="card p-4 space-y-3">
  <div>
    <label class="section-label">Email Address</label>
    <input type="email" class="input-base mt-1" placeholder="you@example.com" />
  </div>

  <div>
    <label class="section-label">Password</label>
    <input type="password" class="input-base mt-1" placeholder="••••••••" />
  </div>

  <div class="flex gap-2">
    <button type="submit" class="btn-primary flex-1">Log In</button>
    <button type="button" class="btn-secondary flex-1">Cancel</button>
  </div>
</form>
```

### Content List Example

```html
<div class="space-y-2">
  <div class="card card-hover p-3 cursor-pointer">
    <div class="flex items-center justify-between mb-1">
      <h4 class="font-semibold text-sm">Translation #1</h4>
      <span class="badge badge-primary">New</span>
    </div>
    <p class="text-xs text-glotian-text-secondary">Original text here...</p>
  </div>

  <div class="card card-hover p-3 cursor-pointer">
    <div class="flex items-center justify-between mb-1">
      <h4 class="font-semibold text-sm">Translation #2</h4>
      <span class="badge badge-secondary">Saved</span>
    </div>
    <p class="text-xs text-glotian-text-secondary">Original text here...</p>
  </div>
</div>
```

### Loading State Example

```html
<div class="card p-4">
  <!-- Skeleton loader -->
  <div class="space-y-3 animate-pulse">
    <div class="skeleton h-4 w-24"></div>
    <div class="skeleton h-16 w-full"></div>
    <div class="flex gap-2">
      <div class="skeleton h-8 w-20"></div>
      <div class="skeleton h-8 w-20"></div>
    </div>
  </div>
</div>
```

## Best Practices

### Do's ✅

- Use Tailwind utility classes consistently
- Follow the Glotian color palette
- Add hover states to all interactive elements
- Include focus states for accessibility
- Use appropriate spacing (4px increments)
- Add smooth transitions (0.2s)

### Don'ts ❌

- Don't use arbitrary values (`h-[137px]`) - stick to scale
- Don't mix inline styles with Tailwind classes
- Don't use custom colors outside the palette
- Don't forget accessibility attributes
- Don't use animations longer than 0.3s for interactions
- Don't use `!important` - prefer specificity

## Migration from Old CSS

If migrating components from the old CSS files:

1. Replace custom classes with Tailwind utilities
2. Update colors to use the Glotian palette
3. Convert px values to Tailwind scale (4, 8, 12, 16...)
4. Add hover/focus states if missing
5. Test accessibility with keyboard navigation

### Example Migration

**Before (Old CSS):**

```css
.my-button {
  padding: 10px 16px;
  background: linear-gradient(135deg, #87b6c4 0%, #89b78a 100%);
  color: white;
  border-radius: 12px;
}
```

**After (Tailwind):**

```html
<button class="btn-primary">My Button</button>
```

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Glotian Web App Design](../../web/app/globals.css)
- [Chrome Extension UI Guidelines](https://developer.chrome.com/docs/extensions/develop/ui)
