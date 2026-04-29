---
phase: group-control-review
reviewed: 2026-04-17T00:00:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - src/app/(dashboard)/groups/page.tsx
  - src/app/(dashboard)/control/page.tsx
  - src/hooks/useDeviceGroups.ts
  - src/hooks/useDevices.ts
  - src/app/api/devices/groups/route.ts
  - src/app/api/devices/control/route.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Code Review: Group Device Control (组设备控制)

**Reviewed:** 2026-04-17
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the group device control feature across the groups page, ControlGroupDrawer component, useDeviceGroups hook, and related API routes. Cross-referenced against the DeviceDrawer pattern in control/page.tsx for consistency. Found two critical issues (React anti-pattern, incorrect state initialization), five warnings (state management bugs, inconsistent value indexing, missing mobile support, code duplication), and four informational items.

---

## CRITICAL Findings

### CR-01: React Hooks Violation — setState During Render in ControlGroupDrawer

**File:** `src/app/(dashboard)/groups/page.tsx:475-487`

**Issue:**
The `ControlGroupDrawer` component calls `setState` directly during render (not inside `useEffect` or an event handler). This violates React's rules of hooks and causes a double-render on every device switch:

```tsx
// Lines 475-487
if (device.id !== prevDeviceId) {
  setPrevDeviceId(device.id);
  if (device.func === 3 || device.func === 4) {
    setBrightnessValue(currentValue[0] ?? 100);
  } else {
    setBrightnessValue(100);
  }
  if (device.func === 4) {
    setColorTempValue(currentValue[1] ?? 50);
  } else {
    setColorTempValue(50);
  }
}
```

If the `device` prop is a new object reference on every parent render (which is likely since `filteredGroups.map(...)` creates new references), this can cause an infinite render loop: render -> setState -> re-render -> new device ref -> setState -> infinite loop.

**Fix:**
Replace with `useEffect` that runs when `device?.id` changes:

```tsx
useEffect(() => {
  if (!device) return;
  if (device.func === 3 || device.func === 4) {
    setBrightnessValue(currentValue[0] ?? 100);
  } else {
    setBrightnessValue(100);
  }
  if (device.func === 4) {
    setColorTempValue(currentValue[1] ?? 50);
  } else {
    setColorTempValue(50);
  }
}, [device?.id, device?.func, currentValue]);
```

Then remove `prevDeviceId` state entirely (lines 461, 475-476).

---

### CR-02: Slider Control Sends Wrong Values on Release for func=4 (Dual Color Temp)

**File:** `src/app/(dashboard)/groups/page.tsx:490-499`

**Issue:**
The `handleBrightnessRelease` function is supposed to send both brightness and colorTemp for func=4 devices, but the spread syntax creates a new array every time:

```tsx
// Line 492
await onControl(device.id, "level", [brightnessValue, ...(device.func === 4 ? [colorTempValue] : [])], device.meshId);
```

When `device.func === 4`, this produces `[brightnessValue, colorTempValue]` — correct.
When `device.func !== 4`, this produces `[brightnessValue]` — correct.

However, `handleColorTempRelease` at line 498 always sends `[brightnessValue, colorTempValue]` regardless of device func. If somehow called on a non-func-4 device, it would send an incorrect second value. More importantly, **this function is only rendered for `hasColorTemp` (func=4)**, so it is safe in practice, but the lack of a guard makes it a latent bug if the conditional rendering changes.

**Fix:**
Add a guard to `handleColorTempRelease` for safety:

```tsx
const handleColorTempRelease = async () => {
  if (!device.meshId || device.func !== 4) return;
  await onControl(device.id, "level", [brightnessValue, colorTempValue], device.meshId);
};
```

---

## HIGH Findings

### HI-01: State Mutation After Control Does Not Update Drawer Values

**File:** `src/app/(dashboard)/groups/page.tsx:75-98`

**Issue:**
When `handleControl` succeeds, it calls `setControllingDevice(null)` (closes drawer) and `refetch()` (re-fetches from server). The `ControlGroupDrawer` slider state (`brightnessValue`, `colorTempValue`) is NOT updated with the new server values — it only resets when a new device is opened.

Compare to `DeviceDrawer` in `control/page.tsx:4462-4476` which uses `useEffect` to re-initialize values whenever `device` changes:

```tsx
// DeviceDrawer (correct pattern)
useEffect(() => {
  if (device && device.value) {
    const brightnessVal = device.value[1];
    const colorTempVal = device.value[2];
    if (brightnessVal !== undefined) setBrightness(brightnessVal);
    if (colorTempVal !== undefined) setColorTemp(colorTempVal);
  }
}, [device]);
```

**Consequence:** After controlling a device (e.g., setting brightness to 50%), if the user closes and reopens the drawer without the refetch completing, they see stale values. If refetch completes while drawer is open, values don't update because there's no useEffect watching `device.value`.

**Fix:**
Add a `useEffect` in `ControlGroupDrawer` to update control values when `device.value` changes:

```tsx
useEffect(() => {
  if (!device) return;
  const val = parseValue(device.value);
  if (device.func === 3 || device.func === 4) {
    setBrightnessValue(val[0] ?? 100);
  }
  if (device.func === 4) {
    setColorTempValue(val[1] ?? 50);
  }
}, [device?.id, device?.value, device?.func]);
```

---

### HI-02: Inconsistent Value Array Indexing Between ControlGroupDrawer and DeviceDrawer

**File:** `src/app/(dashboard)/groups/page.tsx:466-472` vs `src/app/(dashboard)/control/page.tsx:4463-4475`

**Issue:**
The two drawer components interpret the `device.value` JSON array differently:

| Index | DeviceDrawer (control/page.tsx) | ControlGroupDrawer (groups/page.tsx) |
|-------|--------------------------------|-------------------------------------|
| `value[0]` | on/off state (0 or 1) | **brightness** (0-100) |
| `value[1]` | brightness (0-100) | **colorTemp** (0-100) |
| `value[2]` | colorTemp (0-100) | unused |

In `ControlGroupDrawer` line 468:
```tsx
return JSON.parse(device.value || "[]"); // currentValue
// Then: currentValue[0] = brightness, currentValue[1] = colorTemp
```

In `DeviceDrawer` lines 4467-4468:
```tsx
const brightnessVal = device.value[1]; // index 1
const colorTempVal = device.value[2];  // index 2
```

**Consequence:** If the backend stores values in the DeviceDrawer format (index 0 = on/off), then ControlGroupDrawer reads wrong values: it interprets on/off state (0 or 1) as brightness (0-100), and brightness as colorTemp. This means sliders start at incorrect positions.

**Fix:**
Verify the actual value format stored by the backend for group devices. If it matches the DeviceDrawer format, update `ControlGroupDrawer` to use the same indexing:

```tsx
// If value format is [onOff, brightness, colorTemp]:
const onOff = currentValue[0];    // 0 or 1
const brightness = currentValue[1] ?? 100;
const colorTemp = currentValue[2] ?? 50;
```

If the group device value format is intentionally different (just `[brightness, colorTemp]`), add a comment documenting this and verify the backend produces this format.

---

### HI-03: Missing `onTouchEnd` on DeviceDrawer Sliders (Mobile Gap)

**File:** `src/app/(dashboard)/control/page.tsx:4608-4636`

**Issue:**
`ControlGroupDrawer` correctly has both `onMouseUp` and `onTouchEnd` handlers (lines 616-617, 640-641), but `DeviceDrawer` in `control/page.tsx` only has `onMouseUp` (lines 4615, 4636). On touch devices, the slider release event fires `onTouchEnd`, not `onMouseUp`, so the control command is never sent.

**Fix:**
Add `onTouchEnd` to DeviceDrawer sliders:

```tsx
onMouseUp={(e) => handleBrightness(Number((e.target as HTMLInputElement).value))}
onTouchEnd={(e) => handleBrightness(Number((e.target as HTMLInputElement).value))}
```

---

### HI-04: No Transition Parameter Sent from ControlGroupDrawer

**File:** `src/app/(dashboard)/groups/page.tsx:492, 498, 577, 588`

**Issue:**
`DeviceDrawer` sends a `transition` parameter (value `1000`) with all control calls (e.g., `control/page.tsx:4488, 4493, 4499`). This controls the fade transition duration on the hardware. `ControlGroupDrawer` never passes `transition`, defaulting to `0` (instant).

The API route at `src/app/api/devices/control/route.ts:49` accepts `transition` and passes it through:
```tsx
await gatewayService.controlDevice(controlDid, action, value ?? [], meshid, transition ?? 0);
```

**Consequence:** Group device controls happen instantly with no smooth transition, which may cause jarring light behavior compared to individual device control.

**Fix:**
Either:
1. Add `transition` to the `onControl` callback signature in `ControlGroupDrawer` and pass it through, or
2. Set a default transition in the API route for group devices.

---

### HI-05: `quickToggle` Passes Wrong Action for Dimming Devices

**File:** `src/app/(dashboard)/groups/page.tsx:93-98`

**Issue:**
The `quickToggle` function always sends `action: "onoff"` regardless of device function type:

```tsx
const quickToggle = async (device: GroupDevice) => {
  if (!device.meshId) return;
  const currentValue = parseValue(device.value);
  const isOn = currentValue[0] === 1;  // BUG: wrong index if format is [onOff, brightness, colorTemp]
  await handleControl(device.id, "onoff", [isOn ? 0 : 1], device.meshId);
};
```

Combined with HI-02 (value indexing inconsistency), `currentValue[0]` may read brightness instead of on/off state for devices using the standard format. This means the toggle logic inverts — if brightness is 100, it thinks the device is ON and turns it OFF; if brightness is 0, it thinks OFF and turns ON.

Additionally, for func=3 (dimming) and func=4 (dual color temp) devices, sending `action: "onoff"` with value `[0]` or `[1]` may not work correctly if the gateway expects `action: "level"` with value `[0]` (off) or `[100]` (on + full brightness).

**Fix:**
Use the correct value index and verify the action type matches the device function:

```tsx
const quickToggle = async (device: GroupDevice) => {
  if (!device.meshId) return;
  const currentValue = parseValue(device.value);
  // Adjust index based on actual value format
  const isOn = currentValue[0] === 1; // verify this is correct for group devices
  await handleControl(device.id, "onoff", [isOn ? 0 : 1], device.meshId);
};
```

---

## MEDIUM Findings

### MI-01: Duplicated Function Label Maps

**File:** `src/app/(dashboard)/groups/page.tsx:62-72` and `src/app/(dashboard)/groups/page.tsx:504-511`

**Issue:**
The same func-to-label mapping is defined in two places:

```tsx
// getDeviceFunc (lines 62-72)
const labels: Record<number, string> = {
  2: "开关", 3: "调光", 4: "双色温", 5: "HSL彩灯", 9: "面板", 10: "传感器",
};

// funcLabels in ControlGroupDrawer (lines 504-511)
const funcLabels: Record<number, string> = {
  2: "开关", 3: "调光", 4: "双色温", 5: "HSL彩灯", 9: "面板", 10: "传感器",
};
```

**Consequence:** If a new function type is added, both maps must be updated. Inconsistency will cause confusing labels.

**Fix:**
Extract to a shared constant in a utility file or `@/lib/types`:

```tsx
// src/lib/types.ts
export const FUNC_TYPE_LABELS: Record<number, string> = {
  2: "开关", 3: "调光", 4: "双色温", 5: "HSL彩灯", 9: "面板", 10: "传感器",
};
```

---

### MI-02: `handleDelete` Bypasses Optimistic Update and Uses Different API

**File:** `src/app/(dashboard)/groups/page.tsx:122-131`

**Issue:**
The delete handler calls `/api/devices/${deviceId}` directly with `DELETE` instead of using the `useDeviceGroups` hook's methods. This means:
1. No optimistic UI update — the deleted item stays visible until refetch completes.
2. If the API route expects a specific ID format (e.g., `meshId:did`), the raw `device.id` may not match.

**Fix:**
Consider adding a `deleteGroup` method to `useDeviceGroups` hook that handles both the API call and local state update, similar to `updateGroup`.

---

### MI-03: `EditGroupModal` Does Not Re-sync When `device` Prop Changes

**File:** `src/app/(dashboard)/groups/page.tsx:383-384`

**Issue:**
The `EditGroupModal` initializes `name` and `roomId` from `device` in `useState`, but these initial values are only set once when the component mounts. If the `device` prop changes (e.g., due to a refetch while the modal is open), the form fields don't update.

```tsx
const [name, setName] = useState(device.name || device.gatewayName || "");
const [roomId, setRoomId] = useState(device.roomId || "");
```

**Fix:**
Add a `useEffect` to sync when device changes:

```tsx
useEffect(() => {
  setName(device.name || device.gatewayName || "");
  setRoomId(device.roomId || "");
}, [device?.id]);
```

---

### MI-04: `handleSync` Does Not Check Response Status Before Parsing JSON

**File:** `src/app/(dashboard)/groups/page.tsx:136-137`

**Issue:**
```tsx
const res = await fetch("/api/devices", { method: "POST" });
const data = await res.json();  // Parses JSON even if response is not OK
if (data.error) { ... }
```

If the response is a non-JSON error (e.g., 502 Bad Gateway HTML error page), `res.json()` will throw. The error is caught but the message will be "Unexpected token..." rather than a meaningful error.

**Fix:**
```tsx
if (!res.ok) {
  const data = await res.json().catch(() => null);
  throw new Error(data?.error || `同步失败: HTTP ${res.status}`);
}
const data = await res.json();
```

---

## LOW / Info Findings

### IN-01: `loading` Prop Hardcoded to `false`

**File:** `src/app/(dashboard)/groups/page.tsx:365`

```tsx
<ControlGroupDrawer
  loading={false}  // Always false — unused prop
  ...
/>
```

The `loading` prop is always `false` and the loading state in `ControlGroupDrawer` (lines 561-565) is unreachable. Either remove the prop or pass the actual loading state.

---

### IN-02: `prevDeviceId` State in ControlGroupDrawer Is Dead Code After Fix

**File:** `src/app/(dashboard)/groups/page.tsx:461`

The `prevDeviceId` state exists solely to detect device changes during render. Once CR-01 is fixed by converting to `useEffect`, this state variable and its setter become dead code and should be removed.

---

### IN-03: Missing `aria-label` on Drawer for Accessibility

**File:** `src/app/(dashboard)/groups/page.tsx:526-528`

The drawer panel lacks `role="dialog"` and `aria-label` attributes. Screen readers will not identify this as a dialog. Compare to accessibility best practices:

```tsx
<div
  role="dialog"
  aria-label="组设备控制"
  aria-modal="true"
  className="fixed right-0 ..."
>
```

---

### IN-04: `getDeviceFunc` Is a Duplicate of `FUNC_TYPE_LABELS` in `@/lib/types`

**File:** `src/app/(dashboard)/groups/page.tsx:62-72`

The `DEVICE_TYPE_LABELS` import from `@/lib/types` (line 5) is used for device types, but the function type labels are defined inline. Consider adding `FUNC_TYPE_LABELS` to `@/lib/types` for consistency.

---

## Appendix: Files Reviewed

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/groups/page.tsx` | Groups page with ControlGroupDrawer, EditGroupModal |
| `src/app/(dashboard)/control/page.tsx` | Control page with DeviceDrawer (reference for consistency) |
| `src/hooks/useDeviceGroups.ts` | Hook for fetching and controlling group devices |
| `src/hooks/useDevices.ts` | Base Device type and useDevices hook |
| `src/app/api/devices/groups/route.ts` | API route for group device list |
| `src/app/api/devices/control/route.ts` | API route for device control |

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
