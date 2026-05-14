# Changelog

All notable changes to this project will be documented in this file.


## [1.1.0](https://github.com/alexlupu3/info-bisericabetel/compare/v1.0.0...v1.1.0) (2026-05-14)

### Features

* **api:** add remote MCP endpoint for Claude iOS integration ([82406a6](https://github.com/alexlupu3/info-bisericabetel/commit/82406a6a106147f316ac57d6c64f54b4365a3629))
* **content:** add chronological ordering for group items ([ee4f318](https://github.com/alexlupu3/info-bisericabetel/commit/ee4f318ca0f289692b792d9d58f7d039816e828a))
* **mcp:** add MCP server package for content management via Claude ([e9b5c9d](https://github.com/alexlupu3/info-bisericabetel/commit/e9b5c9d5375925f93f4bd7a962ad64057fb6731b))

### Bug Fixes

* **api/mcp:** guard update_card and publish_card against wrong type/state ([0613ab1](https://github.com/alexlupu3/info-bisericabetel/commit/0613ab1b4b2f5e2f1fda69b91fca8487ef7232bc))
* **api:** eliminate MAX(order_position) concurrency race on content insert ([bbb61f5](https://github.com/alexlupu3/info-bisericabetel/commit/bbb61f55b987dcbcb5d1dcb9ada3f1f45c0f5263))
* **api:** resolve all TypeScript errors ([192d19c](https://github.com/alexlupu3/info-bisericabetel/commit/192d19c53d51012879e0c7dfee8a19bf7944c355))
* **content:** address review findings in chronological ordering ([d37f031](https://github.com/alexlupu3/info-bisericabetel/commit/d37f031b59e244121a7e661b552ba0c24c4281d7))
* **mcp:** address code review findings in stdio MCP server ([a6cf57d](https://github.com/alexlupu3/info-bisericabetel/commit/a6cf57dc0263955616e781943e61ba0adaeba149))
* **mcp:** security hardening and MCP standard compliance ([e9a0b9a](https://github.com/alexlupu3/info-bisericabetel/commit/e9a0b9ab80f990357c9abe9e0109f390876fd73d))
* **ui:** set all form inputs to 16px font to prevent iOS auto-zoom ([537e15e](https://github.com/alexlupu3/info-bisericabetel/commit/537e15efe9acd53d3f560cd95710c1cbc7210bbe))

### Code Refactoring

* **content:** move group chronological ordering to API POST handler ([a0b6a55](https://github.com/alexlupu3/info-bisericabetel/commit/a0b6a559bf7a02c0536bb557951b5732609e7907))

## 1.0.0 (2026-05-12)

### ⚠ BREAKING CHANGES

* **deploy:** CapRover deployment now requires only one app instead of two. The nginx app should be removed from CapRover after deploying this update.
* **docker:** CapRover API app must set `API_HOST=srv-captain--<api-app-name>`
* `SiteSlug` type and `SITES` constant removed from `@betel/shared`

### Features

* add short link tracking for content items ([2881306](https://github.com/alexlupu3/info-bisericabetel/commit/288130635da76902d561433648ad95203976bc70))
* **admin:** add error logs viewer for super-admins ([6ff7a65](https://github.com/alexlupu3/info-bisericabetel/commit/6ff7a65c85f8441216be8a616f396049d3c7d814))
* **admin:** site-exclusive toggle in content form ([1205ce5](https://github.com/alexlupu3/info-bisericabetel/commit/1205ce55ef20a2f43c1177813e564723a9b20202))
* **admin:** visual indicator for site-exclusive items in list ([2b21e6d](https://github.com/alexlupu3/info-bisericabetel/commit/2b21e6dd77f837c49f8abc7a688c537a32f1a495))
* **analytics:** add client-side error logging to DB ([695c88a](https://github.com/alexlupu3/info-bisericabetel/commit/695c88ab57caee15f0418dc76e2c974376c16991))
* **analytics:** add manual start date picker for statistics charts ([2f9f213](https://github.com/alexlupu3/info-bisericabetel/commit/2f9f21384c853b3efaf381e3f8cd6985b1f1dabe))
* **analytics:** add per-item CSV export to the content clicks table ([cd41f4c](https://github.com/alexlupu3/info-bisericabetel/commit/cd41f4cc5c0d03c8161e10290013cf24ff028110))
* **analytics:** add per-site comparison chart on all-sites view ([a4c8a70](https://github.com/alexlupu3/info-bisericabetel/commit/a4c8a70204e27ccbf60f0f45b5768f7f89315e11))
* **analytics:** add site filter to analytics dashboard ([5ab4ecb](https://github.com/alexlupu3/info-bisericabetel/commit/5ab4ecb5d228bdcc6ee01a00bf9ebb58596236c8))
* **analytics:** show per-link click breakdown in trend chart tooltip ([c70492d](https://github.com/alexlupu3/info-bisericabetel/commit/c70492ddbc7f6918a859885c6b13a7c3d50e8b08))
* **api:** add analytics overview endpoint with period comparison ([86c8761](https://github.com/alexlupu3/info-bisericabetel/commit/86c87614a040b0ff59f457c9e08e6eb581815187))
* **api:** add analytics_events index on item_id ([b79dc06](https://github.com/alexlupu3/info-bisericabetel/commit/b79dc069ed2f927f6761565b30267d95d31ab2ca))
* **api:** add exclusive_site column and migration ([922eb8d](https://github.com/alexlupu3/info-bisericabetel/commit/922eb8d117d42804793dae9c592b7a18ca94a136))
* **api:** add per-item daily clicks endpoint ([cf61426](https://github.com/alexlupu3/info-bisericabetel/commit/cf614269aa25d245e5f7b5ec19636d04cc658231))
* **api:** hide exclusive items from all-sites view ([e8d9d8e](https://github.com/alexlupu3/info-bisericabetel/commit/e8d9d8e2f1b618a1ff15cda84203a7d878600ade))
* **app:** add analytics API client types and methods ([e463996](https://github.com/alexlupu3/info-bisericabetel/commit/e463996e691718eb13b3e76bc63ed7c0af09972a))
* **app:** add analytics dashboard sub-components ([c38dcc0](https://github.com/alexlupu3/info-bisericabetel/commit/c38dcc078682546c56a3da39366b541fb398dbcb))
* **app:** rebuild analytics dashboard with charts and comparison ([6fef451](https://github.com/alexlupu3/info-bisericabetel/commit/6fef451069e9ca5cc631924aa42cbc274cfcd7a5))
* **card:** render description as markdown in CardItem ([daed251](https://github.com/alexlupu3/info-bisericabetel/commit/daed25178905ed0c0ec2abfc119862aad1cb42b9))
* **card:** show external link icon when card has link but no CTA ([9e6a930](https://github.com/alexlupu3/info-bisericabetel/commit/9e6a93018538c3dd99666b2c79ae36c4a4c642b2))
* **content:** add duplicate action to content item context menu ([ccbe63c](https://github.com/alexlupu3/info-bisericabetel/commit/ccbe63c9d587077f37afe1712f96abdf2f46a08f))
* **content:** add per-site link overrides for cards and posters ([442c35f](https://github.com/alexlupu3/info-bisericabetel/commit/442c35fc76b6d2f9d24d4db08412e02b961f864f))
* **content:** add soft delete with archive page for content items ([df234c9](https://github.com/alexlupu3/info-bisericabetel/commit/df234c9b7cafe341118dcfeeca9c2e062866a969))
* **content:** filter past events from PWA and flag them in admin ([df0ec1a](https://github.com/alexlupu3/info-bisericabetel/commit/df0ec1a4c570388af37807a29b5610ef15178cfe))
* **content:** unify date handling across all content types ([a6102d4](https://github.com/alexlupu3/info-bisericabetel/commit/a6102d4d79aa48946e0b203343ec4771a0fcd32e))
* **i18n:** add admin TranslationsPage and content form translation mode ([99bb96d](https://github.com/alexlupu3/info-bisericabetel/commit/99bb96d48873491524e8a98005fe8802a9b7eeee))
* **i18n:** add AI auto-generate button for missing UI translations ([c542d58](https://github.com/alexlupu3/info-bisericabetel/commit/c542d581595198bac0f09641720f5d62d728a011))
* **i18n:** add AI auto-translation for content and groups on create/update ([218a505](https://github.com/alexlupu3/info-bisericabetel/commit/218a5054d1341ebc82ea8cd7a5a4d12dc9906d1c))
* **i18n:** add API routes for languages, translations, and content locale ([418d647](https://github.com/alexlupu3/info-bisericabetel/commit/418d647d1a231172a9b0291100e897ea4fc9422e))
* **i18n:** add database tables and shared types for internationalization ([caedf32](https://github.com/alexlupu3/info-bisericabetel/commit/caedf324f8adbd7d4a4c2b53703b54d8c2cfa805))
* **i18n:** add public site language switching and string extraction ([83fac39](https://github.com/alexlupu3/info-bisericabetel/commit/83fac39f53daf1b23cbfc0fa6f6feffe1352c2d9))
* **i18n:** support locale-specific images for poster and card content ([610b73d](https://github.com/alexlupu3/info-bisericabetel/commit/610b73d0ee7ea486be38a5799c304f87779d6c01))
* **public:** add slugified id to group section headers for anchor links ([19074ae](https://github.com/alexlupu3/info-bisericabetel/commit/19074ae7f0d31116bba1e932123ef37e630a2f27))
* **pwa:** add logo, subtitle and website link to hero header ([4f64fed](https://github.com/alexlupu3/info-bisericabetel/commit/4f64fed6875d143fd681386b2119f6c387d8fcc6))
* **pwa:** make linked cards and posters fully clickable with hover animation ([e90aa1f](https://github.com/alexlupu3/info-bisericabetel/commit/e90aa1f28c4af36cdaf3ffa820ca87ec07eb3d99))
* **pwa,admin:** split favicon into light and dark variants ([9749702](https://github.com/alexlupu3/info-bisericabetel/commit/9749702898b1b0b2020d1a35dfaf0e50d67211e8))
* **rate-limiting:** add rate limiting to tracking endpoints ([2c49f62](https://github.com/alexlupu3/info-bisericabetel/commit/2c49f62a242fbd1dfa90b06d4954a17ea3f9f208))
* **ui:** add link affordance to posters and minor UX fixes ([27e6ca9](https://github.com/alexlupu3/info-bisericabetel/commit/27e6ca99f39bdb31b5db4608af83b1c744bca6cb))
* **users:** add super-admin password reset flow for admin accounts ([55b11a5](https://github.com/alexlupu3/info-bisericabetel/commit/55b11a5af656f67447f5aae9987bbbd7bdfc76a2))

### Bug Fixes

* **admin:** sanitize limit/offset query params in error-logs route ([5028c7c](https://github.com/alexlupu3/info-bisericabetel/commit/5028c7cae123d013b7b34b6aab8cf496a7363932))
* **admin:** repair failing Cypress e2e tests for reorder, publish and collapse ([d8fdfae](https://github.com/alexlupu3/info-bisericabetel/commit/d8fdfaef50fd0f0a8147e3b958cd3ae2714ccbdd))
* **ai-translation:** harden error handling and improve observability ([c0dba22](https://github.com/alexlupu3/info-bisericabetel/commit/c0dba22c78a9d2eafd374f67fdbe3298c21f93c3))
* **analytics:** address review findings in startDate handling ([9c6646a](https://github.com/alexlupu3/info-bisericabetel/commit/9c6646a3a75b8924cd894c6197f055ab392cd1a8))
* **analytics:** harden CSV export endpoint and export button ([d4d3987](https://github.com/alexlupu3/info-bisericabetel/commit/d4d3987aace688a76af4adc934ea43c02f5e941a))
* **analytics:** route boundary-day events to previous period in week/month view ([5883e5a](https://github.com/alexlupu3/info-bisericabetel/commit/5883e5ac3148995e2166551a52909c2a3e26e30c))
* **api:** add input validation and locale FK checks across admin routes ([c7138b1](https://github.com/alexlupu3/info-bisericabetel/commit/c7138b110112f92077e39beeaa6414eb2394e245))
* **api:** un-ignore migration SQL files in .gitignore ([b0eaff1](https://github.com/alexlupu3/info-bisericabetel/commit/b0eaff18dca3979613bf4697ba11193cb81f1253))
* **app:** harden LanguageContext, fix a11y labels, and clean up types ([32cefc1](https://github.com/alexlupu3/info-bisericabetel/commit/32cefc1873ffca9abe36b83a64fd3989f7d9fb92))
* **app:** remove unused ItemAnalytics import from AnalyticsPage ([8bc4b07](https://github.com/alexlupu3/info-bisericabetel/commit/8bc4b07fb856d2dc3dc79da3e14ec0a44f72b530))
* **card:** hide CTA button when no cta text is provided ([87ff7c0](https://github.com/alexlupu3/info-bisericabetel/commit/87ff7c0f7d2aa7adab284830e19ac3850d59d8f5))
* **content-form:** render locale badges with toUpperCase() instead of relying on CSS ([a17d260](https://github.com/alexlupu3/info-bisericabetel/commit/a17d26089ee0aedbda6ba690c60c057ab1846442))
* **content:** camelCase mediaFields and fix duplicate test assertion ([f0c593f](https://github.com/alexlupu3/info-bisericabetel/commit/f0c593f65e84969772f3ca780b5208df46e139fa))
* **content:** delete analytics events and audit logs on permanent content deletion ([1c3d847](https://github.com/alexlupu3/info-bisericabetel/commit/1c3d847671c9f063b7a853c5831ad823e528a69b))
* **content:** hide expired items on the public hub across timezones ([8f0a1af](https://github.com/alexlupu3/info-bisericabetel/commit/8f0a1afdcc8f4290203ee3b0957345ef908fd4c5))
* **content:** prevent silent visibility widening on clearing exclusiveSite ([827abcf](https://github.com/alexlupu3/info-bisericabetel/commit/827abcfc92e05cbdd04f86143a0c0eac13fb3537))
* **docker:** bind server to 0.0.0.0 and create uploads dir ([2b62496](https://github.com/alexlupu3/info-bisericabetel/commit/2b6249644494ae97ede5c79b2a554114d945a2c5))
* **docker:** set app port to 80 to match CapRover default ([efac15a](https://github.com/alexlupu3/info-bisericabetel/commit/efac15a490ef005dbbe654542f2f3724d49a253c))
* **markdown:** remove lookbehind regex to fix Safari < 16.4 crash ([175fd96](https://github.com/alexlupu3/info-bisericabetel/commit/175fd96a774c92c740a04f187ab972aed416b444))
* **media:** read auth token from sessionStorage instead of localStorage ([fc72e40](https://github.com/alexlupu3/info-bisericabetel/commit/fc72e40f5a5710b2b15e3164cd162e967a998cbd))
* **public:** add error boundary to public route ([2f86ca5](https://github.com/alexlupu3/info-bisericabetel/commit/2f86ca57d9671d914400e1151db4b032cbde3afc))
* **public:** collapse consecutive hyphens and trim leading/trailing in slugify ([265d87d](https://github.com/alexlupu3/info-bisericabetel/commit/265d87d38c24666f380a02e8cd45350bfe4f0fc9))
* **public:** guard all localStorage calls against SecurityError ([d74745f](https://github.com/alexlupu3/info-bisericabetel/commit/d74745f39d6347a61957270f89cb302032323bf7))
* **public:** make Google Fonts non-render-blocking and guard inline localStorage ([fe1bbae](https://github.com/alexlupu3/info-bisericabetel/commit/fe1bbae240aa33c34c091e1a5a7fb5d70060ea41))
* **pwa:** precache woff fonts and disable auto-reload on SW update ([d984e87](https://github.com/alexlupu3/info-bisericabetel/commit/d984e879f1546b166897e025484b83a5c786fa37))
* **pwa:** use accent tint for card hover background ([73ed89c](https://github.com/alexlupu3/info-bisericabetel/commit/73ed89cd1e5aeb881857099dc5f2235a19e8adb1))
* **short-links:** address code review findings ([9e8bff4](https://github.com/alexlupu3/info-bisericabetel/commit/9e8bff4b2d103a1be1e2926c4e13969d193dc20d))
* **tests:** correct mock key in translations test and extract i18n intercept helper ([ac046d2](https://github.com/alexlupu3/info-bisericabetel/commit/ac046d249d4fa5fb3bf82d1b1c36abf3c6d1064f))
* **tests:** resolve 5 failing e2e tests ([4f3c058](https://github.com/alexlupu3/info-bisericabetel/commit/4f3c05880b3faa31d943ded9ea54151d22d15d40))
* **tests:** use sessionStorage for admin token in Cypress tests ([acdb437](https://github.com/alexlupu3/info-bisericabetel/commit/acdb437fa4ee025e0d5c5b5c7adf84c7addd35a0))

### Performance Improvements

* **ai-translation:** replace string logs with structured JSON for cost observability ([e402400](https://github.com/alexlupu3/info-bisericabetel/commit/e402400a5ffcabc0eb671d8c997b50e376a58101))
* **ai-translation:** skip re-translation of unchanged content fields on update ([755fa46](https://github.com/alexlupu3/info-bisericabetel/commit/755fa46347853e78378c27ef64dff37fa24a2f3a))
* **docker:** skip Cypress binary download in production builds ([23ef14b](https://github.com/alexlupu3/info-bisericabetel/commit/23ef14bd873dca9f5eff7b68576042c131e82741))

### Code Refactoring

* **deploy:** collapse two-container setup into single Fastify-served container ([a3a3b85](https://github.com/alexlupu3/info-bisericabetel/commit/a3a3b8526f93835888a7ab8f7f470e8a97be0384))

### Continuous Integration

* **docker:** split into separate API and frontend images for CapRover ([5288a21](https://github.com/alexlupu3/info-bisericabetel/commit/5288a219edeb845b8df81ddb2d362cf18204c8d2))
