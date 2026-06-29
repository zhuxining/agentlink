---
title: Use Hooks for Setup and Teardown
impact: MEDIUM
impactDescription: clean test state, isolated tests
tags: test, lifecycle, setup, teardown, hooks
---

## Use Hooks for Setup and Teardown

Use `beforeEach`/`afterEach` for setup and teardown to ensure each test starts with a clean state and resources are properly cleaned up.

**Incorrect (setup inside each test):**

```typescript
it('should create user', () => {
  const service = new UserService()
  const user = service.create({ name: 'John' })
  expect(user).toBeDefined()
})

it('should find user', () => {
  const service = new UserService()
  // No user created! This test depends on run order
  const user = service.findById('1')
  expect(user).toBeDefined()
})
```

**Correct (use hooks for setup):**

```typescript
describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    // Fresh setup for each test
    service = new UserService()
  })

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks()
  })

  it('should create user', () => {
    const user = service.create({ name: 'John' })
    expect(user).toBeDefined()
  })

  it('should start fresh', () => {
    // This test is independent
    expect(service.findAll()).toHaveLength(0)
  })
})
```

**Database cleanup:**

```typescript
describe('Database Tests', () => {
  let db: Database

  beforeAll(async () => {
    // One-time setup
    db = await createTestDatabase()
  })

  afterAll(async () => {
    // One-time cleanup
    await db.close()
  })

  beforeEach(async () => {
    // Clean data before each test
    await db.query('TRUNCATE TABLE users')
  })

  it('should have empty database', async () => {
    const users = await db.query('SELECT * FROM users')
    expect(users).toHaveLength(0)
  })
})
```

**Benefits:**
- Consistent test setup
- Clean state between tests
- Proper resource cleanup
- Tests can run in any order

Reference: [Test Hooks - Vitest](https://vitest.dev/api/#beforeeach)
