# Tech Stack

- You are building **AuxPlus**, a management platform for clients/products and due dates (migrated from a PHP app).
- Use TypeScript and React.
- Use React Router. KEEP the routes in `src/App.tsx`.
- Always put source code in the `src` folder.
- Put pages into `src/pages/`.
- Put components into `src/components/`.
- The main page (default page) is `src/pages/Index.tsx` (redirects by auth role).
- ALWAYS try to use the shadcn/ui library.
- Tailwind CSS: always use Tailwind CSS for styling components.

## Domain model

- **Users**: login/register, admin vs regular, activate/deactivate.
- **Folders**: per-user lists of type `Cliente` or `Produto`.
- **Items**: inside folders, with `itemId`, name, due date, phone, price, and auto status (`Longe de Vencer`, `Perto de Vencer`, `Já Vencido`, `Sem Vencimento`).
- **Folder settings**: `nearDueDays` / `farDueDays` control status thresholds.
- **Tickets**: user support messages answered by admin.
- Persistence is currently via `localStorage` in `src/lib/storage.ts` (no PHP/MySQL). Keep the PHP reference code under `legacy/` for historical context only — do not run or depend on it.

## Auth demo accounts

- User: `demo` / `demo123`
- Admin: `admin` / `admin123`

Available packages and libraries:

- The lucide-react package is installed for icons.
- You ALREADY have ALL the shadcn/ui components and their dependencies installed.
- Use prebuilt components from the shadcn/ui library after importing them. Do not edit shadcn files directly.
- Use `date-fns` for date math and `sonner` for toasts.
- Use `recharts` if charts are needed.
