---
title: Test Behavior, Not Implementation Details
impact: HIGH
impactDescription: resilient tests, safer refactoring
tags: test, testing-philosophy, behavior-driven, refactoring
---

## Test Behavior, Not Implementation Details

Test what the code does (behavior), not how it does it (implementation). This makes tests more resilient to refactoring.

**Incorrect (tests implementation):**

```typescript
// Component implementation
function UserList({ users }) {
  return (
    <div className="user-list">
      {users.map(user => (
        <div key={user.id} className="user-item" data-testid={`user-${user.id}`}>
          {user.name}
        </div>
      ))}
    </div>
  )
}

// Tests implementation details
it('should render user items', () => {
  render(<UserList users={[{ id: 1, name: 'John' }]} />)
  expect(screen.getByTestId('user-1')).toBeInTheDocument()
  expect(screen.getByTestId('user-1')).toHaveTextContent('John')
})
```

**Correct (tests user-facing behavior):**

```typescript
it('should display user names', () => {
  render(<UserList users={[{ id: 1, name: 'John' }]} />)
  expect(screen.getByText('John')).toBeInTheDocument()
})

it('should display all users', () => {
  const users = [
    { id: 1, name: 'John' },
    { id: 2, name: 'Jane' }
  ]
  render(<UserList users={users} />)
  expect(screen.getByText('John')).toBeInTheDocument()
  expect(screen.getByText('Jane')).toBeInTheDocument()
})
```

**More examples:**

```typescript
// Bad - tests internal method
it('should call validateUser', () => {
  const spy = vi.spyOn(service, 'validateUser')
  service.createUser({ name: 'John' })
  expect(spy).toHaveBeenCalled()
})

// Good - tests result
it('should create valid user', () => {
  const user = service.createUser({ name: 'John' })
  expect(user).toMatchObject({
    name: 'John',
    status: 'active'
  })
})

// Bad - tests state variable
it('should set isLoading to true', () => {
  render(<UserProfile />)
  expect(screen.getByTestId('loading')).toBeInTheDocument()
})

// Good - tests what user sees
it('should show loading indicator', () => {
  render(<UserProfile />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading...')
})
```

**Benefits:**
- Tests survive refactoring
- More readable test intent
- Focus on user experience
- Easier to maintain

Reference: [Common Mistakes - Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
