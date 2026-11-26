# Viva Preparation

Short answers to the theory questions the evaluation lists (SDLC, SRS, UML,
DFD, testing), each tied back to this project. Every member should be able to
answer all of these, including the project-specific questions at the end.

## SDLC models

**What is the SDLC?**
The stages software goes through: requirements, design, implementation,
testing, deployment and maintenance.

| Model | Idea | When it fits |
|-------|------|--------------|
| Waterfall | One phase after another, no going back | Fixed, well-understood requirements |
| V-model | Waterfall where each phase has a matching test level (requirements ↔ acceptance test, design ↔ integration test, code ↔ unit test) | Safety-critical systems |
| Incremental | Build the system in usable slices | Early value, stable core |
| Iterative | Repeat design → build → review to refine | Requirements learnt along the way |
| Spiral | Iterations driven by risk analysis | Large, high-risk projects |
| Prototype | Build a throwaway model to clarify requirements | Unclear UI or requirements |
| Agile (Scrum) | Short sprints, working software each sprint, continuous feedback | Changing requirements, small teams |

**Which model did we use and why?**
Iterative and incremental with weekly slices (Agile-style). Payment-gateway
behaviour, hosting limits and search ranking could only be learnt by shipping,
so Waterfall would have locked in wrong assumptions. Each slice went through a
pull request and CI before deployment.

## SRS

**What is an SRS?** A document that states *what* the system must do, not how:
functional requirements, non-functional requirements, constraints, interfaces
and assumptions. It is the contract between client and developers and the
basis for test cases.

**Standard?** IEEE 830 (now ISO/IEC/IEEE 29148). Ours follows its structure:
Introduction → Overall Description → System Features → Non-functional
Requirements → Other Requirements.

**Functional vs non-functional?**
Functional = a behaviour ("the system shall verify the PayU hash before marking
an order paid", FR-PAY-02). Non-functional = a quality or constraint
("a cached page shall respond in under 300 ms", NFR-PER-01).

**Qualities of a good SRS?** Correct, unambiguous, complete, consistent,
verifiable (testable), modifiable, traceable (every requirement has an ID, e.g.
FR-CAT-01).

**Requirement elicitation techniques?** Interviews (with the store owner),
observation (of how orders were handled), analysing the existing system (the
old hosted store), questionnaires, prototyping.

## UML

**Structural diagrams:** class, object, component, deployment, package.
**Behavioural diagrams:** use case, sequence, activity, state machine,
communication.

**Use case diagram:** actors (Customer, Admin, PayU) and their goals.
- *include*: always part of the base use case (checkout includes payment).
- *extend*: optional, conditional behaviour (apply promo code extends checkout).
- *generalisation*: Customer inherits everything a Guest can do.

**Class diagram relationships:**
- Association: Product — VehicleModel (fits).
- Association class: Fitment, data about the Product–VehicleModel link.
- Composition (filled diamond): Order ◆— OrderItem; items cannot exist without
  the order.
- Aggregation (hollow diamond): a whole–part link where parts can live alone.
- Generalisation (hollow triangle): inheritance.
- Multiplicity: `1`, `0..1`, `0..*`, `1..*` on each end.

**Sequence diagram:** objects over time with messages; we drew checkout:
UI → API → DB → PayU → API verifies → mark paid → Inngest. `opt` = optional
fragment, `alt` = if/else, `loop` = repetition.

**Activity diagram:** workflow with actions, decisions (diamonds), forks/joins
and swimlanes (Customer | Application | PayU).

**State machine diagram:** states of one object and the events that move it.
Our order: pending → paid → confirmed → shipped → delivered, with cancelled and
refunded.

## DFD

**What is a DFD?** It shows how data moves through a system: external entities
(rectangles), processes (circles), data stores (open rectangles) and data flows
(arrows). It shows data, not control or timing.

**Levels:** Level 0 (context diagram) = the whole system as one process with
its external entities. Level 1 = the main processes (ours: 1.0 Browse and cart,
2.0 Checkout and payment, 3.0 Order management) with data stores D1 Catalogue,
D2 Orders, D3 Settings. Level 2 breaks a Level-1 process down further.

**Rules:** every process has at least one input and one output; data cannot
flow directly between two stores or two external entities; levels must be
balanced (same inputs/outputs at parent and child level).

**DFD vs flowchart?** A DFD shows data movement; a flowchart shows control flow
and decisions.

## ER diagram

Entities (Product, Order), attributes, relationships with cardinality
(1:1, 1:N, M:N). M:N is implemented with a junction table: Product–Category
uses `product_categories`.

## Software testing

**Levels:** unit → integration → system → acceptance.
**Black-box:** test inputs/outputs without looking at code (equivalence
partitioning, boundary value analysis). Example boundary: free shipping exactly
at ₹5,000 qualifies (`>=`), ₹4,999 does not.
**White-box:** test using the code's structure (statement, branch, path
coverage).
**Regression testing:** re-run tests after every change; our CI does this on
every pull request.
**Alpha/beta testing:** alpha in-house, beta with real users.
**Verification vs validation:** verification = "are we building the product
right?" (reviews, tests against the spec); validation = "are we building the
right product?" (does it meet the user's need).
**Test case parts:** ID, requirement traced, preconditions, steps, input data,
expected result, actual result, status.
**Mocking:** replacing a real dependency with a fake one (we use MSW for the
API in storefront tests, and test doubles for the DB and PayU in API tests).

Our numbers: 884 automated tests passing (398 API + 486 storefront), run with
Vitest in GitHub Actions.

## Other common questions

- **Coupling and cohesion:** aim for low coupling between modules and high
  cohesion inside one. Our API keeps business logic in `lib/` and HTTP handling
  in `routes/`.
- **CI/CD:** continuous integration builds and tests every change;
  continuous delivery/deployment ships it. Vercel deploys the storefront from
  `main`.
- **Software maintenance types:** corrective (bug fixes), adaptive (new
  environment), perfective (improvements), preventive.
- **COCOMO:** effort estimation from lines of code (organic, semi-detached,
  embedded modes).
- **Cyclomatic complexity:** number of independent paths = E − N + 2P.

## Project-specific questions

1. **What problem does the project solve?** Customers cannot tell whether a
   part fits their car, and the old hosted store gave no control over search,
   checkout or payments.
2. **Architecture?** Next.js storefront + admin on Vercel, Hono REST API on
   Fly.io, PostgreSQL and storage on Supabase, PayU for payments.
3. **How do you stop price tampering?** The server reloads SKU prices from the
   database at checkout and ignores any total sent by the browser.
4. **How do you know a payment is real?** PayU's response hash (SHA-512) and the
   amount are verified on the server, on both the return callback and the
   webhook.
5. **What if the callback never arrives?** A background job checks pending
   orders with PayU every 15 minutes.
6. **How does login work?** Six-digit email OTP, stored as a bcrypt hash,
   valid 5 minutes, 5 attempts, rate-limited.
7. **How is COD handled?** 15% advance paid online; the admin marks the balance
   as collected on delivery.
8. **How is fitment modelled?** A `product_fitments` table between products and
   vehicle models (many-to-many).
9. **How many tables?** 28.
10. **What did you measure?** 884 passing tests; Lighthouse SEO 100; cached
    pages 375–437 ms; mobile LCP not yet within the 2.5 s target.
11. **Biggest challenges?** Third-party cookies (fixed with a same-origin
    proxy), Vercel image quota (moved to Supabase image rendering), a database
    connectivity outage (moved to the Supabase session pooler).
12. **Future work?** Reviews, courier integration, page-speed improvements,
    Android app.
