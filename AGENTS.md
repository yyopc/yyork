# Agent workflow

- User will assign one PRD at a time to an agent to implement. All the PRDs are available in the `./prds` dir.
- At any time if you think you could do a better job if a CLI tool was available to you and it would take you lesser tokens to do the task in presence of that tool, explicitly ask user to install it. Do not install it directly on your own as there are security related issues regarding this way of installation.

# Local development

- For yyork frontend/dashboard verification, start the stack from the repo root with `pnpm dev`.
- `pnpm dev` runs the yyork stack, docs, and design mock in parallel through portless; after the ready banners appear, use `https://yyork.localhost` for the app, `https://docs.yyork.localhost` for docs, and `https://mock.yyork.localhost` for HTML/CSS design mocks.
- For Storybook UI review, run `pnpm storybook:dev` and open `https://storybook.yyork.localhost`.
- Do not open or report `http://127.0.0.1:3000` or `http://localhost:3000` for normal yyork frontend verification. Treat raw Vite ports as implementation details for explicit non-portless debugging or isolated test fixtures.
- To run docs alone, use `pnpm docs:dev`. Docs source lives in `internal/docs/content/docs/`.
