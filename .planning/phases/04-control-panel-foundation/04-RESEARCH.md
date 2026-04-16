# Phase 4: 控制面板基础架构 - Research

**Researched:** 2026-04-16
**Domain:** React drawer UI patterns, Next.js 15 component architecture, existing codebase patterns
**Confidence:** HIGH

## Summary

This phase upgrades the group device control panel from a centered modal dialog to a slide-out drawer panel, matching the existing `DeviceDrawer` component in the device management tab. The research shows that the codebase already has a fully working drawer implementation (`DeviceDrawer` in `control/page.tsx`) that uses pure Tailwind CSS + inline classes for the overlay, slide animation, and content layout. The current `ControlGroupDrawer` in `groups/page.tsx` is a centered modal (`fixed inset-0 bg-black/50 flex items-center justify-center`) that needs to be replaced with a drawer pattern identical to `DeviceDrawer`.

**Primary recommendation:** Extract a reusable `ControlDrawer` component that mirrors the `DeviceDrawer` structure (overlay + slide panel from right), wire it into the groups page via the existing `controllingDevice` state, add a device info header section, and implement loading state management around the device data fetch.

## User Constraints (from CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
_No CONTEXT.md exists for this phase — no locked decisions to copy._

### Claude's Discretion
_No CONTEXT.md exists for this phase._

### Deferred Ideas (OUT OF SCOPE)
_No CONTEXT.md exists for this phase._
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PANEL-01 | 组设备控制弹窗改为抽屉式侧滑面板（从右侧滑入，与设备管理TAB的 DeviceDrawer 样式一致） | DeviceDrawer pattern documented below; exact CSS classes and structure identified |
| PANEL-02 | 控制面板顶部显示设备基本信息（设备ID、名称、Mesh、在线状态、功能类型） | DeviceDrawer info card pattern documented; GroupDevice type fields identified |
| PANEL-07 | 控制命令发送时显示 loading 状态，完成后自动刷新设备状态 | Existing `controlling` state pattern in groups page; control flow already uses try/finally |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Drawer UI component (overlay, slide animation) | Browser / Client | -- | Pure React + CSS, no server interaction |
| Device info display | Browser / Client | API / Backend | Renders data from GroupDevice (fetched from API) |
| Loading state management | Browser / Client | -- | Client-side React state for loading spinner |
| Control command dispatch | Browser / Client | API / Backend | UI triggers fetch to `/api/devices/control` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.5 | Component framework, state management | [VERIFIED: npm registry] Project uses React 19.0.0, registry shows 19.2.5 |
| Next.js | 16.2.4 | App framework | [VERIFIED: npm registry] Project uses Next.js 15.1.0, registry shows 16.2.4 |
| Tailwind CSS | 3.4.17 (project) | Utility CSS classes, transition animations | [VERIFIED: package.json] Project uses Tailwind 3.x, not 4.x |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| Font Awesome (fa-*) | Icons (power-off, sliders-h, times, spinner) | Already loaded globally in the project, no additional install needed |
| Native `fetch` API | HTTP requests for device control | Project uses native fetch, no axios or other HTTP client |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure CSS drawer (DeviceDrawer pattern) | shadcn/ui Drawer | Adds dependency, inconsistent with existing design system |
| Pure CSS drawer | @headlessui/react Dialog | Unnecessary for simple slide-out panel |
| useState for loading | React Suspense | Overkill for single-component loading state |

**Installation:** No new packages needed. All required libraries are already installed.

## Architecture Patterns

### System Architecture Diagram

```
[User clicks "控制" button]
        |
        v
[setControllingDevice(device)] -- React state update
        |
        v
[ControlDrawer renders]
        |
   +----+----+
   |         |
   v         v
[Overlay]  [Slide Panel (right side)]
  |click      |
  |close      +-- [Header: device name + close button]
               +-- [Info Card: ID, Mesh, status, func type]
               +-- [Loading Spinner] -- if device data not ready
               +-- [Control Components] -- if data loaded (Phase 5)
               |
               v
        [onControl callback] --> fetch /api/devices/control
               |
               v
        [controlling state] --> loading indicator on buttons
```

### Recommended Project Structure

No new files or directories are needed. The `ControlGroupDrawer` component lives inline in `groups/page.tsx` (same pattern as `DeviceDrawer` in `control/page.tsx`). The phase modifies only:

```
src/app/(dashboard)/groups/page.tsx    -- Replace ControlGroupDrawer, add loading state
src/app/globals.css                     -- Add btn-danger class (missing but referenced)
```

### Pattern 1: Slide-out Drawer (from DeviceDrawer)

**What:** A fixed-position overlay + right-aligned slide panel using CSS transitions
**When to use:** Any side-panel UI that needs to slide in from the right with backdrop
**Example:**
```tsx
// Source: control/page.tsx lines 4529-4544
return (
  <>
    {/* Overlay */}
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
    />

    {/* Drawer panel */}
    <div
      className={`fixed right-0 top-0 h-full w-[400px] bg-gradient-to-b from-[#1a1f2e] to-[#151a28] shadow-[-4px_0_20px_rgba(0,0,0,0.5)] z-50 transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="p-6 overflow-y-auto h-full">
        {/* Content */}
      </div>
    </div>
  </>
);
```

Key CSS properties:
- **Overlay:** `fixed inset-0 bg-black/50 backdrop-blur-sm z-40` with `transition-opacity`
- **Panel:** `fixed right-0 top-0 h-full w-[400px]` with gradient background
- **Animation:** `translate-x-full` (hidden) to `translate-x-0` (visible) via `transition-transform duration-300`
- **Z-index:** `z-40` for overlay, `z-50` for panel

### Pattern 2: Device Info Card (from DeviceDrawer)

**What:** A blue-tinted info card at the top of the drawer showing device metadata
**When to use:** Any drawer/drawer-like panel that needs to display device/entity info
**Example:**
```tsx
// Source: control/page.tsx lines 4554-4576
<div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-6">
  <div className="flex items-center justify-between mb-1">
    <h4 className="text-lg font-bold text-white">{device.name || "未命名设备"}</h4>
    <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
      {device.alive === 1 ? "在线" : "离线"}
    </span>
  </div>
  <div className="flex items-center gap-2 text-sm text-gray-400">
    <span className="text-xs font-mono bg-gray-700/50 px-2 py-0.5 rounded">{device.did}</span>
    <span>·</span>
    <span>{roomName}</span>
  </div>
  {/* Optional: func codes display */}
</div>
```

### Pattern 3: Loading State with Spinner

**What:** A centered spinner using Font Awesome's `fa-spinner fa-spin` class
**When to use:** Any async data loading state
**Example (from existing groups page):**
```tsx
// Source: groups/page.tsx lines 261-264
<div className="text-center py-12 text-gray-400">
  <i className="fas fa-spinner fa-spin text-2xl"></i>
  <p className="mt-2">加载中...</p>
</div>
```

### Anti-Patterns to Avoid

- **Do NOT use `flex items-center justify-center` for the drawer** -- this is the current ControlGroupDrawer pattern and produces a centered modal, not a slide-out panel
- **Do NOT add a third-party drawer library** -- the project has zero UI component libraries and the DeviceDrawer pattern works perfectly
- **Do NOT put loading state inside the overlay conditional** -- the drawer component receives `open` boolean and should render null when closed, not show a loading spinner in a closed drawer
- **Do NOT use `alert()` for error states** -- existing code uses it, but inline error messages in the drawer are better UX

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drawer slide animation | Custom CSS @keyframes + JS state | DeviceDrawer's `translate-x-full` to `translate-x-0` pattern | Already works, consistent with existing UI, no bugs |
| Overlay backdrop | Manual opacity + z-index calculations | Same overlay classes as DeviceDrawer | `bg-black/50 backdrop-blur-sm z-40` already proven |
| Loading spinner | Custom CSS animation or SVG | Font Awesome `fa-spinner fa-spin` | Already used in 5+ places in the codebase |
| Status badge | Custom styled span | `.badge .badge-success` / `.badge .badge-error` | Defined in globals.css, consistent across all tabs |
| Device function resolution | Manual if/else chain | `resolveDeviceFunc(func, funcs)` helper | Already defined in control/page.tsx, handles edge cases |

**Key insight:** The codebase already has every UI building block needed. The task is copy-paste-adapt from DeviceDrawer, not invent new patterns.

## Runtime State Inventory

> Not applicable -- this is a greenfield UI phase (replacing an existing component within the same file), not a rename/refactor/migration phase. No runtime state (databases, services, OS registrations, secrets, build artifacts) is affected by changing a drawer component's CSS classes.

## Common Pitfalls

### Pitfall 1: Drawer width mismatch
**What goes wrong:** New drawer uses a different width than DeviceDrawer (400px), causing visual inconsistency
**Why it happens:** Copying the pattern but tweaking the width "to fit better"
**How to avoid:** Use exactly `w-[400px]` to match DeviceDrawer
**Warning signs:** Side-by-side comparison shows different panel widths

### Pitfall 2: Missing `overflow-y-auto` on inner container
**What goes wrong:** Drawer content overflows the viewport on short screens with no scrollbar
**Why it happens:** Forgetting `overflow-y-auto h-full` on the inner content div
**How to avoid:** Copy the exact inner structure: `<div className="p-6 overflow-y-auto h-full">`
**Warning signs:** Content at bottom of drawer is cut off on 13" laptop screens

### Pitfall 3: Loading state blocks drawer open/close
**What goes wrong:** Putting the loading check at the component root level causes the drawer to not render at all while loading
**Why it happens:** `if (loading) return null` inside the drawer component prevents the overlay from showing
**How to avoid:** Loading state should be INSIDE the drawer content area, not at the component root. The overlay and panel must render so the user sees the drawer opening with a spinner inside
**Warning signs:** Clicking "控制" does nothing visible for 1-2 seconds, then drawer appears

### Pitfall 4: GroupDevice vs InSonaDevice type mismatch
**What goes wrong:** Drawer component expects `InSonaDevice` fields (like `did`, `meshid`) but receives `GroupDevice` (which has `id`, `meshId`)
**Why it happens:** Field names differ between the two types
**How to avoid:** The new drawer should accept `GroupDevice` type and use its field names (`id`, `meshId`, `value` as string not array). Parse `value` with `JSON.parse()` since it's a string in GroupDevice
**Warning signs:** TypeScript errors or undefined values in the info card

### Pitfall 5: Missing `btn-danger` CSS class
**What goes wrong:** The groups page uses `btn-danger` class on the delete button but it's not defined in globals.css
**Why it happens:** The class was referenced but never added to the stylesheet
**How to avoid:** Add `.btn-danger` to globals.css as part of this phase (or as a separate fix)
**Warning signs:** Delete button appears unstyled or inherits default browser styles

## Code Examples

### New ControlGroupDrawer (drawer pattern, matching DeviceDrawer)

```tsx
// Replaces the existing ControlGroupDrawer in groups/page.tsx
function ControlGroupDrawer({
  device,
  open,
  onClose,
  onControl,
  controlling,
  loading,
}: {
  device: GroupDevice | null;
  open: boolean;
  onClose: () => void;
  onControl: (did: string, action: string, value: number[], meshid: string) => Promise<void>;
  controlling: boolean;
  loading: boolean;
}) {
  if (!device) return null;

  const funcLabels: Record<number, string> = {
    2: "开关", 3: "调光", 4: "双色温", 5: "HSL彩灯",
    9: "面板", 10: "传感器",
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-gradient-to-b from-[#1a1f2e] to-[#151a28] shadow-[-4px_0_20px_rgba(0,0,0,0.5)] z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 overflow-y-auto h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">组设备控制</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <i className="fas fa-times text-xl" />
            </button>
          </div>

          {/* Device Info Card (PANEL-02) */}
          <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-lg font-bold text-white">
                {device.name || device.gatewayName || `组设备 ${device.displayId || device.id}`}
              </h4>
              <span className={`badge ${device.alive === 1 ? "badge-success" : "badge-error"}`}>
                {device.alive === 1 ? "在线" : "离线"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
              <span className="text-xs font-mono bg-gray-700/50 px-2 py-0.5 rounded">
                {(device.displayId || device.id).toUpperCase()}
              </span>
              <span>·</span>
              <span>Mesh {device.meshId || "-"}</span>
              <span>·</span>
              <span>{funcLabels[device.func] || `功能${device.func}`}</span>
            </div>
          </div>

          {/* Loading State (PANEL-07) */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fas fa-spinner fa-spin text-2xl"></i>
              <p className="mt-2">加载设备数据中...</p>
            </div>
          ) : (
            /* Control content goes here (Phase 5) */
            <div className="text-center py-12 text-gray-500">
              <p>控制面板内容将在下一阶段实现</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

### Wiring the drawer in GroupsPage

```tsx
// Replace the current controllingDevice state usage:
// OLD: {controllingDevice && (<ControlGroupDrawer device={controllingDevice} ... />)}
// NEW:
<ControlGroupDrawer
  device={controllingDevice}
  open={!!controllingDevice}
  onClose={() => setControllingDevice(null)}
  onControl={handleControl}
  controlling={controlling}
  loading={false} // Will be replaced with actual loading state in implementation
/>
```

### btn-danger CSS fix (add to globals.css)

```css
.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Centered modal (`flex items-center justify-center`) | Slide-out drawer (`translate-x` + `fixed right-0`) | This phase | Consistent UX across device management and group device tabs |
| `alert()` for control errors | Inline error display in drawer | This phase | Better UX, no modal interruption |
| No loading state in control panel | Spinner + "加载设备数据中..." | This phase (PANEL-07) | User feedback during async operations |

**Deprecated/outdated:**
- The current `ControlGroupDrawer` centered modal pattern: replaced by slide-out drawer
- The `controllingDevice` state triggers via direct component conditional (`{controllingDevice && ...}`): replaced by `open` boolean prop pattern matching DeviceDrawer

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Font Awesome is available globally (no import needed) | Code Examples | Icons won't render; easily fixed by verifying the HTML template |
| A2 | The groups page is dynamically imported and can be modified independently | Project Structure | May need to coordinate with other files if import structure changes |
| A3 | `GroupDevice.value` is a JSON string (not array) that needs parsing | Code Examples | Wrong parsing would break control values; verified in useDeviceGroups.ts where value is stored as string from DB |

## Open Questions (RESOLVED)

1. **Should the drawer be extracted to a shared component file?** -- **RESOLVED:** Keep inline in `groups/page.tsx` for this phase (consistent with existing pattern). Unify in Phase 6 (视觉一致性优化) if needed.
   - What we know: Both `control/page.tsx` and `groups/page.tsx` have their own drawer implementations
   - What's unclear: Whether the team plans to eventually unify them into `src/components/ControlDrawer.tsx`

2. **Should loading state fetch fresh device data or use the list data?** -- **RESOLVED:** Use list data initially (no extra fetch). Add real-time SSE updates in future phases (already in v1.2 candidates).
   - What we know: `controllingDevice` is set from the list row, which may have stale values
   - What's unclear: Whether there's a need to fetch the latest device state from the gateway before showing the drawer

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Font Awesome | Icons (spinner, times, power-off) | ✓ | Loaded via CDN/global | Use unicode characters or SVG |
| Node.js | Development/build | ✓ | >= 18.18 (Next.js 15 requirement) | -- |
| Browser (any modern) | Drawer rendering | ✓ | CSS transitions supported | -- |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | none — see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANEL-01 | Drawer slides in from right on click | unit | `npx vitest run -t "drawer opens from right"` | ❌ Wave 0 |
| PANEL-02 | Device info card shows ID, name, Mesh, status, func | unit | `npx vitest run -t "device info card displays"` | ❌ Wave 0 |
| PANEL-07 | Loading spinner shows during data load | unit | `npx vitest run -t "loading state shows spinner"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` (quick run, no config file yet)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Test framework config — no vitest config file detected
- [ ] Test directory — no `__tests__` or `*.test.*` files in project
- [ ] Framework setup — `vitest` installed but not configured for React component testing
- [ ] Need: `vitest.config.ts` with React testing library setup
- [ ] Need: `@testing-library/react` + `@testing-library/jest-dom` for component testing

## Security Domain

> `security_enforcement` is not set in config.json (defaults to enabled). However, this phase is purely a UI component change with no authentication, input handling, or data persistence. ASVS categories do not apply to CSS class changes.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — UI component only |
| V3 Session Management | no | N/A — UI component only |
| V4 Access Control | no | N/A — UI component only |
| V5 Input Validation | no | N/A — no new input fields |
| V6 Cryptography | no | N/A — no crypto |

## Sources

### Primary (HIGH confidence)
- [Codebase: `control/page.tsx` lines 4446-4751] - DeviceDrawer component (full implementation read)
- [Codebase: `control/page.tsx` lines 481-483] - openDeviceDrawer state flow
- [Codebase: `control/page.tsx` lines 57-69] - resolveDeviceFunc helper
- [Codebase: `globals.css`] - All CSS classes: .card, .btn, .btn-primary, .btn-secondary, .btn-sm, .badge, .badge-success, .badge-error, .slider, .input-field, .fade-in
- [Codebase: `groups/page.tsx`] - Current ControlGroupDrawer (centered modal pattern)
- [Codebase: `hooks/useDeviceGroups.ts`] - GroupDevice type, controlGroup API call
- [Codebase: `hooks/useDevices.ts`] - Device base type definition
- [Codebase: `lib/types.ts`] - DEVICE_TYPE_LABELS, FUNC_LABELS, InSonaDevice type
- [Codebase: `package.json`] - Next.js 15.1.0, React 19.0.0, Tailwind 3.4.17

### Secondary (MEDIUM confidence)
- [npm registry] - next@16.2.4, react@19.2.5, tailwindcss@4.2.2 (current latest, project uses older versions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages verified via package.json and npm registry
- Architecture: HIGH - patterns directly read from existing codebase source code
- Pitfalls: HIGH - based on direct comparison of existing ControlGroupDrawer vs DeviceDrawer implementations
- CSS classes: HIGH - read directly from globals.css
- Type definitions: HIGH - read directly from source files

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days - stable UI patterns)
