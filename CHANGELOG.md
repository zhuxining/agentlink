# Changelog

All notable changes to this project will be documented in this file.
## [unreleased]

### ⚙️ Miscellaneous Tasks

- Update deps
- Update versions on README
- Bump ui
- Change to tsx from ts-node
- Use package instead of make
- Update deps
- Update deps
- Dowgrade Node
- Install Electron for tests
- Use Linux for E2E tests
- Update parameters

### 🎨 Styling

- Run Biome
## [1.4.0] - 2026-03-25

### ⚙️ Miscellaneous Tasks

- Update deps
- Bump ui
- Update deps
- Update Elctron Fuses to V2
- Update @tailwindcss/vite
- Install Babel core types
- Update packages
- Update versions on README
- Bump version

### 🎨 Styling

- Run Biome
- Ignore lint/a11y/useHtmlLang
- Run Biome

### 🐛 Bug Fixes

- Use __dirname in case of meta is undefined

### 🚀 Features

- Migrate babel to proper Vite plugin
- Show TanStackRouterDevtools only when in development mode

### 🚜 Refactor

- Remove reduntat comments and options
- Extract some code into files from main
## [1.3.2] - 2026-02-05

### ⚙️ Miscellaneous Tasks

- Update demo image
- Remove Prettier and ESLint
- Add VSCode and Zed configuration
- Update to check
- Update jobs versions
- Remove format action
- Update deps
- Update README
- Update react version
- Bump version

### 🎨 Styling

- Run Biome

### 🐛 Bug Fixes

- All Biome issues
- Solve ES modules import

### 🚀 Features

- Init Ultracie
- Add instruction to GitHub Copilot

### 🚜 Refactor

- Rename to app.tsx
## [1.3.1] - 2025-12-28

### ⚙️ Miscellaneous Tasks

- Bump version

### 🐛 Bug Fixes

- T is undefined
## [1.3.0] - 2025-12-28

### ⚙️ Miscellaneous Tasks

- Update deps
- Remove some README sections and add Documentation
- Update demo image
- Update demo image in README
- Bump ui
- Remove old Radix components dependencies
- Bump ui
- Remove unused translation key
- Auto update deps
- Bump version

### 🎨 Styling

- Run Prettier
- Run Prettier

### 🐛 Bug Fixes

- Re-add the drag property for window region
- Remove unused deps and use ts node for bump ui script
- Remove appVersion from second page

### 🚀 Features

- Create bump-ui script
- Update CSS for new style
- Install fonts from Fontsource
- Update landing/home page UI

### 🧪 Testing

- Remove unescessary test
## [1.2.0] - 2025-12-06

### ⚙️ Miscellaneous Tasks

- Add Auto update section to README
- Update deps
- Update lock file
- Bump version

### 🎨 Styling

- Run Prettier
- Run Prettier

### 🐛 Bug Fixes

- Add more string to internationalization

### 🚀 Features

- Show version in second page
- Create shell actions
- Create link component
- Add documentation to nav bar

### 🚜 Refactor

- Rename to ExternalLink
## [1.1.0] - 2025-11-23

### ⚙️ Miscellaneous Tasks

- Add comment to Forge publish
- Always manual trigger for publish workflow
- Bump version
- Rename lint job to check

### 🎨 Styling

- Run Prettier
- Run Prettier

### 🐛 Bug Fixes

- Document theme sync
- Get app version with effect and transition

### 🚀 Features

- Add update checker
- Rename platform IPC to app
## [1.0.1] - 2025-11-23

### ⚙️ Miscellaneous Tasks

- Bump version
## [1.0.0] - 2025-11-23

### ⚙️ Miscellaneous Tasks

- Update package name
- Install Playwright and update dependencies
- Runs on Windows
- Update packages
- Add demo `.gif`
- Create README
- Update pakcages
- Update README
- Add dependabot
- Dump packages version
- Update README and gif demo
- Create LICENSE
- Update packages
- Remove `reviewers` and PR limit from dependabot
- Update README
- Add `eletric-drizzle`
- Update packages
- Update README
- Update dependencies
- Sync with 'main'
- Update packages
- Bump packages version
- Update packages
- Update to React 19 and Electron 34
- Update scripts
- Install Vitest
- Update dependencies
- Add unit test to CI
- Update `uses`
- Update packages
- Update README
- Update packages
- Add resolver for alias in electron main
- Update packages
- Update packages
- Update README tools version
- Update deps
- Update and install Tanstack router and plugins
- Ignore router generated code
- Update deps
- Run format and lint in PR
- Update deps
- Update README and LICENSE
- Use reactHooks in ESLint
- Don't ignore TanStack route file
- *(eslint)* Configure for React jsx-runtime
- Ignore .tanstack
- Update README
- Update deps
- Update README versions
- Update structure on README
- Create workflow to publish release
- Explicit add GITHUB_TOKEN

### 🎨 Styling

- Run Prettier to style all files
- Format project
- Run Prettier
- Run Prettier
- Run Prettier
- Apply lint hints and fixes
- Run Prettier
- Run Prettier
- Run Prettier
- Run Prettier

### 🐛 Bug Fixes

- Remove red from `draglayer`
- DOM errors
- Playwright example and CI
- Some typo and specify Playwright test requirements
- Made window title draggable and not break
- Dependencies issue
- Route not found on final bundle
- Tsconfig
- Add new options on componets.json
- Set main and preload Vite config
- Set executable and package name to electron-shadcn
- Remove package.json from import
- Type for target parse errors
- Use namespace in import
- Tool bar bug for macos
- Tool bar bug for macos
- Resolve hydration error in NavigationMenu by leveraging asChild prop
- Update routes impors and paths
- Remove delay and create memory history

### 💼 Other

- Review README typo
- Rename to `.test.ts`

### 📚 Documentation

- Specify and update versions
- Update README
- Update README
- Update README
- Update README and demo gif
- Update version on README
- Change Jest to Vitest
- Add warning on README
- Add Mehr to Used by section

### 🚀 Features

- Initialize shadcn/ui
- Add the Geist font
- Remove title bar
- Create `BaseLayout`
- Create frameless drag region with action buttons
- Create toggle theme button
- Change `ToggleTheme` button to use the shadcn one
- Use Prettier instead of ESlint
- Add Storybook and configure to use with React and Vite
- Change npm to pnpm
- Add Jest and initialize some tests
- Create e2e example test and update configuration files for tests
- Install Zod and React Query
- Create isolated context for theme
- Use context isolation for Window handler
- Update Forge and Vite configuration for Vite 5
- Create localization with i18n
- Implement localization
- Save theme on `localstorage`
- Integrate TanStack Router with React and refactor routing structure
- Create simple about page to navigate to
- Create `NavigationMenu`
- Remove Storybook
- Add ESLint
- Add plugins to ESLint
- Enable React Compiler
- Add React DevTools
- Add new fonts
- Create Footer
- Add translation to about page
- Add icons to Home Page
- Add a proper navigation menu
- Migrate to Tailwind 4.0
- Create Vitest config file
- Add shadcn global.css properties
- Use TailwindCSS Vite plugin instead of PostCSS
- Update shadcn components
- Add platform detection utility and update DragWindowRegion for macOS support
- Create routes
- Add VIte plguin for router
- Create oRPC manager
- Create theme routes and handlers
- Remove unescessary context and registers
- Initialize IPC and update theme helpers
- Migrate window to oRPC and create contexts
- Update window helpers
- Create platform RPC call
- Add GitHub publisher

### 🚜 Refactor

- Move global CSS to styles
- Properly add `@` as path and update references
- Separate IPC related code on helpers functions
- Separate IPC context and listeners
- Run Prettier
- Separate route into other files
- Create the `__root`
- Rename page to SecondPage
- Remove lib folder and rename Tailwind util
- Rename temp to template
- Update executable and package name to use values from package.json
- Change from helpers to actions and create constants
- Use constant in RPC manager init
- Insert template components into pages
- Define a pattern to file names

### 🧪 Testing

- Update Jest configuration
- Update example tests
- Update tests to use Vitest
