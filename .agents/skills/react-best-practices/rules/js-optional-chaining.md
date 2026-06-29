---
title: Use Optional Chaining for Safe Property Access
impact: MEDIUM
impactDescription: prevents runtime errors, cleaner code
tags: js, optional-chaining, safety, null-checking
---

## Use Optional Chaining for Safe Property Access

Use optional chaining (`?.`) to safely access nested object properties without explicit null/undefined checks.

**Incorrect (verbose error-prone checks):**

```typescript
const city = user && user.address && user.address.city
const zipCode = user && user.address && user.address.zipCode

const methodResult = obj && obj.method && obj.method()
```

**Correct (clean and safe):**

```typescript
const city = user?.address?.city
const zipCode = user?.address?.zipCode // undefined if not exists

const methodResult = obj?.method?.()

// Works with array access
const first = items?.[0]

// Works with dynamic keys
const value = obj?.[dynamicKey]
```

**Combined with nullish coalescing:**

```typescript
const city = user?.address?.city ?? 'Unknown'
const count = list?.length ?? 0
```

Optional chaining short-circuits: if the left side is `null` or `undefined`, the entire expression returns `undefined` without evaluating the rest.

Reference: [MDN Optional Chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining)
