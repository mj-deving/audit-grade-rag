# Audit-Grade RAG Master PRD

Status: FROZEN
Document version: 1.0.0
Source brief: `ISA.md`
Project: `audit-grade-rag`
Prepared on: 2026-05-10
Prepared by: Codex
Write scope: `docs/MASTER_PRD.md`
Guardrail status: Bootstrapped
Goal status: Not launched

## §0 Document Control, Source Brief, and Research Basis

### §0.1 Purpose

1. This Master PRD converts `ISA.md` into an execution-ready product specification.
2. It is intentionally implementation-shaped rather than pitch-shaped.
3. It is written for a Codex implementation run that may later build the product.
4. It does not create a `/goal` run.
5. It does not bootstrap guardrails.
6. It does not modify source code.
7. It does not create project scaffolding.
8. It does not create tests.
9. It does not create package metadata.
10. It only specifies the product to be built.
11. It treats `ISA.md` as the authoritative local brief.
12. It uses current web research only where the brief touches volatile law, standards, models, security, or framework behavior.
13. It freezes the product only after converting material open questions into explicit assumptions.
14. It uses "MUST", "SHOULD", and "MAY" in the RFC-style sense.
15. It treats auditability as a system property, not a later feature.

### §0.2 Product One-Liner

16. Audit-Grade RAG is a self-hostable, EU-regulated-industry knowledge assistant.
17. The v1 deployment serves one regulated organization.
18. The v1 deployment serves one corpus.
19. The v1 deployment exposes a German-language operator console.
20. The system answers questions only from the ingested corpus.
21. The system attaches per-claim citations to exact retrieved chunks.
22. The system records every material event in a hash-chained audit ledger.
23. The system supports replay and drift detection from recorded ledger entries.
24. The system ships an evaluation harness with adversarial golden cases.
25. The system emits one regulator-shaped report in v1: EU AI Act Article 50 transparency disclosure.
26. The product is optimized for DACH regulated industries.
27. The product is not a general "chat with your documents" demo.
28. The product is not a multi-tenant SaaS.
29. The product is not a generic enterprise search product.
30. The product is a reference implementation of auditable RAG.

### §0.3 Status Decision

31. Status is FROZEN.
32. The freeze is conditional on the assumptions in §12.
33. No §12 item is left as a blocking open question.
34. Items that would otherwise block scope are converted into explicit assumptions Codex may act on.
35. The biggest converted assumption concerns cloud LLM replay determinism.
36. Anthropic model IDs in the 4.6 generation are pinned snapshots, but Anthropic documents that serving infrastructure can still change observable behavior.
37. Therefore the PRD does not falsely promise provider-wide cloud determinism.
38. The product promises replay verification, drift naming, and bit-equal replay only where the configured provider profile supports deterministic replay.
39. The acceptance test suite MUST include a deterministic local/stub provider path.
40. The operator UI MUST communicate replay pass, replay drift, and replay unsupported as distinct states.
41. The v1 marketing copy MUST NOT claim that all cloud LLM providers can replay bit-for-bit indefinitely.
42. This status is frozen because Codex can implement against these explicit constraints.

### §0.4 Local Sources

43. Local source 1: `ISA.md`.
44. `ISA.md` defines the problem, vision, principles, constraints, goal, criteria, features, decisions, test strategy, and verification posture.
45. `ISA.md` line count observed by command: 208 lines.
46. No existing `docs/MASTER_PRD.md` was found before this document was created.
47. No project package files were present in the initial max-depth scan.
48. The workspace was not a Git repository at document creation time.
49. The PRD therefore does not rely on git status for change tracking.
50. The PRD writes its own run log in §13.

### §0.5 External Research Sources

51. Source R1: EU AI Act Article 50, AI Act Service Desk, European Commission, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50.
52. R1 informs the v1 transparency-disclosure report requirements.
53. R1 states that direct AI interaction must be disclosed unless obvious in context.
54. R1 states that AI-generated outputs must be machine-readable and detectable where applicable.
55. R1 states that information must be clear, distinguishable, accessible, and provided by first interaction or exposure.
56. Source R2: EU AI Act Article 12, AI Act Service Desk, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12.
57. R2 informs automatic event logging and traceability requirements.
58. R2 supports recording lifecycle events relevant to risks, monitoring, and post-market review.
59. Source R3: EU AI Act Article 13, AI Act Service Desk, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-13.
60. R3 informs deployer-facing instructions, capabilities, limitations, accuracy, robustness, cybersecurity, and log interpretation.
61. Source R4: EU AI Act Article 14, AI Act Service Desk, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14.
62. R4 informs human oversight and operator ability to interpret, disregard, override, or stop system outputs.
63. Source R5: EU AI Act Article 15, AI Act Service Desk, https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-15.
64. R5 informs accuracy, robustness, cybersecurity, data poisoning, adversarial input, confidentiality, and model flaw mitigations.
65. Source R6: GDPR Article 25, GDPR-info mirror of GDPR text, https://gdpr-info.eu/art-25-gdpr/.
66. R6 informs data protection by design, default minimization, and pseudonymization posture.
67. Source R7: GDPR Article 32, EUR-Lex Regulation 2016/679, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679.
68. R7 informs encryption, confidentiality, integrity, availability, resilience, restoration, and testing of measures.
69. Source R8: NIST AI 600-1, Generative AI Profile, https://doi.org/10.6028/NIST.AI.600-1.
70. R8 informs governance, content provenance, pre-deployment testing, incident disclosure, confabulation risk, and risk lifecycle framing.
71. Source R9: OWASP Top 10 for LLM Applications 2025, https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/.
72. R9 informs LLM application security categories.
73. Source R10: OWASP Top 10 for LLM Applications 2025 PDF, https://genai.owasp.org/download/43299/.
74. R10 informs prompt injection, vector and embedding weaknesses, system prompt leakage, and external guardrail requirements.
75. Source R11: pgvector official README, https://github.com/pgvector/pgvector.
76. R11 informs HNSW tradeoffs, defaults, dimensions, filtering behavior, `ef_search`, and build-memory concerns.
77. Source R12: W3C WebAuthn Level 3, https://www.w3.org/TR/webauthn-3/.
78. R12 informs passkey authentication, relying-party scoping, public-key credentials, and HTTPS requirements.
79. Source R13: Anthropic Claude model IDs and versioning, https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions.
80. R13 informs pinned model IDs and infrastructure-drift caveats.
81. Source R14: Anthropic models overview, https://platform.claude.com/docs/en/about-claude/models/overview.
82. R14 informs current Claude Sonnet 4.6 availability, model IDs, context, regional endpoint considerations, and model choice.
83. Source R15: SQLite WAL documentation, https://www.sqlite.org/wal.html.
84. R15 informs WAL concurrency benefits and limitations.
85. Source R16: W3C WCAG 2.2, https://www.w3.org/TR/wcag/.
86. R16 informs operator-console accessibility requirements.
87. Source R17: Hono validation documentation, https://hono.dev/docs/guides/validation.
88. R17 informs Hono request-validation expectations and content-type caveats.
89. Source R18: Next.js 15 App Router docs, https://nextjs.org/docs/15/app/api-reference.
90. R18 informs frontend routing and server boundary expectations.

### §0.6 Research Conclusions

91. Current EU AI Act transparency expectations support a first-interaction AI disclosure in the operator console.
92. Current EU AI Act record-keeping expectations support automatic logs across the system lifecycle.
93. Current AI Act high-risk provisions are not assumed to apply automatically to every v1 deployment.
94. The PRD nevertheless designs logging and oversight to be compatible with high-risk-style diligence.
95. GDPR design-by-default supports not logging query text in ordinary application logs.
96. GDPR security-of-processing supports encryption, resilience, restore testing, and regular security-control evaluation.
97. NIST GenAI guidance supports explicit content provenance and pre-deployment testing.
98. OWASP 2025 specifically calls out vector and embedding weaknesses for RAG.
99. OWASP 2025 supports external deterministic enforcement instead of relying on prompts for security.
100. pgvector HNSW is suitable for self-hosted vector search but approximate indexes can trade recall for speed.
101. WebAuthn passkeys are suitable for passwordless operator authentication.
102. SQLite WAL is suitable for a single-file default audit ledger with concurrent reads, subject to same-host and busy-case constraints.
103. WCAG 2.2 AA is a reasonable v1 accessibility target for a regulated-industry console.
104. Anthropic Sonnet 4.6 is a valid current model ID, but cloud infrastructure drift means replay must detect differences rather than assume impossible immutability.

### §0.7 Document Map

105. §0 defines status, sources, and freeze reasoning.
106. §1 defines problem, vision, value, and success metrics.
107. §2 defines users, jobs, personas, scope, and non-goals at product level.
108. §3 defines architecture and runtime components.
109. §4 defines the data model.
110. §5 defines APIs, CLIs, events, and contracts.
111. §6 defines ingestion, retrieval, generation, citations, ledger, replay, reports, and evaluation workflows.
112. §7 defines UI and interaction details.
113. §8 defines security, privacy, compliance, operations, and deployment.
114. §9 defines test strategy and acceptance criteria.
115. §10 defines anti-requirements.
116. §11 defines definition of done.
117. §12 defines assumptions and open questions.
118. §13 defines this PRD creation run log.

## §1 Product Context, Vision, Goals, and Success Metrics

### §1.1 Problem Statement

119. Regulated DACH organizations want RAG but cannot sign off on shallow "ask your documents" products.
120. The core blocker is not only answer quality.
121. The core blocker is evidentiary quality.
122. Compliance needs provenance.
123. Compliance needs replay.
124. Compliance needs tamper-evident logs.
125. Compliance needs regulator-shaped reports.
126. Compliance needs out-of-corpus refusal.
127. Compliance needs evidence that a fluent response is not a hallucination.
128. Compliance needs system limitations written in a language deployers understand.
129. Engineering needs a self-hostable system that does not outsource the audit story to slides.
130. Operators need a console that shows what happened without reading raw logs.
131. Auditors need a sealed artifact that can be verified independently.
132. Existing RAG demos usually expose chunks and answers but not a complete audit story.
133. Existing commercial claims may be opaque, expensive, or not reproducible from source.
134. Audit-Grade RAG fills the reference-implementation gap.

### §1.2 Vision

135. A compliance officer logs into `audit-grade-rag.example.local`.
136. The officer sees a German-language console.
137. The officer asks a question against one configured corpus.
138. The answer appears with every claim linked to exact source chunks.
139. Each citation opens the source location.
140. The retrieved-chunks panel shows score, method, page, offset, and snapshot.
141. The audit-trail panel shows the ledger entry written for that answer.
142. The ledger entry includes model version, prompt version, embedding model version, corpus snapshot, seed, user, timestamp, and outcome.
143. The operator can replay the entry.
144. Replay either passes bit-equal, reports named drift, or reports provider replay unsupported.
145. The operator can generate an EU AI Act Article 50 disclosure package.
146. The disclosure package contains PDF, JSON, and sealed audit excerpt.
147. The eval dashboard shows groundedness, citation accuracy, refusal correctness, and tag-level breakdowns.
148. The system makes a credible pilot possible without hand-translating logs into compliance prose.

### §1.3 Product Goals

149. Goal G1: Provide a self-hostable RAG application for one regulated organization.
150. Goal G2: Support one corpus per v1 deployment.
151. Goal G3: Enforce per-claim citations for generated answers.
152. Goal G4: Store chunk-level provenance for every retrieved span.
153. Goal G5: Store all answer-relevant events in a hash-chained append-only audit ledger.
154. Goal G6: Support independent ledger verification.
155. Goal G7: Support replay with explicit drift detection.
156. Goal G8: Support deterministic local replay in acceptance and certified deployments.
157. Goal G9: Support cloud model profiles while refusing false bit-stability claims.
158. Goal G10: Provide a regulator-shaped EU AI Act Article 50 disclosure report.
159. Goal G11: Provide a German operator console.
160. Goal G12: Provide an adversarial evaluation harness.
161. Goal G13: Score groundedness, citation accuracy, and refusal correctness.
162. Goal G14: Meet performance thresholds on a 50K-chunk corpus.
163. Goal G15: Provide privacy-by-default logs.
164. Goal G16: Provide no third-party telemetry by default.
165. Goal G17: Use TypeScript end-to-end.
166. Goal G18: Use self-hosted Postgres with pgvector for retrieval.
167. Goal G19: Use SQLite WAL as the default audit-ledger artifact.
168. Goal G20: Keep every compliance claim traceable to code, data, or report evidence.

### §1.4 Non-Goals

169. Non-goal NG1: Multi-tenant SaaS.
170. Non-goal NG2: Tenant-level billing.
171. Non-goal NG3: Usage metering for commercial licensing.
172. Non-goal NG4: Per-seat pricing mechanics.
173. Non-goal NG5: Enterprise SAML or OIDC in v1.
174. Non-goal NG6: Custom embedding-model training.
175. Non-goal NG7: Multi-corpus federation.
176. Non-goal NG8: English operator UI at v1 launch.
177. Non-goal NG9: Native mobile apps.
178. Non-goal NG10: Native desktop apps.
179. Non-goal NG11: Multiple regulator report formats in v1.
180. Non-goal NG12: Collaborative answer drafting.
181. Non-goal NG13: SharePoint ingestion.
182. Non-goal NG14: Confluence ingestion.
183. Non-goal NG15: Email ingestion.
184. Non-goal NG16: Fine-tuning base models on the corpus.
185. Non-goal NG17: Image retrieval.
186. Non-goal NG18: Audio retrieval.
187. Non-goal NG19: A general-purpose agent platform.
188. Non-goal NG20: Automated legal advice.

### §1.5 Success Metrics

189. Metric M1: Groundedness is at least 0.95 on latest golden set.
190. Metric M2: Citation accuracy is at least 0.95 on latest golden set.
191. Metric M3: Refusal correctness is at least 0.90 on latest golden set.
192. Metric M4: Operator-console p95 page interaction latency is at most 1.5 seconds on 50K chunks.
193. Metric M5: End-to-end cloud model query p95 is at most 8 seconds.
194. Metric M6: End-to-end local 70B vLLM query p95 is at most 25 seconds.
195. Metric M7: Ledger verification passes on clean ledgers.
196. Metric M8: Ledger verification fails on one-byte tampering.
197. Metric M9: Clean deterministic replay produces byte-equal output.
198. Metric M10: Drifted prompt replay returns `ReplayDriftError`.
199. Metric M11: Drifted corpus replay returns `ReplayDriftError`.
200. Metric M12: Drifted model replay returns `ReplayDriftError`.
201. Metric M13: Empty golden-set evaluation fails.
202. Metric M14: Generated report is byte-identical when rerun for the same window and ledger.
203. Metric M15: Ordinary INFO logs never contain query text.
204. Metric M16: Ordinary INFO logs never contain retrieved chunk text.
205. Metric M17: Operator console has zero third-party scripts.
206. Metric M18: CSP blocks unapproved external fetches.
207. Metric M19: WebAuthn passkey login succeeds on current Chromium and Firefox.
208. Metric M20: WCAG 2.2 AA automated checks pass with no serious violations.

### §1.6 Value Proposition

209. For compliance officers, the value is defensible evidence.
210. For engineering teams, the value is a reference implementation.
211. For auditors, the value is verifiable artifacts.
212. For data-protection officers, the value is minimization and controlled retention.
213. For security teams, the value is deterministic controls outside the model.
214. For executives, the value is a path from blocked RAG pilots to auditable deployment.
215. For prospective customers, the value is self-hosting without a SaaS data-control dependency.
216. For maintainers, the value is a finite v1 scope with one report and one corpus.
217. For interview evidence, the value is a serious regulated-systems artifact.
218. For commercial positioning, the value is an open-source-auditable codebase with a defensible paid license option.

### §1.7 Product Principles

219. Principle P1: Audit is a property, not a feature.
220. Principle P2: Provenance is per claim, not per answer.
221. Principle P3: Refusal is a correct output when evidence is insufficient.
222. Principle P4: Deterministic enforcement belongs outside the LLM.
223. Principle P5: Prompt instructions are not authorization controls.
224. Principle P6: Logs must be useful without leaking unnecessary content.
225. Principle P7: Self-hosted defaults must be real, not performative.
226. Principle P8: One corpus is a feature of v1 simplicity.
227. Principle P9: The operator UI must help humans avoid over-reliance.
228. Principle P10: Every version that affects an answer must be pinned or recorded.
229. Principle P11: Every report must be reproducible.
230. Principle P12: Every report must name limitations.
231. Principle P13: Every data transformation must be observable.
232. Principle P14: Every security-sensitive boundary must have tests.
233. Principle P15: Product claims must be narrower than evidence.

## §2 Users, Jobs, Scope, and Product Requirements

### §2.1 Personas

234. Persona U1: Compliance Officer.
235. U1 works in a bank, insurance firm, pharma company, public agency, or similarly regulated DACH organization.
236. U1 asks questions about a controlled corpus.
237. U1 needs cited answers.
238. U1 needs to know when the system refuses.
239. U1 needs an exportable compliance artifact.
240. U1 does not want to inspect raw logs.
241. U1 is the primary operator-console user.
242. Persona U2: Internal Auditor.
243. U2 verifies what the system did after the fact.
244. U2 needs immutable evidence.
245. U2 needs ledger verification.
246. U2 needs replay or drift evidence.
247. U2 needs a report package with hashes.
248. Persona U3: IT Operator.
249. U3 deploys and maintains the system.
250. U3 needs health checks.
251. U3 needs backup and restore runbooks.
252. U3 needs clear failure states.
253. U3 needs self-hosted dependencies.
254. Persona U4: Security Engineer.
255. U4 reviews data flow, model boundaries, and audit controls.
256. U4 needs CSP, no telemetry, no prompt-secret reliance, and deterministic validators.
257. U4 needs reproducible security tests.
258. Persona U5: Data Protection Officer.
259. U5 checks GDPR minimization, retention, deletion, and processor boundaries.
260. U5 needs clear egress, logging, and pseudonymization behavior.
261. Persona U6: Engineering Maintainer.
262. U6 implements and extends the product.
263. U6 needs strong typing, stable contracts, and clear acceptance criteria.
264. Persona U7: Executive Sponsor.
265. U7 decides whether a pilot can proceed.
266. U7 needs a concise story backed by artifacts.

### §2.2 Jobs To Be Done

267. JTBD-001: As U1, ask a corpus-grounded question and receive an answer with claim-level citations.
268. JTBD-002: As U1, see why the system refused an out-of-corpus question.
269. JTBD-003: As U1, inspect the retrieved chunks that shaped an answer.
270. JTBD-004: As U1, generate an Article 50 disclosure package for a date range.
271. JTBD-005: As U1, download the sealed report bundle.
272. JTBD-006: As U2, verify the ledger hash chain.
273. JTBD-007: As U2, replay a historical answer.
274. JTBD-008: As U2, identify the first tampered ledger row.
275. JTBD-009: As U2, see drift named by artifact type.
276. JTBD-010: As U3, ingest a corpus from a filesystem directory.
277. JTBD-011: As U3, dry-run ingestion before writing.
278. JTBD-012: As U3, rebuild an index after corpus changes.
279. JTBD-013: As U3, back up the audit ledger.
280. JTBD-014: As U3, restore a deployment and verify ledger integrity.
281. JTBD-015: As U4, prove no query content is in ordinary logs.
282. JTBD-016: As U4, prove authorization is not delegated to the LLM.
283. JTBD-017: As U4, prove prompt leakage cannot expose credentials.
284. JTBD-018: As U5, review data flow and egress.
285. JTBD-019: As U5, delete an operator account mapping while preserving ledger retention.
286. JTBD-020: As U6, run a complete local check suite.
287. JTBD-021: As U6, add a new report format later without corrupting v1.
288. JTBD-022: As U6, add a provider profile later without changing ledger semantics.
289. JTBD-023: As U7, run the demo against a sample BaFin corpus and show a credible audit artifact.

### §2.3 Product Scope

290. Scope S1: Single-tenant self-host deployment.
291. Scope S2: One active corpus per deployment.
292. Scope S3: Multiple corpus snapshots per corpus for replay.
293. Scope S4: German operator UI.
294. Scope S5: English developer docs are allowed.
295. Scope S6: PDF, DOCX, Markdown ingestion.
296. Scope S7: OCR for scanned PDFs.
297. Scope S8: Chunking with stable identifiers.
298. Scope S9: Dense embeddings.
299. Scope S10: BM25 retrieval.
300. Scope S11: Reciprocal-rank fusion.
301. Scope S12: Top-K retrieval.
302. Scope S13: Out-of-corpus threshold.
303. Scope S14: Cited generation.
304. Scope S15: Citation validation.
305. Scope S16: One regeneration attempt after validation failure.
306. Scope S17: Hash-chained audit ledger.
307. Scope S18: Ed25519 ledger signatures.
308. Scope S19: Ledger export.
309. Scope S20: Ledger verify CLI.
310. Scope S21: Replay CLI.
311. Scope S22: Replay UI action.
312. Scope S23: Drift detection.
313. Scope S24: Eval harness.
314. Scope S25: Article 50 report generator.
315. Scope S26: Operator passkey auth.
316. Scope S27: Magic-link recovery bootstrap.
317. Scope S28: No passwords.
318. Scope S29: No third-party telemetry by default.
319. Scope S30: Local/on-prem deployment path.

### §2.4 Feature Inventory

320. Feature F1: Operator authentication.
321. Feature F2: Passkey registration.
322. Feature F3: Recovery magic link.
323. Feature F4: Session management.
324. Feature F5: Corpus ingestion CLI.
325. Feature F6: Document extraction.
326. Feature F7: OCR extraction.
327. Feature F8: Chunk generation.
328. Feature F9: Chunk hashing.
329. Feature F10: Corpus snapshotting.
330. Feature F11: Embedding generation.
331. Feature F12: pgvector indexing.
332. Feature F13: BM25 indexing.
333. Feature F14: Hybrid retrieval.
334. Feature F15: Retrieval scoring.
335. Feature F16: Out-of-corpus decision.
336. Feature F17: Prompt rendering.
337. Feature F18: LLM provider adapter.
338. Feature F19: Cited answer parser.
339. Feature F20: Claim citation validator.
340. Feature F21: Answer regeneration.
341. Feature F22: Ledger writer.
342. Feature F23: Ledger hash-chain verifier.
343. Feature F24: Ledger signer.
344. Feature F25: Ledger export.
345. Feature F26: Replay executor.
346. Feature F27: Drift detector.
347. Feature F28: Eval harness.
348. Feature F29: Eval dashboard.
349. Feature F30: Report generator.
350. Feature F31: Report template.
351. Feature F32: Report deterministic renderer.
352. Feature F33: Operator query UI.
353. Feature F34: Citation inspector.
354. Feature F35: Source viewer.
355. Feature F36: Audit trail panel.
356. Feature F37: Historical ledger browser.
357. Feature F38: Report download view.
358. Feature F39: Data-residency documentation.
359. Feature F40: Operational health checks.

### §2.5 Requirement Groups

360. Requirement group RG1: Identity and session.
361. Requirement group RG2: Ingestion and indexing.
362. Requirement group RG3: Retrieval.
363. Requirement group RG4: Generation and citation validation.
364. Requirement group RG5: Audit ledger.
365. Requirement group RG6: Replay.
366. Requirement group RG7: Evaluation harness.
367. Requirement group RG8: Regulator reporting.
368. Requirement group RG9: Operator console.
369. Requirement group RG10: GDPR and compliance baseline.
370. Requirement group RG11: Build, test, and ship.
371. Requirement group RG12: Operations.
372. Requirement group RG13: Security.
373. Requirement group RG14: Documentation.

## §3 Architecture

### §3.1 Architecture Overview

374. The system uses TypeScript end to end.
375. The frontend is Next.js 15 App Router.
376. The backend API is Hono on Node 22.
377. Postgres 16 stores corpus metadata, chunks, retrieval indexes, eval state, and non-ledger application state.
378. pgvector stores dense embeddings.
379. SQLite WAL stores the default audit ledger.
380. The ledger is encrypted at rest.
381. The ledger is append-only at the application layer.
382. The ledger row identity is a canonical SHA-256 hash.
383. The ledger row is Ed25519 signed.
384. The LLM provider is behind a provider interface.
385. The embedding provider is behind a provider interface.
386. The report renderer uses Typst.
387. The eval harness runs from pinned corpora, prompts, provider profiles, and golden sets.
388. The CLI shares domain services with the API.
389. UI actions call Hono APIs rather than reaching directly into storage.
390. The worker runtime handles ingestion, embedding, report generation, and replay jobs.
391. The application boundary treats the LLM as untrusted output.
392. The application boundary treats retrieved documents as untrusted input.
393. The application boundary treats prompt text as versioned implementation data.
394. The application boundary treats citations as structured claims that must be validated.

### §3.2 Runtime Components

395. Component C1: `apps/web`.
396. C1 serves the operator console.
397. C1 owns German UI text.
398. C1 renders query, answer, citations, chunks, ledger, replay, eval, and report screens.
399. Component C2: `apps/api`.
400. C2 serves Hono REST endpoints.
401. C2 enforces authentication.
402. C2 validates request bodies.
403. C2 coordinates query execution.
404. C2 writes audit events before returning material outcomes.
405. Component C3: `packages/domain`.
406. C3 owns pure domain types.
407. C3 owns canonical JSON serialization.
408. C3 owns ledger hash functions.
409. C3 owns citation validation.
410. C3 owns outcome enums.
411. Component C4: `packages/db`.
412. C4 owns Postgres schema and query functions.
413. C4 owns SQLite ledger access.
414. C4 exposes append-only ledger insert operations only.
415. Component C5: `packages/ingest`.
416. C5 extracts source files.
417. C5 computes document hashes.
418. C5 chunks text.
419. C5 creates corpus snapshots.
420. C5 writes chunk rows.
421. C5 calls embedding provider.
422. C5 builds retrieval indexes.
423. Component C6: `packages/retrieval`.
424. C6 runs BM25 retrieval.
425. C6 runs vector retrieval.
426. C6 merges candidates by reciprocal-rank fusion.
427. C6 applies snapshot filters.
428. C6 applies access filters.
429. C6 returns scored chunks.
430. Component C7: `packages/generation`.
431. C7 renders prompts.
432. C7 calls LLM providers.
433. C7 parses claim citations.
434. C7 runs the citation validator.
435. C7 returns structured answer outcomes.
436. Component C8: `packages/audit`.
437. C8 writes ledger entries.
438. C8 verifies ledger entries.
439. C8 exports sealed artifacts.
440. C8 signs ledger rows.
441. C8 redacts ordinary logs.
442. Component C9: `packages/replay`.
443. C9 loads ledger entries.
444. C9 resolves frozen artifacts.
445. C9 re-executes query plans.
446. C9 compares bytes.
447. C9 reports named drift.
448. Component C10: `packages/eval`.
449. C10 loads golden sets.
450. C10 executes eval cases.
451. C10 computes groundedness.
452. C10 computes citation accuracy.
453. C10 computes refusal correctness.
454. Component C11: `packages/report`.
455. C11 renders Article 50 disclosure JSON.
456. C11 renders Article 50 disclosure PDF.
457. C11 creates sealed audit excerpts.
458. C11 computes report artifact hashes.
459. Component C12: `packages/provider-llm`.
460. C12 implements Anthropic provider profile.
461. C12 implements OpenAI-compatible vLLM provider profile.
462. C12 implements deterministic stub provider profile for tests.
463. Component C13: `packages/provider-embedding`.
464. C13 implements bge-m3 profile.
465. C13 implements Jina embeddings profile.
466. C13 implements deterministic embedding stub for tests.
467. Component C14: `packages/auth`.
468. C14 implements magic-link bootstrap.
469. C14 implements WebAuthn registration.
470. C14 implements WebAuthn authentication.
471. C14 implements sessions and recovery.

### §3.3 Deployment Topology

472. Deployment D1: Local developer profile.
473. D1 runs Next.js, Hono, Postgres, SQLite ledger, stub provider, and example corpus locally.
474. D1 supports fast tests.
475. Deployment D2: Pilot cloud-LLM profile.
476. D2 runs app and data stores on customer-controlled infrastructure.
477. D2 calls Anthropic cloud API through an approved egress allowlist.
478. D2 records model ID and request parameters.
479. D2 detects replay drift rather than assuming bit stability.
480. Deployment D3: Certified local replay profile.
481. D3 runs on-prem or controlled vLLM.
482. D3 pins model artifact digest.
483. D3 pins tokenizer digest.
484. D3 pins sampling implementation digest.
485. D3 pins prompt version.
486. D3 pins corpus snapshot.
487. D3 is the target for bit-equal replay acceptance.
488. Deployment D4: Air-gapped profile.
489. D4 permits no external network except optional manually staged model artifacts.
490. D4 requires local embedding and local LLM providers.
491. D4 can generate reports without outbound calls.
492. D4 can verify old ledgers offline.

### §3.4 Request Lifecycle

493. Step Q1: Operator authenticates with WebAuthn.
494. Step Q2: Browser sends query to API with session cookie.
495. Step Q3: API validates JSON request.
496. Step Q4: API records request start event in ordinary structured logs without query text.
497. Step Q5: API resolves active corpus snapshot.
498. Step Q6: Retrieval service embeds query.
499. Step Q7: Retrieval service runs dense search for top 50.
500. Step Q8: Retrieval service runs BM25 for top 50.
501. Step Q9: Retrieval service merges candidates by reciprocal-rank fusion.
502. Step Q10: Retrieval service filters candidates to active corpus snapshot.
503. Step Q11: Retrieval service computes final top-K.
504. Step Q12: Retrieval service evaluates out-of-corpus threshold.
505. Step Q13: If out of corpus, API creates refusal outcome.
506. Step Q14: If in corpus, generation service renders pinned prompt.
507. Step Q15: Generation service calls configured LLM provider.
508. Step Q16: Generation service parses claims and citations.
509. Step Q17: Citation validator checks every claim.
510. Step Q18: If validation fails, one regeneration attempt occurs.
511. Step Q19: If second validation fails, API creates blocked outcome.
512. Step Q20: If validation passes, API creates answered outcome.
513. Step Q21: Audit service canonicalizes outcome payload.
514. Step Q22: Audit service computes ledger row ID.
515. Step Q23: Audit service signs ledger row.
516. Step Q24: Audit service inserts ledger row.
517. Step Q25: API returns answer plus ledger metadata.
518. Step Q26: UI renders answer, chunks, citations, and audit row.

### §3.5 Ledger Lifecycle

519. Ledger state L1: Initialized.
520. Ledger state L2: Open for append.
521. Ledger state L3: Verification clean.
522. Ledger state L4: Verification failed.
523. Ledger state L5: Exported sealed artifact.
524. Ledger state L6: Restored from sealed artifact.
525. Ledger state L7: Retired read-only.
526. The application MUST NOT update ledger rows.
527. The application MUST NOT delete ledger rows.
528. The application MUST NOT rewrite previous hashes.
529. The application MUST NOT repair tampered rows silently.
530. The application MUST expose first invalid row on verification failure.
531. The application MUST keep ledger writes serializable.
532. The application MUST handle SQLite busy cases with bounded retry.
533. The application MUST checkpoint WAL on a documented schedule.
534. The application MUST include WAL and SHM handling in backup docs.
535. The application MUST support export to a sealed zip.
536. The application MUST support offline verification of exported ledgers.

### §3.6 Trust Boundaries

537. Boundary TB1: Browser to API.
538. TB1 uses HTTPS in production.
539. TB1 uses secure cookies.
540. TB1 validates CSRF where state-changing browser forms exist.
541. Boundary TB2: API to Postgres.
542. TB2 uses least-privilege DB users.
543. TB2 separates app schema from migration privileges.
544. Boundary TB3: API to SQLite ledger.
545. TB3 exposes append and verify operations only.
546. TB3 treats key material as deployment secret.
547. Boundary TB4: API to LLM provider.
548. TB4 is egress allowlisted.
549. TB4 records provider profile, model ID, request parameters, and provider response metadata.
550. TB4 never grants the model direct database access.
551. TB4 never grants the model direct network tools.
552. Boundary TB5: API to embedding provider.
553. TB5 is egress allowlisted.
554. TB5 records embedding provider profile and model version.
555. Boundary TB6: Ingest pipeline to source files.
556. TB6 treats documents as untrusted.
557. TB6 detects hidden text when possible.
558. TB6 extracts text in a content-neutral way.
559. TB6 records extraction warnings.
560. Boundary TB7: Report export to operator.
561. TB7 returns sealed artifacts with hashes.
562. TB7 never includes out-of-window ledger rows.

### §3.7 Architectural Decisions

563. ADR-001: Use TypeScript end to end.
564. ADR-002: Use Next.js 15 App Router for the operator console.
565. ADR-003: Use Hono for the API.
566. ADR-004: Use Postgres 16 for corpus and application data.
567. ADR-005: Use pgvector HNSW for dense search.
568. ADR-006: Use BM25 plus dense retrieval.
569. ADR-007: Use reciprocal-rank fusion.
570. ADR-008: Use SQLite WAL for the default audit ledger.
571. ADR-009: Use Ed25519 signatures for ledger rows.
572. ADR-010: Use SHA-256 over canonical JSON for row identity.
573. ADR-011: Use Typst for deterministic report rendering.
574. ADR-012: Use WebAuthn passkeys for operator login.
575. ADR-013: Use magic links only for bootstrap and recovery.
576. ADR-014: Use one corpus per v1 deployment.
577. ADR-015: Use corpus snapshots rather than destructive re-ingestion.
578. ADR-016: Use provider profiles with explicit replay capability flags.
579. ADR-017: Use deterministic provider profile for bit-equal acceptance.
580. ADR-018: Use drift detection for cloud providers without end-to-end deterministic guarantees.
581. ADR-019: Use no telemetry by default.
582. ADR-020: Use German operator UI in v1.

## §4 Data Model

### §4.1 Data Model Principles

583. Data principle DP1: Every answer-relevant artifact is versioned.
584. Data principle DP2: Every chunk belongs to exactly one corpus snapshot.
585. Data principle DP3: Corpus snapshots are immutable.
586. Data principle DP4: Document revisions are immutable.
587. Data principle DP5: Chunk text is never mutated after snapshot finalization.
588. Data principle DP6: Embeddings are tied to an embedding model version.
589. Data principle DP7: Retrieval events record both candidate sources and final chunks.
590. Data principle DP8: Claims are first-class data.
591. Data principle DP9: Citations are first-class data.
592. Data principle DP10: Ledger entries are canonicalized before hashing.
593. Data principle DP11: Ledger rows are signed after hashing.
594. Data principle DP12: Ordinary logs hold operational metadata only.
595. Data principle DP13: PII-bearing mappings are separated from immutable audit history.
596. Data principle DP14: Deletion tombstones preserve audit continuity.
597. Data principle DP15: Report artifacts are deterministic and hash-addressable.

### §4.2 Core Entity List

598. Entity E1: `operator`.
599. Entity E2: `operator_identity`.
600. Entity E3: `webauthn_credential`.
601. Entity E4: `session`.
602. Entity E5: `magic_link_challenge`.
603. Entity E6: `corpus`.
604. Entity E7: `corpus_snapshot`.
605. Entity E8: `source_document`.
606. Entity E9: `document_revision`.
607. Entity E10: `document_page`.
608. Entity E11: `chunk`.
609. Entity E12: `chunk_embedding`.
610. Entity E13: `bm25_term`.
611. Entity E14: `retrieval_trace`.
612. Entity E15: `generation_trace`.
613. Entity E16: `claim`.
614. Entity E17: `claim_citation`.
615. Entity E18: `prompt_template`.
616. Entity E19: `provider_profile`.
617. Entity E20: `model_artifact`.
618. Entity E21: `embedding_model_artifact`.
619. Entity E22: `eval_golden_set`.
620. Entity E23: `eval_case`.
621. Entity E24: `eval_run`.
622. Entity E25: `eval_result`.
623. Entity E26: `report_window`.
624. Entity E27: `report_artifact`.
625. Entity E28: `audit_ledger_entry`.
626. Entity E29: `audit_export`.
627. Entity E30: `operator_deletion_tombstone`.

### §4.3 Operator Tables

628. Table `operators` stores internal operator IDs.
629. Column `operators.id` is UUID.
630. Column `operators.created_at` is timestamptz.
631. Column `operators.status` is enum `active`, `disabled`, `deleted`.
632. Column `operators.display_name` is nullable text.
633. Column `operators.locale` defaults to `de-DE`.
634. Column `operators.role` is enum `operator`, `auditor`, `admin`.
635. Table `operator_identities` stores email mapping.
636. Column `operator_identities.operator_id` references `operators.id`.
637. Column `operator_identities.email_hash` stores normalized email hash.
638. Column `operator_identities.email_encrypted` stores encrypted email where recovery is enabled.
639. Column `operator_identities.deleted_at` is nullable.
640. Column `operator_identities.tombstone_hash` is nullable.
641. Table `webauthn_credentials` stores passkey credentials.
642. Column `webauthn_credentials.id` is UUID.
643. Column `webauthn_credentials.operator_id` references `operators.id`.
644. Column `webauthn_credentials.credential_id` is unique bytea.
645. Column `webauthn_credentials.public_key` is bytea.
646. Column `webauthn_credentials.sign_count` is bigint.
647. Column `webauthn_credentials.transports` is jsonb.
648. Column `webauthn_credentials.backup_eligible` is boolean.
649. Column `webauthn_credentials.backup_state` is boolean.
650. Column `webauthn_credentials.created_at` is timestamptz.
651. Column `webauthn_credentials.last_used_at` is nullable timestamptz.
652. Table `sessions` stores active sessions.
653. Column `sessions.id` is UUID.
654. Column `sessions.operator_id` references `operators.id`.
655. Column `sessions.created_at` is timestamptz.
656. Column `sessions.last_seen_at` is timestamptz.
657. Column `sessions.expires_at` is timestamptz.
658. Column `sessions.absolute_expires_at` is timestamptz.
659. Column `sessions.user_agent_hash` is text.
660. Column `sessions.ip_hash` is text.
661. Table `magic_link_challenges` stores recovery challenges.
662. Column `magic_link_challenges.id` is UUID.
663. Column `magic_link_challenges.email_hash` is text.
664. Column `magic_link_challenges.challenge_hash` is text.
665. Column `magic_link_challenges.expires_at` is timestamptz.
666. Column `magic_link_challenges.consumed_at` is nullable timestamptz.
667. Column `magic_link_challenges.created_ip_hash` is text.

### §4.4 Corpus Tables

668. Table `corpora` stores the single configured corpus.
669. Column `corpora.id` is UUID.
670. Column `corpora.slug` is unique text.
671. Column `corpora.display_name` is text.
672. Column `corpora.created_at` is timestamptz.
673. Column `corpora.active_snapshot_id` references `corpus_snapshots.id`.
674. Table `corpus_snapshots` stores immutable corpus versions.
675. Column `corpus_snapshots.id` is UUID.
676. Column `corpus_snapshots.corpus_id` references `corpora.id`.
677. Column `corpus_snapshots.sequence` is integer.
678. Column `corpus_snapshots.snapshot_hash` is text.
679. Column `corpus_snapshots.embedding_model_version` is text.
680. Column `corpus_snapshots.chunker_version` is text.
681. Column `corpus_snapshots.created_at` is timestamptz.
682. Column `corpus_snapshots.finalized_at` is nullable timestamptz.
683. Column `corpus_snapshots.status` is enum `building`, `active`, `retired`, `failed`.
684. Table `source_documents` stores logical source docs.
685. Column `source_documents.id` is UUID.
686. Column `source_documents.corpus_id` references `corpora.id`.
687. Column `source_documents.path` is text.
688. Column `source_documents.title` is nullable text.
689. Column `source_documents.source_type` is enum `pdf`, `docx`, `markdown`.
690. Column `source_documents.created_at` is timestamptz.
691. Table `document_revisions` stores immutable source revisions.
692. Column `document_revisions.id` is UUID.
693. Column `document_revisions.source_document_id` references `source_documents.id`.
694. Column `document_revisions.corpus_snapshot_id` references `corpus_snapshots.id`.
695. Column `document_revisions.content_sha256` is text.
696. Column `document_revisions.extracted_text_sha256` is text.
697. Column `document_revisions.extraction_version` is text.
698. Column `document_revisions.ocr_used` is boolean.
699. Column `document_revisions.extraction_warnings` is jsonb.
700. Column `document_revisions.byte_size` is bigint.
701. Column `document_revisions.created_at` is timestamptz.
702. Table `document_pages` stores page-level source mapping.
703. Column `document_pages.id` is UUID.
704. Column `document_pages.document_revision_id` references `document_revisions.id`.
705. Column `document_pages.page_number` is integer.
706. Column `document_pages.text` is text.
707. Column `document_pages.text_sha256` is text.
708. Column `document_pages.char_count` is integer.

### §4.5 Chunk Tables

709. Table `chunks` stores immutable text chunks.
710. Column `chunks.id` is UUID.
711. Column `chunks.chunk_id` is stable text.
712. Column `chunks.corpus_snapshot_id` references `corpus_snapshots.id`.
713. Column `chunks.document_revision_id` references `document_revisions.id`.
714. Column `chunks.page_start` is integer.
715. Column `chunks.page_end` is integer.
716. Column `chunks.char_start` is integer.
717. Column `chunks.char_end` is integer.
718. Column `chunks.token_start` is integer.
719. Column `chunks.token_end` is integer.
720. Column `chunks.chunk_index` is integer.
721. Column `chunks.chunk_text` is text.
722. Column `chunks.chunk_sha256` is text.
723. Column `chunks.chunker_version` is text.
724. Column `chunks.created_at` is timestamptz.
725. Unique key: `(corpus_snapshot_id, chunk_id)`.
726. Table `chunk_embeddings` stores dense vectors.
727. Column `chunk_embeddings.id` is UUID.
728. Column `chunk_embeddings.chunk_id` references `chunks.id`.
729. Column `chunk_embeddings.embedding_model_version` is text.
730. Column `chunk_embeddings.embedding_dim` is integer.
731. Column `chunk_embeddings.embedding` is `vector(1024)` for bge-m3.
732. Column `chunk_embeddings.embedding_sha256` is text.
733. Column `chunk_embeddings.created_at` is timestamptz.
734. Unique key: `(chunk_id, embedding_model_version)`.
735. Index `idx_chunk_embeddings_hnsw_cosine` uses HNSW cosine ops.
736. HNSW option `m` defaults to 16.
737. HNSW option `ef_construction` defaults to 128 for v1 target recall.
738. Query-time `hnsw.ef_search` defaults to 100.
739. The implementation MAY tune `ef_search` by corpus size after measurement.
740. Table `chunk_access_labels` is reserved for v1 internal use.
741. Column `chunk_access_labels.chunk_id` references `chunks.id`.
742. Column `chunk_access_labels.label` is text.
743. v1 sets all chunks to the single deployment label.
744. The table exists to prevent schema churn when v2 introduces richer access controls.

### §4.6 Prompt and Provider Tables

745. Table `prompt_templates` stores prompt metadata.
746. Column `prompt_templates.id` is UUID.
747. Column `prompt_templates.family` is text.
748. Column `prompt_templates.version` is semver text.
749. Column `prompt_templates.path` is text.
750. Column `prompt_templates.template_sha256` is text.
751. Column `prompt_templates.created_at` is timestamptz.
752. Column `prompt_templates.retired_at` is nullable timestamptz.
753. Unique key: `(family, version)`.
754. Table `provider_profiles` stores provider configuration fingerprints.
755. Column `provider_profiles.id` is UUID.
756. Column `provider_profiles.kind` is enum `llm`, `embedding`.
757. Column `provider_profiles.name` is text.
758. Column `provider_profiles.model_id` is text.
759. Column `provider_profiles.model_version` is text.
760. Column `provider_profiles.endpoint_kind` is enum `anthropic_cloud`, `openai_compatible`, `local_stub`, `local_embedding`.
761. Column `provider_profiles.replay_capability` is enum `bit_equal`, `drift_detect_only`, `unsupported`.
762. Column `provider_profiles.config_sha256` is text.
763. Column `provider_profiles.created_at` is timestamptz.
764. Column `provider_profiles.retired_at` is nullable timestamptz.
765. Table `model_artifacts` stores local model artifacts where available.
766. Column `model_artifacts.id` is UUID.
767. Column `model_artifacts.provider_profile_id` references `provider_profiles.id`.
768. Column `model_artifacts.artifact_kind` is enum `weights`, `tokenizer`, `sampling_runtime`, `server_image`, `safety_config`.
769. Column `model_artifacts.uri` is text.
770. Column `model_artifacts.sha256` is text.
771. Column `model_artifacts.created_at` is timestamptz.
772. Cloud providers MAY have metadata rows without local artifact URIs.
773. Local replay-capable providers MUST have local artifact digest rows.

### §4.7 Retrieval Trace Tables

774. Table `retrieval_traces` stores pre-ledger retrieval details.
775. Column `retrieval_traces.id` is UUID.
776. Column `retrieval_traces.query_hash` is text.
777. Column `retrieval_traces.corpus_snapshot_id` references `corpus_snapshots.id`.
778. Column `retrieval_traces.embedding_model_version` is text.
779. Column `retrieval_traces.top_k` is integer.
780. Column `retrieval_traces.vector_candidates` is jsonb.
781. Column `retrieval_traces.bm25_candidates` is jsonb.
782. Column `retrieval_traces.rrf_candidates` is jsonb.
783. Column `retrieval_traces.final_chunks` is jsonb.
784. Column `retrieval_traces.min_relevance_score` is numeric.
785. Column `retrieval_traces.out_of_corpus` is boolean.
786. Column `retrieval_traces.created_at` is timestamptz.
787. Retrieval traces MAY be copied into the ledger row payload.
788. Retrieval traces MUST NOT be trusted as immutable unless ledgered.

### §4.8 Generation and Claim Tables

789. Table `generation_traces` stores generation metadata before ledger append.
790. Column `generation_traces.id` is UUID.
791. Column `generation_traces.retrieval_trace_id` references `retrieval_traces.id`.
792. Column `generation_traces.prompt_template_id` references `prompt_templates.id`.
793. Column `generation_traces.llm_provider_profile_id` references `provider_profiles.id`.
794. Column `generation_traces.seed` is integer.
795. Column `generation_traces.temperature` is numeric.
796. Column `generation_traces.request_sha256` is text.
797. Column `generation_traces.response_sha256` is text.
798. Column `generation_traces.provider_response_metadata` is jsonb.
799. Column `generation_traces.validation_status` is enum `valid`, `regenerated_valid`, `blocked_uncited`, `refused_out_of_corpus`, `provider_error`.
800. Column `generation_traces.created_at` is timestamptz.
801. Table `claims` stores parsed answer claims.
802. Column `claims.id` is UUID.
803. Column `claims.generation_trace_id` references `generation_traces.id`.
804. Column `claims.claim_index` is integer.
805. Column `claims.claim_text` is text.
806. Column `claims.claim_sha256` is text.
807. Column `claims.validation_status` is enum `valid`, `missing_citation`, `invalid_chunk`, `weak_support`.
808. Table `claim_citations` stores claim-to-chunk links.
809. Column `claim_citations.id` is UUID.
810. Column `claim_citations.claim_id` references `claims.id`.
811. Column `claim_citations.chunk_id` references `chunks.id`.
812. Column `claim_citations.citation_role` is enum `primary`, `supporting`, `contradiction`.
813. Column `claim_citations.extracted_marker` is text.
814. Unique key: `(claim_id, chunk_id, citation_role)`.

### §4.9 Audit Ledger Schema

815. Table `audit_ledger_entries` exists in SQLite.
816. Column `id` is BLOB primary key.
817. Column `prev_hash` is BLOB.
818. Column `sequence` is integer unique not null.
819. Column `entry_type` is text not null.
820. Column `outcome` is text not null.
821. Column `canonical_payload` is text not null.
822. Column `query` is encrypted text where deployment policy allows content replay.
823. Column `query_sha256` is text not null.
824. Column `retrieved_chunks` is JSON text.
825. Column `generated_answer` is encrypted text where deployment policy allows content replay.
826. Column `generated_answer_sha256` is text.
827. Column `claim_citations` is JSON text.
828. Column `model_version` is text.
829. Column `prompt_version` is text.
830. Column `embedding_model_version` is text.
831. Column `provider_profile_id` is text.
832. Column `provider_replay_capability` is text.
833. Column `seed` is integer.
834. Column `temperature` is numeric.
835. Column `corpus_snapshot_id` is text.
836. Column `corpus_snapshot_hash` is text.
837. Column `timestamp_ms` is integer.
838. Column `user_id` is text.
839. Column `user_id_hash` is text.
840. Column `signature` is BLOB.
841. Column `signature_key_id` is text.
842. Column `created_at` is integer.
843. Row ID formula is `SHA256(prev_hash || canonical_json(rest_without_signature))`.
844. Canonical JSON MUST be stable across Node versions.
845. Canonical JSON MUST sort object keys lexicographically.
846. Canonical JSON MUST preserve array order.
847. Canonical JSON MUST serialize timestamps as integer milliseconds.
848. Canonical JSON MUST serialize decimal values as strings when precision matters.
849. Canonical JSON MUST reject undefined.
850. Canonical JSON MUST reject non-finite numbers.
851. Ledger payload MUST include enough metadata to verify artifact drift.
852. Ledger payload MUST include outcome for refused and blocked paths.
853. Ledger payload MUST include validation errors when output is blocked.
854. Ledger payload MUST include report-generation events.
855. Ledger payload MUST include replay events.

### §4.10 Eval Tables and Files

856. Golden set files live under `eval/golden/`.
857. File format is JSONL.
858. JSONL field `id` is stable text.
859. JSONL field `question` is text.
860. JSONL field `expected_outcome` is enum `answered`, `refused-out-of-corpus`, `blocked-unsafe`.
861. JSONL field `expected_chunks` is optional array of chunk IDs.
862. JSONL field `must_cite` is optional array of source references.
863. JSONL field `must_not_claim` is optional array of strings or regex descriptors.
864. JSONL field `tags` is array.
865. Allowed tags include `ambiguous`.
866. Allowed tags include `out-of-corpus`.
867. Allowed tags include `contradictory`.
868. Allowed tags include `multi-hop`.
869. Allowed tags include `numerical`.
870. Allowed tags include `prompt-injection`.
871. Allowed tags include `hidden-text`.
872. Allowed tags include `pii`.
873. Allowed tags include `stale-corpus`.
874. Table `eval_runs` stores run metadata.
875. Column `eval_runs.id` is UUID.
876. Column `eval_runs.golden_set_version` is text.
877. Column `eval_runs.corpus_snapshot_id` is text.
878. Column `eval_runs.prompt_version` is text.
879. Column `eval_runs.provider_profile_id` is text.
880. Column `eval_runs.started_at` is timestamptz.
881. Column `eval_runs.completed_at` is nullable timestamptz.
882. Column `eval_runs.status` is enum `running`, `passed`, `failed`, `error`.
883. Column `eval_runs.groundedness` is numeric.
884. Column `eval_runs.citation_accuracy` is numeric.
885. Column `eval_runs.refusal_correctness` is numeric.
886. Column `eval_runs.per_tag_breakdown` is jsonb.
887. Table `eval_results` stores per-case outcomes.
888. Column `eval_results.eval_run_id` references `eval_runs.id`.
889. Column `eval_results.case_id` is text.
890. Column `eval_results.outcome` is text.
891. Column `eval_results.score_payload` is jsonb.
892. Column `eval_results.failure_reason` is nullable text.

### §4.11 Report Artifacts

893. Table `report_artifacts` stores generated report metadata.
894. Column `report_artifacts.id` is UUID.
895. Column `report_artifacts.report_kind` is `eu-ai-act-50`.
896. Column `report_artifacts.since_ms` is integer.
897. Column `report_artifacts.until_ms` is integer.
898. Column `report_artifacts.template_version` is text.
899. Column `report_artifacts.ledger_start_sequence` is integer.
900. Column `report_artifacts.ledger_end_sequence` is integer.
901. Column `report_artifacts.pdf_sha256` is text.
902. Column `report_artifacts.json_sha256` is text.
903. Column `report_artifacts.audit_excerpt_zip_sha256` is text.
904. Column `report_artifacts.bundle_sha256` is text.
905. Column `report_artifacts.generated_by_user_id` is text.
906. Column `report_artifacts.generated_at` is timestamptz.
907. A report generation event MUST be written to the audit ledger.
908. Report artifacts MUST be reproducible for identical inputs.
909. Report artifacts MUST include source references and limitations.
910. Report artifacts MUST not include rows outside the requested time window.

## §5 APIs, CLIs, Events, and Contracts

### §5.1 API Principles

911. API principle AP1: All API inputs are schema validated.
912. API principle AP2: All API errors are structured.
913. API principle AP3: All state-changing routes require authentication.
914. API principle AP4: All query routes require an operator session.
915. API principle AP5: No API route accepts passwords.
916. API principle AP6: No API route exposes raw ledger private keys.
917. API principle AP7: No API route returns unvalidated model output.
918. API principle AP8: API responses distinguish refusal, validation block, provider error, replay drift, and success.
919. API principle AP9: UI-facing APIs return German display messages plus stable machine codes.
920. API principle AP10: Developer APIs return stable JSON contracts.

### §5.2 Authentication APIs

921. `POST /api/auth/magic-link/request` requests bootstrap or recovery.
922. Request field `email` is required.
923. Response field `status` is `accepted`.
924. The route always returns generic success to prevent email enumeration.
925. The route rate-limits by email hash.
926. The route rate-limits by IP hash.
927. `POST /api/auth/magic-link/consume` consumes a token.
928. Request field `token` is required.
929. Response field `webauthn_registration_required` is boolean.
930. `POST /api/auth/webauthn/register/options` returns creation options.
931. `POST /api/auth/webauthn/register/verify` verifies registration response.
932. `POST /api/auth/webauthn/login/options` returns request options.
933. `POST /api/auth/webauthn/login/verify` verifies assertion response.
934. `POST /api/auth/logout` terminates session.
935. `GET /api/auth/session` returns session summary.
936. Session summary MUST NOT return email unless operator identity exists and user has permission.
937. WebAuthn RP ID MUST match deployment host.
938. WebAuthn operations MUST use HTTPS or equivalent secure context in production.

### §5.3 Corpus APIs

939. `GET /api/corpus` returns active corpus summary.
940. `GET /api/corpus/snapshots` returns snapshot list.
941. `GET /api/corpus/snapshots/:id` returns snapshot metadata.
942. `GET /api/documents/:documentId` returns document metadata.
943. `GET /api/documents/:documentId/pages/:page` returns page text and rendering metadata.
944. `GET /api/chunks/:chunkId` returns chunk metadata and text for authorized operators.
945. `GET /api/chunks/:chunkId/source` returns source document locator.
946. Source routes MUST enforce session authorization.
947. Source routes MUST check active or replay snapshot context.
948. Source routes MUST not expose files outside corpus root.

### §5.4 Query APIs

949. `POST /api/query` executes an operator query.
950. Request field `query` is required text.
951. Request field `top_k` is optional integer 1 through 20.
952. Request field `corpus_snapshot_id` is optional and defaults to active snapshot.
953. Request field `provider_profile_id` is optional and defaults to deployment profile.
954. Request field `report_context` is forbidden.
955. Response field `query_id` is stable text.
956. Response field `ledger_entry_id` is hex string.
957. Response field `outcome` is enum.
958. Response field `answer` is present only on answered outcomes.
959. Response field `claims` lists claim IDs, text, and citations.
960. Response field `retrieved_chunks` lists chunk metadata.
961. Response field `audit` lists sequence, row hash, previous hash, and signature key ID.
962. Response field `operator_message_de` is German display copy.
963. Out-of-corpus response uses `outcome=refused-out-of-corpus`.
964. Blocked uncited response uses `outcome=blocked-uncited`.
965. Provider error response uses `outcome=provider-error`.
966. The route MUST ledger refused outcomes.
967. The route MUST ledger blocked outcomes.
968. The route MUST ledger answered outcomes.
969. The route MUST NOT return if ledger append fails.
970. The route MUST NOT return uncited claims.

### §5.5 Replay APIs

971. `POST /api/replay/:ledgerEntryId` starts replay.
972. Response field `replay_id` is UUID.
973. Response field `status` is `queued`, `running`, `passed`, `drift`, `unsupported`, or `error`.
974. `GET /api/replay/:replayId` returns replay result.
975. Replay result field `original_ledger_entry_id` is hex string.
976. Replay result field `provider_replay_capability` is enum.
977. Replay result field `byte_equal` is boolean when applicable.
978. Replay result field `drift_artifact` is nullable enum.
979. Drift artifact values include `prompt`, `model`, `embedding_model`, `corpus_snapshot`, `provider_infrastructure`, `unknown`.
980. Replay result field `diff_summary` is nullable.
981. Replay result field `operator_message_de` is German copy.
982. Replay MUST create a ledger entry for pass, drift, unsupported, or error.
983. Replay MUST never overwrite the original entry.
984. Replay MUST never silently accept a non-byte-equal cloud result.

### §5.6 Eval APIs

985. `GET /api/eval/latest` returns latest eval summary.
986. `GET /api/eval/runs` returns eval run list.
987. `GET /api/eval/runs/:id` returns per-case details.
988. `POST /api/eval/runs` starts an eval run for admin users.
989. Eval APIs MUST not expose golden answer secrets beyond authorized users.
990. Eval APIs MUST show threshold failures clearly.
991. Eval APIs MUST show per-tag breakdowns.
992. Eval APIs MUST show exact prompt, corpus, model, and embedding versions.

### §5.7 Report APIs

993. `POST /api/reports/eu-ai-act-50` generates a report.
994. Request field `since` is required ISO timestamp.
995. Request field `until` is required ISO timestamp.
996. Request field `include_appendices` defaults to true.
997. Response field `report_id` is UUID.
998. Response field `bundle_sha256` is text.
999. Response field `download_url` is relative URL.
1000. `GET /api/reports/:id` returns report metadata.
1001. `GET /api/reports/:id/download` downloads sealed zip.
1002. Report APIs MUST enforce time-window boundaries.
1003. Report APIs MUST be deterministic for same inputs.
1004. Report APIs MUST ledger report generation.

### §5.8 Admin and Health APIs

1005. `GET /api/health/live` returns liveness.
1006. `GET /api/health/ready` returns readiness.
1007. Readiness checks Postgres.
1008. Readiness checks ledger write path with non-mutating or test append mode.
1009. Readiness checks provider profile configuration.
1010. Readiness checks active corpus snapshot.
1011. `GET /api/admin/config` returns redacted configuration.
1012. `POST /api/admin/operator/:id/disable` disables operator.
1013. `POST /api/admin/operator/:id/delete` tombstones operator identity.
1014. Admin APIs require admin role.
1015. Admin APIs MUST ledger security-relevant changes.

### §5.9 CLI Commands

1016. `pnpm ingest --corpus <dir>` ingests corpus files.
1017. `pnpm ingest --corpus <dir> --dry-run` estimates work without writing.
1018. `pnpm ingest --corpus <dir> --snapshot-name <name>` labels snapshot.
1019. `pnpm audit:verify --ledger <path>` verifies hash chain and signatures.
1020. `pnpm audit:export --since <ISO> --until <ISO> --out <dir>` exports sealed ledger excerpt.
1021. `pnpm audit:replay --ledger <path> --entry <id>` replays a ledger row.
1022. `pnpm eval` runs latest golden set.
1023. `pnpm eval --golden <path>` runs named golden set.
1024. `pnpm report --format=eu-ai-act-50 --since <ISO> --until <ISO> --out <dir>` generates report.
1025. `pnpm check:full` runs all gates.
1026. CLI commands MUST return non-zero on failed verification.
1027. CLI commands MUST write machine-readable JSON with `--json`.
1028. CLI commands MUST avoid leaking query content in default stdout unless explicitly requested.

### §5.10 Event Types

1029. Event `operator.login.success` is ledgered.
1030. Event `operator.login.failure` is logged with redaction and rate-limit metadata.
1031. Event `operator.logout` is ledgered.
1032. Event `corpus.ingest.started` is ledgered.
1033. Event `corpus.ingest.completed` is ledgered.
1034. Event `corpus.ingest.failed` is ledgered.
1035. Event `query.received` is logged but not necessarily ledgered before outcome.
1036. Event `query.answered` is ledgered.
1037. Event `query.refused_out_of_corpus` is ledgered.
1038. Event `query.blocked_uncited` is ledgered.
1039. Event `query.provider_error` is ledgered.
1040. Event `replay.started` is ledgered.
1041. Event `replay.passed` is ledgered.
1042. Event `replay.drift` is ledgered.
1043. Event `replay.unsupported` is ledgered.
1044. Event `eval.run.completed` is ledgered.
1045. Event `report.generated` is ledgered.
1046. Event `operator.identity.deleted` is ledgered.
1047. Event `ledger.exported` is ledgered.

## §6 Core Workflows

### §6.1 Ingestion Workflow

1048. Ingestion starts from a configured filesystem directory.
1049. The directory path is resolved before use.
1050. The resolved path must remain inside the configured corpus root.
1051. Supported extension `.pdf` maps to PDF extractor.
1052. Supported extension `.docx` maps to DOCX extractor.
1053. Supported extension `.md` maps to Markdown extractor.
1054. Unsupported files are skipped with a warning.
1055. Dry run reports document count.
1056. Dry run reports changed document count.
1057. Dry run reports estimated chunk count.
1058. Dry run reports embedding model.
1059. Dry run reports estimated vector index size.
1060. Dry run writes no database rows.
1061. Normal run computes raw file SHA-256.
1062. Normal run compares against previous document revisions.
1063. Unchanged files are no-ops.
1064. Changed files create new document revisions.
1065. Any changed file creates a new corpus snapshot.
1066. Snapshot finalization happens only after all chunks and embeddings are written.
1067. Failed snapshots are not activated.
1068. Successful snapshots become active only after index checks pass.
1069. Previous snapshots remain queryable for replay.
1070. Extraction warnings are stored.
1071. Hidden text findings are stored.
1072. OCR use is stored.
1073. Extraction version is stored.
1074. Chunker version is stored.
1075. Embedding model version is stored.

### §6.2 Chunking Workflow

1076. Default chunk window is 800 tokens.
1077. Default overlap is 100 tokens.
1078. Chunk boundaries preserve page and character offsets.
1079. Chunk IDs are deterministic from snapshot, document revision, page span, offset span, and chunk hash.
1080. Chunk text is normalized deterministically.
1081. Chunk text normalization preserves legal numbering.
1082. Chunk text normalization preserves table context when extracted as text.
1083. Chunk text normalization removes extractor control characters.
1084. Chunk text normalization records warnings when text is suspicious.
1085. Scanned PDF OCR output is marked.
1086. Low-confidence OCR chunks are tagged.
1087. Empty chunks are discarded.
1088. Duplicate chunks within one document are stored once with location references where safe.
1089. Duplicate chunks across documents are not merged in v1 because provenance matters.
1090. Chunker tests use fixture PDFs, DOCX, Markdown, tables, and OCR.

### §6.3 Retrieval Workflow

1091. Retrieval embeds the query with the active embedding profile.
1092. Retrieval runs dense search filtered by corpus snapshot.
1093. Dense search requests top 50 candidates.
1094. Retrieval runs BM25 filtered by corpus snapshot.
1095. BM25 requests top 50 candidates.
1096. Retrieval merges candidates by reciprocal-rank fusion.
1097. Final top-K defaults to 8.
1098. Final top-K is configurable per query from 1 through 20.
1099. Retrieved chunks include `chunk_id`.
1100. Retrieved chunks include `doc_id`.
1101. Retrieved chunks include `source_document_id`.
1102. Retrieved chunks include `page_start`.
1103. Retrieved chunks include `page_end`.
1104. Retrieved chunks include `char_start`.
1105. Retrieved chunks include `char_end`.
1106. Retrieved chunks include `retrieval_score`.
1107. Retrieved chunks include `retrieval_method`.
1108. Retrieved chunks include `corpus_snapshot_id`.
1109. Retrieval never crosses corpus snapshots.
1110. Retrieval records vector candidates.
1111. Retrieval records BM25 candidates.
1112. Retrieval records merged ranking.
1113. Retrieval records final selected chunks.
1114. Out-of-corpus threshold is triggered when all top-K relevance scores are below 0.3.
1115. Threshold is configurable but default must be tested.
1116. Out-of-corpus path returns refusal without generation.
1117. Out-of-corpus path is ledgered.
1118. Retrieval rejects unbounded top-K.
1119. Retrieval applies query-time timeouts.
1120. Retrieval applies request-size limits.

### §6.4 Generation Workflow

1121. Generation starts only after retrieval passes the out-of-corpus threshold.
1122. Prompt template is selected by configured prompt version.
1123. Prompt template contains system instructions.
1124. Prompt template contains the user question.
1125. Prompt template contains retrieved chunk payloads.
1126. Prompt template requires claim markers.
1127. Prompt template requires `[chunk:<chunk_id>]` markers.
1128. Prompt template forbids unsupported claims.
1129. Prompt template instructs refusal if evidence is insufficient.
1130. Prompt template does not contain credentials.
1131. Prompt template does not contain database names.
1132. Prompt template does not contain permission structure details.
1133. Prompt rendering is deterministic.
1134. LLM call uses `temperature=0`.
1135. LLM call uses fixed seed where provider supports seed.
1136. LLM call records absence of seed support where provider does not.
1137. LLM call records provider model ID.
1138. LLM call records request parameters.
1139. LLM call records provider response metadata.
1140. Raw model output is parsed before return.
1141. Parser extracts claims.
1142. Parser extracts citations.
1143. Parser rejects malformed citation syntax.
1144. Parser rejects citations to non-retrieved chunks.
1145. Parser rejects empty answer on answered outcome.

### §6.5 Citation Validation Workflow

1146. Every claim must have at least one citation.
1147. Every citation must reference a retrieved chunk.
1148. Every cited chunk must belong to the query corpus snapshot.
1149. Every citation must map to chunk text available in storage.
1150. Validator checks missing citations.
1151. Validator checks invalid chunk IDs.
1152. Validator checks duplicate markers.
1153. Validator checks claims with only introduction text where possible.
1154. Validator emits structured errors.
1155. Validator never relies on LLM self-attestation.
1156. First validation failure triggers one regeneration.
1157. Regeneration prompt includes validator feedback.
1158. Second validation failure becomes `blocked-uncited`.
1159. Blocked result is ledgered.
1160. Blocked result is shown to operator in German.
1161. Operator sees that no answer was returned because citation contract failed.
1162. Operator sees retrieved chunks for inspection.
1163. Operator does not see an uncited generated answer as final.
1164. Admins may inspect blocked raw output only behind a debug permission and audited access.

### §6.6 Audit Ledger Workflow

1165. Query outcomes always create ledger rows.
1166. Report generation creates ledger rows.
1167. Replay outcomes create ledger rows.
1168. Security-relevant admin actions create ledger rows.
1169. Ledger append builds canonical payload.
1170. Ledger append reads previous hash.
1171. Ledger append computes row hash.
1172. Ledger append signs row hash and payload digest.
1173. Ledger append inserts in one transaction.
1174. Ledger append returns sequence and hash.
1175. Ledger append failure aborts the API response.
1176. Ledger verification walks sequence order.
1177. Ledger verification recomputes hashes.
1178. Ledger verification checks previous-hash linkage.
1179. Ledger verification checks signatures.
1180. Ledger verification reports first failure.
1181. Ledger export includes SQLite file.
1182. Ledger export includes signature file.
1183. Ledger export includes manifest JSON.
1184. Ledger export includes report of verification result.
1185. Ledger export includes key ID.
1186. Ledger export excludes private key material.

### §6.7 Replay Workflow

1187. Replay loads the original ledger row.
1188. Replay resolves corpus snapshot.
1189. Replay resolves prompt template version.
1190. Replay resolves embedding model version.
1191. Replay resolves LLM provider profile.
1192. Replay resolves local model artifacts when applicable.
1193. Replay checks provider replay capability.
1194. If provider capability is `unsupported`, replay returns `replay-unsupported`.
1195. If provider capability is `drift_detect_only`, replay attempts re-execution and compares bytes.
1196. If bytes match, replay returns pass with caveat.
1197. If bytes differ, replay returns drift.
1198. If provider capability is `bit_equal`, replay must produce byte equality or named drift.
1199. Replay names prompt drift when template hash differs.
1200. Replay names corpus drift when snapshot hash differs.
1201. Replay names embedding drift when embedding model artifact differs.
1202. Replay names model drift when model artifact differs.
1203. Replay names provider infrastructure drift when only provider metadata changed or bytes differ without local artifact drift.
1204. Replay writes a new ledger row.
1205. Replay never changes the original ledger row.
1206. Replay result UI shows pass, drift, unsupported, or error.

### §6.8 Evaluation Workflow

1207. Eval loads golden set from JSONL.
1208. Eval fails on empty golden set.
1209. Eval pins corpus snapshot.
1210. Eval pins prompt version.
1211. Eval pins provider profile.
1212. Eval runs every case.
1213. Eval records case outcome.
1214. Eval scores groundedness.
1215. Eval scores citation accuracy.
1216. Eval scores refusal correctness.
1217. Eval computes per-tag metrics.
1218. Eval fails when groundedness is below 0.95.
1219. Eval fails when citation accuracy is below 0.95.
1220. Eval fails when refusal correctness is below 0.90.
1221. Eval writes machine-readable results.
1222. Eval dashboard shows latest run.
1223. Eval dashboard shows trend.
1224. Eval dashboard shows failing cases.
1225. Eval is part of `pnpm check:full`.
1226. Eval can run with deterministic stub provider in CI.

### §6.9 Report Workflow

1227. Operator selects report view.
1228. Operator selects since timestamp.
1229. Operator selects until timestamp.
1230. API validates timestamp order.
1231. API queries ledger rows within window only.
1232. API computes query volume.
1233. API computes outcome breakdown.
1234. API computes refusal rate.
1235. API reads latest eval score at or before window end.
1236. API records model versions used.
1237. API records prompt versions used.
1238. API records embedding versions used.
1239. API records corpus snapshots used.
1240. API builds disclosure JSON.
1241. API renders Typst PDF.
1242. API exports audit excerpt zip.
1243. API computes artifact hashes.
1244. API creates final bundle zip.
1245. API writes report ledger entry.
1246. UI exposes bundle download.
1247. Rerunning same report over same ledger produces byte-identical PDF.
1248. Rerunning same report over same ledger produces byte-identical JSON.
1249. Rerunning same report over same ledger produces byte-identical bundle manifest.

## §7 UI and Interaction Design

### §7.1 UI Principles

1250. UI principle UI1: German is the only complete v1 UI locale.
1251. UI principle UI2: The console is operational, not marketing.
1252. UI principle UI3: The UI must expose evidence close to the answer.
1253. UI principle UI4: Citation pills must be visible inline.
1254. UI principle UI5: Audit rows must be visible without opening developer tools.
1255. UI principle UI6: Replay status must be explicit.
1256. UI principle UI7: Refusal must look like a valid system outcome.
1257. UI principle UI8: Validation blocks must be understandable to non-engineers.
1258. UI principle UI9: Operator controls must be keyboard accessible.
1259. UI principle UI10: The UI must not use third-party analytics.
1260. UI principle UI11: The UI must not load third-party scripts.
1261. UI principle UI12: The UI must avoid hidden critical state.

### §7.2 Routes

1262. Route `/auth/operator` handles operator authentication.
1263. Route `/auth/recovery` handles recovery magic link consumption.
1264. Route `/console` is the main query workspace.
1265. Route `/console/history` lists ledger-backed query history.
1266. Route `/console/history/:entryId` shows one ledger entry.
1267. Route `/console/eval` shows eval dashboard.
1268. Route `/console/reports` shows report generator.
1269. Route `/console/reports/:reportId` shows report metadata.
1270. Route `/console/admin` shows admin tools for authorized admins.
1271. Route `/source/:documentId/page/:page` opens source view.
1272. Route `/health` MAY show human-readable health for operators.

### §7.3 Authentication Screens

1273. Login screen headline is German.
1274. Login screen explains that this is an AI system at first interaction.
1275. Login screen asks for email only during bootstrap or recovery.
1276. Login screen never shows password field.
1277. Passkey screen uses browser WebAuthn ceremony.
1278. Passkey screen reports unsupported browser clearly.
1279. Recovery screen reports generic token acceptance.
1280. Rate-limit errors are generic.
1281. Session-expired state returns user to login with clear German message.
1282. Successful login lands on `/console`.

### §7.4 Query Workspace

1283. Query workspace has a persistent query input.
1284. Query input supports multi-line text.
1285. Query input has German placeholder copy.
1286. Query input has submit button with loading state.
1287. Query input shows active corpus snapshot.
1288. Query input shows provider profile label.
1289. Query input shows top-K control for authorized operators.
1290. Query workspace has answer panel.
1291. Answer panel renders claims as separate paragraphs or list items.
1292. Claim text contains inline citation pills.
1293. Citation pills show chunk ID short form.
1294. Citation pills are keyboard focusable.
1295. Citation pills open chunk preview.
1296. Query workspace has retrieved chunks panel.
1297. Retrieved chunks panel is collapsible.
1298. Retrieved chunks panel shows score.
1299. Retrieved chunks panel shows retrieval method.
1300. Retrieved chunks panel shows source document.
1301. Retrieved chunks panel shows page.
1302. Retrieved chunks panel shows character offset.
1303. Retrieved chunks panel highlights cited chunks.
1304. Query workspace has audit trail panel.
1305. Audit trail panel shows ledger sequence.
1306. Audit trail panel shows row hash.
1307. Audit trail panel shows previous hash short form.
1308. Audit trail panel shows signature key ID.
1309. Audit trail panel shows outcome.
1310. Audit trail panel shows prompt version.
1311. Audit trail panel shows model version.
1312. Audit trail panel shows embedding version.
1313. Audit trail panel shows corpus snapshot.
1314. Audit trail panel has replay button.

### §7.5 Refusal and Blocked States

1315. Out-of-corpus refusal uses a calm German message.
1316. Out-of-corpus refusal explains that no sufficiently relevant corpus evidence was found.
1317. Out-of-corpus refusal shows retrieved candidates only if useful and authorized.
1318. Out-of-corpus refusal shows ledger row.
1319. Blocked-uncited state uses a German message.
1320. Blocked-uncited state explains that the generated answer failed the citation contract.
1321. Blocked-uncited state does not show the failed raw answer by default.
1322. Blocked-uncited state shows validation errors in operator-safe language.
1323. Provider-error state names provider class and retry guidance.
1324. Provider-error state does not expose secrets.
1325. Replay-drift state names drift artifact.
1326. Replay-unsupported state explains provider capability.

### §7.6 Source Viewer

1327. Source viewer opens selected PDF page where possible.
1328. Source viewer highlights chunk text.
1329. Source viewer shows extracted text fallback.
1330. Source viewer shows OCR warning when applicable.
1331. Source viewer shows document revision hash.
1332. Source viewer shows corpus snapshot ID.
1333. Source viewer prevents path traversal.
1334. Source viewer requires authenticated session.
1335. Source viewer links back to answer.

### §7.7 History and Replay UI

1336. History list is ledger-backed.
1337. History list shows timestamp.
1338. History list shows outcome.
1339. History list shows operator hash or display name when allowed.
1340. History list shows model version.
1341. History list shows prompt version.
1342. History list supports time-window filtering.
1343. History detail shows original answer.
1344. History detail shows retrieved chunks.
1345. History detail shows claim citations.
1346. History detail shows audit row.
1347. Replay button starts replay.
1348. Replay result appears inline.
1349. Replay pass uses German success copy.
1350. Replay drift uses German drift copy.
1351. Replay unsupported uses German limitation copy.
1352. Replay error uses German troubleshooting copy.

### §7.8 Eval Dashboard

1353. Eval dashboard shows latest run status.
1354. Eval dashboard shows groundedness.
1355. Eval dashboard shows citation accuracy.
1356. Eval dashboard shows refusal correctness.
1357. Eval dashboard shows thresholds.
1358. Eval dashboard shows per-tag breakdown.
1359. Eval dashboard shows failing case IDs.
1360. Eval dashboard shows pinned corpus snapshot.
1361. Eval dashboard shows pinned prompt version.
1362. Eval dashboard shows pinned provider profile.
1363. Eval dashboard warns if no successful eval exists.

### §7.9 Report UI

1364. Report UI has since and until controls.
1365. Report UI validates time range before submit.
1366. Report UI shows expected included ledger row count.
1367. Report UI shows generated artifact hashes.
1368. Report UI shows report generation ledger entry.
1369. Report UI downloads one zip bundle.
1370. Report UI explains that report is Article 50 only.
1371. Report UI does not imply MaRisk or GxP coverage in v1.
1372. Report UI shows legal-disclaimer copy from approved template.
1373. Report UI shows human-review/editorial-responsibility caveat where applicable.

### §7.10 Accessibility

1374. UI must meet WCAG 2.2 AA target.
1375. UI must support keyboard navigation.
1376. UI must provide focus indicators.
1377. UI must provide semantic landmarks.
1378. UI must provide button labels.
1379. UI must provide form labels.
1380. UI must support screen-reader names for citation pills.
1381. UI must not rely on color alone for drift states.
1382. UI must meet contrast ratios.
1383. UI must avoid text overflow in controls.
1384. UI must preserve layout at mobile and desktop widths.
1385. UI must support reduced motion.
1386. UI must test German text expansion.

## §8 Security, Privacy, Compliance, Operations, and Deployment

### §8.1 Security Requirements

1387. Security requirement SEC-001: TLS 1.3 is required in production.
1388. SEC-002: Session cookies are `HttpOnly`.
1389. SEC-003: Session cookies are `Secure`.
1390. SEC-004: Session cookies are `SameSite=Strict`.
1391. SEC-005: Idle timeout is 30 minutes.
1392. SEC-006: Absolute session lifetime is 8 hours.
1393. SEC-007: WebAuthn passkeys are required after bootstrap.
1394. SEC-008: Password authentication is forbidden.
1395. SEC-009: Magic links expire after 10 minutes.
1396. SEC-010: Magic links are recovery-only after passkey enrollment.
1397. SEC-011: Magic-link attempts are rate-limited.
1398. SEC-012: All JSON inputs are schema validated.
1399. SEC-013: Content-type must be checked for JSON bodies.
1400. SEC-014: Authorization checks are deterministic code, not model output.
1401. SEC-015: Prompt instructions are not access controls.
1402. SEC-016: Provider API keys are never placed in prompts.
1403. SEC-017: Database credentials are never placed in prompts.
1404. SEC-018: System prompts are treated as potentially leakable.
1405. SEC-019: Retrieved documents are treated as untrusted.
1406. SEC-020: Hidden-text extraction warnings are surfaced.
1407. SEC-021: CSP is `default-src 'self'` plus minimal explicit allowances.
1408. SEC-022: No third-party JavaScript is loaded in v1.
1409. SEC-023: No analytics is enabled by default.
1410. SEC-024: Egress is allowlisted.
1411. SEC-025: LLM provider egress is explicitly configured.
1412. SEC-026: Embedding provider egress is explicitly configured.
1413. SEC-027: Local model profile uses no egress.
1414. SEC-028: Secrets are stored outside repo.
1415. SEC-029: Report exports never include private keys.
1416. SEC-030: Ledger private key rotation has a runbook.

### §8.2 Privacy and GDPR Requirements

1417. Privacy requirement PRIV-001: INFO logs contain no query text.
1418. PRIV-002: INFO logs contain no chunk text.
1419. PRIV-003: INFO logs contain no generated answer text.
1420. PRIV-004: INFO logs contain `user_id_hash`.
1421. PRIV-005: INFO logs contain `query_id`.
1422. PRIV-006: INFO logs contain latency.
1423. PRIV-007: INFO logs contain outcome.
1424. PRIV-008: Full content lives in audit ledger under configured retention policy.
1425. PRIV-009: Ledger content is encrypted at rest.
1426. PRIV-010: Postgres corpus data is encrypted at rest through deployment storage controls.
1427. PRIV-011: Operator deletion removes live session mappings.
1428. PRIV-012: Operator deletion tombstones immutable ledger identity.
1429. PRIV-013: Tombstone hash preserves audit continuity.
1430. PRIV-014: Data-residency document names supported regions and egress.
1431. PRIV-015: Non-LLM third-party data sharing is forbidden in v1.
1432. PRIV-016: Provider processor details are documented per deployment.
1433. PRIV-017: Backups inherit encryption requirements.
1434. PRIV-018: Restore procedures are tested.
1435. PRIV-019: Data minimization is reviewed before new logging fields are added.
1436. PRIV-020: Sensitive corpus labels are supported for future access controls.

### §8.3 Compliance Requirements

1437. Compliance requirement COMP-001: Operator UI discloses AI interaction at first login.
1438. COMP-002: Generated text reports disclose AI-generated content where publication context requires.
1439. COMP-003: Article 50 report includes system identity.
1440. COMP-004: Article 50 report includes deployment context.
1441. COMP-005: Article 50 report includes model versions.
1442. COMP-006: Article 50 report includes prompt versions.
1443. COMP-007: Article 50 report includes embedding model versions.
1444. COMP-008: Article 50 report includes corpus snapshot identity.
1445. COMP-009: Article 50 report includes eval scores.
1446. COMP-010: Article 50 report includes limitations.
1447. COMP-011: Article 50 report includes human oversight description.
1448. COMP-012: Article 50 report includes logging and audit description.
1449. COMP-013: Article 50 report includes sealed audit excerpt hash.
1450. COMP-014: Article 50 report includes refusal rate.
1451. COMP-015: Article 50 report includes outcome breakdown.
1452. COMP-016: Article 50 report includes report-generation ledger entry hash.
1453. COMP-017: Instructions for use document capabilities.
1454. COMP-018: Instructions for use document limitations.
1455. COMP-019: Instructions for use document accuracy metrics.
1456. COMP-020: Instructions for use document robustness and cybersecurity measures.

### §8.4 Operational Requirements

1457. Ops requirement OPS-001: Health checks include Postgres.
1458. OPS-002: Health checks include active corpus snapshot.
1459. OPS-003: Health checks include ledger availability.
1460. OPS-004: Health checks include provider profile validity.
1461. OPS-005: Ingestion status is observable.
1462. OPS-006: Eval status is observable.
1463. OPS-007: Report generation status is observable.
1464. OPS-008: Replay status is observable.
1465. OPS-009: Backup runbook covers Postgres.
1466. OPS-010: Backup runbook covers SQLite ledger.
1467. OPS-011: Backup runbook covers signing keys.
1468. OPS-012: Restore runbook verifies ledger after restore.
1469. OPS-013: WAL checkpoint runbook exists.
1470. OPS-014: Provider outage runbook exists.
1471. OPS-015: Corpus re-ingestion runbook exists.
1472. OPS-016: Eval failure runbook exists.
1473. OPS-017: Report failure runbook exists.
1474. OPS-018: Replay drift runbook exists.
1475. OPS-019: Tamper detection runbook exists.
1476. OPS-020: Key rotation runbook exists.

### §8.5 Deployment Requirements

1477. Deployment requirement DEP-001: Docker Compose profile exists for local demo.
1478. DEP-002: Production deployment can run on customer-controlled VM or Kubernetes.
1479. DEP-003: Postgres version is 16 or newer.
1480. DEP-004: pgvector version is at least 0.7.
1481. DEP-005: Node version is 22.
1482. DEP-006: Typst CLI is installed in report runtime.
1483. DEP-007: Tesseract is installed where OCR is enabled.
1484. DEP-008: Default demo corpus ships under examples.
1485. DEP-009: Environment validation fails fast.
1486. DEP-010: Missing provider credentials fail readiness.
1487. DEP-011: Missing ledger key fails readiness.
1488. DEP-012: Missing active corpus warns until first ingest.
1489. DEP-013: Local deterministic provider can run in CI.
1490. DEP-014: Cloud LLM profile is optional for local tests.
1491. DEP-015: Air-gapped profile has no required outbound calls.

## §9 Test Strategy and Acceptance Criteria

### §9.1 Test Strategy Overview

1492. Test strategy TS1: Unit tests cover pure domain logic.
1493. TS2: Unit tests cover canonical JSON.
1494. TS3: Unit tests cover hash-chain computation.
1495. TS4: Unit tests cover citation parsing.
1496. TS5: Unit tests cover citation validation.
1497. TS6: Unit tests cover redaction.
1498. TS7: Unit tests cover RRF merge.
1499. TS8: Unit tests cover out-of-corpus threshold.
1500. TS9: Unit tests cover report deterministic helpers.
1501. TS10: Integration tests cover auth routes.
1502. TS11: Integration tests cover ingestion fixtures.
1503. TS12: Integration tests cover Postgres retrieval.
1504. TS13: Integration tests cover SQLite ledger append and verify.
1505. TS14: Integration tests cover report generation.
1506. TS15: Integration tests cover replay.
1507. TS16: E2E tests cover login to answer flow.
1508. TS17: E2E tests cover citations to source view.
1509. TS18: E2E tests cover replay UI.
1510. TS19: E2E tests cover report generation UI.
1511. TS20: Security tests cover CSP.
1512. TS21: Security tests cover no third-party scripts.
1513. TS22: Security tests cover prompt-secret absence.
1514. TS23: Privacy tests cover log redaction.
1515. TS24: Eval tests cover golden thresholds.
1516. TS25: Meta tests cover `pnpm check:full`.

### §9.2 Identity Acceptance Criteria

1517. AC-ID-001: `/auth/operator` accepts email for bootstrap.
1518. AC-ID-002: Magic link expires after 10 minutes.
1519. AC-ID-003: First login requires WebAuthn registration.
1520. AC-ID-004: Subsequent login requires WebAuthn.
1521. AC-ID-005: Magic link after enrollment is recovery-only.
1522. AC-ID-006: Rate limit is 5 attempts per 15 minutes per email hash.
1523. AC-ID-007: Session cookie is `HttpOnly`.
1524. AC-ID-008: Session cookie is `Secure`.
1525. AC-ID-009: Session cookie is `SameSite=Strict`.
1526. AC-ID-010: Idle timeout is 30 minutes.
1527. AC-ID-011: Absolute timeout is 8 hours.
1528. AC-ID-012: No password field exists in UI.
1529. AC-ID-013: No password column exists in schema.
1530. AC-ID-014: Anonymous query returns 401.
1531. AC-ID-015: Login success is ledgered.

### §9.3 Ingestion Acceptance Criteria

1532. AC-ING-001: `pnpm ingest --corpus <dir>` reads PDF files.
1533. AC-ING-002: `pnpm ingest --corpus <dir>` reads DOCX files.
1534. AC-ING-003: `pnpm ingest --corpus <dir>` reads Markdown files.
1535. AC-ING-004: Scanned PDF fixture triggers OCR.
1536. AC-ING-005: OCR usage is recorded.
1537. AC-ING-006: Hidden text warning fixture is recorded.
1538. AC-ING-007: Chunk window defaults to 800 tokens.
1539. AC-ING-008: Chunk overlap defaults to 100 tokens.
1540. AC-ING-009: Chunk row stores document ID.
1541. AC-ING-010: Chunk row stores page.
1542. AC-ING-011: Chunk row stores character offset.
1543. AC-ING-012: Chunk row stores chunk text.
1544. AC-ING-013: Chunk row stores chunk SHA.
1545. AC-ING-014: Unchanged re-ingestion is no-op.
1546. AC-ING-015: Changed document creates new snapshot.
1547. AC-ING-016: Previous snapshot remains queryable.
1548. AC-ING-017: Dry run writes no rows.
1549. AC-ING-018: Dry run reports document count.
1550. AC-ING-019: Dry run reports chunk count.
1551. AC-ING-020: Dry run reports embedding model.
1552. AC-ING-021: Failed ingestion does not activate snapshot.
1553. AC-ING-022: Successful ingestion ledgers completion.

### §9.4 Retrieval Acceptance Criteria

1554. AC-RET-001: Dense retrieval returns top 50 candidates.
1555. AC-RET-002: BM25 retrieval returns top 50 candidates.
1556. AC-RET-003: RRF merge produces deterministic ranking.
1557. AC-RET-004: Default final top-K is 8.
1558. AC-RET-005: Per-query top-K accepts 1 through 20.
1559. AC-RET-006: Per-query top-K rejects 0.
1560. AC-RET-007: Per-query top-K rejects 21.
1561. AC-RET-008: Retrieved chunk response includes chunk ID.
1562. AC-RET-009: Retrieved chunk response includes doc ID.
1563. AC-RET-010: Retrieved chunk response includes page.
1564. AC-RET-011: Retrieved chunk response includes char offset.
1565. AC-RET-012: Retrieved chunk response includes retrieval score.
1566. AC-RET-013: Retrieved chunk response includes retrieval method.
1567. AC-RET-014: Retrieval never returns inactive snapshot chunks for active query.
1568. AC-RET-015: All-low-score top-K triggers out-of-corpus.
1569. AC-RET-016: Out-of-corpus avoids LLM call.
1570. AC-RET-017: Out-of-corpus is ledgered.

### §9.5 Generation Acceptance Criteria

1571. AC-GEN-001: LLM request uses pinned model version.
1572. AC-GEN-002: LLM request uses pinned prompt version.
1573. AC-GEN-003: LLM request uses temperature zero.
1574. AC-GEN-004: LLM request uses fixed seed where provider supports it.
1575. AC-GEN-005: LLM request records no-seed support where absent.
1576. AC-GEN-006: Prompt includes retrieved chunks.
1577. AC-GEN-007: Prompt requires chunk markers.
1578. AC-GEN-008: Parser extracts claims.
1579. AC-GEN-009: Parser extracts citations.
1580. AC-GEN-010: Validator rejects uncited claim.
1581. AC-GEN-011: Validator rejects citation to non-retrieved chunk.
1582. AC-GEN-012: Validator rejects citation to wrong snapshot.
1583. AC-GEN-013: First failure triggers one regeneration.
1584. AC-GEN-014: Second failure blocks output.
1585. AC-GEN-015: Blocked output is ledgered.
1586. AC-GEN-016: Blocked output is not shown as final answer.
1587. AC-GEN-017: Valid answer returns citations inline.

### §9.6 Ledger Acceptance Criteria

1588. AC-AUD-001: Every answered query creates ledger row.
1589. AC-AUD-002: Every out-of-corpus refusal creates ledger row.
1590. AC-AUD-003: Every blocked-uncited outcome creates ledger row.
1591. AC-AUD-004: Ledger row includes previous hash.
1592. AC-AUD-005: Ledger row includes query hash.
1593. AC-AUD-006: Ledger row includes retrieved chunks.
1594. AC-AUD-007: Ledger row includes generated answer hash when answer exists.
1595. AC-AUD-008: Ledger row includes claim citations.
1596. AC-AUD-009: Ledger row includes model version.
1597. AC-AUD-010: Ledger row includes prompt version.
1598. AC-AUD-011: Ledger row includes embedding version.
1599. AC-AUD-012: Ledger row includes seed.
1600. AC-AUD-013: Ledger row includes corpus snapshot.
1601. AC-AUD-014: Ledger row includes timestamp.
1602. AC-AUD-015: Ledger row includes user hash.
1603. AC-AUD-016: Ledger row includes signature.
1604. AC-AUD-017: Verify exits 0 on clean ledger.
1605. AC-AUD-018: Verify exits non-zero after one-byte tamper.
1606. AC-AUD-019: Verify names first invalid row.
1607. AC-AUD-020: Application code contains no ledger UPDATE path.
1608. AC-AUD-021: Application code contains no ledger DELETE path.
1609. AC-AUD-022: Export produces SQLite artifact.
1610. AC-AUD-023: Export produces signature file.
1611. AC-AUD-024: Export produces manifest.

### §9.7 Replay Acceptance Criteria

1612. AC-REP-001: Replay loads ledger entry by ID.
1613. AC-REP-002: Replay checks corpus snapshot hash.
1614. AC-REP-003: Replay checks prompt hash.
1615. AC-REP-004: Replay checks embedding model version.
1616. AC-REP-005: Replay checks model provider profile.
1617. AC-REP-006: Deterministic stub replay returns byte-equal answer.
1618. AC-REP-007: Local bit-equal provider replay returns byte-equal answer.
1619. AC-REP-008: Prompt drift returns `ReplayDriftError`.
1620. AC-REP-009: Corpus drift returns `ReplayDriftError`.
1621. AC-REP-010: Model artifact drift returns `ReplayDriftError`.
1622. AC-REP-011: Cloud provider byte mismatch returns drift, not pass.
1623. AC-REP-012: Unsupported provider returns replay unsupported.
1624. AC-REP-013: Replay pass is ledgered.
1625. AC-REP-014: Replay drift is ledgered.
1626. AC-REP-015: Replay unsupported is ledgered.

### §9.8 Eval Acceptance Criteria

1627. AC-EVAL-001: Golden set JSONL parses.
1628. AC-EVAL-002: Empty golden set fails.
1629. AC-EVAL-003: Missing case ID fails.
1630. AC-EVAL-004: Duplicate case ID fails.
1631. AC-EVAL-005: Missing question fails.
1632. AC-EVAL-006: Missing expected outcome fails.
1633. AC-EVAL-007: Groundedness is computed.
1634. AC-EVAL-008: Citation accuracy is computed.
1635. AC-EVAL-009: Refusal correctness is computed.
1636. AC-EVAL-010: Per-tag breakdown is computed.
1637. AC-EVAL-011: Groundedness below 0.95 fails.
1638. AC-EVAL-012: Citation accuracy below 0.95 fails.
1639. AC-EVAL-013: Refusal correctness below 0.90 fails.
1640. AC-EVAL-014: Latest eval appears in UI.
1641. AC-EVAL-015: Eval output is machine-readable JSON.

### §9.9 Report Acceptance Criteria

1642. AC-RPT-001: Report CLI accepts Article 50 format.
1643. AC-RPT-002: Report CLI requires since timestamp.
1644. AC-RPT-003: Report CLI requires until timestamp.
1645. AC-RPT-004: Report rejects invalid time order.
1646. AC-RPT-005: Report includes system identity.
1647. AC-RPT-006: Report includes deployment context.
1648. AC-RPT-007: Report includes model versions.
1649. AC-RPT-008: Report includes prompt versions.
1650. AC-RPT-009: Report includes embedding versions.
1651. AC-RPT-010: Report includes corpus snapshot identity.
1652. AC-RPT-011: Report includes query volume.
1653. AC-RPT-012: Report includes outcome breakdown.
1654. AC-RPT-013: Report includes eval scores.
1655. AC-RPT-014: Report includes refusal rate.
1656. AC-RPT-015: Report includes prompt-template appendix.
1657. AC-RPT-016: Report includes sealed audit excerpt hash.
1658. AC-RPT-017: Report emits PDF.
1659. AC-RPT-018: Report emits JSON.
1660. AC-RPT-019: Report emits audit excerpt zip.
1661. AC-RPT-020: Same inputs produce byte-identical PDF.
1662. AC-RPT-021: Same inputs produce byte-identical JSON.
1663. AC-RPT-022: Out-of-window ledger rows are excluded.

### §9.10 UI Acceptance Criteria

1664. AC-UI-001: `/console` renders query box.
1665. AC-UI-002: `/console` renders answer panel.
1666. AC-UI-003: `/console` renders retrieved chunks panel.
1667. AC-UI-004: `/console` renders audit trail panel.
1668. AC-UI-005: Inline citation pill opens chunk preview.
1669. AC-UI-006: Source viewer opens cited page.
1670. AC-UI-007: Source viewer highlights cited text where feasible.
1671. AC-UI-008: Replay button shows status.
1672. AC-UI-009: Report view generates bundle.
1673. AC-UI-010: German copy exists for all primary states.
1674. AC-UI-011: WCAG automated check passes.
1675. AC-UI-012: Keyboard flow reaches all controls.
1676. AC-UI-013: CSP blocks external scripts.
1677. AC-UI-014: No analytics request occurs.

### §9.11 Privacy and Security Acceptance Criteria

1678. AC-SEC-001: INFO logs exclude query text.
1679. AC-SEC-002: INFO logs exclude chunk text.
1680. AC-SEC-003: INFO logs exclude answer text.
1681. AC-SEC-004: Provider API key is absent from prompt render.
1682. AC-SEC-005: DB credentials are absent from prompt render.
1683. AC-SEC-006: Authorization tests do not call LLM.
1684. AC-SEC-007: Egress allowlist blocks unapproved host.
1685. AC-SEC-008: Operator identity deletion tombstones user ID.
1686. AC-SEC-009: Tombstoned ledger remains verifiable.
1687. AC-SEC-010: Ledger export excludes private keys.
1688. AC-SEC-011: Tampered export fails verification.
1689. AC-SEC-012: Prompt injection fixture does not bypass citation validator.
1690. AC-SEC-013: Hidden-text fixture is flagged in ingestion.

### §9.12 Build Acceptance Criteria

1691. AC-BLD-001: `pnpm check:full` runs typecheck.
1692. AC-BLD-002: `pnpm check:full` runs Biome.
1693. AC-BLD-003: `pnpm check:full` runs ESLint.
1694. AC-BLD-004: `pnpm check:full` runs knip.
1695. AC-BLD-005: `pnpm check:full` runs unit tests.
1696. AC-BLD-006: `pnpm check:full` runs integration tests.
1697. AC-BLD-007: `pnpm check:full` runs e2e tests.
1698. AC-BLD-008: `pnpm check:full` runs eval harness.
1699. AC-BLD-009: `pnpm check:full` exits non-zero on eval failure.
1700. AC-BLD-010: CI runs full gate on push.
1701. AC-BLD-011: README five-minute install works from clean clone.
1702. AC-BLD-012: Docker Compose demo reaches operator console.

## §10 Anti-Requirements

### §10.1 Product Anti-Requirements

1703. Anti AR-001: v1 MUST NOT be multi-tenant SaaS.
1704. AR-002: v1 MUST NOT include billing.
1705. AR-003: v1 MUST NOT include usage metering.
1706. AR-004: v1 MUST NOT include SAML.
1707. AR-005: v1 MUST NOT include OIDC.
1708. AR-006: v1 MUST NOT train custom embeddings.
1709. AR-007: v1 MUST NOT fine-tune a base LLM.
1710. AR-008: v1 MUST NOT support multi-corpus federation.
1711. AR-009: v1 MUST NOT implement English UI as a launch blocker.
1712. AR-010: v1 MUST NOT ship native mobile apps.
1713. AR-011: v1 MUST NOT ship native desktop apps.
1714. AR-012: v1 MUST NOT ship MaRisk report format.
1715. AR-013: v1 MUST NOT ship GxP report format.
1716. AR-014: v1 MUST NOT ship EBA report format.
1717. AR-015: v1 MUST NOT ship FDA 21 CFR Part 11 attestations.
1718. AR-016: v1 MUST NOT ingest SharePoint.
1719. AR-017: v1 MUST NOT ingest Confluence.
1720. AR-018: v1 MUST NOT ingest email.
1721. AR-019: v1 MUST NOT retrieve from images.
1722. AR-020: v1 MUST NOT retrieve from audio.

### §10.2 Security Anti-Requirements

1723. AR-021: The system MUST NOT accept anonymous queries.
1724. AR-022: The system MUST NOT accept passwords.
1725. AR-023: The system MUST NOT store password hashes.
1726. AR-024: The system MUST NOT rely on system prompts for authorization.
1727. AR-025: The system MUST NOT put secrets in prompts.
1728. AR-026: The system MUST NOT expose provider API keys in UI.
1729. AR-027: The system MUST NOT load third-party JavaScript.
1730. AR-028: The system MUST NOT enable telemetry by default.
1731. AR-029: The system MUST NOT send content to non-LLM third parties.
1732. AR-030: The system MUST NOT run with open egress by default.
1733. AR-031: The system MUST NOT silently ignore ledger append failure.
1734. AR-032: The system MUST NOT silently ignore signature failure.
1735. AR-033: The system MUST NOT silently repair tampered ledger rows.
1736. AR-034: The system MUST NOT expose raw blocked generations by default.

### §10.3 RAG Anti-Requirements

1737. AR-035: The system MUST NOT return an answer with uncited claims.
1738. AR-036: The system MUST NOT cite chunks outside the retrieved set.
1739. AR-037: The system MUST NOT cite chunks outside the corpus snapshot.
1740. AR-038: The system MUST NOT use stale corpus chunks for active queries.
1741. AR-039: The system MUST NOT hide retrieval scores from audit payloads.
1742. AR-040: The system MUST NOT treat per-answer citations as enough.
1743. AR-041: The system MUST NOT treat model confidence as evidence.
1744. AR-042: The system MUST NOT pass eval on an empty golden set.
1745. AR-043: The system MUST NOT generate when out-of-corpus threshold triggers.
1746. AR-044: The system MUST NOT let prompt injection override citation validation.

### §10.4 Replay and Report Anti-Requirements

1747. AR-045: Replay MUST NOT claim bit-equal success when bytes differ.
1748. AR-046: Replay MUST NOT claim cloud-provider deterministic support without provider profile evidence.
1749. AR-047: Replay MUST NOT overwrite original ledger entries.
1750. AR-048: Replay MUST NOT use active corpus when original snapshot differs.
1751. AR-049: Replay MUST NOT use latest prompt when original prompt differs.
1752. AR-050: Report generation MUST NOT read outside the selected window.
1753. AR-051: Report generation MUST NOT imply legal certification.
1754. AR-052: Report generation MUST NOT imply high-risk conformity assessment completion.
1755. AR-053: Report generation MUST NOT include private signing keys.
1756. AR-054: Report generation MUST NOT edit ledger rows.

## §11 Definition of Done

### §11.1 Product-Level Done

1757. DOD-001: All §9 acceptance criteria pass.
1758. DOD-002: `pnpm check:full` passes locally.
1759. DOD-003: CI full gate passes.
1760. DOD-004: Five-minute install works from a clean clone.
1761. DOD-005: Example corpus ingests successfully.
1762. DOD-006: Operator can authenticate with passkey.
1763. DOD-007: Operator can ask an in-corpus question.
1764. DOD-008: Operator receives per-claim citations.
1765. DOD-009: Operator can open cited source.
1766. DOD-010: Operator can ask an out-of-corpus question and receive refusal.
1767. DOD-011: Operator can inspect audit row.
1768. DOD-012: Operator can replay a deterministic ledger row.
1769. DOD-013: Operator can see drift for a drifted artifact.
1770. DOD-014: Operator can generate Article 50 bundle.
1771. DOD-015: Auditor can verify clean ledger.
1772. DOD-016: Auditor can detect tampered ledger.
1773. DOD-017: Eval thresholds pass.
1774. DOD-018: Ordinary logs pass redaction tests.
1775. DOD-019: UI passes accessibility gate.
1776. DOD-020: Security review signs off on no prompt-secret reliance.

### §11.2 Documentation Done

1777. DOD-DOC-001: README includes install.
1778. DOD-DOC-002: README includes architecture overview.
1779. DOD-DOC-003: README includes limitations.
1780. DOD-DOC-004: README includes replay caveat for cloud providers.
1781. DOD-DOC-005: `docs/data-residency.md` exists.
1782. DOD-DOC-006: `docs/audit-ledger.md` exists.
1783. DOD-DOC-007: `docs/replay.md` exists.
1784. DOD-DOC-008: `docs/report-eu-ai-act-50.md` exists.
1785. DOD-DOC-009: `docs/operator-guide.de.md` exists.
1786. DOD-DOC-010: `docs/admin-runbook.md` exists.
1787. DOD-DOC-011: `docs/security.md` exists.
1788. DOD-DOC-012: `docs/privacy.md` exists.
1789. DOD-DOC-013: `docs/eval-harness.md` exists.
1790. DOD-DOC-014: Known limitations are documented.
1791. DOD-DOC-015: Legal disclaimer is documented.

### §11.3 Compliance Done

1792. DOD-COMP-001: First-interaction AI disclosure exists.
1793. DOD-COMP-002: Instructions for use document intended purpose.
1794. DOD-COMP-003: Instructions for use document capabilities.
1795. DOD-COMP-004: Instructions for use document limitations.
1796. DOD-COMP-005: Instructions for use document metrics.
1797. DOD-COMP-006: Human oversight controls exist.
1798. DOD-COMP-007: Stop or disregard guidance exists.
1799. DOD-COMP-008: Article 50 report includes required v1 fields.
1800. DOD-COMP-009: Report artifacts are deterministic.
1801. DOD-COMP-010: Audit excerpt hash verifies.
1802. DOD-COMP-011: Data minimization is tested.
1803. DOD-COMP-012: Encryption-at-rest deployment guidance exists.
1804. DOD-COMP-013: Retention assumptions are documented.

### §11.4 Operational Done

1805. DOD-OPS-001: Backup runbook tested.
1806. DOD-OPS-002: Restore runbook tested.
1807. DOD-OPS-003: Ledger verification after restore passes.
1808. DOD-OPS-004: Key rotation runbook tested.
1809. DOD-OPS-005: Provider outage runbook tested.
1810. DOD-OPS-006: Eval failure runbook tested.
1811. DOD-OPS-007: Tamper detection runbook tested.
1812. DOD-OPS-008: Health checks report accurate readiness.
1813. DOD-OPS-009: Logs show useful metadata without content leakage.
1814. DOD-OPS-010: Report generation failure has recovery guidance.

## §12 Assumptions and Open Questions

### §12.1 Freeze Rule Result

1815. Freeze result: FROZEN.
1816. Blocking open questions: none.
1817. Material uncertainties have been converted into assumptions Codex may act on.
1818. Legal interpretation remains customer counsel responsibility.
1819. Product implementation can proceed against the assumptions below.
1820. Any later contradiction should open a change request rather than silently changing scope.

### §12.2 Explicit Assumptions Codex May Act On

1821. ASSUMP-001: v1 targets one organization and one corpus.
1822. ASSUMP-002: German operator UI is sufficient for v1.
1823. ASSUMP-003: English developer documentation is acceptable.
1824. ASSUMP-004: Article 50 disclosure is the only regulator report in v1.
1825. ASSUMP-005: The Article 50 report is a transparency artifact, not legal advice.
1826. ASSUMP-006: Customer legal/compliance teams own final legal review before production use.
1827. ASSUMP-007: The product should align with high-risk-style logging and oversight even when not all deployments are high-risk under the AI Act.
1828. ASSUMP-008: Anthropic Claude Sonnet 4.6 remains the default cloud model profile for pilot UX.
1829. ASSUMP-009: Certified bit-equal replay acceptance uses a deterministic stub or local replay-capable provider profile.
1830. ASSUMP-010: Cloud Anthropic replay is drift-detecting unless provider infrastructure guarantees bit equality for the recorded request.
1831. ASSUMP-011: If cloud replay bytes differ, the product reports drift and still satisfies audit honesty.
1832. ASSUMP-012: Local vLLM profile can be configured with pinned model artifacts, tokenizer, runtime, and sampling.
1833. ASSUMP-013: bge-m3 is the default embedding model.
1834. ASSUMP-014: Jina embeddings can be supported as an alternative profile.
1835. ASSUMP-015: Postgres plus pgvector is the retrieval store.
1836. ASSUMP-016: SQLite WAL is the default audit-ledger store.
1837. ASSUMP-017: Postgres ledger backend may be added later but is not required for v1.
1838. ASSUMP-018: Typst is the deterministic report renderer.
1839. ASSUMP-019: Tesseract is acceptable for OCR in v1.
1840. ASSUMP-020: WebAuthn passkeys are acceptable operator auth.
1841. ASSUMP-021: Magic-link recovery is acceptable with strict rate limits.
1842. ASSUMP-022: No SSO is acceptable for v1.
1843. ASSUMP-023: The default deployment can rely on infrastructure-level disk encryption plus application-level ledger encryption.
1844. ASSUMP-024: INFO log redaction is mandatory.
1845. ASSUMP-025: Debug content access, if implemented, is admin-only and audited.
1846. ASSUMP-026: One regeneration attempt is enough for v1.
1847. ASSUMP-027: Out-of-corpus threshold default 0.3 is a starting value validated by golden tests.
1848. ASSUMP-028: Chunk size 800 tokens and overlap 100 tokens are starting values validated by eval.
1849. ASSUMP-029: HNSW `m=16` and `ef_construction=128` are starting values validated by recall tests.
1850. ASSUMP-030: Eval thresholds from ISA are binding for v1.
1851. ASSUMP-031: BSL 1.1 licensing can be documented but final legal review happens outside this PRD.
1852. ASSUMP-032: The implementation may create normal project files later, but this PRD creation task does not.
1853. ASSUMP-033: Future `/goal` launch will consume this PRD but is intentionally not launched now.
1854. ASSUMP-034: Future guardrail bootstrap will be separate and is intentionally not performed now.

### §12.3 Non-Blocking Questions for Later Business Review

1855. Q-LATER-001: Should BSL 1.1 remain final license after commercial validation?
1856. Q-LATER-002: Which DACH pilot sector should provide the first real corpus?
1857. Q-LATER-003: Which legal counsel should approve Article 50 wording?
1858. Q-LATER-004: Which retention period applies per customer?
1859. Q-LATER-005: Which provider processor terms are acceptable per customer?
1860. Q-LATER-006: Which on-prem model should be recommended for the certified replay profile?
1861. Q-LATER-007: Should MaRisk report format become v1.1 or v2?
1862. Q-LATER-008: Should SSO land before multi-corpus support?
1863. Q-LATER-009: Should English UI land before enterprise pilots outside DACH?
1864. Q-LATER-010: Should audit ledger move to Postgres for high-volume installations?
1865. These are non-blocking because the v1 implementation has explicit defaults.

## §13 Run Log

### §13.1 Run Log Entries

1866. 2026-05-10T09:15:00+02:00: `ISA.md` source brief timestamp indicates project seed.
1867. 2026-05-10: Codex received instruction to produce only `docs/MASTER_PRD.md`.
1868. 2026-05-10: Codex did not launch `/goal`.
1869. 2026-05-10: Codex did not bootstrap guardrails.
1870. 2026-05-10: Codex inspected workspace path `/home/mj/projects/audit-grade-rag`.
1871. 2026-05-10: Codex found `ISA.md`.
1872. 2026-05-10: Codex found no existing `docs/MASTER_PRD.md`.
1873. 2026-05-10: Codex observed the workspace is not a Git repository.
1874. 2026-05-10: Codex read `ISA.md`.
1875. 2026-05-10: Codex researched current EU AI Act Article 50 transparency obligations.
1876. 2026-05-10: Codex researched current EU AI Act logging, transparency, oversight, and robustness provisions.
1877. 2026-05-10: Codex researched GDPR design-by-default and security-of-processing requirements.
1878. 2026-05-10: Codex researched NIST Generative AI Profile.
1879. 2026-05-10: Codex researched OWASP LLM Top 10 2025.
1880. 2026-05-10: Codex researched pgvector HNSW behavior.
1881. 2026-05-10: Codex researched WebAuthn Level 3.
1882. 2026-05-10: Codex researched Anthropic model ID versioning.
1883. 2026-05-10: Codex researched SQLite WAL documentation.
1884. 2026-05-10: Codex researched WCAG 2.2.
1885. 2026-05-10: Codex converted replay determinism uncertainty into explicit assumptions.
1886. 2026-05-10: Codex set status to FROZEN because no blocking §12 open question remains.
1887. 2026-05-10: Codex created `docs/MASTER_PRD.md`.

### §13.2 Guardrail Bootstrap Run

1888. 2026-05-10: Codex followed `~/.claude/skills/GoalMode/Workflows/Bootstrap.md`.
1889. 2026-05-10: Codex did not launch `/goal`.
1890. 2026-05-10: Codex created the pnpm, TypeScript, Biome, ESLint, knip, Vitest, lefthook, and CI guardrail stack.
1891. 2026-05-10: Codex set `pnpm check:full` as the full agent-done gate.
1892. 2026-05-10: Codex kept `docs/MASTER_PRD.md` as the frozen implementation contract.
1893. 2026-05-10: Codex changed only guardrail status metadata and this run-log status update in the frozen PRD.

### §13.3 Source Sufficiency Note

1894. Source material was sufficient to produce a 1500+ line Master PRD.
1895. `ISA.md` was dense enough to define core scope, stack, constraints, criteria, features, and decisions.
1896. Web research was needed only to harden legal, security, model-versioning, accessibility, and storage assumptions.
1897. The PRD does not require additional source material before implementation planning.
1898. The PRD does require future legal review before production legal claims.

### §13.4 Final Creation Constraints

1899. Only `docs/MASTER_PRD.md` was intended as the content artifact from the PRD creation task.
1900. No source code was generated during the PRD creation task.
1901. No tests were generated during the PRD creation task.
1902. No package manager command was run during the PRD creation task.
1903. No dependency was installed during the PRD creation task.
1904. No guardrail files were created during the PRD creation task.
1905. No goal runner was launched during the PRD creation task.
1906. The document exceeds the requested 1500-line minimum.
