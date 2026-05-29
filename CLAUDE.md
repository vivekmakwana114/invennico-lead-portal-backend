# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn dev              # Start server with nodemon (NODE_ENV=development)

# Testing
yarn test             # Run all tests (Jest, serially with -i)
yarn test:watch       # Watch mode
yarn coverage         # Run tests with coverage report

# Linting & Formatting
yarn lint             # ESLint check
yarn lint:fix         # ESLint auto-fix
yarn prettier         # Check formatting
yarn prettier:fix     # Auto-format

# Production
yarn start            # PM2 cluster start (uses ecosystem.config.json)
```

To run a single test file: `npx jest path/to/test.spec.js -i`

## Environment Setup

Copy `.env` and set these variables:

```
NODE_ENV=development
PORT=4000
MONGODB_URL=mongodb://127.0.0.1:27017/invennico-lead-portal
JWT_SECRET=<random-string>
JWT_ACCESS_EXPIRATION_MINUTES=30
JWT_REFRESH_EXPIRATION_DAYS=30
SMTP_HOST=, SMTP_PORT=, SMTP_USERNAME=, SMTP_PASSWORD=
EMAIL_FROM=noreply@invennico.com
ANTHROPIC_API_KEY=sk-ant-...
ENCRYPTION_KEY=<32-char-string>
```

Test environment automatically uses a `-test` suffix on the MongoDB database name.

## Architecture

**Stack**: Express → Passport JWT → Mongoose (MongoDB) — layered as routes → controllers → services → models.

```
src/
├── config/          # Joi-validated env config, Winston logger, Passport JWT strategy, roles/permissions
├── controllers/     # Thin HTTP layer — calls services, returns responses
├── middlewares/     # auth(), validate(), rateLimiter, error handler
├── models/          # Mongoose schemas with toJSON + paginate plugins
├── routes/v1/       # Route definitions with Swagger JSDoc; all under /v1
├── services/        # All business logic (auth, user, token, email)
├── utils/           # ApiError, catchAsync, pick
└── validations/     # Joi schemas per-route, consumed by validate() middleware
```

### Key Patterns

**Async error handling**: All controller functions are wrapped with `catchAsync()` — never use try/catch in controllers; throw `new ApiError(httpStatus.X, 'message')` instead.

**Auth middleware**: `auth()` requires a valid JWT; `auth('permissionName')` additionally checks the user's role has that permission. Roles and their permissions are defined in `src/config/roles.js` (admin has `getUsers`, `manageUsers`, `manageCredits`, `manageSettings`; partner has none by default).

**Validation**: Every route that accepts input has a Joi schema in `src/validations/`. Wire it up with `validate(schema)` middleware before the controller.

**Mongoose plugins**: All models use `toJSON` (strips `__v`, converts `_id → id`, removes `password`) and most use `paginate`. Add these plugins to any new model.

**Service layer**: Controllers must not contain business logic or direct model access. Keep model queries inside services.

### Credit System

Users have `totalCredits` and `consumedCredits` fields (virtual `availableCredits = total - consumed`). Every grant or consume operation writes an immutable `CreditTransaction` record. Use `userService.grantCredits()` and `userService.consumeCredit()` — never mutate credit fields directly.

### Roles

- `admin`: full user/credit/settings management
- `partner`: can only access their own profile

### API Docs

Swagger UI is available at `GET /v1/docs` (development only). Docs are generated from JSDoc `@swagger` comments in route files.
