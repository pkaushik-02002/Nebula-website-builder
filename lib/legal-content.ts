export type LegalSection = {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export type LegalDocument = {
  eyebrow: string
  title: string
  description: string
  lastUpdated: string
  sections: LegalSection[]
}

export const LEGAL_OPERATOR_NAME = "Lotus.Build"
export const LEGAL_PRODUCT_NAME = "Lotus.build"
export const LEGAL_CONTACT_EMAIL = "arpkwebsitedevelopment@gmail.com"
export const LEGAL_CONTACT_HREF = `mailto:${LEGAL_CONTACT_EMAIL}`
export const LEGAL_LAST_UPDATED = "April 21, 2026"

export const termsDocument: LegalDocument = {
  eyebrow: "Terms and Conditions",
  title: `${LEGAL_PRODUCT_NAME} Terms and Conditions`,
  description:
    `${LEGAL_PRODUCT_NAME} is an AI website and application builder. These Terms explain the rules for using the platform, including account access, AI generation, previews, deployments, billing, and connected services.`,
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: "scope",
      title: "1. Scope and acceptance",
      paragraphs: [
        `These Terms and Conditions govern your access to and use of ${LEGAL_PRODUCT_NAME}, including our website, project builder, computer-assisted build flows, preview environments, deployment tooling, and related support services operated by ${LEGAL_OPERATOR_NAME}.`,
        "By accessing or using the service, you agree to these Terms. If you use the service on behalf of a company, client, or other organization, you represent that you are authorized to bind that organization to these Terms.",
      ],
    },
    {
      id: "eligibility",
      title: "2. Eligibility and account responsibility",
      paragraphs: [
        "You may use the service only if you can form a binding agreement under applicable law and your use is not otherwise prohibited.",
        "You are responsible for maintaining the confidentiality of your login credentials, for all activity that occurs through your account, and for keeping your account information accurate and current.",
      ],
    },
    {
      id: "service",
      title: "3. What the service does",
      paragraphs: [
        `${LEGAL_PRODUCT_NAME} helps users generate, edit, preview, and deploy websites and web applications. Depending on the workflow you use, the service may create or modify code, analyze reference websites, run previews in sandboxed environments, connect to third-party services, and publish project output to hosting providers.`,
        "Some features may be experimental, may depend on third-party availability, or may change over time as we improve the product.",
      ],
    },
    {
      id: "content",
      title: "4. Your prompts, files, and reference materials",
      paragraphs: [
        "You are responsible for all prompts, files, URLs, images, copy, credentials, deployment settings, and other materials you submit to the service or connect through third-party integrations.",
        "You must have all rights, permissions, and legal authority needed to use those materials with the service. This is especially important when you provide reference websites, brand assets, code, customer data, or other content that may be protected by intellectual property, privacy, contract, or platform-use rules.",
        `You grant ${LEGAL_OPERATOR_NAME} a limited, non-exclusive right to host, process, transmit, analyze, reproduce, and adapt that material only as needed to operate, secure, troubleshoot, improve, and support the service in accordance with these Terms and our Privacy Policy.`,
      ],
    },
    {
      id: "ai-output",
      title: "5. AI output and human review",
      paragraphs: [
        "The service uses generative and reasoning systems to produce code, copy, layouts, planning output, and automation actions. AI-generated output can be incomplete, inaccurate, insecure, non-compliant, or similar to content provided to other users or generated elsewhere.",
        "You are responsible for reviewing, testing, and approving all output before relying on it in production, publishing it, sending it to customers, or using it in a regulated or high-risk setting. The service is a software tool and is not legal, accounting, security, accessibility, or regulatory advice.",
      ],
    },
    {
      id: "acceptable-use",
      title: "6. Acceptable use",
      paragraphs: [
        "You may not use the service in a way that is unlawful, harmful, deceptive, abusive, or that infringes the rights of others.",
      ],
      bullets: [
        "Use the service to infringe copyrights, trademarks, trade dress, database rights, privacy rights, or other proprietary rights.",
        "Submit material or instructions that you do not have permission to use, including protected site content, credentials, private data, or customer information.",
        "Attempt to introduce malware, abuse infrastructure, interfere with the service, bypass limits, scrape personal data unlawfully, or gain unauthorized access to systems or accounts.",
        "Use the service to create or distribute fraudulent, defamatory, hateful, exploitative, or otherwise unlawful content or software.",
        "Misrepresent AI-generated work as independently verified, or use the service in a way that creates unreasonable security, compliance, or operational risk for others.",
      ],
    },
    {
      id: "billing",
      title: "7. Billing, subscriptions, and tokens",
      paragraphs: [
        "Paid plans, token allowances, and subscription purchases are processed through Stripe or another designated payment provider. Pricing, billing intervals, taxes, and plan details shown at checkout or in the product control what you are buying.",
        "If you start a recurring subscription, it will continue until canceled. You authorize recurring charges for the selected plan unless and until you cancel in accordance with the provider workflow or any account settings we make available.",
        "We may change pricing, packaging, or plan limits prospectively. If a payment cannot be collected, or if your plan is canceled or expires, we may downgrade, pause, or limit paid features. Questions about billing adjustments can be sent to the contact address listed below.",
      ],
    },
    {
      id: "third-parties",
      title: "8. Third-party services and connected accounts",
      paragraphs: [
        `${LEGAL_PRODUCT_NAME} relies on third-party providers for infrastructure, payments, AI processing, browser automation, previews, analytics, hosting, and integrations. When you connect services such as GitHub, Netlify, Supabase, or Vercel, you authorize us to act on your instructions through those services.`,
        "Your use of third-party services is also governed by their own terms, policies, permissions, and technical limits. We are not responsible for third-party systems, uptime, account actions, security practices, or downstream use of content once you choose to share, deploy, or sync it outside our service.",
      ],
    },
    {
      id: "availability",
      title: "9. Availability, changes, suspension, and termination",
      paragraphs: [
        "We may update, suspend, limit, or discontinue any part of the service at any time, including features that depend on third-party tools or beta functionality.",
        `We may suspend or terminate access if we reasonably believe your use violates these Terms, creates security or legal risk, causes operational harm, or is required by law. You may stop using the service at any time. Sections of these Terms that by their nature should survive termination will continue to apply.`,
      ],
    },
    {
      id: "ip",
      title: "10. Intellectual property and feedback",
      paragraphs: [
        `As between you and ${LEGAL_OPERATOR_NAME}, you retain your rights in the content and materials you submit, and, to the extent permitted by applicable law and third-party terms, in the project output generated for you through the service.`,
        `${LEGAL_OPERATOR_NAME} and its licensors retain all rights in the service itself, including our software, product design, workflows, branding, documentation, and all improvements that are not your submitted content.`,
        "If you provide feedback, suggestions, or ideas about the service, we may use them without restriction or obligation to you.",
      ],
    },
    {
      id: "disclaimers",
      title: "11. Disclaimers",
      paragraphs: [
        `The service is provided on an "as is" and "as available" basis. To the maximum extent permitted by applicable law, ${LEGAL_OPERATOR_NAME} disclaims all warranties, whether express, implied, statutory, or otherwise, including implied warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, and uninterrupted availability.`,
        "We do not guarantee that output will be error-free, original, secure, accessible, production-ready, or suitable for your specific legal, commercial, or technical requirements without your own review and validation.",
      ],
    },
    {
      id: "liability",
      title: "12. Limitation of liability",
      paragraphs: [
        `To the maximum extent permitted by applicable law, ${LEGAL_OPERATOR_NAME} will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, data, goodwill, business opportunities, or anticipated savings arising out of or related to the service.`,
        `To the maximum extent permitted by applicable law, the total aggregate liability of ${LEGAL_OPERATOR_NAME} for claims arising out of or relating to the service will not exceed the fees you paid to ${LEGAL_OPERATOR_NAME} for the service during the 12 months before the event giving rise to the claim.`,
      ],
    },
    {
      id: "law",
      title: "13. Disputes and legal interpretation",
      paragraphs: [
        `If you have a dispute or complaint about the service, please contact ${LEGAL_OPERATOR_NAME} first so we can try to resolve it informally and in good faith.`,
        "These Terms will be interpreted in a commercially reasonable manner consistent with applicable law. If mandatory consumer protections or non-waivable rights apply in your place of residence, nothing in these Terms limits those protections or rights.",
      ],
    },
    {
      id: "contact",
      title: "14. Contact",
      paragraphs: [
        `For legal notices, support questions, or account-related requests about these Terms, contact ${LEGAL_OPERATOR_NAME} at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
}

export const privacyDocument: LegalDocument = {
  eyebrow: "Privacy Policy",
  title: `${LEGAL_PRODUCT_NAME} Privacy Policy`,
  description:
    `${LEGAL_PRODUCT_NAME} uses account data, project content, payment records, analytics, and connected-service information to operate the product. This Privacy Policy explains what we collect, why we use it, when we disclose it, and what choices you may have.`,
  lastUpdated: LEGAL_LAST_UPDATED,
  sections: [
    {
      id: "overview",
      title: "1. Overview",
      paragraphs: [
        `${LEGAL_OPERATOR_NAME} operates ${LEGAL_PRODUCT_NAME}. This Privacy Policy describes how we collect, use, store, disclose, and otherwise process personal information and related business data when you use our website, create an account, build projects, connect third-party services, request previews or deployments, contact support, or otherwise interact with the product.`,
        "Where privacy law requires a legal basis for processing, we generally rely on one or more of the following depending on context: performing our contract with you, our legitimate interests in operating and securing the service, your consent, and compliance with legal obligations.",
      ],
    },
    {
      id: "collect",
      title: "2. Information we collect",
      paragraphs: [
        "The information we collect depends on how you use the service, which features you activate, and which services you connect.",
      ],
      bullets: [
        "Account and identity data, such as your name, email address, profile image, authentication provider details, user ID, and workspace membership information.",
        "Project and product data, such as prompts, follow-up instructions, answers to build questions, files, generated code, previews, deployment metadata, browser session references, logs, and project-sharing choices.",
        "Billing and subscription data, such as plan selection, Stripe customer and subscription identifiers, billing status, token allowances, and payment-related event metadata.",
        "Connected-service data, such as GitHub, Netlify, Supabase, or Vercel tokens, account identifiers, repository or project metadata, and other information required to enable a connected feature.",
        "Support and communications data, such as messages you send us, product feedback, bug reports, and account support requests.",
        "Technical and usage data, such as device and browser information, approximate IP-derived diagnostics, timestamps, error logs, analytics events, and browser storage or cookie values used for product functionality.",
      ],
    },
    {
      id: "use",
      title: "3. How we use information",
      paragraphs: [
        "We use collected information to provide, operate, maintain, secure, support, and improve the service.",
      ],
      bullets: [
        "Create and manage accounts, sign-in sessions, workspaces, and user preferences.",
        "Generate, edit, analyze, preview, verify, and deploy websites or application projects.",
        "Process subscriptions, enforce plan limits, manage token usage, and handle billing events.",
        "Connect to third-party services at your direction and perform actions you request through those integrations.",
        "Monitor reliability, investigate errors, detect abuse, enforce policies, and protect the service and our users.",
        "Respond to support requests, communicate about service updates, and send operational notices.",
        "Improve product quality, workflow design, safety systems, and the overall user experience.",
      ],
    },
    {
      id: "ai-processing",
      title: "4. AI processing, browser automation, and previews",
      paragraphs: [
        "When you use generation, editing, research, clone, verification, or computer-assisted features, we may send prompts, project files, screenshots, URLs, page content, and related instructions to AI and automation providers to perform the requested task.",
        "When you request a live preview or a build run, project code and related runtime information may be executed in sandboxed environments so a preview URL, logs, or verification results can be produced. If you deploy or share a project, the corresponding project content may become accessible through the selected destination or sharing mode.",
      ],
    },
    {
      id: "disclosure",
      title: "5. How we disclose information",
      paragraphs: [
        "We disclose information only as reasonably necessary to operate the service, carry out your instructions, comply with law, or protect rights and safety.",
        "We do not sell personal information as part of our ordinary business model, and we do not share personal information for cross-context behavioral advertising.",
      ],
      bullets: [
        "Infrastructure and identity providers, including Firebase and related Google services, to support authentication and application data storage.",
        "Payment providers, including Stripe, to process subscriptions, billing events, and payment-related records.",
        "AI and compute providers, including OpenAI, Anthropic, NVIDIA-hosted model endpoints, Browserbase, Stagehand, Firecrawl, and E2B, when needed to generate output, research references, automate browser actions, run previews, or verify results.",
        "Publishing and integration providers, including GitHub, Netlify, Supabase, and Vercel, when you connect those services or request actions involving them.",
        "Analytics and observability providers, including Vercel Analytics and service logging tools, to understand usage and maintain reliability.",
        "Professional advisors, legal authorities, or transaction counterparties when required for compliance, dispute handling, fraud prevention, business transfers, or protection of rights and safety.",
      ],
    },
    {
      id: "cookies",
      title: "6. Cookies, local storage, and analytics",
      paragraphs: [
        "We use cookies and browser storage technologies for essential product operation. This includes remembering privacy choices, preserving temporary workflow state, supporting sign-in and integration handoffs, and storing interface preferences that you actively change.",
        "Lotus.build also offers optional privacy-friendly analytics through Vercel Web Analytics. Vercel describes this service as cookieless, and on this site it remains off until you opt in. For the current register of storage technologies and controls, see our Cookie Policy.",
      ],
    },
    {
      id: "retention",
      title: "7. Data retention",
      paragraphs: [
        "We retain information for as long as reasonably necessary to provide the service, maintain account history, support your projects, enforce our agreements, resolve disputes, and comply with legal, tax, accounting, and security obligations.",
        "Retention periods vary by data type. For example, active account and project records are generally kept while your account remains active, while backups, logs, billing records, or security records may remain for longer where reasonably necessary or legally required. Connected-service credentials may remain until disconnected, replaced, or removed through our operational processes.",
      ],
    },
    {
      id: "security",
      title: "8. Security",
      paragraphs: [
        "We use reasonable administrative, technical, and organizational safeguards designed for the nature of the service, including authenticated access controls, service-provider security tooling, environment-based secret handling, and monitoring intended to reduce misuse and unauthorized access.",
        "No internet or software system is completely secure. You should use strong authentication practices, review generated code before production use, and avoid submitting secrets or sensitive personal data unless necessary for the feature you are intentionally using.",
      ],
    },
    {
      id: "transfers",
      title: "9. International data use",
      paragraphs: [
        `${LEGAL_PRODUCT_NAME} and the providers we use may process information in multiple countries. By using the service, you understand that information may be transferred to and processed in jurisdictions that may have different data-protection laws than your own, subject to applicable legal protections.`,
      ],
    },
    {
      id: "rights",
      title: "10. Your choices and rights",
      paragraphs: [
        "Depending on where you live, you may have rights to access, correct, delete, export, restrict, or object to certain processing of your personal information, or to withdraw consent where consent is the basis for processing.",
        "You may also be able to update certain account details directly in the product, disconnect linked services, or request account-related assistance by contacting us. We may need to verify your identity before completing some requests, and certain information may be retained where required for security, legal compliance, or legitimate operational needs.",
      ],
    },
    {
      id: "children",
      title: "11. Children",
      paragraphs: [
        "The service is not directed to children and should be used only by individuals who are old enough to lawfully use the service and form binding agreements under applicable law. If you believe a child has provided us personal information inappropriately, contact us so we can review and respond.",
      ],
    },
    {
      id: "changes",
      title: "12. Changes to this Privacy Policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time to reflect product changes, operational needs, legal developments, or new service providers. When we make material changes, we will update the effective date on this page and may provide additional notice where appropriate.",
      ],
    },
    {
      id: "contact",
      title: "13. Contact",
      paragraphs: [
        `For privacy questions, requests, or complaints, contact ${LEGAL_OPERATOR_NAME} at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
}
