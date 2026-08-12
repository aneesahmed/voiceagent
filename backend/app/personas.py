"""app/personas.py -- registry of every persona/role on the product
roadmap, and which ones are actually callable today.

Single source of truth for the persona list: the frontend fetches this via
GET /personas rather than hardcoding the roadmap, so adding a persona later
means adding one entry here (plus its prompt template) -- not a new route.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Persona:
    key: str
    label: str
    description: str
    available: bool
    # Key into the PromptManager registry (app/prompts/templates/*.yaml).
    # Only meaningful when available=True.
    prompt_key: str | None = None


PERSONA_REGISTRY: dict[str, Persona] = {
    p.key: p
    for p in [
        Persona(
            key="sales",
            label="AI Sales Agent",
            description="Answers product, pricing, and plan questions grounded on the Meridian ERP knowledge base.",
            available=True,
            prompt_key="meridian_voice_assistant",
        ),
        Persona(
            key="support",
            label="AI Customer Support Agent",
            description="Troubleshoots issues and answers account/support questions.",
            available=False,
        ),
        Persona(
            key="knowledge_base",
            label="Knowledge Base Integration",
            description="Retrieval-backed grounding beyond the current naive full-KB-in-context approach.",
            available=False,
        ),
        Persona(
            key="crm",
            label="CRM Integration",
            description="Reads/writes customer records in a connected CRM during calls.",
            available=False,
        ),
        Persona(
            key="appointment_scheduling",
            label="Appointment Scheduling",
            description="Books, reschedules, and cancels appointments during a call.",
            available=False,
        ),
        Persona(
            key="lead_capture",
            label="Lead Capture System",
            description="Captures and qualifies lead details from a conversation.",
            available=False,
        ),
        Persona(
            key="analytics_dashboard",
            label="Analytics Dashboard",
            description="Call volume, outcomes, and usage analytics.",
            available=False,
        ),
        Persona(
            key="admin_portal",
            label="Admin Portal",
            description="Configuration and management UI for administrators.",
            available=False,
        ),
        Persona(
            key="multichannel_messaging",
            label="Multi-channel Messaging",
            description="Extends the assistant to chat/SMS/email channels, not just voice.",
            available=False,
        ),
        Persona(
            key="voice_ai",
            label="Voice AI",
            description="Optional expanded voice capabilities beyond the current pseudo-call.",
            available=False,
        ),
        Persona(
            key="conversation_logs",
            label="Conversation Logs",
            description="Searchable transcript history across calls.",
            available=False,
        ),
        Persona(
            key="reporting_dashboard",
            label="Reporting Dashboard",
            description="Aggregated reporting for stakeholders.",
            available=False,
        ),
        Persona(
            key="human_escalation",
            label="Human Escalation Workflow",
            description="Hands a call off to a human agent when needed.",
            available=False,
        ),
        Persona(
            key="api_integrations",
            label="API Integrations",
            description="Connects the assistant to third-party APIs/services.",
            available=False,
        ),
        Persona(
            key="docs_training",
            label="Documentation and Administrator Training",
            description="End-user and administrator documentation.",
            available=False,
        ),
    ]
}

DEFAULT_PERSONA_KEY = "sales"


def get_persona(key: str) -> Persona | None:
    return PERSONA_REGISTRY.get(key)
