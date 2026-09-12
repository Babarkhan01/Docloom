# Privacy Policy — Docloom

**Effective Date:** September 12, 2026
**Last Updated:** September 12, 2026

---

## 1. Introduction

Docloom is a documentation-generation service that connects to your GitHub repositories, analyzes your source code, and produces API documentation using AI-assisted description generation. This Privacy Policy explains what information we collect, how we use it, how we protect it, and what rights you have regarding your data.

By creating an account or otherwise using Docloom (the "Service"), you agree to the collection and use of information in accordance with this policy.

## 2. Information We Collect

### 2.1 Information You Provide Directly
- **Account information:** When you sign in via GitHub OAuth, we receive your GitHub username, public profile information, and the email address associated with your GitHub account (if you grant that permission).
- **Billing information:** When you subscribe to a paid plan, payment details are collected and processed by our payment processor, **Dodo Payments**, acting as merchant of record. Docloom does not directly store your full payment card details.
- **Communications:** If you contact us for support, we retain the content of that correspondence.

### 2.2 Information Collected Automatically
- **Repository access tokens:** When you connect a GitHub repository, we receive an OAuth access token scoped to the repositories you authorize. This token is encrypted at rest (AES-256-GCM) and is used solely to read repository contents for documentation generation.
- **Source code content:** To generate documentation, Docloom's parser reads the structure of your code (functions, endpoints, types, comments) from the repositories you connect. Code is parsed programmatically using a deterministic AST (Abstract Syntax Tree) parser — we do not use an AI model to infer code structure, only to write natural-language descriptions of structure that has already been extracted mechanically.
- **Usage data:** We log basic usage metrics — which repositories are connected, how many documentation generation requests are made per day, and general service interaction data — to enforce plan-based usage quotas (e.g., Free: 5/day, Starter: 25/day, Team: 100/day) and to maintain and improve the Service.
- **Technical data:** Standard web server logs (IP address, browser type, timestamps) may be collected for security, fraud prevention, and debugging purposes.

### 2.3 Information From Third Parties
- **GitHub:** Repository metadata, code contents, and account information as authorized through GitHub's OAuth flow.
- **Dodo Payments:** Subscription status, payment success/failure events, and related billing metadata (Docloom does not receive or store raw card numbers).

## 3. How We Use Your Information

We use collected information to:

1. Authenticate your identity and maintain your account.
2. Access and parse the repositories you explicitly connect, in order to generate documentation.
3. Send parsed code structure (never raw, unparsed repository dumps beyond what's needed) to Anthropic's Claude API to generate human-readable descriptions of your API endpoints and code structure.
4. Process payments and manage subscription plans through Dodo Payments.
5. Enforce usage quotas associated with your plan tier.
6. Communicate with you about your account, billing, service updates, or in response to support requests.
7. Monitor, secure, and improve the Service, including detecting abuse or unauthorized access.
8. Comply with legal obligations.

We do **not** sell your personal information or your source code to third parties.

## 4. AI Processing Disclosure

Docloom uses Anthropic's Claude API to generate natural-language descriptions of code structures that have already been extracted by our own AST parser. This means:

- Code structure (function names, parameter types, endpoint paths, existing comments) is sent to Anthropic's API for the sole purpose of generating documentation text.
- Docloom is designed to avoid fabrication: where source code does not contain enough information to describe a behavior, the generated documentation will state that the detail is "not documented in source" rather than inventing an explanation.
- We do not use your code to train our own models. Please refer to Anthropic's own data usage and retention policies for information on how the Claude API handles submitted data at the API level.

## 5. Data Sharing and Disclosure

We share information only in the following circumstances:

- **Service providers:** With GitHub (for repository access), Anthropic (for AI-generated descriptions), Dodo Payments (for billing), and Cloudflare (for hosting and infrastructure) — each of which processes data only to the extent necessary to provide their respective service to us.
- **Legal requirements:** If required to do so by law, subpoena, or other legal process, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
- **Business transfers:** In connection with a merger, acquisition, or sale of assets, subject to standard confidentiality obligations.

We do not share your repository contents or account data with advertisers, data brokers, or unrelated third parties.

## 6. Data Storage and Security

- Data is stored in a Postgres database hosted via Neon, with production and development environments maintained as separate database instances.
- GitHub access tokens are encrypted at rest using AES-256-GCM.
- All traffic to and from Docloom is encrypted in transit via HTTPS/TLS.
- Webhook communications (e.g., billing events from Dodo Payments) are verified via HMAC signature validation to prevent spoofed requests.
- We apply rate limiting, input validation, and parameterized database queries to reduce the risk of common web application vulnerabilities.

While we take reasonable technical and organizational measures to protect your data, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.

## 7. Data Retention

- Account and billing data is retained for as long as your account remains active, and for a reasonable period afterward to comply with legal, tax, or accounting obligations.
- Repository access tokens are deleted upon disconnection of a repository or account deletion.
- You may request deletion of your account and associated data at any time (see Section 9).

## 8. Your Rights

Depending on your jurisdiction, you may have the right to:

- **Access** the personal data we hold about you.
- **Correct** inaccurate or incomplete data.
- **Delete** your personal data ("right to be forgotten").
- **Restrict or object to** certain processing activities.
- **Data portability** — receive your data in a structured, machine-readable format.
- **Withdraw consent** at any time where processing is based on consent (e.g., disconnecting a GitHub repository revokes our access to it going forward).

Residents of the European Economic Area, the UK, and California may have additional statutory rights under GDPR, UK GDPR, or the CCPA/CPRA respectively. To exercise any of these rights, contact us using the details in Section 12.

## 9. Account Deletion

You may delete your account at any time through your account settings, or by contacting us directly. Upon deletion:

- Your GitHub access tokens are immediately revoked and deleted.
- Your account and associated repository configuration data is deleted from our production database, subject to a reasonable grace period for backup rotation.
- Billing records may be retained separately by Dodo Payments in accordance with their own retention obligations (e.g., for tax and financial recordkeeping purposes).

## 10. Children's Privacy

Docloom is not directed at, and is not intended for use by, individuals under the age of 16. We do not knowingly collect personal information from children. If we become aware that we have inadvertently collected such information, we will take steps to delete it.

## 11. International Data Transfers

Docloom's infrastructure (Cloudflare Workers, Neon Postgres) may process and store data in multiple regions globally. By using the Service, you acknowledge that your information may be transferred to, stored, and processed in countries other than your country of residence, which may have different data protection laws.

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be communicated via the email address associated with your account or via a notice on the Service prior to the change taking effect. Continued use of the Service after changes take effect constitutes acceptance of the revised policy.

## 13. Contact Us

If you have questions about this Privacy Policy or wish to exercise any of your data rights, contact us at:

**Email:** docloom.help@gmail.com
**Website:** https://docloom.babar-wealthpilot.workers.dev
