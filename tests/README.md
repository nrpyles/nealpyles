# Homepage browser checks

Serve the repository root locally. The onboarding server on port 8888 is suitable; the hero does not need a build step or API credentials.

Run the complete browser suite with the cloud machine's existing Playwright and Chromium:

```sh
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node --test tests/*.spec.cjs
```

Elsewhere, install Playwright into your test environment, make it available to Node, and set `CHROMIUM_PATH` to your Chromium executable. Set `TEST_BASE_URL` if the server uses a different URL.

The suite exercises all hub facts and guide links, map selection, keyboard tab navigation, mobile menu/Escape, viewport overflow, reduced motion, JavaScript-free essentials, lender affiliation, and browser script errors.

The refinement suite additionally exercises geographic zoom/reset, interrupted zooms, bold mortgage-first copy, visible recognitions, the goal helper, logo rendering, and crawlable homepage metadata/JSON-LD.
