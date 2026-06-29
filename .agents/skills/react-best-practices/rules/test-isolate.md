---
title: Keep Tests Isolated
impact: HIGH
impactDescription: reliable, independent tests
tags: test, isolation, test-dependency, reliability
---

## Keep Tests Isolated

Each test should be independent and not rely on other tests. Use beforeEach/afterEach for setup and cleanup.

**Incorrect (tests depend on each other):**

```typescript
let userId: string

it('should create user', () => {
  const service = new UserService()
  const user = service.create({ name: 'John' })
  userId = user.id  // Saves for next test!
})

it('should update user', () => {
  const service = new UserService()
  // Depends on previous test!
  const updated = service.update(userId, { name: 'Jane' })
  expect(updated.name).toBe('Jane')
})
```

**Correct (each test is independent):**

```typescript
describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    // Fresh instance for each test
    service = new UserService()
  })

  it('should create user', () => {
    const user = service.create({ name: 'John' })
    expect(user.id).toBeDefined()
  })

  it('should update user', () => {
    // Setup data within this test
    const user = service.create({ name: 'John' })
    const updated = service.update(user.id, { name: 'Jane' })
    expect(updated.name).toBe('Jane')
  })
})
```

**Clean up side effects:**

```typescript
describe('Database Tests', () => {
  let db: Database

  beforeEach(async () => {
    db = await createTestDatabase()
  })

  afterEach(async () => {
    // Clean up after each test
    await db.cleanup()
  })

  it('should save user', async () => {
    await db.users.create({ name: 'John' })
    const count = await db.users.count()
    expect(count).toBe(1)
  })

  it('should have clean state', async () => {
    // This test starts fresh thanks to cleanup
    const count = await db.users.count()
    expect(count).toBe(0)
  })
})
```

**Clear mocks between tests:**

```typescript
beforeEach(() => {
  vi.clearAllMocks()
})
```

**Benefits:**
- Tests can run in any order
- Failed tests don't cascade
- Easier to debug (test fails for its own reason)
- Can run single test in isolation

Reference: [Test Isolation - Martin Fowler](https://martinfowler.com/bliki/UnitTest.html)
