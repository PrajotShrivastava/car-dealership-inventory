"""Customer leads, each belonging to one dealer, with a history of what changed."""

import re
from collections.abc import Sequence
from datetime import date, timedelta

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Lead, LeadEvent, LeadStatus, Purchase, User, Vehicle
from app.schemas.common import today_in
from app.schemas.leads import (
    EnquiryCreate,
    EnquiryKind,
    FollowUpFilter,
    LeadCreate,
    LeadEventOut,
    LeadList,
    LeadOut,
    LeadQuery,
    LeadUpdate,
    Reminders,
)
from app.services.inventory import contains, vehicle_not_found
from app.services.sales import lead_not_found

UPCOMING_DAYS = 7
# How a website enquiry appears in the dealer's lead list.
ENQUIRY_SOURCES = {
    EnquiryKind.QUESTION: "Website enquiry",
    EnquiryKind.TEST_DRIVE: "Test drive request",
}
# Converted and lost leads need no more follow-ups, so they never count as overdue.
OPEN = Lead.status.not_in([LeadStatus.CONVERTED, LeadStatus.LOST])


def _vehicle(db: Session, dealer_id: int, vehicle_id: int | None) -> Vehicle | None:
    if vehicle_id is None:
        return None
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None or vehicle.dealer_id != dealer_id:
        raise vehicle_not_found(vehicle_id)
    return vehicle


def get_lead(db: Session, dealer_id: int, lead_id: int) -> Lead:
    lead = db.get(Lead, lead_id)
    if lead is None or lead.dealer_id != dealer_id:
        raise lead_not_found(lead_id)
    return lead


def _sale_ids(db: Session, lead_ids: Sequence[int]) -> dict[int, int]:
    rows = db.execute(
        select(Purchase.lead_id, Purchase.id).where(Purchase.lead_id.in_(lead_ids))
    ).all()
    return {lead_id: sale_id for lead_id, sale_id in rows if lead_id is not None}


def lead_out(lead: Lead, sale_id: int | None) -> LeadOut:
    return LeadOut(
        id=lead.id,
        name=lead.name,
        email=lead.email,
        phone=lead.phone,
        vehicle_id=lead.vehicle_id,
        vehicle_label=lead.vehicle_label,
        budget=lead.budget,
        source=lead.source,
        notes=lead.notes,
        follow_up_on=lead.follow_up_on,
        status=lead.status,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        sale_id=sale_id,
        events=[LeadEventOut.model_validate(event) for event in lead.events],
    )


def one_lead(db: Session, lead: Lead) -> LeadOut:
    return lead_out(lead, _sale_ids(db, [lead.id]).get(lead.id))


def _iso(day: date | None) -> str | None:
    return day.isoformat() if day else None


def create_lead(db: Session, dealer_id: int, data: LeadCreate) -> Lead:
    vehicle = _vehicle(db, dealer_id, data.vehicle_id)
    lead = Lead(
        dealer_id=dealer_id,
        **data.model_dump(),
        vehicle_label=vehicle.label if vehicle else None,
    )
    lead.events.append(LeadEvent(kind="created", new_value=lead.status))
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def create_enquiry(db: Session, customer: User, vehicle: Vehicle, data: EnquiryCreate) -> Lead:
    """Turn a customer's question or test-drive request into a new lead for the vehicle's dealer.

    It is due for follow-up today (in the customer's time zone) so the dealer replies promptly.
    """
    if vehicle.dealer_id is None:
        raise AppError(
            409,
            "NO_DEALER",
            f"{vehicle.label} isn't listed by a dealer, so it can't take enquiries",
        )
    source = ENQUIRY_SOURCES[data.kind]
    duplicate = db.scalar(
        select(Lead.id).where(
            Lead.customer_id == customer.id,
            Lead.vehicle_id == vehicle.id,
            Lead.source == source,
            OPEN,
        )
    )
    if duplicate is not None:
        noun = "a question" if data.kind is EnquiryKind.QUESTION else "a test drive request"
        raise AppError(
            409,
            "ALREADY_ENQUIRED",
            f"You've already sent {noun} about {vehicle.label}; the dealer will be in touch",
        )

    notes = [data.message] if data.message else []
    if data.preferred_date is not None:
        notes.insert(0, f"Preferred test drive date: {data.preferred_date:%a %d %b %Y}")
    lead = Lead(
        dealer_id=vehicle.dealer_id,
        customer_id=customer.id,
        vehicle_id=vehicle.id,
        vehicle_label=vehicle.label,
        name=customer.full_name,
        email=customer.email,
        phone=data.phone,
        source=source,
        notes="\n\n".join(notes) or None,
        follow_up_on=today_in(data.tz),
    )
    lead.events.append(LeadEvent(kind="created", new_value=LeadStatus.NEW))
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def update_lead(db: Session, dealer_id: int, lead_id: int, data: LeadUpdate) -> Lead:
    lead = get_lead(db, dealer_id, lead_id)
    changes = data.model_dump(exclude_unset=True)

    status = changes.pop("status", lead.status)
    if status is not lead.status:
        if _sale_ids(db, [lead.id]):
            raise AppError(409, "LEAD_HAS_SALE", "A lead with a recorded sale stays converted")
        lead.events.append(LeadEvent(kind="status", old_value=lead.status, new_value=status))
        lead.status = status

    if "follow_up_on" in changes:
        follow_up = changes.pop("follow_up_on")
        if follow_up != lead.follow_up_on:
            lead.events.append(
                LeadEvent(
                    kind="follow_up", old_value=_iso(lead.follow_up_on), new_value=_iso(follow_up)
                )
            )
            lead.follow_up_on = follow_up

    if "vehicle_id" in changes:
        vehicle = _vehicle(db, dealer_id, changes.pop("vehicle_id"))
        lead.vehicle_id = vehicle.id if vehicle else None
        lead.vehicle_label = vehicle.label if vehicle else None

    for field, value in changes.items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    return lead


def _follow_up(kind: FollowUpFilter, today: date) -> ColumnElement[bool]:
    due = Lead.follow_up_on
    if kind is FollowUpFilter.OVERDUE:
        return and_(OPEN, due < today)
    if kind is FollowUpFilter.TODAY:
        return and_(OPEN, due == today)
    if kind is FollowUpFilter.UPCOMING:
        return and_(OPEN, due > today, due <= today + timedelta(days=UPCOMING_DAYS))
    return and_(OPEN, due.is_(None))


def reminder_counts(db: Session, dealer_id: int, today: date) -> Reminders:
    row = db.execute(
        select(
            func.count().filter(_follow_up(FollowUpFilter.OVERDUE, today)),
            func.count().filter(_follow_up(FollowUpFilter.TODAY, today)),
            func.count().filter(_follow_up(FollowUpFilter.UPCOMING, today)),
        ).where(Lead.dealer_id == dealer_id)
    ).one()
    return Reminders(overdue=row[0], today=row[1], upcoming=row[2])


def list_leads(db: Session, dealer_id: int, query: LeadQuery) -> LeadList:
    today = today_in(query.tz)
    conditions: list[ColumnElement[bool]] = [Lead.dealer_id == dealer_id]
    if query.status is not None:
        conditions.append(Lead.status == query.status)
    if query.follow_up is not None:
        conditions.append(_follow_up(query.follow_up, today))
    for word in (query.q or "").split():
        matches = [
            contains(Lead.name, word),
            contains(Lead.email, word),
            contains(Lead.phone, word),
            contains(Lead.vehicle_label, word),
            contains(Lead.source, word),
        ]
        if re.fullmatch(r"\d{3,}", word):
            matches.append(func.regexp_replace(Lead.phone, r"\D", "", "g").contains(word))
        conditions.append(or_(*matches))
    where = and_(*conditions)

    leads = db.scalars(
        select(Lead)
        .where(where)
        # Next follow-up first; undated leads last, most recently touched first.
        .order_by(
            case((Lead.follow_up_on.is_(None), 1), else_=0),
            Lead.follow_up_on.asc(),
            Lead.updated_at.desc(),
            Lead.id.desc(),
        )
        .limit(query.limit)
        .offset(query.offset)
    ).all()
    total = db.scalar(select(func.count()).select_from(Lead).where(where)) or 0
    counts = dict(
        db.execute(
            select(Lead.status, func.count())
            .where(Lead.dealer_id == dealer_id)
            .group_by(Lead.status)
        ).all()
    )
    sales = _sale_ids(db, [lead.id for lead in leads])
    return LeadList(
        items=[lead_out(lead, sales.get(lead.id)) for lead in leads],
        total=total,
        counts={status: counts.get(status, 0) for status in LeadStatus},
        reminders=reminder_counts(db, dealer_id, today),
    )
