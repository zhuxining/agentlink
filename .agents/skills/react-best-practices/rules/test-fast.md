---
title: Keep Tests Fast
impact: MEDIUM
impactDescription: faster feedback, better developer experience
tags: test, performance, mocking, speed
---

## Keep Tests Fast

Keep tests fast by mocking slow operations (network, database, file system) and avoiding unnecessary delays.

**Incorrect (slow tests with real operations):**

```typescript
it('should fetch user from API', async () => {
  // Real API call - slow!
  const user = await fetch('https://api.example.com/users/1')
    .then(r => r.json())
  expect(user).toBeDefined()
}, 10000) // 10 second timeout!

it('should save to database', async () => {
  const db = new Database('localhost:5432')
  // Real database operation - slow!
  await db.users.create({ name: 'John' })
  const user = await db.users.findOne({ name: 'John' })
  expect(user).toBeDefined()
})
```

**Correct (mock slow operations):**

```typescript
it('should fetch user from API', async () => {
  // Mock the API call
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: '1', name: 'John' })
  })

  const user = await service.fetchUser('1')
  expect(user).toEqual({ id: '1', name: 'John' })
  // Test runs instantly!
})

it('should save to database', async () => {
  // Use in-memory repository
  const mockRepo = {
    create: vi.fn().mockResolvedValue({ id: '1', name: 'John' })
  }
  const service = new UserService(mockRepo)

  await service.createUser({ name: 'John' })
  expect(mockRepo.create).toHaveBeenCalled()
})
```

**Mock time-dependent code:**

```typescript
it('should debounce input', () => {
  vi.useFakeTimers()
  const callback = vi.fn()
  const debounced = debounce(callback, 300)

  debounced()
  expect(callback).not.toHaveBeenCalled()

  vi.advanceTimersByTime(300)
  expect(callback).toHaveBeenCalledTimes(1)

  vi.useRealTimers()
})
```

**Avoid unnecessary waits:**

```typescript
// Bad - arbitrary wait
it('should show message', async () => {
  render(<Message />)
  await new Promise(r => setTimeout(r, 1000)) // Why wait?!
  expect(screen.getByText('Hello')).toBeInTheDocument()
})

// Good - wait for specific condition
it('should show message', async () => {
  render(<Message />)
  await waitFor(() => {
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

**Benefits:**
- Faster feedback loop
- Developers run tests more often
- CI/CD completes faster
- More test iterations possible

Reference: [Fast Tests - Martin Fowler](https://martinfowler.com/articles/practical-test-pyramid.html)
