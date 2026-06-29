---
title: Use Fake Timers for Time-Dependent Tests
impact: MEDIUM
impactDescription: deterministic, fast tests
tags: test, timers, mocking, time-dependent
---

## Use Fake Timers for Time-Dependent Tests

Use fake timers to test time-dependent behavior without actually waiting. Makes tests deterministic and fast.

**Incorrect (real delays make tests slow):**

```typescript
it('should call callback after delay', (done) => {
  const callback = vi.fn()
  setTimeout(callback, 5000)
  // Test actually waits 5 seconds!
  setTimeout(() => {
    expect(callback).toHaveBeenCalled()
    done()
  }, 5100)
})

it('should debounce input', async () => {
  const callback = vi.fn()
  const debounced = debounce(callback, 300)

  debounced()
  await new Promise(r => setTimeout(r, 500)) // Wait 500ms
  expect(callback).toHaveBeenCalled()
})
```

**Correct (use fake timers):**

```typescript
it('should call callback after delay', () => {
  vi.useFakeTimers()
  const callback = vi.fn()

  setTimeout(callback, 5000)

  expect(callback).not.toHaveBeenCalled()

  // Fast-forward 5 seconds instantly
  vi.advanceTimersByTime(5000)

  expect(callback).toHaveBeenCalledTimes(1)

  vi.useRealTimers()
})

it('should debounce input', () => {
  vi.useFakeTimers()
  const callback = vi.fn()
  const debounced = debounce(callback, 300)

  debounced()
  debounced() // Call again

  vi.advanceTimersByTime(200)
  expect(callback).not.toHaveBeenCalled()

  vi.advanceTimersByTime(100)
  expect(callback).toHaveBeenCalledTimes(1) // Called once after debounce

  vi.useRealTimers()
})
```

**Testing intervals:**

```typescript
it('should poll every second', () => {
  vi.useFakeTimers()
  const callback = vi.fn()

  const interval = setInterval(callback, 1000)

  vi.advanceTimersByTime(5000)
  expect(callback).toHaveBeenCalledTimes(5)

  clearInterval(interval)
  vi.useRealTimers()
})
```

**Testing date-dependent code:**

```typescript
it('should show expiration message', () => {
  vi.setSystemTime(new Date('2024-01-01'))

  const component = render(<Subscription expiresAt="2024-01-15" />)
  expect(screen.getByText(/expires in/)).toBeInTheDocument()

  vi.setSystemTime(new Date('2024-01-16'))
  rerender(<Subscription expiresAt="2024-01-15" />)
  expect(screen.getByText(/expired/)).toBeInTheDocument()

  vi.useRealTimers()
})
```

**Benefits:**
- Tests run instantly
- Deterministic results
- Can test edge cases (exact timing)
- No flaky tests due to timing

Reference: [Fake Timers - Vitest](https://vitest.dev/api/#vi-usefaketimers)
