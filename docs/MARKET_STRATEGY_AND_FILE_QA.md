# Evidence-based market strategy and delivery-file QA

Implemented November 6, 2026. These checks reduce specific failures; they do not certify an error-free application, native documents or future sales.

## Market evidence

Trend results include a versioned strategy record with query, UTC check time, sample size, Etsy listing URLs when available, observed title/tag features, USD price quartiles and source identifiers. Listings with protected-name risk are excluded from strategy features and prices. Known listing IDs are deduplicated. Unknown age/favorite fields remain unknown in this record. Favorite-per-month values are lifetime averages normalized by listing age, not actual recent growth or sales.

The public sample does not verify competitors' bestseller badges, units sold, conversion rates, ad spend or causes of success. Evidence levels describe sample coverage, not confidence in a sales forecast. Feature observations count mentions in titles/tags; missing mentions do not establish missing deliverables or a market gap. Search-level strategies are labeled separately from product-matched digital research.

Digital Studio accepts up to five optional Etsy listing URLs or listing IDs. The server parses IDs and fetches the official Etsy API; it never requests a user-provided arbitrary host. Selected references must be active and match the digital product kind/topic. They are merged into fresh matched search results and deduplicated. Preparation requires at least three eligible comparable products and three comparable USD prices. Previously cached records without the evidence version are refreshed. Stale physical research cannot supply a plan's keyword or competitor price.

Strategy-derived prices exclude protected-name records and unsupported currency values. The existing discounted launch candidate remains a heuristic, explicitly labeled as a trial rather than an optimal price. Cost, fees, shipping, taxes and seller margin still need review. A hypothetical separate bundle price does not establish that a bundle was created.

The strategy suggests original positioning, applicable observed features, covers based on final content, and separately measured cover/price trials. Seller-entered Etsy Stats are required for real performance comparisons; no experiment is silently run. Small-sample thresholds are practical review rules, not statistical significance claims.

## Chat handoff and listing consistency

When a server AI provider is configured, the listing-wording request receives the observed strategy as data and is restricted to the specified product. The English production package includes the evidence-based strategy and authoritative listing metadata: product name, title, description, tags and USD price. Competitor content is treated as data rather than instructions. Models are told to report FAIL if the promised deliverables cannot be produced. Unsupported competitor features must not become listing claims. The complete package is rechecked by the output guard.

Selected competitor references participate in the saved workspace identity; changing them invalidates the old preparation. The workflow keeps assistant choice, listing, product identity and strategy together. Subscription chat use still requires the seller to share the package, attach required inputs, download the generated files to the phone and select them for upload. A successful share is not proof of generation. No chat subscription is silently treated as API credit.

## Delivery-file QA

The Worker opens stored/deflated ZIP entries in memory, checks CRC, local/central directory consistency, actual decompressed lengths, duplicate paths, traversal, symlinks, overlapping file ranges and resource limits. No entry is extracted to disk. Limits: 20 MiB per uncompressed entry, 40 MiB combined across nested containers, 1,200 entries and at most two nested levels; Office packages have an additional depth guard. ZIP64, multipart/encrypted archives and unsupported compression methods are rejected.

PDF entries go through the actual PDF parser and filename-based paper-size checks. PPTX/DOCX/XLSX packages require their core parts, corresponding XML root/namespace, syntactically well-formed XML, and slides/worksheets where applicable. Executables, macros and unreviewed binary Office parts are rejected. PNG/JPEG checks inspect basic headers, not complete pixel decoding. Unsupported extras do not count as a valid deliverable.

`GET /api/digital/products/:id/qa` rechecks the seller's privately stored files, hashes, duplicate file contents and promised delivery formats. The Digital screen exposes this as a read-only file-structure audit. Draft creation repeats the audit before any Etsy write, including a retry of a previously created draft. Failed structural checks prevent transfer.

Structural success does not validate puzzle answers, grammar, originality, licensing, page aesthetics, Office relationships, slide interactivity, spreadsheet formulas, rendered output or print results. The seller must open each final file in the target application, review its content, test relevant interactions and print where appropriate. Existing native/seller QA acknowledgments remain required. This release did not inspect the saleable Christmas trivia ZIP because it was not supplied.

## Open source and dependency checks

- `fflate` **0.8.3**, MIT: streaming deflate decompression. Version 0.8.2 was rejected after an npm audit reported GHSA-px8p-9vwx-vf98; 0.8.3 is the patched version. Production code does not call `unzipSync` and independently rejects ZIP64.
- `fast-xml-validator` **1.4.2**, MIT: `SyntaxValidator` for Office XML syntax checks. It is not a full Office schema/rendering validator.

Both direct versions are pinned and the lockfile is committed. Package installation used disabled lifecycle scripts. The production dependency audit reported zero known vulnerabilities at review time. This is an advisory-database result, not a security warranty. Licenses are retained in OPEN_SOURCE_NOTICES.md.

## Validation

All 261 automated tests pass, including real screen-button flows through the Worker with controlled external responses. Coverage includes selected-reference validation, stale evidence, deduplication/currency/risk pricing, saved workspace binding, actual archive/PDF/XML failures, read-only audit behavior, exact listing metadata transfer, interrupted upload retry and separately verified active state. Root/mobile TypeScript checks, Worker bundling and offline Android export pass. Exact results are also recorded in the pull request.

No real Etsy listing, customer message or Pinterest pin is published during QA. Passing controlled tests does not prove native picker behavior or every Etsy remote response on a phone.

## Primary references

- https://developer.etsy.com/documentation/reference/
- https://developer.etsy.com/documentation/essentials/authentication/
- https://github.com/101arrowz/fflate
- https://github.com/NaturalIntelligence/fast-xml-validator
- https://github.com/advisories/GHSA-px8p-9vwx-vf98
