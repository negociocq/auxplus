# Tech Stack

- TypeScript and React for application development
- React Router for navigation (routes kept in src/App.tsx)
- Shadcn/ui library for UI components
- Tailwind CSS for styling
- Supabase (PostgreSQL) for backend database and real-time data access
- @supabase/supabase-js client library for interacting with Supabase
- React Context (AppContext) for global state management
- date-fns for date manipulation utilities
- sonner for toast notifications
- recharts for chart components (if needed)

# Library Usage Rules

- UI Components: Always use shadcn/ui components; do not create new UI components unless absolutely necessary
- Styling: Use Tailwind CSS utility classes for styling; avoid custom CSS unless required for specific design
- Data Operations: Use @supabase/supabase-js for all database operations; never make direct SQL queries in frontend code
- Data Fetching/Mutations: All data fetching, mutations, and persistence must go through the provided supabaseApi.ts functions (fetchAppDataFromSupabase, persistAppDataToSupabase, loginWithSupabase)
- Authentication: Use the app-level username/password authentication stored in the `users` table; do not implement custom authentication mechanisms
- Routing: Keep all route definitions in src/App.tsx; do not move routing logic elsewhere
- State Management: Use the provided AppContext for global state; do not implement custom context providers unless necessary
- Local Storage: Only use local storage for temporary caching or offline fallback; do not use it as the primary data storage mechanism
- Data Source: All application data must originate from Supabase; the local backend (seed data and localStorage) is deprecated and should not be used for primary data operations