---
name: Tactical Brutalist
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#4b4731'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#7c775f'
  outline-variant: '#cdc7aa'
  surface-tint: '#6a5f00'
  primary: '#6a5f00'
  on-primary: '#ffffff'
  primary-container: '#ffe600'
  on-primary-container: '#726600'
  inverse-primary: '#dec800'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#b91a24'
  on-tertiary: '#ffffff'
  tertiary-container: '#ffddda'
  on-tertiary-container: '#c4242a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#fde400'
  primary-fixed-dim: '#dec800'
  on-primary-fixed: '#201c00'
  on-primary-fixed-variant: '#504700'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-bold:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
spacing:
  unit: 4px
  gutter: 16px
  margin-sm: 8px
  margin-md: 16px
  margin-lg: 24px
  window-padding: 20px
---

## Brand & Style

The design system is rooted in a **Retro-Technical Brutalist** aesthetic, inspired by early workstation interfaces and tactical simulation software. It targets power users who prioritize information density, rapid data manipulation, and structural clarity.

The visual personality is authoritative, cold, and precise. It utilizes high-contrast interfaces, heavy "hard-surface" borders, and a modular window-based layout that mimics a complex operating system. The emotional response should be one of total control over a complex simulation—functional, unfiltered, and uncompromisingly utilitarian.

## Colors

The palette is strictly high-contrast to ensure maximum legibility of complex data. 

- **Base Architecture:** Uses a stark Black (#000000) and White (#FFFFFF) foundation. Surfaces use a very light grey (#F4F4F5) to distinguish nested containers without losing contrast.
- **Primary Action (Yellow):** Reserved for the most critical interactive elements, such as global "Save" functions or primary call-to-actions.
- **System Blue:** Used for secondary structural highlights and "POLMAP" identifiers.
- **Alert/Warning (Red):** Used for destructive actions (Delete, Close) and critical system warnings.
- **Status (Green):** Used for positive growth metrics, active connections, or "On" states.

## Typography

Typography is used as a structural element. 
- **Space Grotesk** is used for headlines to provide a modern, technical feel that remains legible at larger sizes.
- **JetBrains Mono** is the workhorse font for all body text, data tables, and labels. Its monospaced nature ensures that columns of numbers and code-like "rules" align perfectly.
- All labels and tactical information should utilize uppercase styling to reinforce the "instrument panel" aesthetic.
- High information density is prioritized; line heights are kept tight to allow for maximum content per square inch.

## Layout & Spacing

This design system utilizes a **Fixed-Modular Grid** based on 4px increments.

- **Window-Based Layout:** The primary interface consists of floating or docked "modules" (windows). These modules have 4px solid black borders and 2px interior dividers.
- **Modularity:** Complex data tables and node editors are built using nested boxes. Each level of nesting should be clearly defined by its border weight or a subtle background shift to light grey.
- **Safe Areas:** Maintain a 24px margin from the screen edges for global controls (Top bar, Bottom status).
- **Density:** Spacing is intentionally tight. Content should feel "packed" but organized, reflecting the complexity of the simulation.

## Elevation & Depth

Depth is conveyed through **Hard-Shadow Brutalism** and **Tonal Layering** rather than blurs or gradients.

- **Stacking:** Windows are stacked with a 4px offset solid black shadow to simulate physical separation from the map background.
- **Layering:** Active states use the primary Yellow background. Inactive or "background" modules use a white or light grey surface with a 1px or 2px black border.
- **Focus:** When a window is active, its border may increase in thickness or the header background may shift to black with white text to indicate focus.

## Shapes

The shape language is strictly **Sharp (0px)**. 

No rounded corners are permitted. This reinforces the technical, engineered nature of the interface. Every button, input field, window, and chip must be a perfect rectangle. Dividers are solid, 1px or 2px lines.

## Components

- **Buttons:** 2px solid black borders. Default state is white background. Primary state is Yellow background. Hover states should invert colors (Black background / White text).
- **Tabs:** Rectangular boxes stacked horizontally. The active tab is Black with White text; inactive tabs are White with Black text.
- **Input Fields:** White background with a 1px black border. On focus, the border thickens to 3px. Monospaced text only.
- **Data Tables:** Use 1px vertical and horizontal lines to create a spreadsheet-like grid. Header rows should have a light grey background (#F4F4F5).
- **Node Editor Elements:** Modules connected by 2px solid black lines. Input/Output ports are represented by small 8x8px black squares.
- **Status Chips:** Small rectangular boxes with a solid background color (Green for active, Red for warning) and high-contrast text.
- **Close Buttons:** Always a red square with a white "X", positioned in the top right of window headers.