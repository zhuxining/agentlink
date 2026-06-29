---
title: Use Nullish Coalescing for Default Values
impact: MEDIUM
impactDescription: correct default values, cleaner code
tags: js, nullish-coalescing, default-values, logical-operators
---

## Use Nullish Coalescing for Default Values

Use nullish coalescing (`??`) instead of logical OR (`||`) for default values. `??` only checks for `null`/`undefined`, while `||` checks for all falsy values.

**Incorrect (|| treats 0 and "" as falsy):**

```typescript
const count = items.length || 10  // Wrong: 0 becomes 10
const name = user.name || 'Anonymous'  // Wrong: "" becomes 'Anonymous'
const speed = config.speed || 100  // Wrong: speed 0 becomes 100
```

**Correct (?? only catches null/undefined):**

```typescript
const count = items.length ?? 10  // Correct: 0 stays 0
const name = user.name ?? 'Anonymous'  // Correct: "" stays ""
const speed = config.speed ?? 100  // Correct: 0 stays 0
```

**Logical assignment operators:**

```typescript
// Nullish assignment
a ??= defaultValue  // Only assigns if a is null/undefined

// Logical OR assignment
b ||= defaultValue  // Assigns if b is falsy

// Logical AND assignment
c &&= defaultValue  // Assigns if c is truthy
```

**Comparison table:**

| Value | `value || 10` | `value ?? 10` |
|-------|---------------|---------------|
| `0`   | `10`          | `0`           |
| `""`  | `"10"`        | `""`          |
| `false` | `10`       | `false`       |
| `null` | `10`        | `10`          |
| `undefined` | `10`  | `10`          |

Reference: [MDN Nullish Coalescing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator)
