---
title: Use Test Factories for Consistent Data
impact: MEDIUM
impactDescription: maintainable tests, consistent test data
tags: test, fixtures, factories, test-data
---

## Use Test Factories for Consistent Data

Use test factories/fixtures to generate consistent test data instead of hardcoding values in each test.

**Incorrect (repetitive hardcoded data):**

```typescript
it('should create user', () => {
  const user = service.create({
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date('2024-01-01')
  })
  expect(user).toBeDefined()
})

it('should update user', () => {
  const user = service.create({
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date('2024-01-01')
  })
  service.update(user.id, { name: 'Jane' })
})
```

**Correct (use factory function):**

```typescript
// tests/factories/user.factory.ts
import { faker } from '@faker-js/faker'

export function createUser(overrides?: Partial<User>): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    createdAt: faker.date.past(),
    ...overrides
  }
}

export function createUsers(count: number): User[] {
  return Array.from({ length: count }, () => createUser())
}

// Tests
it('should create user', () => {
  const user = service.create(createUser())
  expect(user.id).toBeDefined()
})

it('should update user', () => {
  const user = service.create(createUser({ name: 'John' }))
  const updated = service.update(user.id, { name: 'Jane' })
  expect(updated.name).toBe('Jane')
})

it('should handle multiple users', () => {
  const users = createUsers(10)
  users.forEach(user => service.create(user))
  expect(service.count()).toBe(10)
})
```

**Factory with overrides:**

```typescript
// Flexible factory for specific scenarios
it('should handle long names', () => {
  const user = createUser({ name: 'a'.repeat(300) })
  expect(() => service.create(user)).toThrow()
})

it('should handle invalid email', () => {
  const user = createUser({ email: 'invalid-email' })
  expect(() => service.create(user)).toThrow()
})
```

**Benefits:**
- Consistent test data
- Easier to maintain
- Tests focus on what matters
- Easy to create variations
- Realistic data (with faker)

Reference: [Test Data Builders - Martin Fowler](https://martinfowler.com/bliki/ObjectMother.html)
