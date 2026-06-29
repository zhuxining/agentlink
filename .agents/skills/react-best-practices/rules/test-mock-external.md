---
title: Mock External Dependencies
impact: HIGH
impactDescription: isolated, reliable, fast tests
tags: test, mocking, isolation, external-dependencies
---

## Mock External Dependencies

Mock external dependencies (APIs, databases, file system) to keep tests isolated, reliable, and fast.

**Incorrect (tests depend on external API):**

```typescript
it('should fetch user from API', async () => {
  const service = new UserService()
  // This makes a real API call - slow and unreliable!
  const user = await service.fetchUser('123')
  expect(user).toBeDefined()
})
```

**Correct (mock the API call):**

```typescript
it('should fetch user from API', async () => {
  // Arrange
  const mockUser = { id: '123', name: 'John' }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockUser
  })

  const service = new UserService()

  // Act
  const user = await service.fetchUser('123')

  // Assert
  expect(user).toEqual(mockUser)
  expect(fetch).toHaveBeenCalledWith('https://api.example.com/users/123')
})
```

**Mocking modules:**

```typescript
// Mock external module
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: '123' })
    }))
  }
}))

it('should send email', async () => {
  const emailService = new EmailService()
  await emailService.sendEmail('test@example.com', 'Subject', 'Body')

  expect(emailService['transporter'].sendMail).toHaveBeenCalled()
})
```

**Dependency injection for testability:**

```typescript
// Production code
class UserService {
  constructor(private userRepository: IUserRepository) {}
}

// Test code
describe('UserService', () => {
  it('should create user', async () => {
    const mockRepo = {
      create: vi.fn().mockResolvedValue({ id: '1', name: 'John' })
    }
    const service = new UserService(mockRepo)

    await service.createUser({ name: 'John' })

    expect(mockRepo.create).toHaveBeenCalled()
  })
})
```

**Benefits:**
- Tests run fast (no network/database calls)
- Tests are deterministic (no external failures)
- Can test edge cases easily
- No test data pollution

Reference: [Mocking - Vitest](https://vitest.dev/guide/mocking.html)
